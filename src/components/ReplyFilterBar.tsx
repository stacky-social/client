"use client";

import React from "react";
import { Text } from "@mantine/core";
import { CATEGORY_LABELS, getCategoryColors, categoryIcon } from "../utils/categoryStyles";

interface ReplyFilterBarProps {
  filterCategories: Set<string>;
  responseFilter: { start: number; end: number; text: string } | null;
  /** Topic pushed onto the replies by a related-panel anchor (source 'related'). */
  relatedTopic: string | null;
  shown: number;
  total: number;
  onRemoveCategory: (category: string) => void;
  onClearResponse: () => void;
  onClearTopic: () => void;
  onClearAll: () => void;
}

const chipX: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", lineHeight: 1,
  fontSize: 13, padding: "0 0 0 2px", color: "inherit",
};

/**
 * Visible filter state for the replies list. Cross-pane filtering only works
 * when the filtered list wears its filters: every active lens renders as a
 * removable chip HERE, next to the replies it hides — never as invisible
 * action-at-a-distance from the other pane.
 */
export default function ReplyFilterBar({
  filterCategories,
  responseFilter,
  relatedTopic,
  shown,
  total,
  onRemoveCategory,
  onClearResponse,
  onClearTopic,
  onClearAll,
}: ReplyFilterBarProps) {
  const cats = Array.from(filterCategories);
  const anyActive = cats.length > 0 || responseFilter !== null || relatedTopic !== null;
  if (!anyActive) return null;

  return (
    <div
      data-testid="reply-filter-bar"
      style={{
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
        padding: "6px 10px", margin: "0.75rem 0 0.5rem",
      }}
    >
      <Text size="xs" fw={600} c="#64748b" style={{ fontSize: 11, flexShrink: 0 }}>
        Replies filtered:
      </Text>

      {cats.map((cat) => {
        const tc = getCategoryColors(cat);
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onRemoveCategory(cat)}
            aria-label={`Remove ${CATEGORY_LABELS[cat] ?? cat} filter from replies`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`,
              borderRadius: 12, padding: "2px 8px", cursor: "pointer",
              fontSize: 11, fontWeight: 600,
            }}
          >
            {categoryIcon(cat, 12, tc.text)}
            {CATEGORY_LABELS[cat] ?? cat}
            <span aria-hidden style={chipX}>×</span>
          </button>
        );
      })}

      {responseFilter !== null && (
        <button
          type="button"
          onClick={onClearResponse}
          aria-label="Remove passage filter from replies"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1",
            borderRadius: 12, padding: "2px 8px", cursor: "pointer",
            fontSize: 11, fontWeight: 600, maxWidth: 220,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }}>
            &ldquo;{responseFilter.text.length > 28 ? responseFilter.text.slice(0, 28) + "…" : responseFilter.text}&rdquo;
          </span>
          <span aria-hidden style={chipX}>×</span>
        </button>
      )}

      {relatedTopic !== null && (
        <button
          type="button"
          onClick={onClearTopic}
          aria-label={`Remove ${relatedTopic} topic filter from replies`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "#eef7f2", color: "#2f6b4f", border: "1px solid #bfdccb",
            borderRadius: 12, padding: "2px 8px", cursor: "pointer",
            fontSize: 11, fontWeight: 600, maxWidth: 200,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{relatedTopic}</span>
          <span aria-hidden style={chipX}>×</span>
        </button>
      )}

      <Text size="xs" c="#64748b" style={{ fontSize: 11, marginLeft: "auto", flexShrink: 0 }}>
        showing {shown} of {total} {total === 1 ? "reply" : "replies"}
      </Text>
      <button
        type="button"
        onClick={onClearAll}
        aria-label="Clear all reply filters"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#5a71a8", fontSize: 11, fontWeight: 600, padding: "2px 4px",
        }}
      >
        clear
      </button>
    </div>
  );
}
