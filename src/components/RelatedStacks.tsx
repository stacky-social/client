import React, { useRef, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { Paper, UnstyledButton, Group, Avatar, Text, Divider, Anchor } from '@mantine/core';
import { IconMessageCircle, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare, IconQuestionMark, IconBulb, IconQuote, IconLink, IconPointer, IconBook, IconMoodSmile, IconFrame, IconUser, IconThumbUp, IconThumbDown } from '@tabler/icons-react';
import { Layers } from 'lucide-react';
import { formatPostDate } from '../utils/formatPostDate';
import RelatedStackCount from './RelatedStackCount';
import { useRouter } from 'next/navigation';
import StackPostsModal from './StackPostsModal';
import InteractionControl from './InteractionControl';
import { toggleFavourite, toggleBookmark } from '../utils/mastoActions';
import { notifications } from '@mantine/notifications';
import { copyLink } from '../utils/share';
import { useRelatedStacks } from '../app/(shell)/related-stacks-context';
import { setHoveredSidebarPost, setHoveredHighlightRangeIndex, setHoveredCategory, setTapped, clearTapped, toggleReRankAnchor, clearReRankAnchors, setFilterCategories, clearFilterFocusSpan, setPanelFocus, useHighlightStore } from '../utils/highlightStore';
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
  /** When set, the matching related card is emphasised + scrolled into view
   *  (arrived via a shared "pairing" link: …/posts/{source}?related={this}). */
  highlightPostId?: string | null;
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

/** When realCount ≤ 1, returns a deterministic value in [2, 7]; otherwise
 *  returns the real count unchanged. Topics genuinely absent (count = 0) still
 *  get a synthetic count here, but the missing-topic guard in the tooltip
 *  rendering path suppresses display whenever r.topic is falsy — so absent
 *  topics are never shown regardless of this count. */
function getSyntheticTopicCount(_topic: string, realCount: number): number {
  // No-op: synthetic boost removed because tooltip "N more" was promising
  // posts the load couldn't deliver. Real count is honest.
  return realCount;
}

/** Same logic as getSyntheticTopicCount but for relation categories. */
function getSyntheticCategoryCount(_category: string, realCount: number): number {
  // No-op: synthetic boost removed; see getSyntheticTopicCount.
  return realCount;
}

// ─── Tooltip label renderer ───────────────────────────────────────────────────
// "N more <Topic>" with the topic bolded in the category color. When `isShown`
// the wording becomes "N more <Topic> (shown)" — for hovering a span whose
// topic is already the active anchor's grouping. Returns null when topic is
// absent, so callers can short-circuit without rendering.
function buildTooltipLabel(
  topic: string | undefined,
  otherCount: number | undefined,
  textColor: string,
  isShown: boolean = false,
): React.ReactNode | null {
  if (!topic) return null;
  const count = otherCount ?? 0;
  return (
    <>
      {count} more <strong style={{ color: textColor }}>{topic}</strong>
      {isShown ? ' (shown)' : null}
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

/**
 * Group × category interaction. When a grouping (anchor) is active and the user
 * clicks/hovers a category chip, decide whether it STACKS onto the group or
 * REPLACES it:
 * - 'STACK'  → some post in the group also has every (current filters + candidate)
 *              category, so we keep the grouping and add the category constraint.
 * - 'SWITCH' → no group member matches, so clicking would abandon the grouping
 *              and just filter by the category instead.
 * Mirrors decideFilterMode (ADD/SWITCH) but scoped to the current group.
 */
function decideGroupFilterMode(
  groupMemberIds: Set<string>,
  stacks: RelatedStackType[],
  currentFilters: Set<string>,
  candidate: string,
): 'STACK' | 'SWITCH' {
  const need = new Set(currentFilters);
  need.add(candidate);
  for (const stack of stacks) {
    if (!groupMemberIds.has(stack.topPost.id)) continue;
    const cats = new Set<string>();
    for (const r of stack.topPost.relations ?? []) cats.add(r.category);
    let allPresent = true;
    need.forEach(c => { if (!cats.has(c)) allPresent = false; });
    if (allPresent) return 'STACK';
  }
  return 'SWITCH';
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
    /** Currently-active anchor topic (for in-block dimming + tooltip "shown"
     *  wording + no-op clicks). Null when no anchor is active. */
    activeTopic: string | null;
    /** True when this card is part of the active topic block — drives the
     *  "dim non-topic spans" behavior. False on cards outside the block. */
    inActiveBlock: boolean;
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
      const bandTopic = (c: { topic?: string; category: string; rangeIndex: number }) =>
        c.topic ?? getSyntheticTopic(c.category, `${opts.stackId}-${c.rangeIndex}`);
      const isBandOnActiveTopic = (c: { topic?: string; category: string; rangeIndex: number }) =>
        opts.activeTopic !== null && bandTopic(c) === opts.activeTopic;
      const gradientStops = cats.map((c, i) => {
        let a = baseAlpha;
        if (anyDirected) a = isBandActive(c) ? 1 : 0.18;
        // In-block dimming: dim bands whose topic isn't the active one
        // (unless this very band is hovered).
        else if (opts.inActiveBlock && !isBandOnActiveTopic(c) && !isBandActive(c)) a = 0.2;
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

        const resolvedTopic = bandTopic(band);
        const isShown = opts.activeTopic !== null && resolvedTopic === opts.activeTopic;
        const count = opts.otherCountByTopic ? opts.otherCountByTopic(resolvedTopic) : undefined;
        const colors: TooltipColors = { text: band.colors.text, border: band.colors.border };
        showTooltip({
          content: buildTooltipLabel(resolvedTopic, count, band.colors.text, isShown),
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
              // Forward to onRangeClick — handleToggleAnchor enforces the
              // "same-topic on a different post = no-op" rule; clicking the
              // anchor's own band must pass through to toggle the anchor off.
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

      // Resolved topic for this range — used for in-block dimming and the
      // "(shown)" tooltip wording / no-op click for same-topic spans.
      const resolvedTopicForRange = c.topic ?? getSyntheticTopic(c.category, `${opts.stackId}-${c.rangeIndex}`);
      const isOnActiveTopic = opts.activeTopic !== null && resolvedTopicForRange === opts.activeTopic;
      // In-block dimming: when this card sits inside the active topic block,
      // non-Topic spans dim out (unless this very span is hovered).
      const dimByBlock = opts.inActiveBlock && !isOnActiveTopic && !isThisRangeHovered;

      // 3-level background alpha — dims highlight background only, text stays readable
      const isAnchored = opts.anchoredRangeIndex === c.rangeIndex;
      let bgAlpha: number;
      if (isAnchored) {
        bgAlpha = 1; // Anchored range always stays bright
      } else if (opts.anchoredRangeIndex !== null && !opts.isCardHovered) {
        bgAlpha = 0.2; // Another range in this card is anchored — dim this one
      } else if (opts.isCardHovered) {
        if (!anyDirected) {
          bgAlpha = dimByBlock ? 0.2 : 1; // Level 1: this card hovered (dim non-Topic spans in block)
        } else {
          bgAlpha = isThisRangeHovered ? 1 : 0.2; // Level 2: specific range or category hovered
        }
      } else if (opts.anyCardHovered) {
        bgAlpha = 0.25; // Another card is hovered — dim these highlights
      } else if (dimByBlock) {
        bgAlpha = 0.2; // Non-Topic span inside the active topic block
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
              const count = opts.otherCountByTopic ? opts.otherCountByTopic(resolvedTopicForRange) : undefined;
              showTooltip({
                content: buildTooltipLabel(resolvedTopicForRange, count, colors.text, isOnActiveTopic),
                colors: { text: colors.text, border: colors.border },
                x: e.clientX,
                y: e.clientY,
              });
            }}
            onMouseLeave={() => { opts.onRangeHover(null); hideTooltip(); }}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse') return;
              opts.onRangeHover(c.rangeIndex);
              const count = opts.otherCountByTopic ? opts.otherCountByTopic(resolvedTopicForRange) : undefined;
              showTooltip({
                content: buildTooltipLabel(resolvedTopicForRange, count, colors.text, isOnActiveTopic),
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
              // Forward every click to onRangeClick (handleToggleAnchor) — it
              // owns the "same-topic on a different post = no-op" rule. The
              // anchor card's own span must still pass through so re-clicking
              // it toggles the anchor off.
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

const RelatedStacks: React.FC<RelatedStacksProps> = ({ relatedStacks, cardWidth = "100%", onStackClick, showupdate, onOpenModalWithStackId, onPostNavigate, sourcePostId, highlightPostId }) => {
  const router = useRouter();
  // Single source of truth for the focus post: the related cards are, by
  // definition, related TO the active post. Using the context here means the
  // share-a-pairing link always anchors on the focus post even if a given aside
  // forgot to thread the sourcePostId prop (which is what produced the "share
  // opens the related post instead of the pairing" bug).
  const { activePostId: ctxActivePostId } = useRelatedStacks();
  const paperRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Debounce hover activation. Hovering a card cross-highlights the (possibly
  // long) focus post, which re-parses its HTML + reflows (~300ms). Firing that
  // on every enter/leave as the cursor sweeps across cards stacks up into a
  // multi-second main-thread block (the "page died" freeze). Coalescing rapid
  // enter/leave into a single settle keeps the thread free while moving.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Shared-pairing highlight: scroll the emphasised card into view when arriving
  // via a …?related={id} link (or when the highlight target changes).
  const highlightCardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!highlightPostId) return;
    const el = highlightCardRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => clearTimeout(t);
  }, [highlightPostId, relatedStacks]);
  const [stackPostsModalOpen, setStackPostsModalOpen] = useState(false);
  const [favouritedOverride, setFavouritedOverride] = useState<Record<string, boolean>>({});
  const [bookmarkedOverride, setBookmarkedOverride] = useState<Record<string, boolean>>({});
  const [favouritesCountOverride, setFavouritesCountOverride] = useState<Record<string, number>>({});
  const { filterCategories, filterFocusSpan, hoveredHighlightRangeIndex, hoveredCategory, tappedCardPostId, tappedRangeIndex, reRankAnchorIds, anchoredRangeByPost } = useHighlightStore();
  // C2: hover preview state for filter chips
  const [chipHovered, setChipHovered] = useState<string | null>(null);
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
    // Optimistically reflect the toggle, then confirm/revert with the server result
    // (mastoActions now returns { ok, value } so failures can be surfaced).
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
      // Deselect this chip (always allowed; keeps any grouping).
      const next = new Set(active);
      next.delete(category);
      setFilterCategories(next);
      return;
    }

    // Group × category: when a grouping is active, decide whether the category
    // stacks onto the group (drill in) or replaces it.
    if (reRankAnchorIds.length > 0) {
      const mode = decideGroupFilterMode(groupMemberIds, relatedStacks, active, category);
      if (mode === 'STACK') {
        // Keep the grouping; add the category as an intersection constraint.
        setFilterCategories(new Set(Array.from(active).concat([category])));
      } else {
        // No group member matches → abandon the grouping and filter fresh.
        clearReRankAnchors();
        setFilterCategories(new Set([category]));
      }
      return;
    }

    if (active.size === 0) {
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
  // Synthetic augmentation is applied for low real counts (see getSyntheticCategoryCount).
  const categoryStackCount = useMemo(() => {
    const real = new Map<string, number>();
    for (const stack of relatedStacks) {
      const seen = new Set<string>();
      for (const r of stack.topPost.relations ?? []) {
        seen.add(r.category);
      }
      seen.forEach(c => real.set(c, (real.get(c) ?? 0) + 1));
    }
    const augmented = new Map<string, number>();
    real.forEach((count, category) => {
      augmented.set(category, getSyntheticCategoryCount(category, count));
    });
    return augmented;
  }, [relatedStacks]);

  // Topic prevalence — used by tooltip ("7 more Contract reform") and for pagination.
  // Synthetic augmentation is applied for low real counts (see getSyntheticTopicCount).
  // When relation.topic is absent, a synthetic topic is generated via topicOf().
  const { postTopics, topicTotal } = useMemo(() => {
    const postTopics = new Map<string, Set<string>>();
    const realTopicTotal = new Map<string, number>();
    for (const stack of relatedStacks) {
      const topics = new Set<string>();
      for (let ri = 0; ri < (stack.topPost.relations ?? []).length; ri++) {
        const r = stack.topPost.relations![ri];
        const t = topicOf(r, stack.stackId, ri);
        topics.add(t);
      }
      postTopics.set(stack.topPost.id, topics);
      topics.forEach(t => realTopicTotal.set(t, (realTopicTotal.get(t) ?? 0) + 1));
    }
    const topicTotal = new Map<string, number>();
    realTopicTotal.forEach((count, topic) => {
      topicTotal.set(topic, getSyntheticTopicCount(topic, count));
    });
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

  // Base order = the visible side-pane order at the moment the active anchor
  // was last toggled. Updated on EVERY anchor transition (activation, switch,
  // and cancel) so reordering is permanent — cancelling a group leaves posts
  // in their current positions; a subsequent grouping operates on that order.
  // Using refs (not state) so captures don't trigger extra re-renders.
  const baseOrderRef = useRef<string[]>([]);
  const activeAnchorIdRef = useRef<string | null>(null);
  // E: previous render's displayStacks — updated after each render via useEffect.
  // Used to snapshot the "current visible order" at each anchor transition.
  const prevDisplayStacksRef = useRef<RelatedStackType[]>([]);

  /** Reorder side-pane stacks around the active anchor (paper §3.1):
   *  – ALL matched posts above the anchor move down to immediately above it
   *    (preserving their relative order).
   *  – The TOP N (default 3) matched posts below the anchor move up to
   *    immediately below it; the rest are paginated out and revealed by the
   *    footer "K more Topic" link.
   *  Reordering is permanent: cancelling the group leaves the posts in their
   *  new positions, and a subsequent grouping layers on top of that order. */
  const { displayStacks, claimedBy, anchorSet, anchorParent, groupTotal, groupShown, activeAnchorTopic, groupMemberIds } = useMemo(() => {
    const anchorSet = new Set(reRankAnchorIds);
    const claimedBy = new Map<string, string>(); // postId -> anchorId
    const anchorParent = new Map<string, string>(); // anchorId -> parent anchorId
    const groupTotal = new Map<string, number>(); // anchorId -> matched posts (excludes anchor itself)
    const groupShown = new Map<string, number>(); // anchorId -> matched posts currently visible
    let activeAnchorTopic: string | null = null;
    // All posts that belong to the active group (anchor + every topic match,
    // BEFORE pagination). Drives decideGroupFilterMode (stack vs switch).
    let groupMemberIds = new Set<string>();

    const anchorId: string | null = reRankAnchorIds.length > 0
      ? reRankAnchorIds[reRankAnchorIds.length - 1]
      : null;

    // ── Anchor transition: capture the current visible order as the new base.
    // Same behavior on activate, switch, and cancel — reordering is permanent.
    if (anchorId !== activeAnchorIdRef.current) {
      const prev = prevDisplayStacksRef.current;
      const visibleIds = (prev.length > 0 ? prev : relatedStacks).map(s => s.topPost.id);
      baseOrderRef.current = visibleIds;
      activeAnchorIdRef.current = anchorId;
    }

    // Reconstruct workingStacks from baseOrderRef, dropping IDs that are no
    // longer in relatedStacks and appending any new IDs at the end.
    const stackById = new Map(relatedStacks.map(s => [s.topPost.id, s]));
    let workingStacks: RelatedStackType[];
    if (baseOrderRef.current.length > 0) {
      const ordered = baseOrderRef.current
        .map(id => stackById.get(id))
        .filter((s): s is RelatedStackType => s !== undefined);
      const seen = new Set(ordered.map(s => s.topPost.id));
      const appended = relatedStacks.filter(s => !seen.has(s.topPost.id));
      workingStacks = [...ordered, ...appended];
    } else {
      workingStacks = [...relatedStacks];
    }

    // ── No active anchor: display workingStacks directly (filtered). ───────
    if (anchorId === null) {
      let result = workingStacks;
      if (filterCategories.size > 0) {
        result = result.filter((s) => {
          const cats = new Set<string>();
          for (const r of s.topPost.relations ?? []) cats.add(r.category);
          let allPresent = true;
          filterCategories.forEach(c => { if (!cats.has(c)) allPresent = false; });
          return allPresent;
        });
      }
      return { displayStacks: result, claimedBy, anchorSet, anchorParent, groupTotal, groupShown, activeAnchorTopic, groupMemberIds };
    }

    // Find anchor entry in the working set.
    const anchorIdx = workingStacks.findIndex(s => s.topPost.id === anchorId);
    const anchorEntry = anchorIdx >= 0 ? workingStacks[anchorIdx] : undefined;
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
      return { displayStacks: result, claimedBy, anchorSet, anchorParent, groupTotal, groupShown, activeAnchorTopic, groupMemberIds };
    }

    const anchorContent = anchorEntry.topPost.content;

    // Topic-based when the anchor was created by clicking a specific highlight.
    // Falls back to content word-similarity when the anchor has no usable relation.
    const anchorRangeIdx = anchoredRangeByPost[anchorId];
    const anchorRelation = anchorRangeIdx !== undefined
      ? anchorEntry.topPost.relations?.[anchorRangeIdx]
      : undefined;
    const anchorTopic = anchorRelation
      ? topicOf(anchorRelation, anchorEntry.stackId, anchorRangeIdx!)
      : undefined;
    activeAnchorTopic = anchorTopic ?? null;

    const aboveStacks = workingStacks.slice(0, anchorIdx);
    const belowStacks = workingStacks.slice(anchorIdx + 1);

    const matchesAnchor = anchorTopic
      ? (s: RelatedStackType) =>
          (s.topPost.relations ?? []).some((r, ri) => topicOf(r, s.stackId, ri) === anchorTopic)
      : (s: RelatedStackType) =>
          similarityScore(s.topPost.content, anchorContent) > SIMILARITY_THRESHOLD;

    // Above-matched: ALL of them, preserving relative order. They will move
    // down to immediately above the anchor — never paginated out.
    const aboveMatched: string[] = [];
    for (const s of aboveStacks) if (matchesAnchor(s)) aboveMatched.push(s.topPost.id);

    // Below-matched: collect all, then paginate (top N in working order).
    const belowMatchedAll: string[] = [];
    for (const s of belowStacks) if (matchesAnchor(s)) belowMatchedAll.push(s.topPost.id);

    // Every group member (anchor + all topic matches, pre-pagination) — used by
    // decideGroupFilterMode to decide whether a category stacks or switches.
    groupMemberIds = new Set<string>([anchorId, ...aboveMatched, ...belowMatchedAll]);

    const showCountBelow = shownByAnchor[anchorId] ?? SHOWN_INCREMENT;
    const belowMatchedVisible = belowMatchedAll.slice(0, showCountBelow);

    // groupTotal/groupShown count matched posts (NOT including the anchor) so
    // the renderer can compute "K more" = total - shown for the footer.
    groupTotal.set(anchorId, aboveMatched.length + belowMatchedAll.length);
    groupShown.set(anchorId, aboveMatched.length + belowMatchedVisible.length);

    const visibleMatchedIds = new Set<string>([...aboveMatched, ...belowMatchedVisible]);
    visibleMatchedIds.forEach(id => claimedBy.set(id, anchorId));

    if (visibleMatchedIds.size === 0) {
      // No matches to group — return workingStacks (filtered).
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
      return { displayStacks: result, claimedBy, anchorSet, anchorParent, groupTotal, groupShown, activeAnchorTopic, groupMemberIds };
    }

    // Paginate out below-matched posts beyond the visible cap.
    const hiddenBelowIds = new Set(belowMatchedAll.slice(showCountBelow));
    const paginatedStacks = workingStacks.filter(s => !hiddenBelowIds.has(s.topPost.id));

    // Bring above-matched down (immediately above anchor) and below-visible
    // up (immediately below anchor). reorderForAnchor handles both directions.
    let result = reorderForAnchor(
      paginatedStacks,
      anchorId,
      (pid) => visibleMatchedIds.has(pid),
    );

    // Populate anchorParent for visual connector-line indentation (single anchor: no parent).
    // reRankAnchorIds is always length ≤ 1 by setter invariant, so anchorParent stays empty.
    const resolvedAnchorIdx = result.findIndex(s => s.topPost.id === anchorId);
    for (let k = resolvedAnchorIdx - 1; k >= 0; k--) {
      const prevId = result[k].topPost.id;
      if (anchorSet.has(prevId)) { anchorParent.set(anchorId, prevId); break; }
      if (!claimedBy.has(prevId)) break;
    }

    // C1 + group×category stacking: with a grouping active, a category filter
    // STACKS as an intersection — keep the anchor (it defines the group) plus
    // group members that also match every selected category. Posts outside the
    // group are hidden so the panel shows the drill-down rather than unrelated
    // category matches. (The switch case — a category with no group overlap —
    // drops the grouping in handleFilterChipClick before we ever get here.)
    if (filterCategories.size > 0) {
      result = result.filter((s) => {
        if (s.topPost.id === anchorId) return true; // anchor always visible while grouped
        if (!groupMemberIds.has(s.topPost.id)) return false; // intersection: group members only
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

    return { displayStacks: result, claimedBy, anchorSet, anchorParent, groupTotal, groupShown, activeAnchorTopic, groupMemberIds };
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

  const handleNavigateToUser = (e: React.MouseEvent, account: { acct?: string; username?: string; display_name: string }) => {
    e.preventDefault();
    e.stopPropagation();
    const profileHandle = account.acct || account.username || account.display_name;
    router.push(`/user/${profileHandle}`);
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
    // Re-anchoring a DIFFERENT post on the topic that is already being grouped
    // is a no-op — it would just shuffle which post owns the block without
    // changing what's grouped. Covers highlight-span clicks (also guarded
    // inside buildMultiHighlightNodes for tooltip wording), category-tag
    // clicks, and the F-indicator chip.
    if (rangeIndex !== undefined && reRankAnchorIds.length > 0) {
      const currentAnchorId = reRankAnchorIds[reRankAnchorIds.length - 1];
      if (currentAnchorId !== postId) {
        const currentRangeIdx = anchoredRangeByPost[currentAnchorId];
        if (currentRangeIdx !== undefined) {
          const currentStack = relatedStacks.find(s => s.topPost.id === currentAnchorId);
          const newStack = relatedStacks.find(s => s.topPost.id === postId);
          const currentRel = currentStack?.topPost.relations?.[currentRangeIdx];
          const newRel = newStack?.topPost.relations?.[rangeIndex];
          if (currentStack && newStack && currentRel && newRel) {
            const currentTopic = topicOf(currentRel, currentStack.stackId, currentRangeIdx);
            const newTopic = topicOf(newRel, newStack.stackId, rangeIndex);
            if (currentTopic === newTopic) return;
          }
        }
      }
    }

    // Clear hover state — card indices shift after reorder, so old
    // hoveredCardIndex would point at a different card → everything dims.
    setHoveredCardId(null);
    setHoveredSidebarPost(null);
    setHoveredHighlightRangeIndex(null);
    setHoveredCategory(null);
    clearTapped();

    // Capture the anchor's viewport position BEFORE the reorder. Using
    // getBoundingClientRect (not offsetTop) is deliberate: the first time you
    // group, the "Grouped by …" bar appears in the sticky header and grows it
    // by ~40px, pushing every card — including the one you clicked — down. A
    // viewport-relative measure captures that header growth as well as the
    // reorder, so the post-reorder scroll compensation can keep the clicked
    // card exactly where it was.
    const cardEl = document.querySelector(`[data-post-id="${postId}"]`) as HTMLElement | null;
    pinnedPostIdRef.current = postId;
    pinnedPrevTopRef.current = cardEl ? cardEl.getBoundingClientRect().top : null;

    toggleReRankAnchor(postId, rangeIndex);
  };

  // Compensate scroll BEFORE paint so the clicked card never visually moves on a
  // regroup. CRITICAL: this is keyed on the grouping state — it must NOT run on
  // every render. A dependency-less version ran (and mutated aside.scrollTop) on
  // every hover-driven re-render, which, combined with cards moving under the
  // cursor, was the page-freeze amplifier. The pinnedPostIdRef guard makes it a
  // no-op unless a toggle just set it.
  useLayoutEffect(() => {
    const postId = pinnedPostIdRef.current;
    const prevTop = pinnedPrevTopRef.current;
    if (!postId || prevTop === null) return;

    // Clear refs so future renders don't re-compensate
    pinnedPostIdRef.current = null;
    pinnedPrevTopRef.current = null;

    // Scope the lookup to THIS aside (avoids matching another route's panel) and
    // clamp the result so a mis-measured delta can never fling the scroll.
    const aside = document.querySelector('[data-testid="col-aside"]') as HTMLElement | null;
    const cardEl = aside?.querySelector(`[data-post-id="${postId}"]`) as HTMLElement | null;
    if (!aside || !cardEl) return;
    const newTop = cardEl.getBoundingClientRect().top;
    const delta = newTop - prevTop;
    if (Math.abs(delta) > 0.5) {
      const max = Math.max(0, aside.scrollHeight - aside.clientHeight);
      aside.scrollTop = Math.min(max, Math.max(0, aside.scrollTop + delta));
    }
  }, [reRankAnchorIds, anchoredRangeByPost, shownByAnchor]);

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
  // hoveredCardId: tracks which card the mouse is actually over, BY POST ID (not
  // array index). Index-keying broke when displayStacks reordered/filtered under
  // the hover (grouping, pagination, AnimatePresence exits) — the highlighted
  // card stopped matching the cursor. A stable id is immune to all reshuffles.
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

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

  // On a focus-post change: restore that post's saved grouping/filters (or reset
  // to a clean panel if it has none) and clear transient view state. Persisting
  // per focus post is what makes the panel survive back-navigation, a feed post →
  // its full view, and scrolling between focus posts. useLayoutEffect so the
  // restore runs before useUrlSync's passive ?fc/?fs handling — a shared filter
  // link still wins, while ordinary navigation restores the saved panel.
  useLayoutEffect(() => {
    const focusId = sourcePostId ?? ctxActivePostId ?? null;
    setPanelFocus(focusId);
    setHoveredCardId(null);
    setHoveredIndex(null);
    hideTooltip();
    if (rangeHoverTimer.current) clearTimeout(rangeHoverTimer.current);
    clearTapped();
    // Discard saved baseOrder — it refers to post IDs from the previous
    // dataset and would corrupt the working order if reused.
    baseOrderRef.current = [];
    activeAnchorIdRef.current = null;
    prevDisplayStacksRef.current = [];
  }, [relatedStacks, sourcePostId, ctxActivePostId]);

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

  // Group × category preview: while a grouping is active, hovering a category
  // chip previews whether clicking will STACK onto the group or DROP it. When it
  // would drop, we dim the "Grouped by" pill (and the active chips) so the user
  // sees the consequence before clicking — same idea as the category switch
  // preview, extended to the grouping.
  const grouped = reRankAnchorIds.length > 0;
  const hoveredWouldDropGroup =
    grouped && chipHovered !== null && !filterCategories.has(chipHovered)
      ? decideGroupFilterMode(groupMemberIds, relatedStacks, filterCategories, chipHovered) === 'SWITCH'
      : false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Sticky header: title + filter chips + count — stays visible while scrolling */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#FCFBF5', paddingBottom: '0.5rem',
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
                  previewActive={(previewMode !== 'none' || grouped) && category === chipHovered}
                  previewDim={(previewMode === 'switch' || hoveredWouldDropGroup) && filterCategories.has(category)}
                  onClick={() => handleFilterChipClick(category)}
                  onMouseEnter={() => setChipHovered(category)}
                  onMouseLeave={() => setChipHovered(null)}
                />
              ));
            })()}
          </div>
        )}

        <Text size="xs" c="dimmed" mb={4}>
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
          <div style={{
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

        {/* "More like this" active indicator — single anchor only. Dims + turns
            red while hovering a category chip that would drop the grouping, so
            the consequence is visible before the click. */}
        {reRankAnchorIds.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px',
            background: hoveredWouldDropGroup ? '#fdecea' : '#f0f4ff',
            borderRadius: '6px', marginBottom: '0.5rem', flexWrap: 'wrap',
            opacity: hoveredWouldDropGroup ? 0.6 : 1,
            transition: 'opacity 120ms ease, background 120ms ease',
          }}>
            <Text size="xs" c={hoveredWouldDropGroup ? '#c0392b' : '#5a71a8'} fw={600} style={{ fontSize: '11px' }}>
              {hoveredWouldDropGroup ? 'Will replace grouping:' : 'Grouped by:'}
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

      {/* Cards — no inner scroll, the aside's own scrollbar handles everything.
          NOTE: LayoutGroup + AnimatePresence mode="popLayout" + layout FLIP were
          removed — in this grouped, custom-scroll container their per-render
          layout projection never settled (10+ perpetual animations saturating
          the main thread → the page-freeze on hover-while-grouped). Reorders now
          snap; the clicked card still stays put via the scroll compensation. */}
      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
          paddingBottom: '1rem',
        }}
      >
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
          const isCardHovered = hoveredCardId === stack.topPost.id;
          const isHighlighted = !!highlightPostId && stack.topPost.id === highlightPostId;
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
          const anyCardHovered = hoveredCardId !== null || tappedCardPostId !== null;
          const cardDimStyle = anyCardHovered && !isCardActive
            ? { opacity: 0.45, filter: 'grayscale(0.3)' }
            : { opacity: 1, filter: 'none' };

          // Is this card part of the active topic block? Drives in-block
          // dimming of non-Topic spans and the "(shown)" tooltip wording.
          const inActiveBlock =
            claimedBy.has(stack.topPost.id)
            || (anchorSet.has(stack.topPost.id) && anchorsWithClaims.has(stack.topPost.id));

          // Build React content nodes with multi-range + 3-level hover
          const contentNodes = buildMultiHighlightNodes(
            visibleText, adjustedRelations, colors,
            {
              isCardHovered: isCardActive,
              anyCardHovered,
              hoveredRangeIndex: isCardActive ? (isCardTapped ? tappedRangeIndex : hoveredHighlightRangeIndex) : null,
              hoveredCategory: isCardActive ? hoveredCategory : null,
              anchoredRangeIndex: anchoredRangeByPost[stack.topPost.id] ?? null,
              activeTopic: activeAnchorTopic,
              inActiveBlock,
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

          // Block boundaries: the first card whose anchorOf differs from the
          // previous (and isn't undefined) is the start of the topic block;
          // similarly for the last.
          const isFirstInBlock = !!anchorForThisCard && anchorForThisCard !== anchorForPrev;
          const isLastInBlock = !!anchorForThisCard && anchorForThisCard !== anchorForNext;

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

          // Block decoration metadata. groupTotal/groupShown count MATCHED
          // posts only (excluding the anchor). Block size = 1 (anchor) +
          // matched total. Footer "K more" = matched total - matched shown.
          const groupTotalForThis = anchorForThisCard ? (groupTotal.get(anchorForThisCard) ?? 0) : 0;
          const groupShownForThis = anchorForThisCard ? (groupShown.get(anchorForThisCard) ?? 0) : 0;
          const groupRemaining = Math.max(0, groupTotalForThis - groupShownForThis);
          const blockTotalCount = anchorForThisCard ? 1 + groupTotalForThis : 0; // includes anchor
          const showBlockDecorations = !!anchorForThisCard && groupTotalForThis > 0;
          if (showBlockDecorations && !anchorTopic) {
            warnMissingTopic(anchorForThisCard!, anchorRangeIdx ?? -1);
          }

          // Footer: "K more Topic" — clickable to load 3 more when K > 0,
          // plain "0 more Topic" when K = 0 so the user can see where the
          // block ends. Rendered inside the cardEl's motion.div so its
          // lifecycle is tied to the last block card (popLayout would
          // otherwise strand a separately-keyed footer at opacity:0).
          const footerHover = (clientX: number, clientY: number) => {
            if (!anchorTopic) return;
            showTooltip({
              content: buildTooltipLabel(anchorTopic, groupRemaining, anchorColors.text),
              colors: { text: anchorColors.text, border: anchorColors.border },
              x: clientX,
              y: clientY,
            });
          };
          const renderFooter = showBlockDecorations && isLastInBlock && !!anchorTopic;
          const footerEl = renderFooter && anchorForThisCard ? (
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
              {groupRemaining > 0 ? (
                <button
                  type="button"
                  className="show-more-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShowMore(anchorForThisCard);
                  }}
                  onMouseEnter={(e) => footerHover(e.clientX, e.clientY)}
                  onMouseLeave={() => hideTooltip()}
                  onPointerEnter={(e) => { if (e.pointerType === 'mouse') footerHover(e.clientX, e.clientY); }}
                  onPointerLeave={(e) => { if (e.pointerType === 'mouse') hideTooltip(); }}
                  style={{ color: anchorColors.text }}
                >
                  {groupRemaining} more <strong style={{ color: anchorColors.text }}>{anchorTopic}</strong>
                </button>
              ) : (
                <span style={{ color: anchorColors.text, opacity: 0.6, fontSize: 12 }}>
                  0 more <strong style={{ color: anchorColors.text }}>{anchorTopic}</strong>
                </span>
              )}
            </div>
          ) : null;

          // Header: "Topic (N)" chip + × dismiss button. Rendered as its own
          // animated row above the first block card (which may be an
          // above-matched claim or the anchor itself if there are none).
          const headerHover = (clientX: number, clientY: number) => {
            if (!anchorTopic) return;
            showTooltip({
              content: buildTooltipLabel(anchorTopic, groupRemaining, anchorColors.text),
              colors: { text: anchorColors.text, border: anchorColors.border },
              x: clientX,
              y: clientY,
            });
          };
          const renderHeader = showBlockDecorations && isFirstInBlock && !!anchorTopic;
          const headerEl = renderHeader && anchorForThisCard ? (
            <div
              key={`header-${anchorForThisCard}`}
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
                onMouseEnter={(e) => headerHover(e.clientX, e.clientY)}
                onMouseLeave={() => hideTooltip()}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') headerHover(e.clientX, e.clientY); }}
                onPointerLeave={(e) => { if (e.pointerType === 'mouse') hideTooltip(); }}
                style={{
                  fontSize: '11px', fontWeight: 600, color: anchorColors.text,
                  background: anchorColors.bg, border: `1px solid ${anchorColors.border}55`,
                  borderRadius: '4px', padding: '1px 6px',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: '220px',
                }}
              >
                {anchorTopic} ({blockTotalCount})
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleAnchor(anchorForThisCard);
                }}
                aria-label={`Dismiss ${anchorTopic} block`}
                // 24px hit target. Background appears on hover so the click
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
            </div>
          ) : null;

          const cardEl = (
            <div
              key={stack.stackId}
              data-related-card
              style={{
                position: 'relative',
                // Indented cards carry a left margin; subtracting it from the width
                // keeps margin + border-box width === 100% so the card never spills
                // past the panel's right edge (that overflow was the source of the
                // unwanted horizontal scroll). paddingLeft is inside border-box, so
                // it doesn't need subtracting.
                width: indentPx > 0 ? `calc(100% - ${indentPx}px)` : '100%',
                borderRadius: '10px',
                ...cardDimStyle,
                // Every card in the active topic block sits alongside a continuous
                // group connector line (rendered as an absolute child below). The
                // padding leaves room for it; the line itself bridges the flex gap
                // above so the whole block — including the anchor — reads as one
                // continuous thread.
                paddingLeft: anchorForThisCard ? '8px' : undefined,
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
                // Idempotent: mousemove fires on every pixel of motion; only
                // commit a state change when the bottom-edge hover actually
                // flips, so a steady cursor (or one over animating geometry)
                // can't drive a render storm / feedback loop.
                const nextIdx = (withinX && inBottomEdge) ? index : null;
                setHoveredIndex((prev) => (prev === nextIdx ? prev : nextIdx));
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
              {/* Block connector rail. Claim cards (above + below) draw a
                  full-height segment alongside themselves. The anchor card
                  draws nothing; instead, the rail from the surrounding
                  claims (or the header's overhang / footer-overhang inside
                  the anchor's own cardEl) reaches the anchor at top and
                  bottom. A claim whose next sibling is the anchor extends
                  its rail DOWN through the gap so the rail visually enters
                  the anchor's top edge. */}
              {anchorForThisCard && anchorForThisCard !== stack.topPost.id && (
                <div aria-hidden style={{
                  position: 'absolute',
                  left: 0,
                  top: -GROUP_GAP_PX,
                  bottom: anchorForNext === anchorForThisCard
                    && displayStacks[index + 1]?.topPost.id === anchorForThisCard
                    ? -GROUP_GAP_PX
                    : 0,
                  width: GROUP_LINE_WIDTH,
                  background: anchorColors.border,
                  borderRadius: GROUP_LINE_WIDTH,
                  zIndex: 0,
                }} />
              )}
              <Paper
                ref={(el) => { paperRefs.current[index] = el; if (isHighlighted) highlightCardRef.current = el; }}
                data-post-id={stack.topPost.id}
                onMouseEnter={() => {
                  if (isTouch) return;
                  setHoveredIndex(null);
                  // Debounced: coalesce a fast cursor sweep into a single settle
                  // so the expensive focus-post cross-highlight fires once.
                  const pid = stack.topPost.id;
                  const rels = stack.topPost.relations;
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  hoverTimerRef.current = setTimeout(() => {
                    setHoveredCardId(pid);
                    setHoveredSidebarPost(pid, rels);
                  }, 90);
                }}
                onMouseLeave={(e) => {
                  if (isTouch) return;
                  // A6: ignore Paper-leave events where the mouse went to a
                  // sibling that is still part of the SAME card container
                  // (bottom-edge zone, stack-shadow layers). Without this guard
                  // the cross-highlight/dim breaks every time the cursor brushes
                  // those zones mid-interaction.
                  const next = (e.relatedTarget as Node | null);
                  if (next && (e.currentTarget as HTMLElement)
                      .closest('[data-related-card]')
                      ?.contains(next)) {
                    return;
                  }
                  // Debounced clear — same coalescing so a sweep doesn't trigger
                  // an expensive un-highlight on every card boundary.
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  hoverTimerRef.current = setTimeout(() => {
                    setHoveredCardId(null); setHoveredSidebarPost(null);
                    setHoveredHighlightRangeIndex(null); setHoveredCategory(null);
                  }, 60);
                }}
                style={{
                  position: 'relative', width: '100%', backgroundColor: '#ffffff', zIndex: isHighlighted ? 6 : 5,
                  borderRadius: '10px', margin: '0 auto', paddingTop: '40px',
                  border: isHighlighted ? `2px solid #1c2b4a` : `2px solid #e2e8f0`,
                  boxShadow: isHighlighted
                    ? '0 0 0 3px rgba(28,43,74,0.18), 0 4px 16px rgba(0,0,0,0.10)'
                    : stack.size > 1 ? 'none' : '0 2px 12px rgba(0,0,0,0.06)',
                  transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
                  cursor: 'pointer',
                }}
              >
                {/* Category tags — one per unique relation category, dims/brightens with highlight hover */}
                <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '4px', alignItems: 'center', zIndex: 10, flexWrap: 'wrap' }}>
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
                            // Category tags are always color-coded so the highlight↔icon
                            // mapping is visible without relying on a colored card border.
                            background: tc.bg,
                            color: tc.text,
                            borderRadius: '5px',
                            padding: '2px 7px', display: 'flex', alignItems: 'center', gap: '4px',
                            border: `1px solid ${tc.border}`,
                            opacity: tagBright ? 1 : 0.3,
                            transition: 'opacity 200ms ease',
                            cursor: 'pointer',
                          }}
                        >
                          {React.cloneElement(iconMapping[cat] || iconMapping['default'], { color: tc.text, size: 12 })}
                          <Text className="related-tag-text" size="xs" c={tc.text} fw={700} style={{ fontSize: '10px' }}>
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
                  const indicatorColors = getCategoryColors(indicatorRel.category);
                  // Always show the category color so the chip is recognizable
                  // as the topic-anchor for that highlight color.
                  const indicatorColor = indicatorColors.text;
                  const clusterCount = topicTotal.get(indicatorTopic) ?? 0;
                  const baseOpacity = isCurrentAnchor ? 1 : 0.75;
                  return (
                    <button
                      type="button"
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
                    <InteractionControl icon={<IconShare size={20} />} ariaLabel="Share pairing"
                      onClick={() => {
                        // Share this related response *paired with* its focus post.
                        // Same base post id as the focus-post share button — the
                        // related one just adds ?related=. Opening the link lands on
                        // the focus post and emphasises this card (see the ?related=
                        // handler on the focus page). Base is the focus post: the
                        // sourcePostId prop if given, else the context's active post.
                        const origin = window.location.origin;
                        const focusId = sourcePostId ?? ctxActivePostId;
                        const url = focusId
                          ? `${origin}/ChineseEVs/posts/${focusId}?related=${stack.topPost.id}`
                          : `${origin}/ChineseEVs/posts/${stack.topPost.id}`;
                        copyLink(url, focusId ? "Pairing link copied" : "Post link copied");
                      }} />
                  </Group>
                </div>
                {stack.size !== null && stack.size > 1 && (
                  <RelatedStackCount count={stack.size} onClick={() => handleOpenStackModal(stack.stackId)} />
                )}
              </Paper>

              {footerEl}

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
            </div>
          );

          return [headerEl, cardEl].filter(Boolean);
          }); // end displayStacks.flatMap
        })()} {/* end activeAnchorTopic IIFE */}
      </div>

      <StackPostsModal
        isOpen={stackPostsModalOpen} onClose={() => setStackPostsModalOpen(false)}
        apiUrl={currentStackId ? `https://beta.stacky.social:3002/stacks/${currentStackId}/posts` : ''}
        stackId={currentStackId}
      />
    </div>
  );
};

export default RelatedStacks;
