"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
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
  const motionRef = useRef<BridgeMotion>(initialMotion);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

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

      if (source !== observedSource) {
        sourceObserver?.disconnect();
        sourceObserver?.observe(source);
        observedSource = source;
      }

      const visibleTop = Math.max(sourceRect.top, TOP_NAV_HEIGHT + VIEWPORT_EDGE_GUTTER);
      const visibleBottom = Math.min(sourceRect.bottom, window.innerHeight - VIEWPORT_EDGE_GUTTER);
      const sourceX = round(sourceRect.right);
      const targetX = round(asideRect.left);
      if (
        visibleBottom - visibleTop < MIN_VISIBLE_SOURCE_HEIGHT
        || targetX - sourceX < MIN_BRIDGE_WIDTH
        || asideRect.right <= 0
        || asideRect.left >= window.innerWidth
      ) {
        setMeasuredGeometry((current) => current ? null : current);
        return;
      }

      const centerY = round((visibleTop + visibleBottom) / 2);
      const halfSource = clamp(round((visibleBottom - visibleTop) * 0.18), 22, 48);
      const halfTarget = clamp(round(halfSource * 0.24), 6, 12);
      const sourceTopY = round(centerY - halfSource);
      const sourceBottomY = round(centerY + halfSource);
      const targetTopY = round(centerY - halfTarget);
      const targetBottomY = round(centerY + halfTarget);
      const bridgeWidth = targetX - sourceX;
      const firstControlX = round(sourceX + bridgeWidth * 0.42);
      const secondControlX = round(targetX - bridgeWidth * 0.28);
      const local = (viewportY: number) => round(viewportY - TOP_NAV_HEIGHT);
      const upperPath = `M ${sourceX} ${local(sourceTopY)} C ${firstControlX} ${local(sourceTopY)}, ${secondControlX} ${local(targetTopY)}, ${targetX} ${local(targetTopY)}`;
      const lowerPath = `M ${sourceX} ${local(sourceBottomY)} C ${firstControlX} ${local(sourceBottomY)}, ${secondControlX} ${local(targetBottomY)}, ${targetX} ${local(targetBottomY)}`;
      const ribbonPath = `${upperPath} L ${targetX} ${local(targetBottomY)} C ${secondControlX} ${local(targetBottomY)}, ${firstControlX} ${local(sourceBottomY)}, ${sourceX} ${local(sourceBottomY)} Z`;
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
      setMeasuredGeometry((current) => current?.signature === next.signature ? current : next);
    };

    function scheduleMeasure() {
      if (frame) return;
      frame = requestAnimationFrame(measure);
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

    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      sourceObserver?.disconnect();
      layoutObserver?.disconnect();
      contentObserver?.disconnect();
    };
  }, [activePostId, asideRef, enabled, feedRef]);

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
    const isRetarget = previous.current !== null;
    const current: BridgeLayer = {
      key: revision,
      geometry: measuredGeometry,
      phase: "entering",
      enterDelay: isRetarget ? RETARGET_DELAY_MS : 0,
    };
    commitMotion({
      current,
      outgoing: isRetarget
        ? { ...previous.current!, phase: "exiting", enterDelay: 0 }
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

  const displayGeometry = bridgeMotion.current?.geometry ?? bridgeMotion.outgoing?.geometry;
  if (!displayGeometry) return null;

  const layers = [bridgeMotion.outgoing, bridgeMotion.current].filter(
    (layer): layer is BridgeLayer => layer !== null,
  );

  const renderLayer = (layer: BridgeLayer, role: "current" | "outgoing") => {
    const entering = layer.phase === "entering";
    const exiting = layer.phase === "exiting";
    const enterDuration = role === "current" && bridgeMotion.state === "retargeting"
      ? RETARGET_ENTER_MS : ENTER_MS;
    const delay = entering ? layer.enterDelay / 1000 : 0;
    const geometry = layer.geometry;
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
        <motion.path
          className={classes.ribbon}
          d={geometry.ribbonPath}
          data-testid={testId("weave-ribbon")}
          initial={entering ? { opacity: 0 } : { opacity: 1 }}
          animate={{ opacity: exiting ? 0 : 1 }}
          transition={{ duration: (exiting ? EXIT_MS : 150) / 1000, delay: delay + (entering ? 0.04 : 0) }}
        />
        {([geometry.upperPath, geometry.lowerPath] as const).map((path, index) => (
          <motion.path
            key={index}
            className={`${classes.strand} ${index === 1 ? classes.accentStrand : ""}`}
            d={path}
            data-testid={testId(index === 0 ? "weave-strand-upper" : "weave-strand-lower")}
            initial={entering ? { pathLength: 0 } : { pathLength: 1 }}
            animate={{ pathLength: exiting ? 0 : 1 }}
            transition={{
              duration: (exiting ? EXIT_MS : enterDuration) / 1000,
              delay: delay + (entering && index === 1 ? 0.018 : 0),
              ease: exiting ? EXIT_EASE : ENTER_EASE,
            }}
          />
        ))}
      </motion.g>
    );
  };

  return (
    <svg
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
