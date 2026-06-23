"use client";

import React, { useRef, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { Paper, UnstyledButton, Group, Avatar, Text, Divider, Anchor } from '@mantine/core';
import { IconMessageCircle, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare, IconQuestionMark, IconBulb, IconQuote, IconLink, IconPointer, IconBook, IconMoodSmile, IconFrame, IconUser, IconThumbUp, IconThumbDown } from '@tabler/icons-react';
import { Layers } from 'lucide-react';
import { formatPostDate } from '../utils/formatPostDate';
import RelatedStackCount from './RelatedStackCount';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import StackPostsModal from './StackPostsModal';
import InteractionControl from './InteractionControl';
import { toggleFavourite, toggleBookmark } from '../utils/mastoActions';
import { setHoveredSidebarPost, setHoveredHighlightRangeIndex, setHoveredCategory, setTapped, clearTapped, toggleReRankAnchor, clearReRankAnchors, setFilterCategories, clearFilterFocusSpan, useHighlightStore } from '../utils/highlightStore';
import { reorderForAnchor } from '../utils/reorderForAnchor';
import type { Relation } from '../types/PostType';
import { showTooltip, hideTooltip, type TooltipColors } from './HoverTooltip';
import './RelatedStacks.css';

interface PostType {
  id: string;
  created_at: string;
  replies_count: number;
  favourites_count: number;
  favourited: boolean;
  bookmarked: boolean;
  content: string;
  account: {
    avatar: string;
    display_name: string;
    acct?: string;
    username?: string;
  };
  content_rewritten: string;
  rewrite: { content: string; significant: boolean };
  /** Offset-based relations between this post and the focus post */
  relations?: Relation[];
}

interface RelatedStackType {
  stackId: string;
  rel: string;
  size: number;
  topPost: PostType;
}

interface RelatedStacksProps {
  relatedStacks: RelatedStackType[];
  cardWidth?: number | string;
  onStackClick: (stackId: string) => void;
  showupdate: boolean;
  onOpenModalWithStackId?: (stackId: string) => void;
  /** When provided, intercepts post navigation instead of routing to /posts/{id} */
  onPostNavigate?: (postId: string) => void;
  /** H5: when set, appends ?from={sourcePostId} to related-post navigation URLs */
  sourcePostId?: string;
}

// ─── Category colors ─────────────────────────────────────────────────────────

interface CategoryStyle { bg: string; border: string; text: string }

const CATEGORY_COLORS: Record<string, CategoryStyle> = {
  agree:              { bg: "#d4f9d3", border: "#4caf50", text: "#1b5e20" },
  disagree:           { bg: "#ffe0e0", border: "#f44336", text: "#b71c1c" },
  predictions:        { bg: "#fff3cd", border: "#ff9800", text: "#e65100" },
  evidence_public:    { bg: "#e3f2fd", border: "#2196f3", text: "#0d47a1" },
  evidence_personal:  { bg: "#f3e5f5", border: "#9c27b0", text: "#4a148c" },
  connections:        { bg: "#e0f2f1", border: "#009688", text: "#004d40" },
  questions:          { bg: "#fce4ec", border: "#e91e63", text: "#880e4f" },
  humor:              { bg: "#fff8e1", border: "#ffc107", text: "#ff6f00" },
  values:             { bg: "#ede7f6", border: "#673ab7", text: "#311b92" },
  framing:            { bg: "#e0f7fa", border: "#00bcd4", text: "#006064" },
  proposals:          { bg: "#e8eaf6", border: "#3f51b5", text: "#1a237e" },
  pointers:           { bg: "#e8eaf6", border: "#3f51b5", text: "#1a237e" },
  uncategorized:      { bg: "#f5f5f5", border: "#9e9e9e", text: "#424242" },
};

const CATEGORY_LABELS: Record<string, string> = {
  agree: "Agree", disagree: "Disagree", predictions: "Predictions",
  evidence_public: "Evidence (Public)", evidence_personal: "Evidence (Personal)",
  connections: "Connections", questions: "Questions", humor: "Humor",
  values: "Values", framing: "Framing", proposals: "Proposals",
  pointers: "Pointers", uncategorized: "Uncategorized",
};

const iconMapping: Record<string, JSX.Element> = {
  uncategorized: <Layers size={14} />, predictions: <IconBulb size={14} />,
  evidence_public: <IconQuote size={14} />, evidence_personal: <IconUser size={14} />,
  connections: <IconLink size={14} />, pointers: <IconPointer size={14} />,
  proposals: <IconBook size={14} />, humor: <IconMoodSmile size={14} />,
  values: <IconHeart size={14} />, framing: <IconFrame size={14} />,
  questions: <IconQuestionMark size={14} />, default: <Layers size={14} />,
  agree: <IconThumbUp size={14} />, disagree: <IconThumbDown size={14} />,
};

function getCategoryColors(rel: string): CategoryStyle {
  return CATEGORY_COLORS[rel] ?? CATEGORY_COLORS.uncategorized;
}

// ─── Eye cursor — indicates "click to see more like this" ───────────────────
// Small 20x20 SVG eye, encoded inline as the cursor image. Fallback: pointer.
const EYE_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='%23334155' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z'/><circle cx='12' cy='12' r='3'/></svg>") 11 11, pointer`;

// ─── Group connector line ───────────────────────────────────────────────────
// A single continuous vertical line spans from the topic label below the
// anchor, through all claimed cards, down to the "MORE [topic]" pagination
// link. Each item in the group renders its own line segment that extends into
// the flex gap above so the segments visually connect across the gaps. The
// line is colored with the anchor's category color so the group reads as one
// thread rather than per-card border segments.
const GROUP_LINE_WIDTH = 2;
const GROUP_GAP_PX = 12; // matches the parent's `gap: '0.75rem'`

// ─── Missing-topic diagnostic (rate-limited) ─────────────────────────────────
// Surface data-integrity issues (relations with no `topic`) in study logs
// without spamming the console. One warning per (stackId, rangeIndex) pair
// per session; the tooltip and "X more" button are suppressed in that case.
const warnedMissingTopic = new Set<string>();
function warnMissingTopic(stackId: string, rangeIndex: number): void {
  const key = `${stackId}:${rangeIndex}`;
  if (warnedMissingTopic.has(key)) return;
  warnedMissingTopic.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    '[stacky] missing topic on relation; tooltip/button suppressed',
    { stackId, rangeIndex },
  );
}

// ─── Synthetic count augmentation (research mode) ────────────────────────────
// The current backend produces sparse topic / category distributions — most
// topics are unique per stack, so realCount = 1 and the tooltip would read
// "0 more <Topic>". To produce plausible "N more" values for the UI without
// altering upstream data, we boost counts deterministically when realCount ≤ 1.
// The hash ensures the same topic/category always maps to the same displayed N,
// which is important for study reproducibility. Remove this augmentation once
// the backend produces organic topic overlap across stacks.
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ─── Synthetic topic names (research mode) ───────────────────────────────────
// The backend often omits relation.topic, causing "related" to appear everywhere.
// We generate deterministic synthetic topic names drawn from per-category pools
// so the UI reads meaningfully without changing backend data.
const SYNTHETIC_TOPIC_POOLS: Record<string, string[]> = {
  evidence_public:    ["Trial results", "Productivity gains", "Worker outcomes", "Cost savings", "Pilot programs", "Public data"],
  evidence_personal:  ["Personal experience", "My team's data", "Observed shifts", "Time tracking", "Direct observation"],
  agree:              ["Worker autonomy", "Trial results", "Productivity gains", "Pilot programs", "Shorter workweek"],
  disagree:           ["Generalizability", "Cherry-picked data", "Cost concerns", "Industry differences", "Implementation gaps"],
  framing:            ["Worker autonomy", "Time vs output", "Cultural shift", "Employer expectations", "Productivity metrics"],
  questions:          ["Generalizability", "Implementation", "Long-term effects", "Industry fit", "Worker preferences"],
  connections:        ["Worker autonomy", "Cultural shift", "Time vs output", "Industry trends"],
  proposals:          ["Pilot programs", "Phased rollout", "Industry adoption", "Policy framework"],
  values:             ["Worker dignity", "Time as resource", "Quality of life", "Sustainability"],
  predictions:        ["Industry adoption", "Long-term effects", "Workforce changes", "Productivity trends"],
  humor:              ["Office stories", "Workplace humor", "Friday vibes", "Email culture"],
};

/** Returns a deterministic synthetic topic from the category's pool, or the
 *  category label if no pool exists. `seed` should be a stable string like
 *  `${stackId}-${rangeIndex}` so the same relation always maps to the same name. */
function getSyntheticTopic(category: string, seed: string): string {
  const pool = SYNTHETIC_TOPIC_POOLS[category];
  if (!pool || pool.length === 0) return CATEGORY_LABELS[category] ?? category;
  const idx = hashString(seed) % pool.length;
  return pool[idx];
}

/** Returns the relation's topic if present, otherwise generates a synthetic one.
 *  `stackId` and `rangeIndex` are used as the deterministic seed. */
function topicOf(relation: { topic?: string; category: string }, stackId: string, rangeIndex: number): string {
  return relation.topic ?? getSyntheticTopic(relation.category, `${stackId}-${rangeIndex}`);
}

// ─── Tooltip label renderer ───────────────────────────────────────────────────
// "N more <Topic>" with the topic bolded in the category color. Returns null
// when topic is absent, so callers can short-circuit without rendering.
function buildTooltipLabel(
  topic: string | undefined,
  otherCount: number | undefined,
  textColor: string,
): React.ReactNode | null {
  if (!topic) return null;
  const count = otherCount ?? 0;
  return (
    <>
      {count} more <strong style={{ color: textColor }}>{topic}</strong>
    </>
  );
}

// ─── Filter chip ─────────────────────────────────────────────────────────────

function FilterChip({ category, count, active, previewActive, previewDim, onClick, onMouseEnter, onMouseLeave }: {
  category: string; count: number; active: boolean;
  /** Preview: this chip would become active if clicked (hover preview for ADD mode) */
  previewActive?: boolean;
  /** Preview: this chip would be deactivated if another chip is clicked (hover preview for SWITCH mode) */
  previewDim?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const colors = getCategoryColors(category);
  const label = CATEGORY_LABELS[category] ?? category;
  const isLit = active || previewActive;
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-testid="filter-chip"
      data-category={category}
      aria-label={`${active ? "Remove" : "Show"} ${label} filter`}
      aria-pressed={active}
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        background: isLit ? colors.bg : "#f8f9fa",
        border: `1.5px solid ${isLit ? colors.border : "#e2e8f0"}`,
        borderRadius: "16px", padding: "3px 10px 3px 7px",
        cursor: "pointer", transition: "all 150ms ease", outline: "none", flexShrink: 0,
        opacity: previewDim ? 0.5 : 1,
        filter: previewDim ? "grayscale(0.4)" : "none",
      }}
    >
      {React.cloneElement(iconMapping[category] ?? iconMapping['default'], { color: isLit ? colors.text : "#64748b", size: 13 })}
      <Text className="related-chip-text" size="xs" fw={600} c={isLit ? colors.text : "#64748b"} style={{ fontSize: "11px", lineHeight: 1, whiteSpace: "nowrap" }}>{label}</Text>
      <Text size="xs" c={isLit ? colors.text : "#94a3b8"} style={{ fontSize: "10px", lineHeight: 1 }}>{count}</Text>
    </button>
  );
}

