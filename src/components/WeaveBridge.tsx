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
  sourceLineX: number; sourceX: number; sourceTopY: number; sourceBottomY: number;
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
type SourceFramePhase = "closed" | "opening" | "open" | "closing";
type BridgeMotion = {
  current: BridgeLayer | null;
  outgoing: BridgeLayer | null;
  revision: number;
  state: WeaveMotionState;
};

const MIN_VISIBLE_SOURCE_HEIGHT = 32, MIN_BRIDGE_WIDTH = 12, VIEWPORT_EDGE_GUTTER = 8;
const SOURCE_OVERLAP_PX = 3;
const SOURCE_CORNER_INSET = 10, TARGET_EXPANSION_RATIO = 0.64;
const MIN_TARGET_EXPANSION = 84, MAX_TARGET_EXPANSION = 252;
const BRIDGE_MORPH_MS = 220;
const RETARGET_DELAY_MS = BRIDGE_MORPH_MS;
const ENTER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EXIT_EASE: [number, number, number, number] = [0.4, 0, 1, 1];

const round = Math.round;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type RevealWindowProps = {
  entering: boolean; exiting: boolean; enterDelay: number; sourceX: number;
  midpointY: number; targetTopY: number; targetWidth: number; targetHeight: number;
  testId?: string;
};

function useOpeningState(entering: boolean, enterDelay: number) {
  const [opened, setOpened] = useState(!entering);

  useLayoutEffect(() => {
    if (!entering) {
      setOpened(true);
      return;
    }

    setOpened(false);
    let firstFrame = 0;
    let secondFrame = 0;
    const timer = window.setTimeout(() => {
      // A painted collapsed frame removes Framer's mount-time ambiguity. The
      // following frame can only animate outward; it can never inherit the
      // final rectangle before the reveal begins.
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setOpened(true));
      });
    }, enterDelay);
    return () => {
      window.clearTimeout(timer);
      [firstFrame, secondFrame].forEach((frame) => frame && window.cancelAnimationFrame(frame));
    };
  }, [enterDelay, entering]);

  return opened;
}

function RevealWindow(props: RevealWindowProps) {
  const { entering, exiting, enterDelay, sourceX, midpointY,
    targetTopY, targetWidth, targetHeight, testId } = props;
  const opened = useOpeningState(entering, enterDelay);
  const expanded = opened && !exiting;
  return (
    <motion.rect
      x={sourceX}
      data-testid={testId}
      initial={false}
      animate={{ y: expanded ? targetTopY : midpointY,
        width: expanded ? targetWidth : 0, height: expanded ? targetHeight : 0 }}
      transition={{ duration: BRIDGE_MORPH_MS / 1000, ease: exiting ? EXIT_EASE : ENTER_EASE }}
    />
  );
}

type DividerRailsProps = {
  entering: boolean; exiting: boolean; enterDelay: number;
  x: number; midpointY: number; targetTopY: number; targetBottomY: number;
  viewportHeight: number; testId?: (value: string) => string | undefined;
};

/**
 * Continues the bridge edges along the resize divider. Both rails grow from
 * the same midpoint as the white bridge surface, so no detached divider line
 * flashes before the focused card has opened far enough to meet it.
 */
