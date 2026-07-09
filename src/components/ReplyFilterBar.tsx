"use client";

import React from "react";
import { Text } from "@mantine/core";
import { CATEGORY_LABELS, getCategoryColors, categoryIcon } from "../utils/categoryStyles";
import FilterByChip from "./FilterByChip";

interface ReplyFilterBarProps {
  filterCategories: Set<string>;
  responseFilter: { start: number; end: number; text: string } | null;
  /** Cross-pane topic filter key (aside-origin interaction). Mutually exclusive
   *  with the category/passage filters under replace-not-stack. */
  topicFilter?: string | null;
  shown: number;
  total: number;
  onRemoveCategory: (category: string) => void;
  onClearResponse: () => void;
  onClearTopic?: () => void;
  onClearAll: () => void;
}

/**
 * Visible filter state for the replies list. Cross-pane filtering only works
 * when the filtered list wears its filters: every active lens renders as a
 * removable chip HERE, next to the replies it hides — never as invisible
 * action-at-a-distance from the other pane.
 */
export default function ReplyFilterBar({
  filterCategories,
  responseFilter,
  topicFilter,
  shown,
  total,
  onRemoveCategory,
  onClearResponse,
  onClearTopic,
  onClearAll,
}: ReplyFilterBarProps) {
  const cats = Array.from(filterCategories);
  const anyActive = cats.length > 0 || responseFilter !== null || !!topicFilter;
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
          <FilterByChip
            key={cat}
            kind="category"
            label={CATEGORY_LABELS[cat] ?? cat}
            colors={tc}
            icon={categoryIcon(cat, 12, tc.text)}
            onClear={() => onRemoveCategory(cat)}
          />
        );
      })}

      {responseFilter !== null && (
        <FilterByChip
          kind="response"
          label={responseFilter.text}
          maxChars={28}
          onClear={onClearResponse}
        />
      )}

      {topicFilter && (
        <FilterByChip
          kind="topic"
          label={topicFilter}
          onClear={onClearTopic ?? onClearAll}
          testId="reply-topic-filter"
        />
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
