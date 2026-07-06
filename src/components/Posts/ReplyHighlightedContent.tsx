"use client";

import React, { useRef, useEffect, useState } from "react";
import type { Relation } from "../../types/PostType";
import { getCategoryColors } from "../../utils/categoryStyles";
import {
  setHoveredSidebarPost,
  setHoveredHighlightRangeIndex,
} from "../../utils/highlightStore";
import { showTooltip, hideTooltip } from "../HoverTooltip";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface ReplyHighlightedContentProps {
  /** The reply's plain text — relation content offsets index into this string. */
  plainText: string;
  /** Non-overlapping content-side relations (the dataset generator guarantees it). */
  relations: Relation[];
  replyId: string;
  /** Clicking a span (rangeIndex into `relations`). Reranking wires in here. */
  onSpanClick?: (rangeIndex: number) => void;
  /** Optional "N more <topic>" tooltip count — wired by the thread page. */
  otherCountByTopic?: (topic: string) => number;
}

/**
 * Reply body with colored contribution spans — the left-pane counterpart of the
 * related cards' highlight rendering, deliberately simpler: replies are short,
 * plain-text, and their spans never overlap. Hovering the reply publishes its
 * relations to the highlight store, which is all the focus post needs to
 * cross-highlight the connected regions (same path a related-card hover uses).
 */
export default function ReplyHighlightedContent({
  plainText,
  relations,
  replyId,
  onSpanClick,
  otherCountByTopic,
}: ReplyHighlightedContentProps) {
  const [hovered, setHovered] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishedRef = useRef(false);

  // Clear any pending publish + our store entry on unmount so a hovered reply
  // that gets filtered/reordered away doesn't leave a stale cross-highlight.
  useEffect(() => {
    return () => {
      if (enterTimer.current) clearTimeout(enterTimer.current);
      if (publishedRef.current) {
        setHoveredSidebarPost(null);
        publishedRef.current = false;
      }
      hideTooltip();
    };
  }, []);

  const publishHover = () => {
    setHovered(true);
    if (enterTimer.current) clearTimeout(enterTimer.current);
    // Same 90ms coalescing as the related cards: sweeping the cursor across the
    // reply list must not fire a cross-highlight per card boundary.
    enterTimer.current = setTimeout(() => {
      setHoveredSidebarPost(replyId, relations);
      publishedRef.current = true;
    }, 90);
  };

  const clearHover = () => {
    setHovered(false);
    setHoveredIdx(null);
    if (enterTimer.current) clearTimeout(enterTimer.current);
    enterTimer.current = setTimeout(() => {
      if (publishedRef.current) {
        setHoveredSidebarPost(null);
        publishedRef.current = false;
      }
      setHoveredHighlightRangeIndex(null);
    }, 60);
    hideTooltip();
  };

  // Sorted, validated segments. Overlap would mean corrupt data — render plain
  // rather than mis-highlighting.
  const sorted = relations
    .map((r, i) => [i, r] as [number, Relation])
    .sort((a, b) => a[1].contentStart - b[1].contentStart);
  let valid = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][1].contentStart < sorted[i - 1][1].contentEnd) valid = false;
  }
  for (const [, r] of sorted) {
    if (r.contentStart < 0 || r.contentEnd > plainText.length || r.contentEnd <= r.contentStart) valid = false;
  }
  if (!valid || sorted.length === 0) {
    return <span>{plainText}</span>;
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const [origIdx, r] of sorted) {
    if (r.contentStart > cursor) nodes.push(plainText.slice(cursor, r.contentStart));
    const colors = getCategoryColors(r.category);
    const segText = plainText.slice(r.contentStart, r.contentEnd);
    const isSpanHovered = hoveredIdx === origIdx;
    const alpha = isSpanHovered || hovered ? 1 : 0.7;
    // Bold sub-phrase (contentComment) shown while the span is hovered — matches
    // the related cards' non-reflowing text-shadow emphasis.
    const cs = r.contentCommentStart - r.contentStart;
    const ce = r.contentCommentEnd - r.contentStart;
    const hasComment = r.contentCommentEnd > r.contentCommentStart && cs >= 0 && ce <= segText.length;
    const content = isSpanHovered && hasComment ? (
      <>
        {segText.slice(0, cs)}
        <span style={{ textShadow: "0 0 0.7px currentColor, 0 0 0.7px currentColor" }}>
          {segText.slice(cs, ce)}
        </span>
        {segText.slice(ce)}
      </>
    ) : segText;
    nodes.push(
      <mark
        key={origIdx}
        data-reply-range-id={origIdx}
        style={{
          background: alpha < 1 ? hexToRgba(colors.bg, alpha) : colors.bg,
          color: "inherit",
          borderRadius: "3px",
          padding: "1px 0",
          transition: "background 200ms ease",
          cursor: onSpanClick ? "pointer" : "inherit",
          WebkitTapHighlightColor: "transparent",
        }}
        onMouseEnter={(e) => {
          setHoveredIdx(origIdx);
          setHoveredHighlightRangeIndex(origIdx);
          if (r.topic && otherCountByTopic) {
            showTooltip({
              content: (
                <>
                  {otherCountByTopic(r.topic)} more <strong style={{ color: colors.text }}>{r.topic}</strong>
                </>
              ),
              colors: { text: colors.text, border: colors.border },
              x: e.clientX,
              y: e.clientY,
            });
          }
        }}
        onMouseLeave={() => {
          setHoveredIdx(null);
          setHoveredHighlightRangeIndex(null);
          hideTooltip();
        }}
        onClick={(e) => {
          if (!onSpanClick) return;
          e.preventDefault();
          e.stopPropagation();
          hideTooltip();
          onSpanClick(origIdx);
        }}
      >
        {content}
      </mark>
    );
    cursor = r.contentEnd;
  }
  if (cursor < plainText.length) nodes.push(plainText.slice(cursor));

  return (
    <span onMouseEnter={publishHover} onMouseLeave={clearHover}>
      {nodes}
    </span>
  );
}
