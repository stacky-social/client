"use client";

import React, { useMemo, useState } from "react";
import { Paper, Text } from "@mantine/core";
import { IconSparkles, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { buildReplySummary } from "../utils/replySort.mjs";
import { CATEGORY_LABELS, getCategoryColors } from "../utils/categoryStyles";
import type { Relation } from "../types/PostType";

interface ReplySummaryCardProps {
  /** The CURRENTLY DISPLAYED replies (post-filter) — the summary always
   *  describes what the list below it shows, never hidden posts. */
  replies: Array<{ id: string; content: string; created_at: string; favourites_count: number; account: { username?: string; display_name?: string } }>;
  relationsOf: (replyId: string) => Relation[];
}

/**
 * Collapsible summary of the visible replies. Deliberately a card above the
 * list, NOT a sort tab: a summary is not an ordering, and parking it in the
 * sort control would teach users that tabs change content rather than
 * arrangement. Collapsed by default so it never competes with real posts
 * unless asked for.
 */
export default function ReplySummaryCard({ replies, relationsOf }: ReplySummaryCardProps) {
  const [open, setOpen] = useState(false);

  const digest = useMemo(
    () => buildReplySummary(replies, { relationsOf: (r: any) => relationsOf(r.id) }),
    [replies, relationsOf]
  );

  if (replies.length === 0) return null;

  return (
    <Paper
      withBorder
      data-testid="reply-summary-card"
      style={{ borderRadius: 8, borderStyle: "dashed", background: "#fcfcf9", marginBottom: "0.75rem" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="reply-summary-toggle"
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          background: "none", border: "none", cursor: "pointer",
          padding: "10px 14px", textAlign: "left",
        }}
      >
        <IconSparkles size={16} color="#5a71a8" />
        <Text size="sm" fw={600} c="#374151">
          {open ? `Summary of ${digest.total} ${digest.total === 1 ? "reply" : "replies"}` : `Summarize these ${digest.total} ${digest.total === 1 ? "reply" : "replies"}`}
        </Text>
        <span style={{ marginLeft: "auto", display: "inline-flex", color: "#94a3b8" }}>
          {open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 14px 12px" }}>
          <Text size="xs" c="#475569" mb={6}>
            {digest.withContributions} of {digest.total} replies carry contributions
            {digest.topTopics.length > 0 ? <> — most discussed: {digest.topTopics.join(", ")}</> : null}.
          </Text>
          {digest.byCategory.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              {digest.byCategory.map(([cat, count]) => {
                const tc = getCategoryColors(cat);
                return (
                  <span key={cat} style={{
                    background: tc.bg, color: tc.text, border: `1px solid ${tc.border}55`,
                    borderRadius: 5, padding: "1px 7px", fontSize: 10, fontWeight: 700,
                  }}>
                    {CATEGORY_LABELS[cat] ?? cat} ({count})
                  </span>
                );
              })}
            </div>
          )}
          {digest.sample.map((s, i) => (
            <Text key={i} size="xs" c="#64748b" style={{ fontStyle: "italic", marginBottom: 2 }}>
              {s.author}: &ldquo;{s.firstSentence}&rdquo;
            </Text>
          ))}
          <Text size="xs" c="dimmed" mt={6} style={{ fontSize: 10 }}>
            Demo summary — generated locally from the visible replies.
          </Text>
        </div>
      )}
    </Paper>
  );
}
