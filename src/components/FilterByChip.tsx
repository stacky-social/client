"use client";

import React from "react";

export type FilterByKind = "category" | "response" | "topic";

/**
 * The shared "Filtered by" descriptor: one model — {kind, label, onClear} plus
 * optional color/icon — drives every removable filter chip. Rendered by both the
 * aside header (RelatedStacks) and the reply filter bar so the two panes wear
 * their filters identically, replacing the bespoke per-pane pills.
 */
export interface FilterByChipModel {
  kind: FilterByKind;
  label: string;
  onClear: () => void;
  /** Optional category/topic color styling (slate default when omitted). */
  colors?: { bg: string; text: string; border: string };
  /** Optional leading icon (category chips carry their category glyph). */
  icon?: React.ReactNode;
  /** Max characters before the label is truncated (passages get long). */
  maxChars?: number;
  /** Optional test hook for e2e targeting (the cross-pane topic chips). */
  testId?: string;
}

const clearX: React.CSSProperties = { fontSize: 13, lineHeight: 1, paddingLeft: 2 };

export default function FilterByChip({
  kind,
  label,
  onClear,
  colors,
  icon,
  maxChars = 32,
  testId,
}: FilterByChipModel) {
  const bg = colors?.bg ?? "#f1f5f9";
  const text = colors?.text ?? "#475569";
  const border = colors?.border ?? "#cbd5e1";
  const shown = label.length > maxChars ? label.slice(0, maxChars) + "…" : label;
  const display = kind === "response" ? `“${shown}”` : shown;
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        onClear();
      }}
      aria-label={`Remove ${kind === "response" ? "passage" : label} filter`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: bg,
        color: text,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: "2px 8px",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        maxWidth: 220,
      }}
    >
      {icon}
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontStyle: kind === "response" ? "italic" : "normal",
        }}
      >
        {display}
      </span>
      <span aria-hidden style={clearX}>
        ×
      </span>
    </button>
  );
}