// ─── Filter conjunction helper ────────────────────────────────────────────────

/**
 * Decides whether clicking `candidate` should ADD it to the current filter set
 * (conjunction non-empty) or SWITCH to it exclusively.
 *
 * Real AND semantics: for each stack, collect every distinct `category` across
 * `stack.topPost.relations`.  If any stack covers every category in
 * (currentFilters ∪ {candidate}), there would be at least one result — ADD.
 * Otherwise SWITCH.
 *
 * When currentFilters is empty the candidate set is just {candidate}, so any
 * stack that has candidate in its relations satisfies the check → always ADD,
 * which is correct for the first selection.
 */
function decideFilterMode(
  stacks: RelatedStackType[],
  currentFilters: Set<string>,
  candidate: string,
): 'ADD' | 'SWITCH' {
  const candidateSet = new Set(currentFilters);
  candidateSet.add(candidate);
  const found = stacks.some(stack => {
    const cats = new Set<string>();
    for (const r of stack.topPost.relations ?? []) {
      cats.add(r.category);
    }
    let allPresent = true;
    candidateSet.forEach(c => { if (!cats.has(c)) allPresent = false; });
    return allPresent;
  });
  return found ? 'ADD' : 'SWITCH';
}

// ─── Filter hover-preview logic ──────────────────────────────────────────────

/**
 * Determines what visual signal to show when hovering a filter chip.
 * - 'add'    → clicking would add this category to the active set (conjunction non-empty)
 * - 'switch' → clicking would replace the active set with this category alone
 * - 'none'   → no preview needed (nothing active, or hovering an already-active chip)
 */
function computePreviewMode(
  hoveredCat: string | null,
  activeCats: Set<string>,
  relStacks: RelatedStackType[],
): 'none' | 'add' | 'switch' {
  if (!hoveredCat) return 'none';
  if (activeCats.has(hoveredCat)) return 'none'; // already active
  if (activeCats.size === 0) return 'none';       // first selection, no preview needed
  // Real conjunction check across relations arrays
  return decideFilterMode(relStacks, activeCats, hoveredCat) === 'ADD' ? 'add' : 'switch';
}

// ─── Highlight helpers (offset-based) ────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface HighlightRange { start: number; end: number }

// ─── Overlap detection for multi-range highlights ────────────────────────────

interface TaggedRange { start: number; end: number; rangeIndex: number; category: string; topic?: string; comment?: string }

/** Split overlapping ranges into non-overlapping segments, each tagged with contributing ranges */
interface Segment { start: number; end: number; contributors: TaggedRange[] }

function buildSegments(tagged: TaggedRange[]): Segment[] {
  if (tagged.length === 0) return [];
  // Collect all boundary points
  const points = new Set<number>();
  for (const r of tagged) { points.add(r.start); points.add(r.end); }
  const sorted = Array.from(points).sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i], e = sorted[i + 1];
    if (s === e) continue;
    const contributors = tagged.filter(r => r.start <= s && r.end >= e);
    if (contributors.length > 0) {
      segments.push({ start: s, end: e, contributors });
    }
  }
  return segments;
}

/** Build React nodes for multi-range highlights with overlap support.
 *  Uses offset-based Relation[] — no bracket parsing needed.
 *  Supports 3 visual levels: default (always-on, dimmed), card-hover (bright), substring-hover (one bright, rest dim). */
