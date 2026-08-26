"use client";

import { useEffect, useState, type RefObject } from "react";
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

const MIN_VISIBLE_SOURCE_HEIGHT = 32, MIN_BRIDGE_WIDTH = 12, VIEWPORT_EDGE_GUTTER = 8;

const round = Math.round;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function elementWithValue(root: HTMLElement, selector: string, attribute: string, value: string) {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).find(
    (element) => element.getAttribute(attribute) === value,
  ) ?? null;
}

/**
 * Draws the static connection between the feed's active post and the related
 * pane. It deliberately measures existing semantic DOM hooks instead of owning
 * either pane's layout, so resizing and the two independent scroll containers
 * remain untouched.
 */
export function WeaveBridge({ enabled, feedRef, asideRef }: WeaveBridgeProps) {
  const { activePostId } = useRelatedStacks();
  const [geometry, setGeometry] = useState<BridgeGeometry | null>(null);

  useEffect(() => {
    if (!enabled || !activePostId) {
      setGeometry(null);
      return;
    }

    const feed = feedRef.current;
    const aside = asideRef.current;
    if (!feed || !aside) {
      setGeometry(null);
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
        setGeometry((current) => current ? null : current);
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
        setGeometry((current) => current ? null : current);
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
      setGeometry((current) => current?.signature === next.signature ? current : next);
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

  if (!geometry) return null;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={classes.bridge}
      viewBox={`0 0 ${geometry.viewportWidth} ${geometry.viewportHeight}`}
      preserveAspectRatio="none"
      data-testid="weave-bridge"
      data-focus-id={geometry.focusId}
      data-bridge-state="connected"
      data-source-kind={geometry.sourceKind}
      data-source-x={geometry.sourceX}
      data-source-top-y={geometry.sourceTopY}
      data-source-bottom-y={geometry.sourceBottomY}
      data-target-x={geometry.targetX}
      data-target-top-y={geometry.targetTopY}
      data-target-bottom-y={geometry.targetBottomY}
    >
      <path className={classes.ribbon} d={geometry.ribbonPath} data-testid="weave-ribbon" />
      <path className={classes.strand} d={geometry.upperPath} data-testid="weave-strand-upper" />
      <path className={`${classes.strand} ${classes.accentStrand}`} d={geometry.lowerPath} data-testid="weave-strand-lower" />
    </svg>
  );
}

export default WeaveBridge;
