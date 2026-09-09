"use client";

import React, { useEffect, useRef, useState } from "react";
import { Text } from "@mantine/core";
import { IconArrowUp } from "@tabler/icons-react";
import type { Relation } from "../../types/PostType";
import { useHighlightStore } from "../../utils/highlightStore";
import { useRelatedStacks } from "../../app/(shell)/related-stacks-context";
import { TOP_NAV_HEIGHT } from "../NavBar/TopNav";
import ProfileAvatar from "../ProfileAvatar";
import FocusTopicHighlightedContent from "./FocusTopicHighlightedContent";

// The 3-line text window: fontSize 12.5 × lineHeight 1.5 ≈ 19px per line.
const LINE_HEIGHT_PX = 19;
const VISIBLE_LINES = 3;

interface FocusPostStickyBarProps {
  postId: string;
  author: string;
  avatar: string;
  plainText: string;
  focusRelations: Relation[];
  /** The focus post's wrapper — the bar shows while this is above the viewport. */
  anchorRef: React.RefObject<HTMLElement>;
  /** The centered column the bar should span — measured for fixed positioning. */
  containerRef: React.RefObject<HTMLElement>;
  /** Reports the pinned bar's bottom viewport-Y while shown (null when hidden),
   *  so a sibling (the reply composer) can pin itself directly beneath it and
   *  stay visible for the whole scroll — same "always available" idea as the bar. */
  onStickyChange?: (bottom: number | null) => void;
}

/**
 * The PINNED POST (D9): while the focused post is scrolled off-screen, a fixed
 * bar keeps a 3-line window of its REAL text — marks included — under the top
 * nav. Hovering a contribution span anywhere (a related card on the right, a
 * reply on the left) cross-highlights the connected region here AND auto-scrolls
 * the window to bring it into view, so the connection is always visible without
 * any proxy visualization. Clicking a highlighted region applies the passage
 * filter (same semantics as clicking it in the full post); clicking anywhere
 * else on the bar returns to the post.
 */