function DividerRails(props: DividerRailsProps) {
  const {
    entering, exiting, enterDelay, x, midpointY, targetTopY,
    targetBottomY, viewportHeight, testId = () => undefined,
  } = props;
  const opened = useOpeningState(entering, enterDelay);
  const expanded = opened && !exiting;
  // Connected geometry is already synchronized to the curve during the
  // scroll event. Letting Framer interpolate those new rail coordinates over
  // the normal morph duration makes the vertical line visibly trail the path
  // junction. Only lifecycle changes should animate; ordinary scroll/resize
  // tracking must land in the same painted frame as the curve.
  const transition = entering || exiting
    ? {
        duration: BRIDGE_MORPH_MS / 1000,
        ease: exiting ? EXIT_EASE : ENTER_EASE,
      }
    : { duration: 0 };

  return (
    <>
      <motion.line
        className={classes.dividerRail}
        x1={x}
        x2={x}
        initial={false}
        animate={{
          y1: expanded ? targetTopY : midpointY,
          y2: expanded ? 0 : midpointY,
        }}
        transition={transition}
        data-testid={testId("weave-divider-rail-upper")}
      />
      <motion.line
        className={classes.dividerRail}
        x1={x}
        x2={x}
        initial={false}
        animate={{
          y1: expanded ? targetBottomY : midpointY,
          y2: expanded ? viewportHeight : midpointY,
        }}
        transition={transition}
        data-testid={testId("weave-divider-rail-lower")}
      />
    </>
  );
}

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
  svg.setAttribute("data-source-line-x", String(geometry.sourceLineX));
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
  const localTargetTop = geometry.targetTopY - TOP_NAV_HEIGHT;
  const localTargetBottom = geometry.targetBottomY - TOP_NAV_HEIGHT;
  const upperRail = layer.querySelector<SVGLineElement>('[data-testid="weave-divider-rail-upper"]');
  const lowerRail = layer.querySelector<SVGLineElement>('[data-testid="weave-divider-rail-lower"]');
  [upperRail, lowerRail].forEach((rail) => {
    rail?.setAttribute("x1", String(geometry.targetX));
    rail?.setAttribute("x2", String(geometry.targetX));
  });
  upperRail?.setAttribute("y1", String(localTargetTop));
  upperRail?.setAttribute("y2", "0");
  lowerRail?.setAttribute("y1", String(localTargetBottom));
  lowerRail?.setAttribute("y2", String(geometry.viewportHeight));
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
  const sourceFrameTimersRef = useRef<Map<HTMLElement, ReturnType<typeof setTimeout>>>(new Map());
  const openedLayerKeysRef = useRef<Set<number>>(new Set());
  const sourceOpenTimersRef = useRef<Map<number, number>>(new Map());

  const syncOpenSourceCards = useCallback((layers: Array<BridgeLayer | null>, clearImmediately = false) => {
    const next = new Map<HTMLElement, SourceFramePhase>();
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
        if (!card) return;
        next.set(card, layer.phase === "exiting"
          ? "closing"
          : layer.phase === "entering" ? "opening" : "open");
      });
    }

    const clearFrameTimer = (card: HTMLElement) => {
      const timer = sourceFrameTimersRef.current.get(card);
      if (timer) clearTimeout(timer);
      sourceFrameTimersRef.current.delete(card);
    };

    const removeFrame = (card: HTMLElement) => {
      card.removeAttribute("data-weave-source-open");
      card.removeAttribute("data-weave-source-phase");
      openCardsRef.current.delete(card);
      sourceFrameTimersRef.current.delete(card);
    };

    const startOpening = (card: HTMLElement) => {
      clearFrameTimer(card);
      const isNewFrame = card.getAttribute("data-weave-source-open") !== "true";
      openCardsRef.current.add(card);
      card.setAttribute("data-weave-source-open", "true");
      if (isNewFrame) {
        // Materialize the open-source state before advancing its lifecycle.
        // This keeps virtualized cards borderless from their first painted
        // focus frame and preserves deterministic motion event sequencing.
        card.setAttribute("data-weave-source-phase", "closed");
        void card.offsetHeight;
      }
      card.setAttribute("data-weave-source-phase", "opening");
      const timer = setTimeout(() => {
        if (card.getAttribute("data-weave-source-phase") !== "opening") return;
        card.setAttribute("data-weave-source-phase", "open");
        sourceFrameTimersRef.current.delete(card);
      }, BRIDGE_MORPH_MS);
      sourceFrameTimersRef.current.set(card, timer);
    };

    const startClosing = (card: HTMLElement) => {
      if (card.getAttribute("data-weave-source-open") !== "true") return;
      clearFrameTimer(card);
      card.setAttribute("data-weave-source-phase", "closing");
      const timer = setTimeout(() => {
        if (card.getAttribute("data-weave-source-phase") !== "closing") return;
        removeFrame(card);
      }, BRIDGE_MORPH_MS);
      sourceFrameTimersRef.current.set(card, timer);
    };

    openCardsRef.current.forEach((card) => {
      if (next.has(card)) return;
      if (clearImmediately || reduceMotion) {
        clearFrameTimer(card);
        removeFrame(card);
        return;
      }
      if (card.getAttribute("data-weave-source-phase") === "closing") return;
      startClosing(card);
    });

    next.forEach((desiredPhase, card) => {
      const currentPhase = card.getAttribute("data-weave-source-phase");
      if (reduceMotion) {
        clearFrameTimer(card);
        openCardsRef.current.add(card);
        card.setAttribute("data-weave-source-open", "true");
        card.setAttribute("data-weave-source-phase", "open");
        return;
      }

      if (desiredPhase === "closing") {
        if (currentPhase !== "closing") startClosing(card);
        return;
      }

      if (desiredPhase === "opening") {
        if (currentPhase !== "opening" && currentPhase !== "open") startOpening(card);
        return;
      }

      // A connected render can race the opening-complete timer by one task.
      // Let the active transition finish rather than snapping its rails away.
      if (currentPhase === "opening" || currentPhase === "closed") return;
      if (currentPhase === "closing" || card.getAttribute("data-weave-source-open") !== "true") {
        startOpening(card);
        return;
      }
      card.setAttribute("data-weave-source-phase", "open");
    });
  }, [feedRef, reduceMotion]);

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

      // Visibility is only an eligibility check. Geometry keeps the source's
      // real document-space edges even when they sit above or below the bridge
      // viewport; the SVG itself clips those continuous paths cleanly.
      const visibleTop = Math.max(sourceRect.top, TOP_NAV_HEIGHT + VIEWPORT_EDGE_GUTTER);
      const visibleBottom = Math.min(sourceRect.bottom, window.innerHeight - VIEWPORT_EDGE_GUTTER);
      // Begin beneath the card instead of exactly beside it. The card paints
      // above this overlay, so the small overlap is invisible but prevents a
      // subpixel gap from flashing while the document scrolls.
      const sourceX = round(sourceRect.right) - (sourceKind === "card" ? SOURCE_OVERLAP_PX : 0);
      // Draw the visible card border and the bridge curve as one SVG path. The
      // line begins just after the rounded left corner and overlays the card's
      // existing horizontal rule before continuing through the open right edge.
      const sourceLineX = sourceKind === "card"
        ? round(sourceRect.left + SOURCE_CORNER_INSET)
        : sourceX;
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

      // The active card has no right edge: its top and bottom borders become
      // these strands, so card sources begin at the real frame corners—even
      // off-screen. The compact sticky source keeps its rounded-corner inset.
      const sourceInset = sourceKind === "card" ? 0 : SOURCE_CORNER_INSET;
      const sourceTopY = round(sourceRect.top + sourceInset);
      const sourceBottomY = round(sourceRect.bottom - sourceInset);
      const sourceSpan = sourceBottomY - sourceTopY;
      // Open well beyond BOTH ends of the source frame. The wider mouth makes
      // the divider feel generated by the focused card rather than like a tab
      // attached to a pre-existing split.
      const targetExpansion = clamp(
        round(sourceSpan * TARGET_EXPANSION_RATIO),
        MIN_TARGET_EXPANSION,
        MAX_TARGET_EXPANSION,
      );
      const targetTopY = round(sourceTopY - targetExpansion);
      const targetBottomY = round(sourceBottomY + targetExpansion);
      const bridgeWidth = targetX - sourceX;
      // Preserve the old bridge's calm, nearly-horizontal departure even though
      // the panes now sit closer and the opening is taller.
      const sourceControlX = round(sourceX + clamp(bridgeWidth * 0.25, 12, 16));
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
      const upperCurvePath = [
        `M ${sourceX} ${local(sourceTopY)}`,
        `C ${sourceControlX} ${local(sourceTopY)}, ${terminalControlX} ${local(upperTerminalControlY)}, ${targetX} ${local(targetTopY)}`,
      ].join(" ");
      const lowerCurvePath = [
        `M ${sourceX} ${local(sourceBottomY)}`,
        `C ${sourceControlX} ${local(sourceBottomY)}, ${terminalControlX} ${local(lowerTerminalControlY)}, ${targetX} ${local(targetBottomY)}`,
      ].join(" ");
      const upperPath = [
        `M ${sourceLineX} ${local(sourceTopY)}`,
        `L ${sourceX} ${local(sourceTopY)}`,
        `C ${sourceControlX} ${local(sourceTopY)}, ${terminalControlX} ${local(upperTerminalControlY)}, ${targetX} ${local(targetTopY)}`,
      ].join(" ");
      const lowerPath = [
        `M ${sourceLineX} ${local(sourceBottomY)}`,
        `L ${sourceX} ${local(sourceBottomY)}`,
        `C ${sourceControlX} ${local(sourceBottomY)}, ${terminalControlX} ${local(lowerTerminalControlY)}, ${targetX} ${local(targetBottomY)}`,
      ].join(" ");
      const ribbonPath = [
        upperCurvePath,
        `L ${targetX} ${local(targetBottomY)}`,
        `C ${terminalControlX} ${local(lowerTerminalControlY)}, ${sourceControlX} ${local(sourceBottomY)}, ${sourceX} ${local(sourceBottomY)}`,
        "Z",
      ].join(" ");
      const coordinates = [sourceLineX, sourceX, sourceTopY, sourceBottomY, targetX, targetTopY, targetBottomY];
      const next: BridgeGeometry = {
        focusId: activePostId,
        sourceKind,
        signature: `${activePostId}|${sourceKind}|${window.innerWidth}|${window.innerHeight}|${coordinates.join("|")}`,
        viewportWidth: round(window.innerWidth),
        viewportHeight: round(window.innerHeight - TOP_NAV_HEIGHT),
        sourceLineX,
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
        && previous.current.geometry.sourceKind === next.sourceKind
        && previous.current.phase === "connected"
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
    // Route exits keep `enabled` true for the split grace, so the white aperture
    // and divider rails still close deliberately before the panes collapse.
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
      const sameSource = previous.current?.geometry.focusId === measuredGeometry.focusId
        && previous.current.geometry.sourceKind === measuredGeometry.sourceKind;
      const revision = sameSource ? previous.revision : previous.revision + 1;
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
      scheduleMotion(revision, BRIDGE_MORPH_MS, (current) => ({
        ...current, outgoing: null, state: "connected",
      }));
      return;
    }

    if (
      previous.current?.geometry.focusId === measuredGeometry.focusId
      && previous.current.geometry.sourceKind === measuredGeometry.sourceKind
    ) {
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
      && (
        priorLayer.geometry.focusId !== measuredGeometry.focusId
        || priorLayer.geometry.sourceKind !== measuredGeometry.sourceKind
      );
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
      scheduleMotion(revision, BRIDGE_MORPH_MS, (value) => ({ ...value, outgoing: null }));
    }
    scheduleMotion(
      revision,
      current.enterDelay + BRIDGE_MORPH_MS,
      (value) => ({
        ...value,
        current: value.current ? { ...value.current, phase: "connected", enterDelay: 0 } : null,
        outgoing: null,
        state: "connected",
      }),
    );
  }, [clearMotionTimers, commitMotion, enabled, measuredGeometry, reduceMotion, scheduleMotion]);

  useEffect(() => () => clearMotionTimers(), [clearMotionTimers]);

  // The source frame belongs to visible bridge layers, not merely to the active
  // post. Its two rails close while an outgoing ribbon collapses and open while
  // the delayed replacement ribbon expands from the same midpoint.
  useLayoutEffect(() => {
    const current = bridgeMotion.current;
    const liveKeys = new Set(
      [bridgeMotion.outgoing?.key, current?.key].filter((key): key is number => key !== undefined),
    );
    openedLayerKeysRef.current.forEach((key) => {
      if (!liveKeys.has(key)) openedLayerKeysRef.current.delete(key);
    });
    sourceOpenTimersRef.current.forEach((timer, key) => {
      if (liveKeys.has(key)) return;
      window.clearTimeout(timer);
      sourceOpenTimersRef.current.delete(key);
    });
    const currentReady = current
      && (current.enterDelay === 0 || openedLayerKeysRef.current.has(current.key));
    const immediateCurrent = currentReady ? current : null;
    syncOpenSourceCards([bridgeMotion.outgoing, immediateCurrent]);

    if (!current || currentReady || sourceOpenTimersRef.current.has(current.key)) return;
    const layerKey = current.key;
    const timer = window.setTimeout(() => {
      const latest = motionRef.current;
      sourceOpenTimersRef.current.delete(layerKey);
      if (latest.current?.key !== layerKey) return;
      openedLayerKeysRef.current.add(layerKey);
      syncOpenSourceCards([latest.outgoing, latest.current]);
    }, current.enterDelay);
    sourceOpenTimersRef.current.set(layerKey, timer);
  }, [bridgeMotion, syncOpenSourceCards]);

  useEffect(() => () => {
    sourceOpenTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    sourceOpenTimersRef.current.clear();
    syncOpenSourceCards([], true);
  }, [syncOpenSourceCards]);

  const displayGeometry = bridgeMotion.current?.geometry ?? bridgeMotion.outgoing?.geometry;
  if (!displayGeometry) return null;

  const layers = [bridgeMotion.outgoing, bridgeMotion.current].filter(
    (layer): layer is BridgeLayer => layer !== null,
  );

  const renderLayer = (layer: BridgeLayer, role: "current" | "outgoing") => {
    const entering = layer.phase === "entering";
    const exiting = layer.phase === "exiting";
    const geometry = layer.geometry;
    const revealClipId = `weave-reveal-clip-${layer.key}`;
    const morphDelay = entering ? layer.enterDelay : 0;
    const revealTop = geometry.targetTopY - TOP_NAV_HEIGHT;
    const revealHeight = geometry.targetBottomY - geometry.targetTopY;
    const revealWidth = geometry.targetX - geometry.sourceX + 1;
    const revealMidY = (
      geometry.sourceTopY + geometry.sourceBottomY
    ) / 2 - TOP_NAV_HEIGHT;
    const testId = role === "current" ? (value: string) => value : () => undefined;
    return (
      <g
        key={layer.key}
        data-testid="weave-bridge-layer"
        data-weave-layer={role}
        data-focus-id={geometry.focusId}
        data-source-kind={geometry.sourceKind}
        data-phase={layer.phase}
        data-morph-delay-ms={morphDelay}
        data-morph-duration-ms={BRIDGE_MORPH_MS}
      >
        <defs>
          <clipPath id={revealClipId} clipPathUnits="userSpaceOnUse">
            <RevealWindow
              entering={entering}
              exiting={exiting}
              enterDelay={morphDelay}
              sourceX={geometry.sourceX}
              midpointY={revealMidY}
              targetTopY={revealTop - 2}
              targetWidth={revealWidth + 2}
              targetHeight={revealHeight + 4}
              testId={testId("weave-reveal-window")}
            />
          </clipPath>
        </defs>
        {/* The reveal window grows from the card midpoint in both axes, so the
            bridge widens and opens vertically in lockstep with the two rails. */}
        <g clipPath={entering || exiting ? `url(#${revealClipId})` : undefined}>
          <path
            className={classes.ribbon}
            d={geometry.ribbonPath}
            data-testid={testId("weave-ribbon")}
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
        </g>
        <DividerRails
          entering={entering}
          exiting={exiting}
          enterDelay={morphDelay}
          x={geometry.targetX}
          midpointY={revealMidY}
          targetTopY={revealTop}
          targetBottomY={geometry.targetBottomY - TOP_NAV_HEIGHT}
          viewportHeight={geometry.viewportHeight}
          testId={testId}
        />
      </g>
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
      data-source-line-x={displayGeometry.sourceLineX}
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
