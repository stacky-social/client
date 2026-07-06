"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Text } from "@mantine/core";
import { IconArrowUp } from "@tabler/icons-react";
import type { Relation } from "../../types/PostType";
import { getCategoryColors, blendHex } from "../../utils/categoryStyles";
import {
  useHighlightStore,
  setResponseFilter,
  clearResponseFilter,
  setFilterCategories,
} from "../../utils/highlightStore";
import { useRelatedStacks } from "../../app/(shell)/related-stacks-context";
import { TOP_NAV_HEIGHT } from "../NavBar/TopNav";

// The 3-line text window: fontSize 12.5 × lineHeight 1.5 ≈ 19px per line.
const LINE_HEIGHT_PX = 19;
const VISIBLE_LINES = 3;

interface TextSegment {
  start: number;
  end: number;
  /** Indices into focusRelations covering this segment (empty = plain text). */
  contributors: number[];
}

/** Split the full text into non-overlapping segments at relation boundaries.
 *  Focus relations overlap freely; flat segments let us render the whole post
 *  as a single sequence of text and <mark> runs with no nesting. */
function buildSegments(relations: Relation[], textLength: number): TextSegment[] {
  if (textLength <= 0) return [];
  const points = new Set<number>([0, textLength]);
  for (const r of relations) {
    points.add(Math.max(0, Math.min(textLength, r.focusStart)));
    points.add(Math.max(0, Math.min(textLength, r.focusEnd)));
  }
  const sorted = Array.from(points).sort((a, b) => a - b);
  const segments: TextSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (e <= s) continue;
    const contributors: number[] = [];
    relations.forEach((r, ri) => {
      if (r.focusStart < e && s < r.focusEnd) contributors.push(ri);
    });
    segments.push({ start: s, end: e, contributors });
  }
  return segments;
}

interface FocusPostStickyBarProps {
  author: string;
  avatar: string;
  plainText: string;
  focusRelations: Relation[];
  /** The focus post's wrapper — the bar shows while this is above the viewport. */
  anchorRef: React.RefObject<HTMLElement>;
  /** The centered column the bar should span — measured for fixed positioning. */
  containerRef: React.RefObject<HTMLElement>;
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
  author,
  avatar,
  plainText,
  focusRelations,
  anchorRef,
  containerRef,
}: FocusPostStickyBarProps) {
  const [visible, setVisible] = useState(false);
  const [bounds, setBounds] = useState<{ left: number; width: number } | null>(null);
  const { hoveredRelations, hoveredHighlightRangeIndex, hoveredCategory, responseFilter, filterCategories } =
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

  // Track the center column's box for the fixed bar.
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setBounds({ left: rect.left, width: rect.width });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [containerRef, visible]);

  const segments = useMemo(
    () => buildSegments(focusRelations, plainText.length),
    [focusRelations, plainText.length]
  );

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
      const mark = (Array.from(box.querySelectorAll("mark[data-fs]")) as HTMLElement[]).find((m) => {
        const a = parseInt(m.getAttribute("data-fs") || "NaN", 10);
        const b = parseInt(m.getAttribute("data-fe") || "NaN", 10);
        return a < target!.end && target!.start < b;
      });
      if (!mark) return;
      const boxRect = box.getBoundingClientRect();
      const markRect = mark.getBoundingClientRect();
      // Center the mark in the 3-line window.
      const top = box.scrollTop + (markRect.top - boxRect.top) - boxRect.height / 2 + markRect.height / 2;
      animateScrollTo(box, Math.max(0, top));
    }, 120);

    return () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, [visible, hoveredRelations, hoveredHighlightRangeIndex, hoveredCategory, responseFilter]);

  if (!visible || !bounds) return null;

  const oneLine = plainText.replace(/\s+/g, " ").trim();

  // Visual state per segment — same precedence as the full post's cross-highlight.
  const segmentTint = (seg: TextSegment): string | undefined => {
    if (seg.contributors.length === 0) return undefined;
    const overlap = (r: { focusStart: number; focusEnd: number }) =>
      r.focusStart < seg.end && seg.start < r.focusEnd;
    const catFor = (ri: number) => focusRelations[ri]?.category ?? "uncategorized";
    if (responseFilter && responseFilter.start < seg.end && seg.start < responseFilter.end) {
      const c = getCategoryColors(catFor(seg.contributors[0]));
      return blendHex(c.bg, c.border, 0.15);
    }
    if (hoveredRelations) {
      const l2 = hoveredHighlightRangeIndex != null ? hoveredRelations[hoveredHighlightRangeIndex] : null;
      if (l2 && overlap(l2)) {
        const c = getCategoryColors(l2.category);
        return blendHex(c.bg, c.border, 0.15);
      }
      if (hoveredCategory) {
        const catMatch = hoveredRelations.find((r) => r.category === hoveredCategory && overlap(r));
        if (catMatch) {
          const c = getCategoryColors(hoveredCategory);
          return blendHex(c.bg, c.border, 0.15);
        }
      }
      const l1 = hoveredRelations.find(overlap);
      if (l1) {
        const c = getCategoryColors(l1.category);
        return blendHex(c.bg, "#ffffff", 0.35);
      }
    }
    return undefined; // idle: marks are invisible, exactly like the full post
  };

  const handleMarkClick = (e: React.MouseEvent, seg: TextSegment) => {
    if (seg.contributors.length === 0) return;
    e.stopPropagation(); // a highlight click filters; it must not trigger return-to-post
    const rel = focusRelations[seg.contributors[0]];
    const span = { start: rel.focusStart, end: rel.focusEnd, text: plainText.slice(rel.focusStart, rel.focusEnd) };
    if (responseFilter && responseFilter.start === span.start && responseFilter.end === span.end) {
      clearResponseFilter();
      return;
    }
    // Dead-end guard (same as the full post's span click): category chips that
    // cannot coexist with this passage are dropped instead of composing to zero.
    if (filterCategories.size > 0) {
      const compatible = (ctxRelatedStacks ?? []).some((s: any) => {
        const rels: Relation[] = ((s?.topPost?.relations ?? []) as Relation[]);
        const responds = rels.some((r) => r.focusStart < span.end && span.start < r.focusEnd);
        if (!responds) return false;
        const own = new Set<string>(rels.map((r) => r.category));
        return Array.from(filterCategories).every((c) => own.has(c));
      });
      if (!compatible) setFilterCategories(new Set());
    }
    setResponseFilter(span);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Return to focused post"
      data-testid="focus-sticky-bar"
      title="Pinned post — click to return to it"
      onClick={() => anchorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          anchorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
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
        <Avatar src={avatar} alt={author} radius="xl" size={24} style={{ flexShrink: 0 }} />
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
        ref={textBoxRef}
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
        {segments.length === 0
          ? oneLine
          : segments.map((seg, i) => {
              const text = plainText.slice(seg.start, seg.end);
              if (seg.contributors.length === 0) {
                return <React.Fragment key={i}>{text}</React.Fragment>;
              }
              const tint = segmentTint(seg);
              return (
                <mark
                  key={i}
                  data-fs={seg.start}
                  data-fe={seg.end}
                  onClick={(e) => handleMarkClick(e, seg)}
                  style={{
                    background: tint ?? "transparent",
                    color: "inherit",
                    borderRadius: 2,
                    padding: "1px 0",
                    transition: "background 150ms ease",
                    cursor: "pointer",
                  }}
                >
                  {text}
                </mark>
              );
            })}
      </div>
    </div>
  );
}
