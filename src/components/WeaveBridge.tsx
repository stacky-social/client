"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useRelatedStacks } from "../app/(shell)/related-stacks-context";
import { TOP_NAV_HEIGHT } from "./NavBar/TopNav";
import classes from "./WeaveBridge.module.css";
type WeaveBridgeProps = { enabled: boolean; feedRef: RefObject<HTMLElement>; asideRef: RefObject<HTMLElement> };
type SourceKind = "card" | "sticky";

type BridgeGeometry = {
  focusId: string; sourceKind: SourceKind; signature: string;
  viewportWidth: number; viewportHeight: number;
  sourceX: number; sourceTopY: number; sourceBottomY: number;
  targetX: number; targetTopY: number; targetBottomY: number;
  upperPath: string; lowerPath: string; ribbonPath: string;
};

type LayerPhase = "entering" | "connected" | "exiting";
type BridgeLayer = {
  key: number;
  geometry: BridgeGeometry;
  phase: LayerPhase;
  enterDelay: number;
};
type WeaveMotionState = "entering" | "connected" | "retargeting" | "exiting";
type BridgeMotion = {
  current: BridgeLayer | null;
  outgoing: BridgeLayer | null;
  revision: number;
  state: WeaveMotionState;
};

const MIN_VISIBLE_SOURCE_HEIGHT = 32, MIN_BRIDGE_WIDTH = 12, VIEWPORT_EDGE_GUTTER = 8;
const SOURCE_OVERLAP_PX = 3;
const SOURCE_CORNER_INSET = 10, TARGET_EXPANSION_RATIO = 0.52;
const MIN_TARGET_EXPANSION = 72, MAX_TARGET_EXPANSION = 220;
const ENTER_MS = 210, RETARGET_DELAY_MS = 45, RETARGET_ENTER_MS = 190;
const EXIT_MS = 100, FINAL_EXIT_MS = 120;
const ENTER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EXIT_EASE: [number, number, number, number] = [0.4, 0, 1, 1];

const round = Math.round;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function elementWithValue(root: HTMLElement, selector: string, attribute: string, value: string) {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).find(
    (element) => element.getAttribute(attribute) === value,
  ) ?? null;
}

function syncRenderedGeometry(svg: SVGSVGElement | null, geometry: BridgeGeometry) {
  if (!svg) return;
  const layer = Array.from(svg.querySelectorAll<SVGGElement>('[data-weave-layer="current"]')).find(
    (candidate) => candidate.getAttribute("data-focus-id") === geometry.focusId,
  );
  if (!layer) return;

  svg.setAttribute("viewBox", `0 0 ${geometry.viewportWidth} ${geometry.viewportHeight}`);
  svg.setAttribute("data-source-kind", geometry.sourceKind);
  svg.setAttribute("data-source-x", String(geometry.sourceX));
  svg.setAttribute("data-source-top-y", String(geometry.sourceTopY));
  svg.setAttribute("data-source-bottom-y", String(geometry.sourceBottomY));
  svg.setAttribute("data-target-x", String(geometry.targetX));
  svg.setAttribute("data-target-top-y", String(geometry.targetTopY));
  svg.setAttribute("data-target-bottom-y", String(geometry.targetBottomY));
  layer.querySelector<SVGPathElement>('[data-testid="weave-ribbon"]')
    ?.setAttribute("d", geometry.ribbonPath);
  layer.querySelector<SVGPathElement>('[data-testid="weave-strand-upper"]')
    ?.setAttribute("d", geometry.upperPath);
  layer.querySelector<SVGPathElement>('[data-testid="weave-strand-lower"]')
    ?.setAttribute("d", geometry.lowerPath);
  const gradient = layer.querySelector<SVGLinearGradientElement>(
    '[data-testid="weave-ribbon-gradient"]',
  );
  gradient?.setAttribute("x1", String(geometry.sourceX));
  gradient?.setAttribute("x2", String(geometry.targetX));
}

/**
 * Measures and animates the connection between the active post and related
 * pane. It deliberately reads existing semantic DOM hooks instead of owning
 * either pane's layout, so resizing and the two independent scroll containers
 * remain untouched.
 */