function buildMultiHighlightNodes(
  plain: string,
  relations: Relation[] | undefined,
  primaryColors: CategoryStyle,
  opts: {
    isCardHovered: boolean;
    anyCardHovered: boolean;
    hoveredRangeIndex: number | null;
    hoveredCategory: string | null;
    anchoredRangeIndex: number | null;
    onRangeHover: (index: number | null) => void;
    onRangeClick?: (index: number) => void;
    /** topic → number of OTHER posts (excluding current) that share this topic */
    otherCountByTopic?: (topic: string) => number;
    stackId: string;
  },
): React.ReactNode[] {
  if (!relations || relations.length === 0) return [plain];

  // Build tagged ranges from relations (content side)
  const tagged: TaggedRange[] = relations.map((r, i) => ({
    start: r.contentStart, end: r.contentEnd, rangeIndex: i,
    category: r.category,
    topic: r.topic,
    // contentComment is the substring plain[contentCommentStart:contentCommentEnd]
    comment: (r.contentCommentStart < r.contentCommentEnd)
      ? plain.slice(r.contentCommentStart, r.contentCommentEnd)
      : undefined,
  }));

  // Detect overlaps by building segments
  const segments = buildSegments(tagged);
  if (segments.length === 0) return [plain];

  const nodes: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const seg of segments) {
    // Add plain text before this segment
    if (seg.start > lastEnd) {
      nodes.push(plain.slice(lastEnd, seg.start));
    }

    const isOverlap = seg.contributors.length > 1;
    const segText = plain.slice(seg.start, seg.end);

    if (isOverlap) {
      // Overlapping region — per-band alpha: the hovered band is bright, others dim.
      // Hover band is detected via mouseMove Y within the mark.
      const cats = seg.contributors.map(c => {
        const cc = getCategoryColors(c.category);
        return { ...c, colors: cc };
      });

      const isBandActive = (c: { rangeIndex: number; category: string }) =>
        opts.hoveredRangeIndex === c.rangeIndex ||
        (opts.hoveredCategory !== null && opts.hoveredCategory === c.category);
      const anyDirected = opts.hoveredRangeIndex !== null || opts.hoveredCategory !== null;
      const baseAlpha =
        opts.isCardHovered ? 1 :
        opts.anyCardHovered ? 0.25 :
        0.7;
      const gradientStops = cats.map((c, i) => {
        let a = baseAlpha;
        if (anyDirected) a = isBandActive(c) ? 1 : 0.18;
        const pct1 = (i / cats.length) * 100;
        const pct2 = ((i + 1) / cats.length) * 100;
        const rgba = hexToRgba(c.colors.bg, a);
        return `${rgba} ${pct1}%, ${rgba} ${pct2}%`;
      }).join(', ');

      // Pointer + mouse handlers run side-by-side so an extension that blocks one
      // event family still leaves the other working (Chrome on Win/Linux hover bug).
      const overlapHover = (clientX: number, clientY: number, currentTarget: HTMLElement) => {
        const rect = currentTarget.getBoundingClientRect();
        const rel = (clientY - rect.top) / rect.height;
        const bandIdx = Math.max(0, Math.min(cats.length - 1, Math.floor(rel * cats.length)));
        const band = cats[bandIdx];
        opts.onRangeHover(band.rangeIndex);

        // Always resolve a topic — synthetic fallback ensures one is available
        const resolvedTopic = band.topic ?? getSyntheticTopic(band.category, `${opts.stackId}-${band.rangeIndex}`);
        const count = opts.otherCountByTopic ? opts.otherCountByTopic(resolvedTopic) : undefined;
        const colors: TooltipColors = { text: band.colors.text, border: band.colors.border };
        showTooltip({
          content: buildTooltipLabel(resolvedTopic, count, band.colors.text),
          colors,
          x: clientX,
          y: clientY,
        });
      };
      nodes.push(
        <span key={`seg-${seg.start}`} style={{ position: 'relative', display: 'inline' }}>
          <mark
            data-overlap-bands={cats.length}
            data-overlap-range-ids={cats.map(c => c.rangeIndex).join(',')}
            tabIndex={-1}
            onMouseMove={(e) => overlapHover(e.clientX, e.clientY, e.currentTarget as HTMLElement)}
            onMouseLeave={() => { opts.onRangeHover(null); hideTooltip(); }}
            onPointerMove={(e) => { if (e.pointerType === 'mouse') overlapHover(e.clientX, e.clientY, e.currentTarget as HTMLElement); }}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') { opts.onRangeHover(null); hideTooltip(); } }}
            onClick={(e) => {
              if (!opts.onRangeClick) return;
              const el = e.currentTarget as HTMLElement;
              const rect = el.getBoundingClientRect();
              const rel = (e.clientY - rect.top) / rect.height;
              const bandIdx = Math.max(0, Math.min(cats.length - 1, Math.floor(rel * cats.length)));
              e.stopPropagation();
              (e.currentTarget as HTMLElement).blur();
              opts.onRangeClick(cats[bandIdx].rangeIndex);
            }}
            style={{
              background: `linear-gradient(180deg, ${gradientStops})`,
              color: 'inherit', borderRadius: '3px', padding: '1px 0',
              transition: 'background 200ms ease',
              cursor: EYE_CURSOR,
              outline: 'none',
              border: 'none',
              pointerEvents: 'auto',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {segText}
          </mark>
        </span>
      );
    } else {
      // Single-contributor segment
      const c = seg.contributors[0];
      const colors = getCategoryColors(c.category);
      const isThisRangeHovered =
        opts.hoveredRangeIndex === c.rangeIndex ||
        (opts.hoveredCategory !== null && opts.hoveredCategory === c.category);
      const anyDirected = opts.hoveredRangeIndex !== null || opts.hoveredCategory !== null;

      // 3-level background alpha — dims highlight background only, text stays readable
      const isAnchored = opts.anchoredRangeIndex === c.rangeIndex;
      let bgAlpha: number;
      if (isAnchored) {
        bgAlpha = 1; // Anchored range always stays bright
      } else if (opts.anchoredRangeIndex !== null && !opts.isCardHovered) {
        bgAlpha = 0.2; // Another range in this card is anchored — dim this one
      } else if (opts.isCardHovered) {
        if (!anyDirected) {
          bgAlpha = 1; // Level 1: this card hovered, all its highlights bright
        } else {
          bgAlpha = isThisRangeHovered ? 1 : 0.2; // Level 2: specific range or category hovered
        }
      } else if (opts.anyCardHovered) {
        bgAlpha = 0.25; // Another card is hovered — dim these highlights
      } else {
        bgAlpha = opts.anchoredRangeIndex !== null ? 0.2 : 0.7; // default
      }
      const bgColor = bgAlpha < 1 ? hexToRgba(colors.bg, bgAlpha) : colors.bg;

      // Bold the contentComment phrase only on card hover (Level 1+)
      const commentPhrase = c.comment;
      let markContent: React.ReactNode;
      if (isThisRangeHovered && commentPhrase && segText.includes(commentPhrase)) {
        const ci = segText.indexOf(commentPhrase);
        markContent = (
          <>
            {ci > 0 && segText.slice(0, ci)}
            <span style={{ textShadow: '0 0 0.7px currentColor, 0 0 0.7px currentColor' }}>{commentPhrase}</span>
            {ci + commentPhrase.length < segText.length && segText.slice(ci + commentPhrase.length)}
          </>
        );
      } else {
        markContent = segText;
      }

      nodes.push(
        <span key={`r${c.rangeIndex}-${seg.start}`} style={{ position: 'relative', display: 'inline' }}>
          <mark
            data-range-id={c.rangeIndex}
            tabIndex={-1}
            onMouseEnter={(e) => {
              opts.onRangeHover(c.rangeIndex);
              // Always resolve a topic — synthetic fallback ensures one is available
              const resolvedTopic = c.topic ?? getSyntheticTopic(c.category, `${opts.stackId}-${c.rangeIndex}`);
              const count = opts.otherCountByTopic ? opts.otherCountByTopic(resolvedTopic) : undefined;
              showTooltip({
                content: buildTooltipLabel(resolvedTopic, count, colors.text),
                colors: { text: colors.text, border: colors.border },
                x: e.clientX,
                y: e.clientY,
              });
            }}
            onMouseLeave={() => { opts.onRangeHover(null); hideTooltip(); }}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse') return;
              opts.onRangeHover(c.rangeIndex);
              // Always resolve a topic — synthetic fallback ensures one is available
              const resolvedTopic = c.topic ?? getSyntheticTopic(c.category, `${opts.stackId}-${c.rangeIndex}`);
              const count = opts.otherCountByTopic ? opts.otherCountByTopic(resolvedTopic) : undefined;
              showTooltip({
                content: buildTooltipLabel(resolvedTopic, count, colors.text),
                colors: { text: colors.text, border: colors.border },
                x: e.clientX,
                y: e.clientY,
              });
            }}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') { opts.onRangeHover(null); hideTooltip(); } }}
            onClick={(e) => {
              if (!opts.onRangeClick) return;
              e.stopPropagation();
              (e.currentTarget as HTMLElement).blur();
              opts.onRangeClick(c.rangeIndex);
            }}
            style={{
              background: bgColor, color: 'inherit', borderRadius: '3px', padding: '1px 0',
              transition: 'background 200ms ease',
              cursor: EYE_CURSOR,
              outline: 'none',
              border: 'none',
              pointerEvents: 'auto',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {markContent}
          </mark>
        </span>
      );

    }

    lastEnd = seg.end;
  }

  // Trailing plain text
  if (lastEnd < plain.length) {
    nodes.push(plain.slice(lastEnd));
  }

  return nodes;
}

// ─── Smart windowing: show only the highlighted portion if content is long ───

const WINDOW_CHARS = 140;

/** Window content around the first relation's content range. Returns adjusted relations with shifted offsets. */
function windowContent(plain: string, relations: Relation[] | undefined, expanded: boolean): {
  text: string; adjustedRelations: Relation[] | undefined; hasPrefix: boolean; hasSuffix: boolean;
} {
  if (!relations || relations.length === 0) {
    return { text: plain, adjustedRelations: relations, hasPrefix: false, hasSuffix: false };
  }
  const totalChars = WINDOW_CHARS * 2;
  if (expanded || plain.length <= totalChars) {
    return { text: plain, adjustedRelations: relations, hasPrefix: false, hasSuffix: false };
  }
  const first = relations[0];
  const center = Math.floor((first.contentStart + first.contentEnd) / 2);
  const start = Math.max(0, center - WINDOW_CHARS);
  const end = Math.min(plain.length, center + WINDOW_CHARS);
  const text = plain.slice(start, end);
  const adjustedRelations = relations.map(r => ({
    ...r,
    contentStart: Math.max(0, r.contentStart - start),
    contentEnd: Math.min(text.length, r.contentEnd - start),
    contentCommentStart: Math.max(0, r.contentCommentStart - start),
    contentCommentEnd: Math.min(text.length, r.contentCommentEnd - start),
  })).filter(r => r.contentEnd > 0 && r.contentStart < text.length);
  return { text, adjustedRelations, hasPrefix: start > 0, hasSuffix: end < plain.length };
}

// ─── offsetTop utility (immune to CSS transforms) ──────────────────────────
// Walks the offsetParent chain to compute the element's absolute vertical
// position in the document. Unlike getBoundingClientRect(), this is NOT
// affected by CSS transforms (e.g. framer-motion FLIP animations), so it
// always returns the element's true resting DOM position.

function absoluteOffsetTop(el: HTMLElement): number {
  let top = 0;
  let cur: HTMLElement | null = el;
  while (cur) {
    top += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return top;
}

// ─── "More like this" word overlap scoring ──────────────────────────────────

const STOP_WORDS = new Set(["the","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","shall","can","need","to","of","in","for","on","with","at","by","from","as","into","through","during","before","after","above","below","between","out","off","over","under","again","further","then","once","that","this","these","those","it","its","and","but","or","nor","not","so","very","just","about","also","than","too","only","same","both","each","all","any","few","more","most","other","some","such","no","up","if","we","they","i","you","he","she","who","which","what","when","where","how","why"]);

function getSignificantWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s'-]/g, '').split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function similarityScore(textA: string, textB: string): number {
  const wordsA = getSignificantWords(textA);
  const wordsB = getSignificantWords(textB);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  wordsA.forEach(w => { if (wordsB.has(w)) overlap++; });
  return overlap / Math.min(wordsA.size, wordsB.size);
}

// ─── Main component ──────────────────────────────────────────────────────────

const RelatedStacks: React.FC<RelatedStacksProps> = ({ relatedStacks, cardWidth = "100%", onStackClick, showupdate, onOpenModalWithStackId, onPostNavigate, sourcePostId }) => {
  const router = useRouter();
  const paperRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [stackPostsModalOpen, setStackPostsModalOpen] = useState(false);
  const [favouritedOverride, setFavouritedOverride] = useState<Record<string, boolean>>({});
  const [bookmarkedOverride, setBookmarkedOverride] = useState<Record<string, boolean>>({});
  const [favouritesCountOverride, setFavouritesCountOverride] = useState<Record<string, number>>({});
  const { filterCategories, filterFocusSpan, hoveredHighlightRangeIndex, hoveredCategory, tappedCardPostId, tappedRangeIndex, reRankAnchorIds, anchoredRangeByPost } = useHighlightStore();
  // C2: hover preview state for filter chips
  const [chipHovered, setChipHovered] = useState<string | null>(null);
  // C3: panel hover state for neutral-until-hover tag coloring
  const [panelHovered, setPanelHovered] = useState(false);
  // Interaction mode: hover (mouse/pen) vs tap (touch). Adaptive — the most
  // recent real pointer input decides, so hybrid devices (e.g. a touchscreen
  // laptop) get hover with the trackpad/mouse and tap with a finger.
  //
  // NOTE: do NOT key this off touch *capability* (`navigator.maxTouchPoints` /
  // `ontouchstart`). Those are nonzero on touch-capable-but-mouse-driven
  // machines (common on Linux/Windows laptops), which wrongly disabled hover
  // and broke cross-highlighting on those devices.
  const [isTouch, setIsTouch] = useState(false);
  const isTouchRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const set = (touch: boolean) => {
      if (isTouchRef.current === touch) return; // dedupe the constant pointermove stream
      isTouchRef.current = touch;
      setIsTouch(touch);
    };
    // Initial guess: only treat as touch-only when nothing can hover and there
    // is no fine pointer. A touchscreen laptop reports a hover-capable
    // trackpad, so it correctly starts in hover mode.
    const canHover =
      window.matchMedia('(any-hover: hover)').matches ||
      window.matchMedia('(any-pointer: fine)').matches;
    set(!canHover);
    // Then follow whichever pointer the user actually uses.
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') set(true);
      else if (e.pointerType === 'mouse' || e.pointerType === 'pen') set(false);
    };
    window.addEventListener('pointerdown', onPointer, { capture: true });
    window.addEventListener('pointermove', onPointer, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onPointer, { capture: true } as any);
      window.removeEventListener('pointermove', onPointer, { capture: true } as any);
    };
  }, []);
  // Per-card expanded state, keyed by stackId
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const isFavourited = (postId: string, initial: boolean) =>
    favouritedOverride[postId] !== undefined ? favouritedOverride[postId] : initial;
  const isBookmarked = (postId: string, initial: boolean) =>
    bookmarkedOverride[postId] !== undefined ? bookmarkedOverride[postId] : initial;
  const getFavouritesCount = (postId: string, initial: number) =>
    favouritesCountOverride[postId] !== undefined ? favouritesCountOverride[postId] : initial;

  const handleToggleFavourite = async (postId: string, current: boolean, initialCount: number) => {
    // Optimistically reflect the toggle, then confirm/revert with the server result.
    const optimistic = !current;
    setFavouritedOverride(prev => ({ ...prev, [postId]: optimistic }));
    setFavouritesCountOverride(prev => {
      const effectivePrev = prev[postId] !== undefined ? prev[postId] : initialCount;
      const newCount = optimistic ? effectivePrev + 1 : effectivePrev - 1;
      return { ...prev, [postId]: Math.max(0, newCount) };
    });

    const result = await toggleFavourite(postId, current);
    if (!result.ok) {
      // Revert optimistic UI on failure.
      setFavouritedOverride(prev => ({ ...prev, [postId]: current }));
      setFavouritesCountOverride(prev => {
        const effectivePrev = prev[postId] !== undefined ? prev[postId] : initialCount;
        const reverted = optimistic ? effectivePrev - 1 : effectivePrev + 1;
        return { ...prev, [postId]: Math.max(0, reverted) };
      });
      notifications.show({
        title: 'Error',
        message: 'Could not update like. Please try again.',
        color: 'red',
      });
    }
  };

  const handleToggleBookmark = async (postId: string, current: boolean) => {
    // Optimistically reflect the toggle, then confirm/revert with the server result.
    setBookmarkedOverride(prev => ({ ...prev, [postId]: !current }));
    const result = await toggleBookmark(postId, current);
    if (!result.ok) {
      setBookmarkedOverride(prev => ({ ...prev, [postId]: current }));
      notifications.show({
        title: 'Error',
        message: 'Could not update bookmark. Please try again.',
        color: 'red',
      });
    }
  };

  const [currentStackId, setCurrentStackId] = useState<string | null>(null);

  // C1: Smart conjunction click handler for filter chips
  const handleFilterChipClick = (category: string) => {
    const active = filterCategories;
    if (active.has(category)) {
      // Deselect this chip
      const next = new Set(active);
      next.delete(category);
      setFilterCategories(next);
    } else if (active.size === 0) {
      // First selection — always ADD
      setFilterCategories(new Set([category]));
    } else {
      // Real AND conjunction check across relations arrays
      const mode = decideFilterMode(relatedStacks, active, category);
      setFilterCategories(mode === 'ADD' ? new Set(Array.from(active).concat([category])) : new Set([category]));
    }
  };

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const stack of relatedStacks) {
      const cat = stack.rel || 'uncategorized';
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [relatedStacks]);

  // Category prevalence — counts stacks that contain ANY relation with the given
  // category (one stack contributes at most 1 per category, even if it has
  // multiple relations of the same category). Used for tag-hover tooltips.
  const categoryStackCount = useMemo(() => {
    const real = new Map<string, number>();
    for (const stack of relatedStacks) {
      const seen = new Set<string>();
      for (const r of stack.topPost.relations ?? []) {
        seen.add(r.category);
      }
      seen.forEach(c => real.set(c, (real.get(c) ?? 0) + 1));
    }
    return real;
  }, [relatedStacks]);

  // Topic prevalence — used by tooltip ("7 more Contract reform") and for pagination.
  // When relation.topic is absent, a synthetic topic is generated via topicOf().
  const { postTopics, topicTotal } = useMemo(() => {
    const postTopics = new Map<string, Set<string>>();
    const topicTotal = new Map<string, number>();
    for (const stack of relatedStacks) {
      const topics = new Set<string>();
      for (let ri = 0; ri < (stack.topPost.relations ?? []).length; ri++) {
        const r = stack.topPost.relations![ri];
        const t = topicOf(r, stack.stackId, ri);
        topics.add(t);
      }
      postTopics.set(stack.topPost.id, topics);
      topics.forEach(t => topicTotal.set(t, (topicTotal.get(t) ?? 0) + 1));
    }
    return { postTopics, topicTotal };
  }, [relatedStacks]);

  const SIMILARITY_THRESHOLD = 0.15;
  const SHOWN_INCREMENT = 3;

  // Per-anchor "show this many claims" count. Defaults to SHOWN_INCREMENT when an
  // anchor is created; bumped by SHOWN_INCREMENT each time the user clicks the
  // "MORE [topic]" link. Synced to reRankAnchorIds via the effect below.
  const [shownByAnchor, setShownByAnchor] = useState<Record<string, number>>({});

  useEffect(() => {
    setShownByAnchor(prev => {
      const next: Record<string, number> = {};
      let changed = Object.keys(prev).length !== reRankAnchorIds.length;
      for (const id of reRankAnchorIds) {
        if (id in prev) next[id] = prev[id];
        else { next[id] = SHOWN_INCREMENT; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [reRankAnchorIds]);

  // E: base order tracking — the post-ID order at the moment the active anchor was created.
  // Using refs (not state) so captures don't trigger extra re-renders.
  const baseOrderRef = useRef<string[]>([]);
  const activeAnchorIdRef = useRef<string | null>(null);
  // E: previous render's displayStacks — updated after each render via useEffect.
  // Used to capture the "current visible order" when a new anchor replaces the old one.
  const prevDisplayStacksRef = useRef<RelatedStackType[]>([]);

  /** E: Single-anchor reordering — above-matched move above target, below-matched move below.
   *  Re-ranking runs on the base order captured at anchor-creation time so a new anchor
   *  can layer on top of the previously visible ordering. The active filter is applied
   *  AFTER re-ranking (same as before) so filtering never breaks group connectivity. */
  const { displayStacks, claimedBy, anchorSet, anchorParent, groupTotal, groupShown } = useMemo(() => {
    const anchorSet = new Set(reRankAnchorIds);
    const claimedBy = new Map<string, string>(); // postId -> anchorId
    const anchorParent = new Map<string, string>(); // anchorId -> parent anchorId
    const groupTotal = new Map<string, number>(); // anchorId -> total similar count
    const groupShown = new Map<string, number>(); // anchorId -> shown similar count

    // No active anchors — revert to server order and clear tracking refs.
    if (reRankAnchorIds.length === 0) {
      baseOrderRef.current = [];
      activeAnchorIdRef.current = null;
      let result = [...relatedStacks];
      if (filterCategories.size > 0) {
        result = result.filter((s) => {
          const cats = new Set<string>();
          for (const r of s.topPost.relations ?? []) cats.add(r.category);
          let allPresent = true;
          filterCategories.forEach(c => { if (!cats.has(c)) allPresent = false; });
          return allPresent;
        });
      }
      return { displayStacks: result, claimedBy, anchorSet, anchorParent, groupTotal, groupShown };
    }

    // E: Only the most recently added anchor drives reordering (single-anchor semantics).
    const anchorId = reRankAnchorIds[reRankAnchorIds.length - 1];

    // Detect anchor transition: new anchor was added or replaced the previous one.
    if (anchorId !== activeAnchorIdRef.current) {
      // Capture the order the user currently sees as the new base.
      // prevDisplayStacksRef holds the displayStacks from the previous render (before this anchor).
      const prev = prevDisplayStacksRef.current;
      baseOrderRef.current = (prev.length > 0 ? prev : relatedStacks).map(s => s.topPost.id);
      activeAnchorIdRef.current = anchorId;
    }

    // Reconstruct baseStacks from the captured IDs (drop IDs no longer in relatedStacks).
    const stackById = new Map(relatedStacks.map(s => [s.topPost.id, s]));
    const baseStacks: RelatedStackType[] = baseOrderRef.current
      .map(id => stackById.get(id))
      .filter((s): s is RelatedStackType => s !== undefined);
    // Fall back to relatedStacks order if base is somehow empty.
    const workingStacks = baseStacks.length > 0 ? baseStacks : [...relatedStacks];

    // Find anchor entry in the working set.
    const anchorEntry = workingStacks.find(s => s.topPost.id === anchorId);
    if (!anchorEntry) {
      // Anchor not found — return as-is.
      let result = [...workingStacks];
      if (filterCategories.size > 0) {
        result = result.filter((s) => {
          const cats = new Set<string>();
          for (const r of s.topPost.relations ?? []) cats.add(r.category);
          let allPresent = true;
          filterCategories.forEach(c => { if (!cats.has(c)) allPresent = false; });
          return allPresent;
        });
      }
      return { displayStacks: result, claimedBy, anchorSet, anchorParent, groupTotal, groupShown };
    }

    const anchorContent = anchorEntry.topPost.content;

    // Topic-based when the anchor was created by clicking a specific highlight.
    // Falls back to content word-similarity when the anchor has no usable relation.
    const anchorRangeIdx = anchoredRangeByPost[anchorId];
    // Always resolve a topic via synthetic fallback so matching is consistent
    // with topicOf() used elsewhere. We only use topic-based matching when the
    // anchor was activated via a specific range index; otherwise fall back to
    // content similarity.
    const anchorRelation = anchorRangeIdx !== undefined
      ? anchorEntry.topPost.relations?.[anchorRangeIdx]
      : undefined;
    const anchorTopic = anchorRelation
      ? topicOf(anchorRelation, anchorEntry.stackId, anchorRangeIdx!)
      : undefined;

    // Build the set of ALL matching post IDs (before pagination).
    const allMatchedIds = new Set<string>();
    if (anchorTopic) {
      for (const s of workingStacks) {
        if (s.topPost.id === anchorId) continue;
        // Match using topicOf() on each relation so synthetic topics align
        if ((s.topPost.relations ?? []).some((r, ri) => topicOf(r, s.stackId, ri) === anchorTopic)) {
          allMatchedIds.add(s.topPost.id);
        }
      }
    } else {
      // Similarity-based fallback — collect sorted by score.
      const scored: { id: string; score: number }[] = [];
      for (const s of workingStacks) {
        if (s.topPost.id === anchorId) continue;
        const score = similarityScore(s.topPost.content, anchorContent);
        if (score > SIMILARITY_THRESHOLD) scored.push({ id: s.topPost.id, score });
      }
      // Sort by score descending; then add IDs in that order (Set preserves insertion order).
      scored.sort((a, b) => b.score - a.score);
      for (const { id } of scored) allMatchedIds.add(id);
    }

    groupTotal.set(anchorId, allMatchedIds.size);

    if (allMatchedIds.size === 0) {
      groupShown.set(anchorId, 0);
      let result = [...workingStacks];
      if (filterCategories.size > 0) {
        result = result.filter((s) => {
          const cats = new Set<string>();
          for (const r of s.topPost.relations ?? []) cats.add(r.category);
          let allPresent = true;
          filterCategories.forEach(c => { if (!cats.has(c)) allPresent = false; });
          return allPresent;
        });
      }
      return { displayStacks: result, claimedBy, anchorSet, anchorParent, groupTotal, groupShown };
    }

    // Pagination: only show the first N matched posts.
    const shown = shownByAnchor[anchorId] ?? SHOWN_INCREMENT;
    const allMatchedArray = Array.from(allMatchedIds);
    const visibleMatchedIds = new Set(allMatchedArray.slice(0, shown));
    groupShown.set(anchorId, visibleMatchedIds.size);

    allMatchedArray.slice(0, shown).forEach(id => {
      claimedBy.set(id, anchorId);
    });

    // Remove non-visible matched posts (they are paginated out).
    const hiddenMatchedIds = new Set(allMatchedArray.slice(shown));
    const paginatedStacks = workingStacks.filter(s => !hiddenMatchedIds.has(s.topPost.id));

    // E: Apply above/below split — matched above anchor stay above, matched below stay below.
    let result = reorderForAnchor(
      paginatedStacks,
      anchorId,
      (pid) => visibleMatchedIds.has(pid),
    );

    // Populate anchorParent for visual connector-line indentation (single anchor: no parent).
    // reRankAnchorIds is always length ≤ 1 by setter invariant, so anchorParent stays empty.
    const anchorIdx = result.findIndex(s => s.topPost.id === anchorId);
    for (let k = anchorIdx - 1; k >= 0; k--) {
      const prevId = result[k].topPost.id;
      if (anchorSet.has(prevId)) { anchorParent.set(anchorId, prevId); break; }
      if (!claimedBy.has(prevId)) break;
    }

    // C1: multi-category filter with AND semantics across relations array
    if (filterCategories.size > 0) {
      result = result.filter((s) => {
        const cats = new Set<string>();
        for (const r of s.topPost.relations ?? []) cats.add(r.category);
        let allPresent = true;
        filterCategories.forEach(c => { if (!cats.has(c)) allPresent = false; });
        return allPresent;
      });
    }

    // D2: span filter — keep only stacks whose relations overlap the clicked focus-post span
    if (filterFocusSpan !== null) {
      result = result.filter(s =>
        (s.topPost.relations ?? []).some(r =>
          r.focusStart < filterFocusSpan.end && filterFocusSpan.start < r.focusEnd
        )
      );
    }

    return { displayStacks: result, claimedBy, anchorSet, anchorParent, groupTotal, groupShown };
  }, [relatedStacks, filterCategories, filterFocusSpan, reRankAnchorIds, shownByAnchor, anchoredRangeByPost]);

  // E: keep prevDisplayStacksRef up-to-date so the next anchor activation can
  // capture the order the user currently sees as the new baseOrder.
  useEffect(() => {
    prevDisplayStacksRef.current = displayStacks;
  }, [displayStacks]);

  const handleShowMore = (anchorId: string) => {
    setShownByAnchor(prev => ({ ...prev, [anchorId]: (prev[anchorId] ?? SHOWN_INCREMENT) + SHOWN_INCREMENT }));
  };

  /** Set of anchor IDs that actually pulled in at least one claimed post. */
  const anchorsWithClaims = useMemo(() => {
    const s = new Set<string>();
    claimedBy.forEach((anchorId) => s.add(anchorId));
    return s;
  }, [claimedBy]);

  /**
   * D3: shortest common related text — the narrowest focus-post substring that
   * all currently-visible stacks' relevant relations collectively cover.
   * Only computed when filterFocusSpan is active.
   */
  const shortestCommonText = useMemo<string | null>(() => {
    if (!filterFocusSpan) return null;
    if (displayStacks.length === 0) return null;

    let maxStart = filterFocusSpan.start;
    let minEnd = filterFocusSpan.end;

    for (const s of displayStacks) {
      const rels = (s.topPost.relations ?? []).filter(r =>
        filterCategories.size === 0 || filterCategories.has(r.category)
      );
      for (const r of rels) {
        // Only narrow on relations that actually overlap the span filter
        if (r.focusStart < filterFocusSpan.end && filterFocusSpan.start < r.focusEnd) {
          if (r.focusStart > maxStart) maxStart = r.focusStart;
          if (r.focusEnd < minEnd) minEnd = r.focusEnd;
        }
      }
    }

    let text: string;
    if (
      maxStart < minEnd &&
      maxStart >= filterFocusSpan.start &&
      minEnd <= filterFocusSpan.end
    ) {
      text = filterFocusSpan.text.slice(maxStart - filterFocusSpan.start, minEnd - filterFocusSpan.start);
    } else {
      text = filterFocusSpan.text; // fallback: show the full clicked span
    }

    return text.length > 60 ? text.slice(0, 60) + '…' : text;
  }, [displayStacks, filterFocusSpan, filterCategories]);

  const EDGE_HOVER_HEIGHT = 28;

  const handleNavigate = (postId: string, newStackId: string) => {
    if (onPostNavigate) { onPostNavigate(postId); return; }
    // H5: build params — preserve stackId, add ?from= when navigating from a known focus post
    const navParams = new URLSearchParams();
    if (newStackId) navParams.set("stackId", newStackId);
    if (sourcePostId) navParams.set("from", sourcePostId);
    const search = navParams.toString();
    const url = `/posts/${postId}${search ? "?" + search : ""}`;
    sessionStorage.setItem(`previousPath:/posts/${postId}`, window.location.pathname);
    sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
    router.push(url);
  };

  // Hover-prefetch: warm the live post route (its RSC payload enters Next's
  // prefetch cache) so clicking a related card navigates instantly. Skipped in
  // mock mode (onPostNavigate), where the data is already in memory.
  const prefetchedRef = useRef<Set<string>>(new Set());
  const prefetchPost = (postId: string) => {
    if (onPostNavigate || prefetchedRef.current.has(postId)) return;
    prefetchedRef.current.add(postId);
    try { router.prefetch(`/posts/${postId}`); } catch { /* prefetch is best-effort */ }
  };

  const handleNavigateToUser = (e: React.MouseEvent, account: { acct?: string; username?: string; display_name: string }) => {
    e.preventDefault();
    e.stopPropagation();
    const profileHandle = account.acct || account.username || account.display_name;
    router.push(`/user/${profileHandle}`);
  };

  const containerVariants = {
    hidden: { opacity: 1 },
    show: { opacity: 1, transition: { staggerChildren: 0.15 } },
  };

  // Per-item enter / exit / layout-change variants.
  // `layout` on motion.div handles reordering (up/down) smoothly.
  // AnimatePresence handles enter/exit (vanish) when a post appears/disappears.
  const itemVariants = {
    hidden: { opacity: 0, y: 24, scale: 0.96 },
    show: {
      opacity: 1, y: 0, scale: 1,
      transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] as any },
    },
    exit: {
      opacity: 0, scale: 0.97,
      transition: { duration: 0.2, ease: "easeIn" },
    },
  };

  const handleOpenStackModal = (stackId: string) => {
    setCurrentStackId(stackId);
    setStackPostsModalOpen(true);
  };

  // ── Scroll-pinning state for anchor toggle ─────────────────────────────────
  // When toggling an anchor, we:
  //   1. Disable `layout` on the pinned card (no FLIP transform → it snaps to new DOM position).
  //   2. Compensate scrollTop in useLayoutEffect BEFORE paint so the card never visually moves.
  //   Other cards keep `layout` and animate smoothly around the pinned one.
  const pinnedPostIdRef = useRef<string | null>(null);
  const pinnedPrevTopRef = useRef<number | null>(null);

  /** Toggle an anchor. The interacted card stays visually pinned while other
   *  cards animate around it. */
  const handleToggleAnchor = (postId: string, rangeIndex?: number) => {
    // Clear hover state — card indices shift after reorder, so old
    // hoveredCardIndex would point at a different card → everything dims.
    setHoveredCardIndex(null);
    setHoveredSidebarPost(null);
    setHoveredHighlightRangeIndex(null);
    setHoveredCategory(null);
    clearTapped();

    // Capture position BEFORE the reorder
    const cardEl = document.querySelector(`[data-post-id="${postId}"]`) as HTMLElement | null;
    pinnedPostIdRef.current = postId;
    pinnedPrevTopRef.current = cardEl ? absoluteOffsetTop(cardEl) : null;

    toggleReRankAnchor(postId, rangeIndex);
  };

  // Compensate scroll BEFORE paint — runs after React commits the DOM update
  // but before the browser paints, so the card never visually moves.
  useLayoutEffect(() => {
    const postId = pinnedPostIdRef.current;
    const prevTop = pinnedPrevTopRef.current;
    if (!postId || prevTop === null) return;

    // Clear refs so future renders don't re-compensate
    pinnedPostIdRef.current = null;
    pinnedPrevTopRef.current = null;

    const cardEl = document.querySelector(`[data-post-id="${postId}"]`) as HTMLElement | null;
    if (!cardEl) return;
    const newTop = absoluteOffsetTop(cardEl);
    const delta = newTop - prevTop;
    if (Math.abs(delta) > 1) {
      const aside = document.querySelector('.mantine-AppShell-aside');
      if (aside) aside.scrollTop += delta;
    }
  });

  /** Ref-based guard: set when a touch tap just "activated" a card/range so the
   *  synthetic click that follows doesn't also navigate. */
  const skipNextClickRef = useRef(false);

  /** Card-level click: navigate, unless click originated on a highlight <mark> (those handle their own onClick),
   *  or we're suppressing the click after a touch tap that activated something. */
  const handleCardClick = (e: React.MouseEvent, postId: string, stackId: string) => {
    if (skipNextClickRef.current) { skipNextClickRef.current = false; return; }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('mark')) return;
    handleNavigate(postId, stackId);
  };

  /** Touch tap on card body. First tap activates; tap again on same active card with no range triggers rerank (top range). */
  const handleCardTap = (e: React.PointerEvent, postId: string, _stackId: string) => {
    if (e.pointerType !== 'touch') return;
    const target = e.target as HTMLElement | null;
    const markEl = target?.closest('mark') as HTMLElement | null;
    if (markEl) {
      // Resolve range id from the mark
      const singleId = markEl.getAttribute('data-range-id');
      let rangeIdx: number | null = null;
      if (singleId !== null) {
        rangeIdx = parseInt(singleId, 10);
      } else {
        const ids = markEl.getAttribute('data-overlap-range-ids');
        if (ids) {
          const bands = ids.split(',').map(n => parseInt(n, 10));
          const rect = markEl.getBoundingClientRect();
          const rel = (e.clientY - rect.top) / rect.height;
          const bandIdx = Math.max(0, Math.min(bands.length - 1, Math.floor(rel * bands.length)));
          rangeIdx = bands[bandIdx];
        }
      }
      if (rangeIdx === null || Number.isNaN(rangeIdx)) return;
      // Second tap on the same active range → rerank
      if (tappedCardPostId === postId && tappedRangeIndex === rangeIdx) {
        skipNextClickRef.current = true;
        handleToggleAnchor(postId, rangeIdx);
        clearTapped();
        return;
      }
      skipNextClickRef.current = true;
      setTapped(postId, rangeIdx);
      setHoveredSidebarPost(postId, relatedStacks.find(s => s.topPost.id === postId)?.topPost.relations);
      setHoveredHighlightRangeIndex(rangeIdx);
      return;
    }
    // Non-mark tap: toggle card-level active, don't navigate on the first tap.
    if (tappedCardPostId === postId && tappedRangeIndex === null) {
      // Second tap on already-active card (no range) → clear and allow click to navigate
      clearTapped();
      return;
    }
    skipNextClickRef.current = true;
    setTapped(postId, null);
    setHoveredSidebarPost(postId, relatedStacks.find(s => s.topPost.id === postId)?.topPost.relations);
    setHoveredHighlightRangeIndex(null);
  };

  // hoveredIndex: for the stacked-card bottom-edge layer effect only
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // hoveredCardIndex: tracks which card the mouse is actually over (for highlight marks + cross-highlighting)
  const [hoveredCardIndex, setHoveredCardIndex] = useState<number | null>(null);

  // Debounced range hover — prevents Level 2 from firing immediately on card enter
  const rangeHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRangeHover = useRef((idx: number | null) => {
    if (rangeHoverTimer.current) clearTimeout(rangeHoverTimer.current);
    if (idx === null) {
      setHoveredHighlightRangeIndex(null);
    } else {
      rangeHoverTimer.current = setTimeout(() => setHoveredHighlightRangeIndex(idx), 200);
    }
  }).current;

  // Identity of the focus post these stacks belong to. Revalidation produces a
  // new `relatedStacks` array reference for the *same* logical post, so we key
  // the reset on this stable id rather than the array reference — otherwise a
  // background refresh would wipe the user's active filter/anchor mid-interaction.
  // Prefer an explicit sourcePostId; fall back to the first stack's post id.
  const focusPostIdentity = sourcePostId ?? relatedStacks[0]?.topPost.id ?? null;

  // Reset stale hover + anchors when the focus post actually changes.
  useEffect(() => {
    setHoveredCardIndex(null);
    setHoveredIndex(null);
    hideTooltip();
    if (rangeHoverTimer.current) clearTimeout(rangeHoverTimer.current);
    clearReRankAnchors();
    clearTapped();
    clearFilterFocusSpan(); // D2: clear span filter when focus post changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPostIdentity]);

  // Touch: tap-outside clears the active state so highlights/sidebar reset.
  useEffect(() => {
    if (!isTouch) return;
    if (tappedCardPostId === null) return;
    const handler = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const target = e.target as HTMLElement | null;
      // If the tap is on one of our cards, the per-card onPointerDown handles it.
      if (target && target.closest('[data-related-card]')) return;
      clearTapped();
      setHoveredSidebarPost(null);
      setHoveredHighlightRangeIndex(null);
      setHoveredCategory(null);
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true } as any);
  }, [isTouch, tappedCardPostId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Sticky header: title + filter chips + count — stays visible while scrolling */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        // paddingTop gives a stable gap under the top bar that is part of the
        // header's own (opaque) painted area, so it does not collapse when the
        // panel scrolls and never lets scrolled cards show through above it.
        background: '#FCFBF5', paddingTop: '0.6rem', paddingBottom: '0.5rem',
      }}>
        <Text size="sm" fw={700} c="#374151" mb={6}>Related responses</Text>
        <Text size="xs" c="dimmed" mb="xs">Hover a post to highlight the relevant parts</Text>

        {categories.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "0.75rem" }}>
            {(() => {
              // C2: compute preview mode once for the whole chip row
              const previewMode = computePreviewMode(chipHovered, filterCategories, relatedStacks);
              return categories.map(([category, count]) => (
                <FilterChip
                  key={category}
                  category={category}
                  count={count}
                  active={filterCategories.has(category)}
                  previewActive={previewMode !== 'none' && category === chipHovered}
                  previewDim={previewMode === 'switch' && filterCategories.has(category)}
                  onClick={() => handleFilterChipClick(category)}
                  onMouseEnter={() => setChipHovered(category)}
                  onMouseLeave={() => setChipHovered(null)}
                />
              ));
            })()}
          </div>
        )}

        <Text size="xs" c="dimmed" mb={4} data-testid="related-count">
          {filterCategories.size > 0 && filterFocusSpan !== null
            ? `${displayStacks.length} post${displayStacks.length !== 1 ? 's' : ''} matching category + span`
            : filterFocusSpan !== null
            ? `${displayStacks.length} post${displayStacks.length !== 1 ? 's' : ''} matching span`
            : filterCategories.size > 0
            ? `${displayStacks.length} ${Array.from(filterCategories).map(c => CATEGORY_LABELS[c] ?? c).join(' + ')} post${displayStacks.length !== 1 ? 's' : ''}`
            : `${displayStacks.length} posts across all categories`}
        </Text>

        {/* D2: span filter active indicator */}
        {filterFocusSpan !== null && (
          <div data-testid="span-filter-pill" style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px',
            background: '#f1f5f9', borderRadius: '6px', marginBottom: '0.5rem',
            border: '1px solid #cbd5e1', flexWrap: 'wrap',
          }}>
            <Text size="xs" c="#5a71a8" fw={600} style={{ fontSize: '11px', flexShrink: 0 }}>
              Span:
            </Text>
            <Text size="xs" c="#64748b" style={{
              fontSize: '10px', fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '140px', fontStyle: 'italic',
            }}>
              "{filterFocusSpan.text.length > 35 ? filterFocusSpan.text.slice(0, 35) + '…' : filterFocusSpan.text}"
            </Text>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clearFilterFocusSpan(); }}
              // A5: 24px minimum hit target. Larger transparent zone around the
              // glyph so the close button can actually be clicked reliably.
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94a3b8', fontSize: '16px', lineHeight: 1,
                padding: '6px 8px', marginLeft: 'auto',
                minWidth: 24, minHeight: 24,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#475569'; (e.currentTarget as HTMLElement).style.background = '#e2e8f0'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
              aria-label="Clear span filter"
            >×</button>
          </div>
        )}

        {/* "More like this" active indicator — single anchor only */}
        {reRankAnchorIds.length > 0 && (
          <div data-testid="grouped-by-pill" style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px',
            background: '#f0f4ff', borderRadius: '6px', marginBottom: '0.5rem', flexWrap: 'wrap',
          }}>
            <Text size="xs" c="#5a71a8" fw={600} style={{ fontSize: '11px' }}>
              Grouped by:
            </Text>
            {reRankAnchorIds.map(id => {
              const a = relatedStacks.find(s => s.topPost.id === id);
              const rangeIdx = anchoredRangeByPost[id];
              const rel = a?.topPost.relations?.[rangeIdx] ?? a?.topPost.relations?.[0];
              const topic = rel
                ? topicOf(rel, a!.stackId, rangeIdx ?? 0)
                : (a?.topPost.account.display_name ?? id);
              return (
                <button
                  type="button"
                  key={id}
                  // A5: real <button> with bigger hit area + visible affordance so
                  // the dismiss target doesn't get missed in study sessions.
                  style={{
                    background: '#dce4f5', borderRadius: '4px',
                    padding: '4px 8px', minHeight: 24,
                    fontSize: '10px', fontWeight: 600, color: '#3b5998',
                    cursor: 'pointer', border: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                  onClick={(e) => { e.stopPropagation(); handleToggleAnchor(id); }}
                  aria-label={`Remove ${topic} grouping`}
                  title="Click to remove this anchor"
                >
                  <span>{topic}</span>
                  <span aria-hidden style={{ fontSize: 14, lineHeight: 1, color: '#5b71a8' }}>×</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cards — no inner scroll, the aside's own scrollbar handles everything */}
      {/* C3: panelHovered wrapper — reveals category colors on multi-type cards when mouse enters cards area */}
      <div onMouseEnter={() => setPanelHovered(true)} onMouseLeave={() => setPanelHovered(false)}>
      <LayoutGroup>
      <motion.div
        variants={containerVariants} initial="hidden" animate="show"
        style={{
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
          paddingBottom: '1rem',
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
        {(() => {
          // Compute the active anchor's dominant topic (after synthetic fallback) so
          // each card can decide whether to show the F indicator.
          const activeAnchorId = reRankAnchorIds.length > 0
            ? reRankAnchorIds[reRankAnchorIds.length - 1]
            : null;
          const activeAnchorStack = activeAnchorId
            ? relatedStacks.find(s => s.topPost.id === activeAnchorId)
            : null;
          const activeAnchorRangeIdx = activeAnchorId != null
            ? (anchoredRangeByPost[activeAnchorId] ?? 0)
            : 0;
          const activeAnchorRel = activeAnchorStack?.topPost.relations?.[activeAnchorRangeIdx];
          const activeAnchorTopic: string | null = activeAnchorRel && activeAnchorStack
            ? topicOf(activeAnchorRel, activeAnchorStack.stackId, activeAnchorRangeIdx)
            : null;

          return displayStacks.flatMap((stack, index) => {
          const isCardHovered = hoveredCardIndex === index;
          const colors = getCategoryColors(stack.rel);
          const isExpanded = !!expandedCards[stack.stackId];

          const plainContent = stack.topPost.content;
          const rels = stack.topPost.relations;

          // Smart windowing: show only the highlighted portion unless expanded
          const { text: visibleText, adjustedRelations, hasPrefix, hasSuffix } =
            windowContent(plainContent, rels, isExpanded);
          const isTruncated = hasPrefix || hasSuffix;

          // "More like this" visual state + nesting depth for indentation
          const isAnchor = anchorSet.has(stack.topPost.id);
          const isReRanked = claimedBy.has(stack.topPost.id);
          // Calculate indent depth by walking the anchor chain. Per-level indent
          // is small (8px) so deep nesting doesn't overflow the right pane.
          let indentDepth = 0;
          if (isReRanked) {
            // Claimed post: depth = 1 (for its claimer) + claimer's own depth
            let aid = claimedBy.get(stack.topPost.id);
            while (aid) {
              indentDepth++;
              aid = anchorParent.get(aid); // walk anchor's parent chain
            }
          } else if (isAnchor) {
            // Anchor itself: depth from its parent chain
            let aid = anchorParent.get(stack.topPost.id);
            while (aid) {
              indentDepth++;
              aid = anchorParent.get(aid);
            }
          }
          const indentPx = indentDepth * 8;

          // Card-level dim/bright: when any card is hovered OR tapped, non-active cards dim.
          const isCardTapped = tappedCardPostId === stack.topPost.id;
          const isCardActive = isCardHovered || isCardTapped;
          const anyCardHovered = hoveredCardIndex !== null || tappedCardPostId !== null;
          const cardDimStyle = anyCardHovered && !isCardActive
            ? { opacity: 0.45, filter: 'grayscale(0.3)' }
            : { opacity: 1, filter: 'none' };

          // Build React content nodes with multi-range + 3-level hover
          const contentNodes = buildMultiHighlightNodes(
            visibleText, adjustedRelations, colors,
            {
              isCardHovered: isCardActive,
              anyCardHovered,
              hoveredRangeIndex: isCardActive ? (isCardTapped ? tappedRangeIndex : hoveredHighlightRangeIndex) : null,
              hoveredCategory: isCardActive ? hoveredCategory : null,
              anchoredRangeIndex: anchoredRangeByPost[stack.topPost.id] ?? null,
              onRangeHover: debouncedRangeHover,
              onRangeClick: (ri) => handleToggleAnchor(stack.topPost.id, ri),
              otherCountByTopic: (topic: string) => {
                const total = topicTotal.get(topic) ?? 0;
                const hasSelf = postTopics.get(stack.topPost.id)?.has(topic) ? 1 : 0;
                return Math.max(0, total - hasSelf);
              },
              stackId: stack.stackId,
            },
          );

          // ── Anchor-group topic ─────────────────────────────────────────────
          // The "Trial results ×" topic label appears between the anchor and its
          // first claim. Claims get a thin left border + small indent to indicate
          // nesting under the anchor. The anchor itself is rendered like any
          // ungrouped card.
          const anchorOf = (s: RelatedStackType | undefined): string | undefined => {
            if (!s) return undefined;
            if (claimedBy.has(s.topPost.id)) return claimedBy.get(s.topPost.id);
            if (anchorSet.has(s.topPost.id) && anchorsWithClaims.has(s.topPost.id)) return s.topPost.id;
            return undefined;
          };
          const anchorForThisCard = anchorOf(stack);
          const anchorForPrev = index > 0 ? anchorOf(displayStacks[index - 1]) : undefined;
          const anchorForNext = index + 1 < displayStacks.length ? anchorOf(displayStacks[index + 1]) : undefined;

          const isClaim = isReRanked; // this card was pulled in under an anchor
          // First claim of a group: previous card is the anchor of the same group
          const isFirstClaim = isClaim && index > 0
            && displayStacks[index - 1].topPost.id === claimedBy.get(stack.topPost.id);
          const isLastInGroup = !!anchorForThisCard && anchorForThisCard !== anchorForNext;

          const anchorStack = anchorForThisCard
            ? relatedStacks.find(s => s.topPost.id === anchorForThisCard)
            : undefined;
          const anchorRangeIdx = anchorForThisCard
            ? (anchoredRangeByPost[anchorForThisCard] ?? 0)
            : undefined;
          const anchorTopic: string | undefined = (() => {
            if (!anchorStack) return undefined;
            const rel = anchorStack.topPost.relations?.[anchorRangeIdx ?? 0];
            if (!rel) return anchorStack.topPost.account.display_name ?? undefined;
            // Always produce a topic: real topic first, then synthetic fallback
            return topicOf(rel, anchorStack.stackId, anchorRangeIdx ?? 0);
          })();
          const anchorColors = anchorStack
            ? getCategoryColors(
                anchorStack.topPost.relations?.[anchorRangeIdx ?? 0]?.category ?? anchorStack.rel
              )
            : colors;

          // Pagination metadata for "MORE [topic]" link rendered after the last claim of a group
          const groupTotalForThis = anchorForThisCard ? (groupTotal.get(anchorForThisCard) ?? 0) : 0;
          const groupShownForThis = anchorForThisCard ? (groupShown.get(anchorForThisCard) ?? 0) : 0;
          const groupRemaining = Math.max(0, groupTotalForThis - groupShownForThis);
          const canShowMore = isClaim && isLastInGroup && groupRemaining > 0;
          if (canShowMore && !anchorTopic && anchorForThisCard) {
            warnMissingTopic(anchorForThisCard, anchorRangeIdx ?? -1);
          }
          const showMoreLink = canShowMore && !!anchorTopic;

          // "MORE [topic]" pagination — caps the bottom of the group connector
          // line. Rendered inside the last claim's motion.div (below the Paper)
          // so its lifecycle is tied to the card. Kept out of the parent
          // AnimatePresence's flatMap because popLayout mode strands such
          // children at opacity:0 forever when their key disappears.
          const buttonHover = (clientX: number, clientY: number) => {
            if (!anchorTopic) return;
            showTooltip({
              content: buildTooltipLabel(anchorTopic, groupRemaining, anchorColors.text),
              colors: { text: anchorColors.text, border: anchorColors.border },
              x: clientX,
              y: clientY,
            });
          };
          const moreEl = showMoreLink && anchorForThisCard ? (
            <div
              style={{
                position: 'relative',
                marginLeft: `${indentPx}px`,
                paddingLeft: '8px',
                marginTop: GROUP_GAP_PX,
              }}
            >
              <div aria-hidden style={{
                position: 'absolute',
                left: 0,
                top: -GROUP_GAP_PX,
                bottom: '50%',
                width: GROUP_LINE_WIDTH,
                background: anchorColors.border,
                borderRadius: GROUP_LINE_WIDTH,
              }} />
              <button
                type="button"
                className="show-more-link"
                data-testid="more-like-this"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShowMore(anchorForThisCard);
                }}
                onMouseEnter={(e) => buttonHover(e.clientX, e.clientY)}
                onMouseLeave={() => hideTooltip()}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') buttonHover(e.clientX, e.clientY); }}
                onPointerLeave={(e) => { if (e.pointerType === 'mouse') hideTooltip(); }}
                style={{ color: anchorColors.text }}
              >
                {groupRemaining} more <strong style={{ color: anchorColors.text }}>{anchorTopic}</strong>
              </button>
            </div>
          ) : null;

          // Label (between anchor and first claim) — rendered as its own animated row.
          // The chip + × button cap the top of the connector line; the line itself
          // begins just below the chip and bridges into the gap before the first claim.
          const chipHover = (clientX: number, clientY: number) => {
            if (!anchorTopic) return;
            showTooltip({
              content: buildTooltipLabel(anchorTopic, groupRemaining, anchorColors.text),
              colors: { text: anchorColors.text, border: anchorColors.border },
              x: clientX,
              y: clientY,
            });
          };
          const labelEl = isFirstClaim && anchorForThisCard ? (
            <motion.div
              key={`label-${anchorForThisCard}`}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', gap: '6px',
                marginLeft: `${indentPx}px`,
                padding: '2px 0 4px 2px',
              }}
            >
              <div aria-hidden style={{
                position: 'absolute',
                left: 0,
                top: '100%',
                bottom: -GROUP_GAP_PX,
                width: GROUP_LINE_WIDTH,
                background: anchorColors.border,
                borderRadius: GROUP_LINE_WIDTH,
              }} />
              <span
                onMouseEnter={(e) => chipHover(e.clientX, e.clientY)}
                onMouseLeave={() => hideTooltip()}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') chipHover(e.clientX, e.clientY); }}
                onPointerLeave={(e) => { if (e.pointerType === 'mouse') hideTooltip(); }}
                style={{
                  fontSize: '11px', fontWeight: 600, color: anchorColors.text,
                  background: anchorColors.bg, border: `1px solid ${anchorColors.border}55`,
                  borderRadius: '4px', padding: '1px 6px',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: '220px',
                }}
              >
                {anchorTopic ?? 'Related'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleAnchor(anchorForThisCard);
                }}
                aria-label={`Dismiss ${anchorTopic ?? 'group'}`}
                // A5: 24px hit target. Background appears on hover so the click
                // affordance is obvious.
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', fontSize: '16px', lineHeight: 1,
                  padding: '6px 8px',
                  minWidth: 24, minHeight: 24,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#475569'; (e.currentTarget as HTMLElement).style.background = '#e2e8f0'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                ×
              </button>
            </motion.div>
          ) : null;

          const cardEl = (
            <motion.div
              key={stack.stackId}
              layout={pinnedPostIdRef.current !== stack.topPost.id}
              variants={itemVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              data-related-card
              style={{
                position: 'relative', width: '100%', borderRadius: '10px',
                ...cardDimStyle,
                // Claims sit alongside a continuous group connector line (rendered
                // as an absolute child below). The padding leaves room for it; the
                // line itself bridges the flex gap above so the group reads as one
                // continuous thread rather than per-card border segments.
                paddingLeft: isClaim ? '8px' : undefined,
                marginLeft: indentPx > 0 ? `${indentPx}px` : undefined,
                transition: 'filter 200ms ease',
              }}
              onMouseMove={(e) => {
                const el = paperRefs.current[index];
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const x = e.clientX, y = e.clientY;
                const withinX = x >= rect.left && x <= rect.right;
                const inBottomEdge = y >= rect.bottom && y <= rect.bottom + EDGE_HOVER_HEIGHT;
                const insideMain = y >= rect.top && y <= rect.bottom;
                if (withinX && inBottomEdge) setHoveredIndex(index);
                else if (withinX && insideMain) setHoveredIndex(null);
                else setHoveredIndex(null);
              }}
              onMouseLeave={() => {
                if (isTouch) return;
                // Only clear bottom-edge hoveredIndex here. Cross-highlight state
                // (hoveredCardIndex, hoveredSidebarPost, etc.) is owned by the
                // inner Paper's onMouseEnter/Leave. Clearing it here races with
                // the next card's Paper.onMouseEnter because this motion.div
                // extends past the inter-card gap (via the bottom-edge hover
                // zone) — leaving motion.div A can fire AFTER Paper B has
                // already set the new highlight, wiping it.
                setHoveredIndex(null);
              }}
              onPointerDown={(e) => handleCardTap(e, stack.topPost.id, stack.stackId)}
            >
              {isClaim && (
                <div aria-hidden style={{
                  position: 'absolute',
                  left: 0,
                  top: -GROUP_GAP_PX,
                  bottom: 0,
                  width: GROUP_LINE_WIDTH,
                  background: anchorColors.border,
                  borderRadius: GROUP_LINE_WIDTH,
                  zIndex: 0,
                }} />
              )}
              <Paper
                ref={(el) => { paperRefs.current[index] = el; }}
                data-post-id={stack.topPost.id}
                onMouseEnter={() => {
                  if (isTouch) return;
                  setHoveredIndex(null);
                  setHoveredCardIndex(index);
                  setHoveredSidebarPost(stack.topPost.id, stack.topPost.relations);
                  prefetchPost(stack.topPost.id);
                }}
                onMouseLeave={(e) => {
                  if (isTouch) return;
                  // A6: ignore Paper-leave events where the mouse went to a
                  // sibling that is still part of the SAME card container
                  // (bottom-edge zone, stack-shadow layers). Without this guard
                  // the cross-highlight/dim breaks every time the cursor brushes
                  // those zones mid-interaction.
                  // relatedTarget can be null OR a non-Node EventTarget (e.g. the
                  // window when the cursor leaves the viewport) — guard before
                  // calling Node.contains, which throws on a non-Node argument.
                  const next = e.relatedTarget;
                  if (next instanceof Node && (e.currentTarget as HTMLElement)
                      .closest('[data-related-card]')
                      ?.contains(next)) {
                    return;
                  }
                  setHoveredCardIndex(null); setHoveredSidebarPost(null);
                  setHoveredHighlightRangeIndex(null); setHoveredCategory(null);
                }}
                style={{
                  position: 'relative', width: '100%', backgroundColor: '#ffffff', zIndex: 5,
                  borderRadius: '10px', margin: '0 auto', paddingTop: '40px',
                  border: `2px solid #e2e8f0`,
                  boxShadow: stack.size > 1 ? 'none' : '0 2px 12px rgba(0,0,0,0.06)',
                  transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
                  cursor: 'pointer',
                }}
              >
                {/* Category tags — one per unique relation category, dims/brightens with highlight hover */}
                <div className="related-tag-row" style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '4px', alignItems: 'center', zIndex: 10, flexWrap: 'nowrap', maxWidth: 'calc(100% - 16px)', overflow: 'hidden' }}>
                  {(() => {
                    // Dedupe categories from relations, preserving order
                    const rels = stack.topPost.relations ?? [];
                    const seen = new Set<string>();
                    const tags: { cat: string; indices: number[] }[] = [];
                    for (let ri = 0; ri < rels.length; ri++) {
                      const cat = rels[ri].category;
                      if (!seen.has(cat)) { seen.add(cat); tags.push({ cat, indices: [ri] }); }
                      else { tags.find(t => t.cat === cat)?.indices.push(ri); }
                    }
                    const hri = isCardActive ? (isCardTapped ? tappedRangeIndex : hoveredHighlightRangeIndex) : null;
                    const hcat = isCardActive ? hoveredCategory : null;
                    // C3: multi-type posts show neutral color until panel is hovered
                    const isMultiType = tags.length > 1;
                    const showTagColor = !isMultiType || panelHovered;
                    return tags.map(({ cat, indices }) => {
                      const tc = getCategoryColors(cat);
                      const anyDirected = hri !== null || hcat !== null;
                      const tagBright = !anyDirected || indices.includes(hri ?? -1) || hcat === cat;
                      // Tag tooltip should match the highlight-text tooltip: show the
                      // TOPIC of the first relation of this category (the same relation
                      // a click would anchor on), and the count for THAT topic.
                      const tagRangeIdx = indices[0];
                      const tagTopic = topicOf(rels[tagRangeIdx], stack.stackId, tagRangeIdx);
                      const otherCount = Math.max(0, (topicTotal.get(tagTopic) ?? 0) - 1);
                      const tagHover = (clientX: number, clientY: number) => {
                        showTooltip({
                          content: buildTooltipLabel(tagTopic, otherCount, tc.text),
                          colors: { text: tc.text, border: tc.border },
                          x: clientX,
                          y: clientY,
                        });
                      };
                      return (
                        <div
                          key={cat}
                          data-testid="card-category-tag"
                          data-category={cat}
                          onMouseEnter={(e) => { if (!isTouch) setHoveredCategory(cat); tagHover(e.clientX, e.clientY); }}
                          onMouseLeave={() => { if (!isTouch) setHoveredCategory(null); hideTooltip(); }}
                          onPointerEnter={(e) => { if (e.pointerType !== 'mouse') return; tagHover(e.clientX, e.clientY); }}
                          onPointerLeave={(e) => { if (e.pointerType === 'mouse') hideTooltip(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isTouch) {
                              // Touch: tap toggles category highlight; second tap on same category triggers rerank on first matching range
                              if (hoveredCategory === cat && tappedCardPostId === stack.topPost.id) {
                                handleToggleAnchor(stack.topPost.id, indices[0]);
                                setHoveredCategory(null);
                                clearTapped();
                              } else {
                                setTapped(stack.topPost.id, null);
                                setHoveredSidebarPost(stack.topPost.id, stack.topPost.relations);
                                setHoveredCategory(cat);
                              }
                            } else {
                              // Desktop: clicking a relation tag anchors this card and clusters
                              // same-topic posts above/below it — same as a highlight-substring
                              // click or the F-indicator chip on the top-right.
                              handleToggleAnchor(stack.topPost.id, indices[0]);
                            }
                          }}
                          style={{
                            // C3: neutral colors for multi-type cards until panel is hovered
                            background: showTagColor ? tc.bg : '#f0f0f0',
                            color: showTagColor ? tc.text : '#888888',
                            borderRadius: '5px',
                            padding: '2px 7px', display: 'flex', alignItems: 'center', gap: '4px',
                            border: `1px solid ${showTagColor ? tc.border : '#d0d0d0'}`,
                            opacity: tagBright ? 1 : 0.3,
                            transition: 'background 200ms ease, color 200ms ease, border-color 200ms ease, opacity 200ms ease',
                            cursor: 'pointer',
                          }}
                        >
                          {React.cloneElement(iconMapping[cat] || iconMapping['default'], { color: showTagColor ? tc.text : '#888888', size: 12 })}
                          <Text className="related-tag-text" size="xs" c={showTagColor ? tc.text : '#888888'} fw={700} style={{ fontSize: '10px' }}>
                            {CATEGORY_LABELS[cat] ?? cat}
                          </Text>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* F: Relation indicator — top-right. Shows the active grouping topic
                    (driven by activeAnchorTopic) so the label always matches the
                    "Grouped by:" pill at the top of the panel. Only visible when:
                    (a) this card is the active see-more anchor, or
                    (b) this card is part of the active anchor's topic cluster. */}
                {(() => {
                  const rels = stack.topPost.relations ?? [];
                  if (rels.length === 0) return null;
                  const isCurrentAnchor =
                    reRankAnchorIds.length > 0 &&
                    reRankAnchorIds[reRankAnchorIds.length - 1] === stack.topPost.id;
                  // Gate: only show when active anchor or in the active anchor's cluster
                  const isInActiveCluster = activeAnchorTopic !== null &&
                    rels.some((r, ri) => topicOf(r, stack.stackId, ri) === activeAnchorTopic);
                  const showRelationIndicator = isCurrentAnchor || isInActiveCluster;
                  if (!showRelationIndicator) return null;
                  // Pick the relation on THIS card that matches activeAnchorTopic — that's
                  // the topic driving this card's place in the cluster. Fall back to rels[0]
                  // only if no match (shouldn't happen when the gate above passes, but defensive).
                  const matchIdx = activeAnchorTopic
                    ? rels.findIndex((r, ri) => topicOf(r, stack.stackId, ri) === activeAnchorTopic)
                    : -1;
                  const indicatorRel = matchIdx >= 0 ? rels[matchIdx] : rels[0];
                  const indicatorRangeIdx = matchIdx >= 0 ? matchIdx : 0;
                  const indicatorTopic = activeAnchorTopic ?? topicOf(rels[0], stack.stackId, 0);
                  const uniqueCategories = new Set(rels.map(r => r.category));
                  const isMultiTypeIndicator = uniqueCategories.size > 1;
                  const indicatorColors = getCategoryColors(indicatorRel.category);
                  const showIndicatorColor = !isMultiTypeIndicator || panelHovered;
                  const indicatorColor = showIndicatorColor ? indicatorColors.text : '#888888';
                  const clusterCount = topicTotal.get(indicatorTopic) ?? 0;
                  const baseOpacity = showIndicatorColor ? (isCurrentAnchor ? 1 : 0.75) : 0.6;
                  return (
                    <button
                      type="button"
                      className="related-topic-label"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleAnchor(stack.topPost.id, indicatorRangeIdx);
                      }}
                      aria-label={`Show more posts about ${indicatorTopic}`}
                      aria-pressed={isCurrentAnchor}
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        zIndex: 10,
                        background: isCurrentAnchor ? indicatorColors.bg : 'transparent',
                        border: isCurrentAnchor ? `1px solid ${indicatorColors.border}55` : 'none',
                        borderRadius: '4px',
                        padding: isCurrentAnchor ? '1px 5px' : '1px 4px',
                        cursor: 'pointer',
                        color: indicatorColor,
                        fontSize: '11px',
                        fontWeight: 600,
                        lineHeight: 1.3,
                        maxWidth: '160px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        opacity: baseOpacity,
                        transition: 'opacity 200ms ease, background 200ms ease, color 200ms ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = String(baseOpacity);
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
                        {indicatorTopic} ({clusterCount})
                      </span>
                      <span aria-hidden style={{ flexShrink: 0, fontSize: '10px', marginLeft: '1px' }}>&#x203A;</span>
                    </button>
                  );
                })()}

                <UnstyledButton onClick={() => handleNavigate(stack.topPost.id, stack.stackId)} style={{ width: '100%' }}>
                  <Group style={{ paddingLeft: '1rem' }}>
                    <UnstyledButton onClick={(e) => handleNavigateToUser(e, stack.topPost.account)} className="avatarHoverDim">
                      <Avatar src={stack.topPost.account.avatar} alt={stack.topPost.account.display_name} radius="xl" />
                    </UnstyledButton>
                    <div>
                      <Anchor component="button" onClick={(e) => handleNavigateToUser(e, stack.topPost.account)} underline="hover"
                        style={{ color: '#011445', fontWeight: 700, fontSize: 'var(--mantine-font-size-md)' }}>
                        {stack.topPost.account.display_name}
                      </Anchor>
                      <Text size="xs" c="dimmed">{formatPostDate(stack.topPost.created_at)}</Text>
                    </div>
                  </Group>
                </UnstyledButton>

                {/* Content with smart windowing + highlight marks on hover */}
                <div
                  onClick={(e) => handleCardClick(e, stack.topPost.id, stack.stackId)}
                  style={{ paddingLeft: '54px', paddingRight: '1rem', cursor: 'pointer' }}
                >
                  {/* D3: shortest common related text label — only when span filter is active */}
                  {shortestCommonText !== null && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center',
                      background: '#f1f5f9', border: '1px solid #cbd5e1',
                      borderRadius: '4px', padding: '1px 6px', marginBottom: '4px',
                      maxWidth: '100%',
                    }}>
                      <Text size="xs" c="#64748b" style={{
                        fontSize: '10px', fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontStyle: 'italic',
                      }}>
                        "{shortestCommonText}"
                      </Text>
                    </div>
                  )}
                  <Text component="p" size="sm" lh={1.55} c="#011445" style={{ margin: '0 0 0.4rem 0' }}>
                    {hasPrefix && <span style={{ color: '#94a3b8', userSelect: 'none' }}>…</span>}
                    {contentNodes}
                    {hasSuffix && !isExpanded && <span style={{ color: '#94a3b8', userSelect: 'none' }}>…</span>}
                  </Text>

                  {/* Read more / See less */}
                  {(isTruncated || isExpanded) && (
                    <Anchor
                      component="button" type="button" size="sm" underline="hover"
                      styles={{ root: { padding: 0, background: 'none', color: '#5a71a8', fontWeight: 600, cursor: 'pointer', marginBottom: '0.4rem', display: 'block' } }}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setExpandedCards(prev => ({ ...prev, [stack.stackId]: !isExpanded }));
                      }}
                      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                      onMouseUp={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      {isExpanded ? 'See less' : 'Read more'}
                    </Anchor>
                  )}

                </div>

                <Divider style={{ marginTop: '0.5rem', marginLeft: '1rem', marginRight: '1rem' }} />
                <div style={{ paddingLeft: '1rem', paddingRight: '1rem' }}>
                  <Group style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <InteractionControl icon={<IconMessageCircle size={20} />} label={stack.topPost.replies_count} ariaLabel="Replies"
                      onClick={() => handleNavigate(stack.topPost.id, stack.stackId)} />
                    <InteractionControl
                      icon={isFavourited(stack.topPost.id, stack.topPost.favourited) ? <IconHeartFilled size={20} /> : <IconHeart size={20} />}
                      label={getFavouritesCount(stack.topPost.id, stack.topPost.favourites_count)} ariaLabel="Favourites"
                      onClick={() => handleToggleFavourite(stack.topPost.id, isFavourited(stack.topPost.id, stack.topPost.favourited), getFavouritesCount(stack.topPost.id, stack.topPost.favourites_count))}
                      active={isFavourited(stack.topPost.id, stack.topPost.favourited)} />
                    <InteractionControl
                      icon={isBookmarked(stack.topPost.id, stack.topPost.bookmarked) ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
                      ariaLabel="Bookmark"
                      onClick={() => handleToggleBookmark(stack.topPost.id, isBookmarked(stack.topPost.id, stack.topPost.bookmarked))}
                      active={isBookmarked(stack.topPost.id, stack.topPost.bookmarked)} />
                    <InteractionControl icon={<IconShare size={20} />} ariaLabel="Share"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/posts/${stack.topPost.id}?stackId=${stack.stackId}`)
                          .then(() => {
                            notifications.show({
                              title: 'Link copied',
                              message: 'The link was copied to your clipboard',
                              color: 'green',
                            });
                          })
                          .catch(() => {
                            notifications.show({
                              title: 'Copy failed',
                              message: 'Could not copy the link',
                              color: 'red',
                            });
                          });
                      }} />
                  </Group>
                </div>
                {stack.size !== null && stack.size > 1 && (
                  <RelatedStackCount count={stack.size} onClick={() => handleOpenStackModal(stack.stackId)} />
                )}
              </Paper>

              {moreEl}

              {/* Bottom-edge hover zone */}
              <div aria-hidden style={{
                position: 'absolute', left: 0, right: 0, height: EDGE_HOVER_HEIGHT,
                bottom: -EDGE_HOVER_HEIGHT, zIndex: 2, pointerEvents: 'auto', background: 'transparent',
              }} onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)} />

              {stack.size !== null && stack.size > 1 && (
                <>
                  {[...Array(2)].map((_, idx) => (
                    <div key={idx} aria-hidden style={{
                      position: 'absolute', inset: 0,
                      transform: `translate(${6 - 3 * idx}px, ${12 - 6 * idx + (isCardHovered ? 20 - (idx * 10) : 0)}px)`,
                      width: '100%', backgroundColor: '#ffffff', borderRadius: '10px',
                      zIndex: idx + 1, pointerEvents: 'none', border: `2px solid #e2e8f0`,
                      boxShadow: idx === 0 ? '0 12px 24px rgba(0,0,0,0.18), 0 6px 12px rgba(0,0,0,0.12)' : 'none',
                      transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 200ms ease',
                    }} />
                  ))}
                </>
              )}
            </motion.div>
          );

          return [labelEl, cardEl].filter(Boolean);
          }); // end displayStacks.flatMap
        })()} {/* end activeAnchorTopic IIFE */}
        </AnimatePresence>
      </motion.div>
      </LayoutGroup>
      </div>{/* end panelHovered wrapper */}

      <StackPostsModal
        isOpen={stackPostsModalOpen} onClose={() => setStackPostsModalOpen(false)}
        apiUrl={currentStackId ? `https://beta.stacky.social:3002/stacks/${currentStackId}/posts` : ''}
        stackId={currentStackId}
      />
    </div>
  );
};

export default RelatedStacks;