export default function FocusPostStickyBar({
  postId,
  author,
  avatar,
  plainText,
  focusRelations,
  anchorRef,
  containerRef,
  onStickyChange,
}: FocusPostStickyBarProps) {
  const [visible, setVisible] = useState(false);
  const [bounds, setBounds] = useState<{ left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { hoveredRelations, hoveredHighlightRangeIndex, hoveredCategory, responseFilter, topicInteraction } =
    useHighlightStore();
  const { relatedStacks: ctxRelatedStacks } = useRelatedStacks();
  const textBoxRef = useRef<HTMLDivElement | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tweenRaf = useRef<number>(0);

  // Chromium quirk: scrollTo({behavior:'smooth'}) silently no-ops on an
  // overflow:hidden box, while direct scrollTop assignment works — so the
  // window is animated by hand with a short rAF tween.
  const animateScrollTo = (box: HTMLElement, to: number) => {
    const from = box.scrollTop;
    const delta = to - from;
    if (Math.abs(delta) < 1) return;
    if (tweenRaf.current) cancelAnimationFrame(tweenRaf.current);
    const t0 = performance.now();
    const DURATION_MS = 180;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / DURATION_MS);
      const ease = 1 - Math.pow(1 - p, 3);
      box.scrollTop = from + delta * ease;
      if (p < 1) tweenRaf.current = requestAnimationFrame(step);
    };
    tweenRaf.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    return () => {
      if (tweenRaf.current) cancelAnimationFrame(tweenRaf.current);
    };
  }, []);

  // Show the bar only while the focus post is fully scrolled above the nav.
  useEffect(() => {
    const el = anchorRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const above = !entry.isIntersecting && entry.boundingClientRect.bottom < TOP_NAV_HEIGHT + 4;
        setVisible(above);
      },
      { rootMargin: `-${TOP_NAV_HEIGHT}px 0px 0px 0px`, threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [anchorRef]);

  // Track the center column's box for the fixed bar. A ResizeObserver on the
  // column itself (not just window resize) keeps the fixed bar aligned when the
  // feed/related ratio slider moves the column without any window resize.
  useEffect(() => {
    const el = containerRef.current;
    const measure = () => {
      const node = containerRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setBounds({ left: rect.left, width: rect.width });
    };
    measure();
    window.addEventListener("resize", measure);
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [containerRef, visible]);

  // Publish the bar's bottom edge (nav height + its measured height) while it is
  // pinned, so the reply composer can stick directly beneath it. Null whenever the
  // bar is hidden, so the composer falls back to normal flow.
  useEffect(() => {
    if (!onStickyChange) return;
    if (!visible || !bounds) {
      onStickyChange(null);
      return;
    }
    const el = rootRef.current;
    const report = () => {
      const h = el ? el.getBoundingClientRect().height : 0;
      onStickyChange(TOP_NAV_HEIGHT + h);
    };
    report();
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(report);
      ro.observe(el);
    }
    return () => ro?.disconnect();
  }, [visible, bounds, onStickyChange]);

  // Drop the composer's anchor if the bar unmounts entirely (route change).
  useEffect(() => () => onStickyChange?.(null), [onStickyChange]);

  // ── Auto-scroll the text window to the active cross-highlight ─────────────
  // Target precedence mirrors the highlight levels: the specific hovered span
  // (level 2) wins, then the hovered category's first region, then the hovered
  // card's first region (level 1). No hover → glide back to the top.
  useEffect(() => {
    if (!visible) return;
    const box = textBoxRef.current;
    if (!box) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);

    let target: { start: number; end: number } | null = null;
    if (hoveredRelations && hoveredRelations.length > 0) {
      const l2 = hoveredHighlightRangeIndex != null ? hoveredRelations[hoveredHighlightRangeIndex] : null;
      const catRel = !l2 && hoveredCategory ? hoveredRelations.find((r) => r.category === hoveredCategory) : null;
      const first = l2 ?? catRel ?? hoveredRelations[0];
      if (first) target = { start: first.focusStart, end: first.focusEnd };
    } else if (topicInteraction?.origin === "focus" && topicInteraction.anchor.postId === postId) {
      const relation = focusRelations[topicInteraction.anchor.rangeIndex];
      if (relation) {
        target = { start: relation.focusCommentStart, end: relation.focusCommentEnd };
      }
    } else if (responseFilter) {
      target = { start: responseFilter.start, end: responseFilter.end };
    }

    // Coalesce sweeps: one settle per 120ms, not one scroll per card boundary.
    scrollTimer.current = setTimeout(() => {
      scrollTimer.current = null;
      if (target === null) {
        animateScrollTo(box, 0);
        return;
      }
      const mark = (Array.from(box.querySelectorAll("[data-focus-passage-ids][data-fs]")) as HTMLElement[]).find((m) => {
        const a = parseInt(m.getAttribute("data-fs") || "NaN", 10);
        const b = parseInt(m.getAttribute("data-fe") || "NaN", 10);
        return a < target!.end && target!.start < b;
      });
      if (!mark) return;
      const boxRect = box.getBoundingClientRect();
      const markRect = mark.getBoundingClientRect();
      // Snap to whole lines — the window must always show exactly 3 full lines,
      // never a clipped one. Top-align regions of 3+ lines (their start is the
      // point of the highlight); shorter regions sit centered on line grid, so
      // anything that fits the window is fully in view.
      const markTopInContent = markRect.top - boxRect.top + box.scrollTop;
      const startLine = Math.round(markTopInContent / LINE_HEIGHT_PX);
      const markLines = Math.max(1, Math.round(markRect.height / LINE_HEIGHT_PX));
      const lead = markLines >= VISIBLE_LINES ? 0 : Math.floor((VISIBLE_LINES - markLines) / 2);
      const maxTop =
        Math.floor(Math.max(0, box.scrollHeight - box.clientHeight) / LINE_HEIGHT_PX) * LINE_HEIGHT_PX;
      const top = Math.max(0, Math.min(maxTop, (startLine - lead) * LINE_HEIGHT_PX));
      animateScrollTo(box, top);
    }, 120);

    return () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, [visible, hoveredRelations, hoveredHighlightRangeIndex, hoveredCategory, responseFilter, topicInteraction, postId, focusRelations]);

  if (!visible || !bounds) return null;


  // Return-to-post must land BELOW the sticky top nav — scrollIntoView aligns
  // to y=0, which the nav covers. scroll-margin-top on the anchor fixes it at
  // the source; set it just-in-time so the anchor element needs no prop change.
  const returnToPost = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchor.style.scrollMarginTop = `${TOP_NAV_HEIGHT + 8}px`;
    anchor.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={0}
      aria-label="Return to focused post"
      data-testid="focus-sticky-bar"
      data-focus-post-id={postId}
      data-weave-source-post-id={postId}
      data-weave-source-kind="sticky"
      // NB: no native `title` here — it fought the app's single tooltip portal
      // and showed "click to return" over marks whose click actually filters.
      onClick={returnToPost}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          returnToPost();
        }
      }}
      style={{
        position: "fixed",
        top: TOP_NAV_HEIGHT,
        left: bounds.left,
        width: bounds.width,
        zIndex: 150,
        background: "#ffffff",
        border: "1px solid #dbe2ea",
        borderTop: "none",
        borderRadius: "0 0 10px 10px",
        boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
        padding: "9px 14px 10px",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <ProfileAvatar src={avatar} alt={author} radius="xl" size={24} style={{ flexShrink: 0 }} />
        <Text size="xs" fw={700} c="#011445" style={{ flexShrink: 0 }}>
          {author}
        </Text>
        <span style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex", color: "#94a3b8" }}>
          <IconArrowUp size={14} />
        </span>
      </div>
      {/* 3-line window over the FULL post text. overflow:hidden still scrolls
          programmatically — the auto-scroll effect drives it to whichever
          region is cross-highlighted, so hovering a span in either pane always
          reveals what it connects to. */}
      <div
        data-testid="pinned-post-text"
        style={{
          marginTop: 6,
          height: LINE_HEIGHT_PX * VISIBLE_LINES,
          overflow: "hidden",
          fontSize: "12.5px",
          lineHeight: `${LINE_HEIGHT_PX}px`,
          color: "#334155",
        }}
      >
        <FocusTopicHighlightedContent
          ref={textBoxRef}
          postId={postId}
          displayText={plainText}
          rawText={plainText}
          isTextExpanded
          focusRelations={focusRelations}
          active
          postRelatedStacks={ctxRelatedStacks}
          style={{
            height: LINE_HEIGHT_PX * VISIBLE_LINES,
            overflow: "hidden",
            fontSize: "12.5px",
            lineHeight: `${LINE_HEIGHT_PX}px`,
            color: "#334155",
          }}
        />
      </div>
    </div>
  );
}
