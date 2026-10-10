"use client";

import React from "react";
import { Menu } from "@mantine/core";

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
  /** Label opens alternatives; the separate × always clears the filter. */
  alternatives?: { label: string; onSelect: () => void }[];
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
  alternatives,
}: FilterByChipModel) {
  const bg = colors?.bg ?? "#f1f5f9";
  const text = colors?.text ?? "#475569";
  const border = colors?.border ?? "#cbd5e1";
  const shown = label.length > maxChars ? label.slice(0, maxChars) + "…" : label;
  const display = kind === "response" ? `“${shown}”` : shown;
  if (alternatives?.length) {
    return (
      <span data-testid={testId} className="filter-summary-chip" style={{ background: bg, color: text, borderColor: border }}>
        <Menu withinPortal position="bottom-start" trigger="click-hover" openDelay={180} closeDelay={200}>
          <Menu.Target>
            <button type="button" className="filter-summary-chip-label" aria-label={`Change ${kind === "category" ? "contribution type" : kind} filter`} onClick={(e) => e.stopPropagation()}>
              {icon}<span>{display}</span><span aria-hidden>▾</span>
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            {alternatives.map((alternative) => (
              <Menu.Item key={alternative.label} onClick={(e) => { e.stopPropagation(); alternative.onSelect(); }}>
                {alternative.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        <button type="button" className="filter-summary-chip-clear" aria-label={`Remove ${label} filter`} onClick={(e) => { e.stopPropagation(); onClear(); }}>
          <span aria-hidden>×</span>
        </button>
      </span>
    );
  }
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
