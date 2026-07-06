"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Text } from "@mantine/core";
import { IconArrowUp } from "@tabler/icons-react";
import type { Relation } from "../../types/PostType";
import { getCategoryColors } from "../../utils/categoryStyles";
import { useHighlightStore, setHoveredHighlightRangeIndex } from "../../utils/highlightStore";
import { TOP_NAV_HEIGHT } from "../NavBar/TopNav";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface StripSegment {
  start: number;
  end: number;
  category: string | null; // null = uncovered text (spacer)
  rangeIndexes: number[];
}

/** Merge relations into non-overlapping strip segments over [0, textLength).
 *  Overlaps take the first contributing relation's category (one uniform band —
 *  the strip is a minimap, not a data-faithful gradient). */
function buildStrip(relations: Relation[], textLength: number): StripSegment[] {
  if (textLength <= 0) return [];
  const points = new Set<number>([0, textLength]);
  for (const r of relations) {
    points.add(Math.max(0, Math.min(textLength, r.focusStart)));
    points.add(Math.max(0, Math.min(textLength, r.focusEnd)));
  }
  const sorted = Array.from(points).sort((a, b) => a - b);
  const segments: StripSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (e <= s) continue;
    const contributors: number[] = [];
    relations.forEach((r, ri) => {
      if (r.focusStart < e && s < r.focusEnd) contributors.push(ri);
    });
    segments.push({
      start: s,
      end: e,
      category: contributors.length > 0 ? relations[contributors[0]].category : null,
      rangeIndexes: contributors,
    });
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
 * Collapsed focus-post bar (D9): a ~56px fixed bar with the author, one line of
 * text, and the contribution strip — a minimap of the focus post's relation
 * regions in category colors. It exists so cross-highlights from reply/related
 * hovers always have a visible landing zone: the strip segments light up from
 * the same hover store the full post uses, on stable nodes (no re-parsing).
 * Click returns to the post.
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
  const { hoveredRelations, hoveredHighlightRangeIndex, hoveredCategory } = useHighlightStore();

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

  const strip = useMemo(
    () => buildStrip(focusRelations, plainText.length),
    [focusRelations, plainText.length]
  );

  if (!visible || !bounds) return null;

  const oneLine = plainText.replace(/\s+/g, " ").trim();

  const segmentState = (seg: StripSegment): "off" | "faint" | "strong" => {
    if (!seg.category) return "off";
    if (hoveredHighlightRangeIndex != null && hoveredRelations) {
      const l2 = hoveredRelations[hoveredHighlightRangeIndex];
      if (l2 && l2.focusStart < seg.end && seg.start < l2.focusEnd) return "strong";
    }
    if (hoveredCategory && hoveredRelations) {
      if (
        hoveredRelations.some(
          (r) => r.category === hoveredCategory && r.focusStart < seg.end && seg.start < r.focusEnd
        )
      )
        return "strong";
    }
    if (hoveredRelations?.some((r) => r.focusStart < seg.end && seg.start < r.focusEnd)) return "faint";
    return "off";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Return to focused post"
      data-testid="focus-sticky-bar"
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
        padding: "7px 12px 8px",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Avatar src={avatar} alt={author} radius="xl" size={22} style={{ flexShrink: 0 }} />
        <Text size="xs" fw={700} c="#011445" style={{ flexShrink: 0 }}>
          {author}
        </Text>
        <Text
          size="xs"
          c="#475569"
          style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {oneLine}
        </Text>
        <span style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex", color: "#94a3b8" }}>
          <IconArrowUp size={14} />
        </span>
      </div>
      {strip.length > 0 && (
        <div
          data-testid="contribution-strip"
          style={{ display: "flex", gap: 2, marginTop: 6, height: 8 }}
          aria-hidden
        >
          {strip.map((seg, i) => {
            if (!seg.category) {
              return <span key={i} style={{ flexGrow: seg.end - seg.start, minWidth: 0 }} />;
            }
            const tc = getCategoryColors(seg.category);
            const state = segmentState(seg);
            return (
              <span
                key={i}
                data-strip-state={state}
                onMouseEnter={() => {
                  if (seg.rangeIndexes.length === 1) setHoveredHighlightRangeIndex(seg.rangeIndexes[0]);
                }}
                onMouseLeave={() => setHoveredHighlightRangeIndex(null)}
                style={{
                  flexGrow: seg.end - seg.start,
                  minWidth: 3,
                  borderRadius: 2,
                  background:
                    state === "strong"
                      ? tc.border
                      : state === "faint"
                        ? tc.bg
                        : hexToRgba(tc.bg, 0.55),
                  outline: state === "strong" ? `1px solid ${tc.border}` : "none",
                  transition: "background 150ms ease",
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