export function WeaveBridge({ enabled, feedRef, asideRef }: WeaveBridgeProps) {
  const { activePostId } = useRelatedStacks();
  const reduceMotion = !!useReducedMotion();
  const [measuredGeometry, setMeasuredGeometry] = useState<BridgeGeometry | null>(null);
  const initialMotion: BridgeMotion = {
    current: null, outgoing: null, revision: 0, state: "connected",
  };
  const [bridgeMotion, setBridgeMotion] = useState<BridgeMotion>(initialMotion);
  const bridgeRef = useRef<SVGSVGElement>(null);
  const motionRef = useRef<BridgeMotion>(initialMotion);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const openCardsRef = useRef<Set<HTMLElement>>(new Set());
  const openedLayerKeysRef = useRef<Set<number>>(new Set());

  const syncOpenSourceCards = useCallback((layers: Array<BridgeLayer | null>) => {
    const next = new Set<HTMLElement>();
    const feed = feedRef.current;
    if (feed) {
      layers.forEach((layer) => {
        if (!layer || layer.geometry.sourceKind !== "card") return;
        const card = elementWithValue(
          feed,
          '[data-testid="post"][data-post-id]',
          "data-post-id",
          layer.geometry.focusId,
        );
        if (card) next.add(card);
      });
    }
    openCardsRef.current.forEach((card) => {
      if (!next.has(card)) card.removeAttribute("data-weave-source-open");
    });
    next.forEach((card) => card.setAttribute("data-weave-source-open", "true"));
    openCardsRef.current = next;
  }, [feedRef]);

  const commitMotion = useCallback((next: BridgeMotion) => {
    motionRef.current = next;
    setBridgeMotion(next);
  }, []);

  const clearMotionTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const scheduleMotion = useCallback((revision: number, delay: number, update: (current: BridgeMotion) => BridgeMotion) => {
    const timer = setTimeout(() => {
      if (motionRef.current.revision !== revision) return;
      commitMotion(update(motionRef.current));
    }, delay);
    timersRef.current.push(timer);
  }, [commitMotion]);

  useEffect(() => {
    if (!enabled || !activePostId) {
      setMeasuredGeometry(null);
      return;
    }

    const feed = feedRef.current;
    const aside = asideRef.current;
    if (!feed || !aside) {
      setMeasuredGeometry(null);
      return;
    }

    let frame = 0;
    let observedSource: HTMLElement | null = null;

    const sourceObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);

    const measure = () => {
      frame = 0;

      const marker = elementWithValue(aside, "[data-related-focus-post-id]", "data-related-focus-post-id", activePostId);
      const card = elementWithValue(
        feed,
        '[data-testid="post"][data-active="true"][data-post-id]',
        "data-post-id",
        activePostId,
      );

      if (!marker || !card || aside.getClientRects().length === 0) {
        setMeasuredGeometry((current) => current ? null : current);
        return;
      }

      const cardRect = card.getBoundingClientRect();
      const sticky = elementWithValue(
        feed,
        '[data-testid="focus-sticky-bar"][data-focus-post-id]',
        "data-focus-post-id",
        activePostId,
      );
      const stickyRect = sticky?.getBoundingClientRect();
      const stickyVisible = !!stickyRect
        && stickyRect.bottom > TOP_NAV_HEIGHT
        && stickyRect.top < window.innerHeight;
      const cardAboveNav = cardRect.bottom <= TOP_NAV_HEIGHT + 4;
      const source = cardAboveNav && stickyVisible ? sticky! : card;
      const sourceKind: SourceKind = source === sticky ? "sticky" : "card";
      const sourceRect = source === card ? cardRect : stickyRect!;
      const asideRect = aside.getBoundingClientRect();
      const divider = feed.parentElement?.querySelector<HTMLElement>(
        '[role="separator"][aria-orientation="vertical"]',
      );
      const dividerRect = divider?.getBoundingClientRect();

      if (source !== observedSource) {
        sourceObserver?.disconnect();
        sourceObserver?.observe(source);
        observedSource = source;
      }

      const visibleTop = Math.max(sourceRect.top, TOP_NAV_HEIGHT + VIEWPORT_EDGE_GUTTER);
      const visibleBottom = Math.min(sourceRect.bottom, window.innerHeight - VIEWPORT_EDGE_GUTTER);
      // Begin beneath the card instead of exactly beside it. The card paints
      // above this overlay, so the small overlap is invisible but prevents a
      // subpixel gap from flashing while the document scrolls.
      const sourceX = round(sourceRect.right) - (sourceKind === "card" ? SOURCE_OVERLAP_PX : 0);
      const targetX = dividerRect
        ? round(dividerRect.left + dividerRect.width / 2)
        : round((sourceRect.right + asideRect.left) / 2);
      if (
        visibleBottom - visibleTop < MIN_VISIBLE_SOURCE_HEIGHT
        || targetX - sourceX < MIN_BRIDGE_WIDTH
        || asideRect.right <= 0
        || asideRect.left >= window.innerWidth
      ) {
        setMeasuredGeometry((current) => current ? null : current);
        return;
      }

      const topEdgeVisible = sourceRect.top >= TOP_NAV_HEIGHT + VIEWPORT_EDGE_GUTTER;
      const bottomEdgeVisible = sourceRect.bottom <= window.innerHeight - VIEWPORT_EDGE_GUTTER;
      // The active card has no right edge: its top and bottom borders become
      // these strands, so card sources begin at the exact frame corners. The
      // compact sticky source remains closed and keeps its rounded-corner inset.
      const sourceInset = sourceKind === "card" ? 0 : SOURCE_CORNER_INSET;
      const sourceTopY = round(visibleTop + (topEdgeVisible ? sourceInset : 0));
      const sourceBottomY = round(visibleBottom - (bottomEdgeVisible ? sourceInset : 0));
      const sourceSpan = sourceBottomY - sourceTopY;
      // Open well beyond BOTH ends of the source frame. At ordinary card sizes
      // the divider mouth is roughly twice the source height, so the focused
      // frame reads as opening into the panel boundary rather than plugging a
      // small tab into its center.
      const targetExpansion = clamp(
        round(sourceSpan * TARGET_EXPANSION_RATIO),
        MIN_TARGET_EXPANSION,
        MAX_TARGET_EXPANSION,
      );
      const targetTopY = round(Math.max(
        TOP_NAV_HEIGHT + VIEWPORT_EDGE_GUTTER,
        sourceTopY - targetExpansion,
      ));
      const targetBottomY = round(Math.min(
        window.innerHeight - VIEWPORT_EDGE_GUTTER,
        sourceBottomY + targetExpansion,
      ));
      const bridgeWidth = targetX - sourceX;
      const sourceControlX = round(sourceX + clamp(bridgeWidth * 0.18, 9, 14));
      const terminalControlX = round(targetX - Math.max(10, bridgeWidth * 0.22));
      const upperTerminalLeg = clamp(
        round((sourceTopY - targetTopY) * 0.58),
        12,
        110,
      );
      const lowerTerminalLeg = clamp(
        round((targetBottomY - sourceBottomY) * 0.58),
        12,
        110,
      );
      const upperTerminalControlY = round(targetTopY + upperTerminalLeg);
      const lowerTerminalControlY = round(targetBottomY - lowerTerminalLeg);
      const local = (viewportY: number) => round(viewportY - TOP_NAV_HEIGHT);
      // One cubic leaves each card corner with a horizontal tangent and starts
      // bending immediately. Avoiding a separate line segment removes the
      // straight-then-turn kink while the bounded Y controls still prevent an
      // inward pinch.
      const upperPath = [
        `M ${sourceX} ${local(sourceTopY)}`,
        `C ${sourceControlX} ${local(sourceTopY)}, ${terminalControlX} ${local(upperTerminalControlY)}, ${targetX} ${local(targetTopY)}`,
      ].join(" ");
      const lowerPath = [
        `M ${sourceX} ${local(sourceBottomY)}`,
        `C ${sourceControlX} ${local(sourceBottomY)}, ${terminalControlX} ${local(lowerTerminalControlY)}, ${targetX} ${local(targetBottomY)}`,
      ].join(" ");
      const ribbonPath = [
        upperPath,
        `L ${targetX} ${local(targetBottomY)}`,
        `C ${terminalControlX} ${local(lowerTerminalControlY)}, ${sourceControlX} ${local(sourceBottomY)}, ${sourceX} ${local(sourceBottomY)}`,
        "Z",
      ].join(" ");
      const coordinates = [sourceX, sourceTopY, sourceBottomY, targetX, targetTopY, targetBottomY];
      const next: BridgeGeometry = {
        focusId: activePostId,
        sourceKind,
        signature: `${activePostId}|${sourceKind}|${window.innerWidth}|${window.innerHeight}|${coordinates.join("|")}`,
        viewportWidth: round(window.innerWidth),
        viewportHeight: round(window.innerHeight - TOP_NAV_HEIGHT),
        sourceX,
        sourceTopY,
        sourceBottomY,
        targetX,
        targetTopY,
        targetBottomY,
        upperPath,
        lowerPath,
        ribbonPath,
      };
      const previous = motionRef.current;
      if (
        previous.current?.geometry.focusId === next.focusId
        && previous.current.geometry.signature !== next.signature
      ) {
        // Scroll geometry is time-sensitive: patch the live SVG during the
        // scroll event, before React's state/effect cycle, and commit the same
        // geometry to state so the next render cannot snap it back.
        const synchronized: BridgeMotion = {
          ...previous,
          current: { ...previous.current, geometry: next },
        };
        commitMotion(synchronized);
        syncRenderedGeometry(bridgeRef.current, next);
      }
      setMeasuredGeometry((current) => current?.signature === next.signature ? current : next);
    };

    function scheduleMeasure() {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    }

    function measureScrollSynchronously() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      measure();
    }

    const layoutObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    layoutObserver?.observe(feed);
    layoutObserver?.observe(aside);

    const contentObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(scheduleMeasure);
    contentObserver?.observe(feed, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-active", "data-focus-post-id"],
    });
    contentObserver?.observe(aside, { childList: true, subtree: true });

    window.addEventListener("scroll", measureScrollSynchronously, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measureScrollSynchronously);
      window.removeEventListener("resize", scheduleMeasure);
      sourceObserver?.disconnect();
      layoutObserver?.disconnect();
      contentObserver?.disconnect();
    };
  }, [activePostId, asideRef, commitMotion, enabled, feedRef]);

  useEffect(() => {
    const previous = motionRef.current;

    // Shell disables the bridge immediately at the single-column breakpoint.
    // Route exits keep `enabled` true for the 140ms split grace, so they still
    // receive the deliberate retract below before the panes collapse.
    if (!enabled) {
      clearMotionTimers();
      if (previous.current || previous.outgoing) {
        commitMotion({ current: null, outgoing: null, revision: previous.revision + 1, state: "connected" });
      }
      return;
    }

    if (reduceMotion) {
      clearMotionTimers();
      if (!measuredGeometry) {
        commitMotion({ current: null, outgoing: null, revision: previous.revision, state: "connected" });
        return;
      }
      const sameFocus = previous.current?.geometry.focusId === measuredGeometry.focusId;
      const revision = sameFocus ? previous.revision : previous.revision + 1;
      commitMotion({
        current: { key: revision, geometry: measuredGeometry, phase: "connected", enterDelay: 0 },
        outgoing: null, revision, state: "connected",
      });
      return;
    }

    if (!measuredGeometry) {
      if (!previous.current) return;
      clearMotionTimers();
      const revision = previous.revision + 1;
      commitMotion({
        current: null,
        outgoing: { ...previous.current, phase: "exiting", enterDelay: 0 },
        revision,
        state: "exiting",
      });
      scheduleMotion(revision, FINAL_EXIT_MS, (current) => ({
        ...current, outgoing: null, state: "connected",
      }));
      return;
    }

    if (previous.current?.geometry.focusId === measuredGeometry.focusId) {
      if (previous.current.geometry.signature === measuredGeometry.signature) return;
      // Scroll, card expansion and divider-resize geometry must stay attached to
      // the same focus without restarting or delaying its current animation.
      commitMotion({
        ...previous,
        current: { ...previous.current, geometry: measuredGeometry },
      });
      return;
    }

    clearMotionTimers();
    const revision = previous.revision + 1;
    // A scroll handoff can briefly invalidate measurement between the old and
    // new cards. Preserve that already-exiting layer as the retarget source so
    // its open frame does not snap shut before the replacement strand begins.
    const priorLayer = previous.current ?? previous.outgoing;
    const isRetarget = priorLayer !== null
      && priorLayer.geometry.focusId !== measuredGeometry.focusId;
    const current: BridgeLayer = {
      key: revision,
      geometry: measuredGeometry,
      phase: "entering",
      enterDelay: isRetarget ? RETARGET_DELAY_MS : 0,
    };
    commitMotion({
      current,
      outgoing: isRetarget
        ? { ...priorLayer, phase: "exiting", enterDelay: 0 }
        : null,
      revision,
      state: isRetarget ? "retargeting" : "entering",
    });
    if (isRetarget) {
      scheduleMotion(revision, EXIT_MS, (value) => ({ ...value, outgoing: null }));
    }
    scheduleMotion(
      revision,
      isRetarget ? RETARGET_DELAY_MS + RETARGET_ENTER_MS : ENTER_MS,
      (value) => ({
        ...value,
        current: value.current ? { ...value.current, phase: "connected", enterDelay: 0 } : null,
        outgoing: null,
        state: "connected",
      }),
    );
  }, [clearMotionTimers, commitMotion, enabled, measuredGeometry, reduceMotion, scheduleMotion]);

  useEffect(() => () => clearMotionTimers(), [clearMotionTimers]);

  // The open frame belongs to visible bridge layers, not merely to the active
  // post. During retargeting the old card stays open through its exit, and the
  // new card opens exactly when its delayed strand begins drawing.
  useLayoutEffect(() => {
    const current = bridgeMotion.current;
    const liveKeys = new Set(
      [bridgeMotion.outgoing?.key, current?.key].filter((key): key is number => key !== undefined),
    );
    openedLayerKeysRef.current.forEach((key) => {
      if (!liveKeys.has(key)) openedLayerKeysRef.current.delete(key);
    });
    const currentReady = current
      && (current.enterDelay === 0 || openedLayerKeysRef.current.has(current.key));
    const immediateCurrent = currentReady ? current : null;
    syncOpenSourceCards([bridgeMotion.outgoing, immediateCurrent]);

    if (!current || currentReady) return;
    const revision = bridgeMotion.revision;
    const timer = window.setTimeout(() => {
      const latest = motionRef.current;
      if (latest.revision !== revision) return;
      openedLayerKeysRef.current.add(current.key);
      syncOpenSourceCards([latest.outgoing, latest.current]);
    }, current.enterDelay);
    return () => window.clearTimeout(timer);
  }, [bridgeMotion, syncOpenSourceCards]);

  useEffect(() => () => syncOpenSourceCards([]), [syncOpenSourceCards]);

  const displayGeometry = bridgeMotion.current?.geometry ?? bridgeMotion.outgoing?.geometry;
  if (!displayGeometry) return null;

  const layers = [bridgeMotion.outgoing, bridgeMotion.current].filter(
    (layer): layer is BridgeLayer => layer !== null,
  );

  const renderLayer = (layer: BridgeLayer, role: "current" | "outgoing") => {
    const entering = layer.phase === "entering";
    const exiting = layer.phase === "exiting";
    const delay = entering ? layer.enterDelay / 1000 : 0;
    const geometry = layer.geometry;
    const ribbonGradientId = `weave-ribbon-gradient-${layer.key}`;
    const testId = role === "current" ? (value: string) => value : () => undefined;
    return (
      <motion.g
        key={layer.key}
        data-testid="weave-bridge-layer"
        data-weave-layer={role}
        data-focus-id={geometry.focusId}
        data-phase={layer.phase}
        initial={entering ? { opacity: 0 } : { opacity: 1 }}
        animate={{ opacity: exiting ? 0 : 1 }}
        transition={{
          duration: (exiting ? EXIT_MS : 150) / 1000,
          delay,
          ease: exiting ? EXIT_EASE : ENTER_EASE,
        }}
      >
        <defs>
          <linearGradient
            id={ribbonGradientId}
            data-testid={testId("weave-ribbon-gradient")}
            gradientUnits="userSpaceOnUse"
            x1={geometry.sourceX}
            x2={geometry.targetX}
            y1="0"
            y2="0"
          >
            <stop offset="0%" stopColor="#45a99e" stopOpacity="0.12" />
            <stop offset="72%" stopColor="#45a99e" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#45a99e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          className={classes.ribbon}
          d={geometry.ribbonPath}
          style={{ fill: `url(#${ribbonGradientId})` }}
          data-testid={testId("weave-ribbon")}
          initial={entering ? { opacity: 0 } : { opacity: 1 }}
          animate={{ opacity: exiting ? 0 : 1 }}
          transition={{ duration: (exiting ? EXIT_MS : 150) / 1000, delay: delay + (entering ? 0.04 : 0) }}
        />
        <path
          className={classes.guide}
          d={geometry.upperPath}
          data-testid={testId("weave-strand-upper")}
        />
        <path
          className={classes.guide}
          d={geometry.lowerPath}
          data-testid={testId("weave-strand-lower")}
        />
      </motion.g>
    );
  };

  return (
    <svg
      ref={bridgeRef}
      aria-hidden="true"
      focusable="false"
      className={classes.bridge}
      viewBox={`0 0 ${displayGeometry.viewportWidth} ${displayGeometry.viewportHeight}`}
      preserveAspectRatio="none"
      data-testid="weave-bridge"
      data-focus-id={displayGeometry.focusId}
      data-bridge-state="connected"
      data-weave-state={bridgeMotion.state}
      data-weave-motion={reduceMotion ? "reduced" : "full"}
      data-weave-revision={bridgeMotion.revision}
      data-source-kind={displayGeometry.sourceKind}
      data-source-x={displayGeometry.sourceX}
      data-source-top-y={displayGeometry.sourceTopY}
      data-source-bottom-y={displayGeometry.sourceBottomY}
      data-target-x={displayGeometry.targetX}
      data-target-top-y={displayGeometry.targetTopY}
      data-target-bottom-y={displayGeometry.targetBottomY}
    >
      {layers.map((layer) => renderLayer(layer, layer === bridgeMotion.current ? "current" : "outgoing"))}
    </svg>
  );
}

export default WeaveBridge;
