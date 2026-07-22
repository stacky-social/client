import React, { useRef, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { Paper, UnstyledButton, Group, Avatar, Text, Divider, Anchor } from '@mantine/core';
import { IconMessageCircle, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare } from '@tabler/icons-react';
import { CATEGORY_COLORS, CATEGORY_LABELS, iconMapping, getCategoryColors, type CategoryStyle } from '../utils/categoryStyles';
import { formatPostDate } from '../utils/formatPostDate';
import RelatedStackCount from './RelatedStackCount';
import { useRouter } from 'next/navigation';
import StackPostsModal from './StackPostsModal';
import InteractionControl from './InteractionControl';
import { toggleFavourite, toggleBookmark } from '../utils/mastoActions';
import { notifications } from '@mantine/notifications';
import { copyLink } from '../utils/share';
import { useRelatedStacks } from '../app/(shell)/related-stacks-context';
import { setHoveredSidebarPost, setHoveredHighlightRangeIndex, setHoveredCategory, setTapped, clearTapped, setCategoryFilter, activateAsideTopic, clearTopicInteraction, clearResponseFilter, setPanelFocus, savePanelScroll, getPanelScroll, useHighlightStore, topicKeyOf, asideGrouping, asideTopicFilter, relationsMatchTopic, resolveReplyTopicKey, beginPanelInteraction, setPanelBaseOrder, currentPanelScope, beginUndoablePanelInteractionIfDetail } from '../utils/highlightStore';
import FilterByChip from './FilterByChip';
import { useExperimentFlags } from '../utils/experimentFlags';
import { reorderForAnchor } from '../utils/reorderForAnchor';
import type { Relation } from '../types/PostType';
import { showTooltip, hideTooltip, type TooltipColors } from './HoverTooltip';
import { showUndoableAction } from '../utils/actionNotifications';
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
  /**
   * Cross-pane role of this panel instance:
   * - `aside-only` (feed/home/bookmarks/liked): a card-span click only GROUPS
   *   the aside — there is no reply pane to filter, and a reply-origin
   *   interaction never filters this panel.
   * - `detail-cross-pane` (thread detail): grouping still happens here, and a
   *   reply-origin interaction FILTERS this panel (the aside filter branch),
   *   gated by the `crossPaneFiltering` flag.
   */
  mode?: 'aside-only' | 'detail-cross-pane';
}

// ─── Category colors ─────────────────────────────────────────────────────────
// Shared with Post (focus cross-highlight), reply badges, and the experiment
// panel via src/utils/categoryStyles — keep presentation in one place.

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
// Radius of the two left corners where the bracket's horizontal rules curve into
// the vertical rail (top-left on the header row, bottom-left on the bottom rule).
const GROUP_CORNER_R = 12;
const RELATED_PAGE_SIZE = 10;

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

/** Returns the relation's topic if present, otherwise the honest fallback: the
 *  category label. (The former SYNTHETIC_TOPIC_POOLS fabricated off-domain topic
 *  names for topicless relations — removed for the open-source release; tooltips
 *  for topicless spans are suppressed separately via warnMissingTopic and
 *  buildTooltipLabel's undefined-topic short-circuit.)
 *  `stackId`/`rangeIndex` are kept in the signature so call sites don't churn. */
function topicOf(relation: { topic?: string; category: string }, _stackId: string, _rangeIndex: number): string {
  return relation.topic ?? (CATEGORY_LABELS[relation.category] ?? relation.category);
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

// Related-card span tooltips appear only after a 1.5s dwell (hover spec), so
// sweeping the cursor across spans doesn't spam tooltips. The highlight itself
// stays immediate — only the tooltip waits. Any reschedule / leave / click
// cancels a pending one. Module-level: shared across all card marks.
let cardTooltipTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleCardTooltip(payload: Parameters<typeof showTooltip>[0]) {
  if (cardTooltipTimer) clearTimeout(cardTooltipTimer);
  cardTooltipTimer = setTimeout(() => { cardTooltipTimer = null; showTooltip(payload); }, 1500);
}
function cancelCardTooltip() {
  if (cardTooltipTimer) { clearTimeout(cardTooltipTimer); cardTooltipTimer = null; }
  hideTooltip();
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

/**
 * "Responses to" × category interaction — the same STACK/SWITCH model as
 * decideGroupFilterMode, but scoped to the posts that respond to the active
 * passage (responseFilter) instead of a group:
 * - 'STACK'  → some post that responds to the passage also has every
 *              (current filters + candidate) category → keep the passage filter
 *              and add the category as an intersection constraint.
 * - 'SWITCH' → no responding post matches, so clicking would abandon the passage
 *              filter and just filter by the category instead.
 */
function decideResponseFilterMode(
  responseFilter: { start: number; end: number },
  stacks: RelatedStackType[],
  currentFilters: Set<string>,
  candidate: string,
): 'STACK' | 'SWITCH' {
  const need = new Set(currentFilters);
  need.add(candidate);
  for (const stack of stacks) {
    const rels = stack.topPost.relations ?? [];
    const responds = rels.some(r => r.focusStart < responseFilter.end && responseFilter.start < r.focusEnd);
    if (!responds) continue;
    const cats = new Set<string>();
    for (const r of rels) cats.add(r.category);
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
    /** Reverse cross-highlight (focus → aside): indices of THIS card's relations
     *  whose focus ranges overlap the hovered focus-post span union. Non-null
     *  whenever a focus span is hovered — matched spans brighten, the card's
     *  other spans dim (paper: "highlighting the corresponding B spans,
     *  temporarily dimming other B spans"). Null when no focus span is hovered. */
    focusHoverMatchedIdx: Set<number> | null;
    /** topic → number of OTHER posts (excluding current) that share this topic */
    otherCountByTopic?: (topic: string) => number;
    /** range indices → number of related posts linked to those spans' focus
     *  regions (the N in "Click to focus on N related posts"). */
    countLinkedToRanges?: (rangeIndices: number[]) => number;
    stackId: string;
  },
): React.ReactNode[] {
  if (!relations || relations.length === 0) return [plain];

  // Build tagged ranges from relations (content side). rangeIndex must be the
  // index into the ORIGINAL relations array (stack.topPost.relations), not this
  // possibly-windowed/filtered copy — otherwise hover→focus mapping is off. The
  // windowing step stamps __idx with the original index; fall back to i when not.
  const tagged: TaggedRange[] = relations.map((r, i) => ({
    start: r.contentStart, end: r.contentEnd, rangeIndex: ((r as any).__idx ?? i) as number,
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
        (opts.hoveredCategory !== null && opts.hoveredCategory === c.category) ||
        (opts.focusHoverMatchedIdx !== null && opts.focusHoverMatchedIdx.has(c.rangeIndex));
      const anyDirected =
        opts.hoveredRangeIndex !== null || opts.hoveredCategory !== null || opts.focusHoverMatchedIdx !== null;
      // Original related-post hover behaviour: always-visible by default, full on
      // card hover (Level 1), and on span/category hover (Level 2) the active band
      // stays full while the rest dim. (The grey/colour spec is focus-post only.)
      const baseAlpha =
        opts.isCardHovered ? 1 :
        opts.anyCardHovered ? 0.25 :
        0.7;
      const bandTopic = (c: { topic?: string; category: string; rangeIndex: number }) =>
        topicOf(c, opts.stackId, c.rangeIndex);
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
      // Which overlap band (category) is under the cursor. The stacked bands are a
      // 180deg gradient that an inline <mark> repaints on EVERY line box it wraps to,
      // so map the cursor to its position within the CURRENT line box — not the whole
      // multi-line bounding rect. With the bounding rect, up/down felt broken: the
      // visible top/bottom split is per line, but the selection only flipped at the
      // overall vertical midpoint, so moving within a line changed nothing and
      // re-entering picked a seemingly random band. getClientRects() = per-line boxes.
      const bandIdxAt = (el: HTMLElement, clientY: number) => {
        const rects = Array.from(el.getClientRects());
        const line = rects.find((r) => clientY >= r.top && clientY <= r.bottom) ?? el.getBoundingClientRect();
        const rel = line.height > 0 ? (clientY - line.top) / line.height : 0;
        return Math.max(0, Math.min(cats.length - 1, Math.floor(rel * cats.length)));
      };
      const overlapHover = (clientX: number, clientY: number, currentTarget: HTMLElement) => {
        const bandIdx = bandIdxAt(currentTarget, clientY);
        const band = cats[bandIdx];
        opts.onRangeHover(band.rangeIndex);

        // Clicking a related-card span GROUPS BY its topic, so the tooltip
        // previews the grouping ("N more <Topic>") — NOT the focus-post span
        // filter wording. (The "Click to focus on N posts" tooltip belongs to the
        // focus post only.)
        const topic = bandTopic(band);
        const moreCount = opts.otherCountByTopic ? opts.otherCountByTopic(topic) : 0;
        const colors: TooltipColors = { text: band.colors.text, border: band.colors.border };
        scheduleCardTooltip({
          // R-REORDER-9: hovering a span whose topic is already the active
          // grouping reads "N more <Topic> (shown)" — the click is a no-op.
          content: buildTooltipLabel(topic, moreCount, band.colors.text, opts.activeTopic !== null && topic === opts.activeTopic),
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
            onMouseLeave={() => { opts.onRangeHover(null); cancelCardTooltip(); }}
            onPointerMove={(e) => { if (e.pointerType === 'mouse') overlapHover(e.clientX, e.clientY, e.currentTarget as HTMLElement); }}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') { opts.onRangeHover(null); cancelCardTooltip(); } }}
            onClick={(e) => {
              if (!opts.onRangeClick) return;
              const bandIdx = bandIdxAt(e.currentTarget as HTMLElement, e.clientY);
              e.stopPropagation();
              (e.currentTarget as HTMLElement).blur();
              cancelCardTooltip();
              // Overlap click → filter by the band under the cursor (onRangeClick
              // sets the span filter). stopPropagation keeps the card's
              // open-the-post handler from also firing.
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

      // Resolved topic for this range — used for in-block dimming and the
      // "(shown)" tooltip wording / no-op click for same-topic spans.
      const resolvedTopicForRange = topicOf(c, opts.stackId, c.rangeIndex);
      const isOnActiveTopic = opts.activeTopic !== null && resolvedTopicForRange === opts.activeTopic;
      // In-block dimming: when this card sits inside the active topic block,
      // non-Topic spans dim out (unless this very span is hovered).
      const dimByBlock = opts.inActiveBlock && !isOnActiveTopic && !isThisRangeHovered;
      const anyDirected = opts.hoveredRangeIndex !== null || opts.hoveredCategory !== null;

      // 3-level background alpha (original related-post hover behaviour): spans are
      // always visible by default; Level 1 (card hovered) brings them all full;
      // Level 2 (a span/category hovered) keeps the active one full and dims the
      // rest. Dims background only — text stays readable. (The new grey/colour
      // spec applies only to the FOCUS post, not here.)
      const isAnchored = opts.anchoredRangeIndex === c.rangeIndex;
      let bgAlpha: number;
      if (isAnchored) {
        bgAlpha = 1; // Anchored range always stays bright
      } else if (opts.anchoredRangeIndex !== null && !opts.isCardHovered) {
        bgAlpha = 0.2; // Another range in this card is anchored — dim this one
      } else if (opts.isCardHovered) {
        if (!anyDirected) {
          bgAlpha = dimByBlock ? 0.2 : 1; // Level 1: this card hovered
        } else {
          bgAlpha = isThisRangeHovered ? 1 : 0.2; // Level 2: specific span/category hovered
        }
      } else if (opts.anyCardHovered) {
        bgAlpha = 0.25; // Another card is hovered — dim these highlights
      } else if (opts.focusHoverMatchedIdx !== null) {
        // A focus-post span is hovered: brighten the spans linked to it,
        // temporarily dim this card's other spans.
        bgAlpha = opts.focusHoverMatchedIdx.has(c.rangeIndex) ? 1 : 0.18;
      } else if (dimByBlock) {
        bgAlpha = 0.2; // Non-Topic span inside the active topic block
      } else {
        bgAlpha = opts.anchoredRangeIndex !== null ? 0.2 : 0.7; // default — always visible
      }
      const bgColor = bgAlpha < 1 ? hexToRgba(colors.bg, bgAlpha) : colors.bg;

      // Bold the contentComment phrase on card hover (Level 1+). Level 1 is the
      // gate — requiring the span itself to be hovered (Level 2 only) meant the
      // crux never bolded on a plain card hover, which read as "boldface in the
      // side pane doesn't work".
      const commentPhrase = c.comment;
      let markContent: React.ReactNode;
      if ((opts.isCardHovered || isThisRangeHovered) && commentPhrase && segText.includes(commentPhrase)) {
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
              const moreCount = opts.otherCountByTopic ? opts.otherCountByTopic(resolvedTopicForRange) : 0;
              scheduleCardTooltip({
                content: buildTooltipLabel(resolvedTopicForRange, moreCount, colors.text, opts.activeTopic !== null && resolvedTopicForRange === opts.activeTopic),
                colors: { text: colors.text, border: colors.border },
                x: e.clientX,
                y: e.clientY,
              });
            }}
            onMouseLeave={() => { opts.onRangeHover(null); cancelCardTooltip(); }}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse') return;
              opts.onRangeHover(c.rangeIndex);
              const moreCount = opts.otherCountByTopic ? opts.otherCountByTopic(resolvedTopicForRange) : 0;
              scheduleCardTooltip({
                content: buildTooltipLabel(resolvedTopicForRange, moreCount, colors.text, opts.activeTopic !== null && resolvedTopicForRange === opts.activeTopic),
                colors: { text: colors.text, border: colors.border },
                x: e.clientX,
                y: e.clientY,
              });
            }}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') { opts.onRangeHover(null); cancelCardTooltip(); } }}
            onClick={(e) => {
              if (!opts.onRangeClick) return;
              e.stopPropagation();
              (e.currentTarget as HTMLElement).blur();
              cancelCardTooltip();
              // Span click → onRangeClick filters the panel to the posts linked to
              // this span (toggles off on re-click). stopPropagation keeps it from
              // bubbling to the card's open-the-post handler.
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
  const adjustedRelations = relations.map((r, i) => ({
    ...r,
    __idx: i, // preserve original index so rangeIndex survives the filter below
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

const RelatedStacks: React.FC<RelatedStacksProps> = ({ relatedStacks, cardWidth = "100%", onStackClick, showupdate, onOpenModalWithStackId, onPostNavigate, sourcePostId, highlightPostId, mode = 'aside-only' }) => {
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
  const pendingHoverCardIdRef = useRef<string | null>(null);
  // A stationary pointer must not activate whichever card happens to pass under
  // it while the related panel is scrolling. Hover becomes eligible again only
  // after the panel has settled; the user's next pointer movement can then
  // activate the card intentionally.
  const panelScrollingRef = useRef(false);
  const panelScrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const { filterCategories, responseFilter, hoveredHighlightRangeIndex, hoveredCategory, tappedCardPostId, tappedRangeIndex, topicInteraction, replyTopicCounts, baseOrderIds, focusHoverRanges } = useHighlightStore();
  const flags = useExperimentFlags();

  // ── T4: consume the T3 derived selectors ────────────────────────────────────
  // The aside GROUPS when the active topic interaction originated here
  // (origin==='aside'); it is FILTERED when the interaction originated on the
  // replies (origin==='replies'), but only in the cross-pane detail role with
  // the flag on. `topicInteraction` is a stable store reference, so the derived
  // grouping is stable too — keeping the effects that depend on it from firing
  // every render.
  const grouping = useMemo(() => asideGrouping(topicInteraction), [topicInteraction]);
  const asideFilterInteraction = useMemo(
    () =>
      mode === 'detail-cross-pane' && flags.crossPaneFiltering
        ? asideTopicFilter(topicInteraction)
        : null,
    [mode, flags.crossPaneFiltering, topicInteraction],
  );
  const asideTopicFilterKey = asideFilterInteraction?.topicKey ?? null;
  // Feed the existing reorder machinery from the selector: the anchor is the
  // clicked span on the origin (aside) pane. Memoized so identities stay stable
  // across renders (the FLIP / show-more effects key off these).
  const reRankAnchorIds = useMemo<string[]>(
    () => (grouping ? [grouping.anchor.postId] : []),
    [grouping],
  );
  const anchoredRangeByPost = useMemo<Record<string, number>>(
    () => (grouping ? { [grouping.anchor.postId]: grouping.anchor.rangeIndex } : {}),
    [grouping],
  );

  // Resolve the topic key currently living at an interaction's anchor — the
  // validator setPanelFocus uses to drop a restored interaction whose span is
  // gone. Routed by ORIGIN: an aside-origin anchor resolves against the related
  // cards; a reply-origin anchor resolves against the detail page's reply
  // relations (registered in the store via registerReplyTopicResolver, T7) — the
  // aside cannot see reply relations itself, so without this a restored
  // reply-origin interaction would always fail to resolve and be dropped.
  const resolveTopicKey = React.useCallback(
    (anchor: { postId: string; rangeIndex: number }, origin?: 'aside' | 'replies'): string | null => {
      if (origin === 'replies') return resolveReplyTopicKey(anchor);
      const stack = relatedStacks.find((s) => s.topPost.id === anchor.postId);
      const rel = stack?.topPost.relations?.[anchor.rangeIndex];
      return rel ? topicKeyOf(rel) : null;
    },
    [relatedStacks],
  );
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
  const [visibleCardCount, setVisibleCardCount] = useState(RELATED_PAGE_SIZE);

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
    const optimisticCount = Math.max(0, initialCount + (optimistic ? 1 : -1));
    setFavouritedOverride(prev => ({ ...prev, [postId]: optimistic }));
    setFavouritesCountOverride(prev => ({ ...prev, [postId]: optimisticCount }));

    const result = await toggleFavourite(postId, current);
    if (!result.ok) {
      // Revert optimistic UI on failure.
      setFavouritedOverride(prev => ({ ...prev, [postId]: current }));
      setFavouritesCountOverride(prev => ({ ...prev, [postId]: initialCount }));
      notifications.show({
        title: 'Error',
        message: 'Could not update like. Please try again.',
        color: 'red',
      });
      return;
    }

    setFavouritedOverride(prev => ({ ...prev, [postId]: result.value }));
    showUndoableAction({
      title: result.value ? 'Post liked' : 'Like removed',
      message: result.value ? 'This post was added to your likes.' : 'This post was removed from your likes.',
      onUndo: async () => {
        const undoResult = await toggleFavourite(postId, result.value);
        if (!undoResult.ok) {
          notifications.show({ title: 'Error', message: 'Could not undo like. Please try again.', color: 'red' });
          return;
        }
        setFavouritedOverride(prev => ({ ...prev, [postId]: undoResult.value }));
        setFavouritesCountOverride(prev => ({
          ...prev,
          [postId]: Math.max(0, optimisticCount + (undoResult.value ? 1 : -1)),
        }));
      },
    });
  };

  const handleToggleBookmark = async (postId: string, current: boolean) => {
    // Optimistically reflect the toggle, then confirm/revert with the server result.
    const optimistic = !current;
    setBookmarkedOverride(prev => ({ ...prev, [postId]: optimistic }));
    const result = await toggleBookmark(postId, current);
    if (!result.ok) {
      setBookmarkedOverride(prev => ({ ...prev, [postId]: current }));
      notifications.show({
        title: 'Error',
        message: 'Could not update bookmark. Please try again.',
        color: 'red',
      });
      return;
    }

    setBookmarkedOverride(prev => ({ ...prev, [postId]: result.value }));
    showUndoableAction({
      title: result.value ? 'Post saved' : 'Bookmark removed',
      message: result.value ? 'This post was added to your bookmarks.' : 'This post was removed from your bookmarks.',
      onUndo: async () => {
        const undoResult = await toggleBookmark(postId, result.value);
        if (!undoResult.ok) {
          notifications.show({ title: 'Error', message: 'Could not undo bookmark. Please try again.', color: 'red' });
          return;
        }
        setBookmarkedOverride(prev => ({ ...prev, [postId]: undoResult.value }));
      },
    });
  };

  const [currentStackId, setCurrentStackId] = useState<string | null>(null);

  // Category chip click → routed through the atomic `setCategoryFilter` so
  // replace-not-stack holds: activating a category clears any active topic
  // grouping + passage filter in one transition (the store enforces the
  // one-interaction-at-a-time invariant). The decide* STACK/SWITCH helpers are
  // kept behind the `filterStacking` flag (default off) for the ablation.
  const handleFilterChipClick = (category: string) => {
    // WS6: a category chip is an undoable gesture on the detail route — record the
    // pre-interaction snapshot before mutating. No rebase (null order): a category
    // filter hides/reveals cards but never reorders the base.
    if (mode === 'detail-cross-pane') {
      const scope = currentPanelScope();
      if (scope) beginPanelInteraction(scope, null);
    }
    const active = filterCategories;
    if (active.has(category)) {
      // Deselect this chip.
      const next = new Set(active);
      next.delete(category);
      setCategoryFilter(next);
      return;
    }

    // Default (filterStacking off): single-category selection — a new category
    // REPLACES the prior filter and any topic/passage interaction.
    if (!flags.filterStacking) {
      setCategoryFilter(new Set([category]));
      return;
    }

    // filterStacking on — legacy AND/drill conjunction via the decide* helpers.
    // NOTE: cross-dimension STACK (category onto a grouping/passage) collapses to
    // the category dimension under the atomic model (one interaction at a time);
    // same-dimension category AND is preserved.
    if (grouping) {
      const decision = decideGroupFilterMode(groupMemberIds, relatedStacks, active, category);
      setCategoryFilter(decision === 'STACK' ? new Set(Array.from(active).concat([category])) : new Set([category]));
      return;
    }
    if (responseFilter !== null) {
      const decision = decideResponseFilterMode(responseFilter, relatedStacks, active, category);
      setCategoryFilter(decision === 'STACK' ? new Set(Array.from(active).concat([category])) : new Set([category]));
      return;
    }
    if (active.size === 0) {
      setCategoryFilter(new Set([category]));
    } else {
      const decision = decideFilterMode(relatedStacks, active, category);
      setCategoryFilter(decision === 'ADD' ? new Set(Array.from(active).concat([category])) : new Set([category]));
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
    // Cross-pane counts: fold in the thread page's displayed-reply topic counts
    // so "N more <topic>" reflects both panes (suppression keeps ids disjoint).
    if (flags.crossPaneFiltering) {
      for (const [topic, n] of Object.entries(replyTopicCounts)) {
        topicTotal.set(topic, (topicTotal.get(topic) ?? 0) + n);
      }
    }
    return { postTopics, topicTotal };
  }, [relatedStacks, replyTopicCounts, flags.crossPaneFiltering]);

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

  // Base order = the visible side-pane order at the moment the active anchor was
  // last toggled. It lives in the STORE (`baseOrderIds`, per-focus) rather than a
  // component ref (WS6/critique C3): a Back-undo restores it atomically alongside
  // the grouping, and the capture happens in a PRE-interaction transaction
  // (`beginPanelInteraction`, in the gesture handlers) instead of during render —
  // a render-time capture would clobber a restore (activeAnchorIdRef would be
  // stale) and could grab the post-interaction order (critique W6-5). Reordering
  // stays permanent because each gesture rebases to the order the user sees.

  /** Reorder side-pane stacks around the active anchor (paper §3.1):
   *  – ALL matched posts above the anchor move down to immediately above it
   *    (preserving their relative order).
   *  – The TOP N (default 3) matched posts below the anchor move up to
   *    immediately below it; the rest are paginated out and revealed by the
   *    footer "K more Topic" link.
   *  Reordering is permanent: cancelling the group leaves the posts in their
   *  new positions, and a subsequent grouping layers on top of that order. */
  const { displayStacks: groupedStacks, claimedBy, anchorSet, anchorParent, groupTotal, groupShown, activeAnchorTopic, groupMemberIds } = useMemo(() => {
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

    // Reconstruct workingStacks from the store's baseOrderIds, dropping IDs that
    // are no longer in relatedStacks and appending any new IDs at the end. The
    // base is captured at the gesture (beginPanelInteraction / setPanelBaseOrder),
    // NOT here — so a Back-restored base survives the next render.
    const stackById = new Map(relatedStacks.map(s => [s.topPost.id, s]));
    let workingStacks: RelatedStackType[];
    if (baseOrderIds.length > 0) {
      const ordered = baseOrderIds
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
      // Span filter — keep stacks whose relations overlap the clicked span's
      // focus region ("focus on the N related posts linked to this span"). This
      // must run when UNGROUPED too — a span click filters without grouping.
      if (responseFilter !== null) {
        result = result.filter(s =>
          (s.topPost.relations ?? []).some(r =>
            r.focusStart < responseFilter!.end && responseFilter!.start < r.focusEnd));
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
    if (responseFilter !== null) {
      result = result.filter(s =>
        (s.topPost.relations ?? []).some(r =>
          r.focusStart < responseFilter.end && responseFilter.start < r.focusEnd
        )
      );
    }

    return { displayStacks: result, claimedBy, anchorSet, anchorParent, groupTotal, groupShown, activeAnchorTopic, groupMemberIds };
  }, [relatedStacks, filterCategories, responseFilter, reRankAnchorIds, shownByAnchor, anchoredRangeByPost, baseOrderIds]);

  // ── Aside filter-by-topic branch (T4) ──────────────────────────────────────
  // When the active interaction originated on the REPLIES pane, this panel is
  // FILTERED to the same topic (asideTopicFilterKey). Mutually exclusive with
  // aside grouping by construction (an aside-origin interaction never sets this
  // key). Precompute the matches: if NONE carry the topic, leave the pane
  // unfiltered and show no chip — a filter that empties the panel would read as
  // "nothing here" when the real story is "this pane has no posts on that topic".
  const { displayStacks, activeTopicFilterKey } = useMemo(() => {
    if (!asideTopicFilterKey) {
      return { displayStacks: groupedStacks, activeTopicFilterKey: null as string | null };
    }
    const matched = groupedStacks.filter((s) =>
      relationsMatchTopic(s.topPost.relations, asideTopicFilterKey),
    );
    return matched.length > 0
      ? { displayStacks: matched, activeTopicFilterKey: asideTopicFilterKey }
      : { displayStacks: groupedStacks, activeTopicFilterKey: null };
  }, [groupedStacks, asideTopicFilterKey]);

  // Keep long related sets study-friendly: start with ten cards and reveal ten
  // more at a time. A filter/group change starts a fresh page, while the active
  // anchor and its currently revealed block are always kept in view even when
  // they originally sat beyond the first ten results.
  const paginationResetKey = useMemo(() => [
    sourcePostId ?? ctxActivePostId ?? '',
    relatedStacks.map((stack) => stack.topPost.id).join(','),
    Array.from(filterCategories).sort().join(','),
    responseFilter ? `${responseFilter.start}:${responseFilter.end}` : '',
    asideTopicFilterKey ?? '',
    grouping ? `${grouping.anchor.postId}:${grouping.anchor.rangeIndex}` : '',
  ].join('|'), [sourcePostId, ctxActivePostId, relatedStacks, filterCategories, responseFilter, asideTopicFilterKey, grouping]);

  useEffect(() => {
    setVisibleCardCount(RELATED_PAGE_SIZE);
  }, [paginationResetKey]);

  const activeAnchorIdForPagination = grouping?.anchor.postId ?? null;
  const minimumCountForActiveGroup = useMemo(() => {
    if (!activeAnchorIdForPagination) return 0;
    let lastGroupIndex = -1;
    displayStacks.forEach((stack, index) => {
      const postId = stack.topPost.id;
      if (postId === activeAnchorIdForPagination || claimedBy.get(postId) === activeAnchorIdForPagination) {
        lastGroupIndex = index;
      }
    });
    return lastGroupIndex + 1;
  }, [activeAnchorIdForPagination, claimedBy, displayStacks]);
  const effectiveVisibleCardCount = Math.max(visibleCardCount, minimumCountForActiveGroup);
  const visibleDisplayStacks = useMemo(
    () => displayStacks.slice(0, effectiveVisibleCardCount),
    [displayStacks, effectiveVisibleCardCount],
  );
  const remainingCardCount = Math.max(0, displayStacks.length - visibleDisplayStacks.length);

  // Robustness: sweep away residual FLIP transforms whenever the visible list
  // changes for a reason the FLIP effect does not run for (filters, cross-pane
  // updates, data refresh). An interrupted FLIP could otherwise leave a card
  // frozen at translateY(...) — rendering it ON TOP of its neighbours.
  useLayoutEffect(() => {
    if (flipFirstTopsRef.current) return; // a FLIP is in flight — its effect owns cleanup
    const aside = document.querySelector('[data-testid="col-aside"]') as HTMLElement | null;
    if (!aside) return;
    aside.querySelectorAll('[data-related-card]').forEach((el) => {
      const h = el as HTMLElement;
      if (h.style.transform) {
        h.style.transition = 'none';
        h.style.transform = '';
      }
    });
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
   * Only computed when responseFilter is active.
   */
  const shortestCommonText = useMemo<string | null>(() => {
    if (!responseFilter) return null;
    if (displayStacks.length === 0) return null;

    let maxStart = responseFilter.start;
    let minEnd = responseFilter.end;

    for (const s of displayStacks) {
      const rels = (s.topPost.relations ?? []).filter(r =>
        filterCategories.size === 0 || filterCategories.has(r.category)
      );
      for (const r of rels) {
        // Only narrow on relations that actually overlap the span filter
        if (r.focusStart < responseFilter.end && responseFilter.start < r.focusEnd) {
          if (r.focusStart > maxStart) maxStart = r.focusStart;
          if (r.focusEnd < minEnd) minEnd = r.focusEnd;
        }
      }
    }

    let text: string;
    if (
      maxStart < minEnd &&
      maxStart >= responseFilter.start &&
      minEnd <= responseFilter.end
    ) {
      text = responseFilter.text.slice(maxStart - responseFilter.start, minEnd - responseFilter.start);
    } else {
      text = responseFilter.text; // fallback: show the full clicked span
    }

    return text.length > 60 ? text.slice(0, 60) + '…' : text;
  }, [displayStacks, responseFilter, filterCategories]);

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
  // FLIP reorder animation: per-card viewport tops captured at toggle time (the
  // "First" measurement), and the rAF handle for the "Play" step.
  const flipFirstTopsRef = useRef<Map<string, number> | null>(null);
  const flipRafRef = useRef<number>(0);

  /** Toggle the aside topic grouping for a clicked card span (or dismiss it via
   *  the header ×). Routes through the atomic `activateAsideTopic` /
   *  `clearTopicInteraction` so replace-not-stack holds (grouping clears any
   *  category/passage filter). The interacted card stays visually pinned while
   *  the others animate around it. */
  const handleToggleAnchor = (postId: string, rangeIndex?: number) => {
    const activeAnchorId = grouping?.anchor.postId ?? null;
    const activeAnchorRange = grouping?.anchor.rangeIndex ?? null;
    const activeTopicKey = grouping?.topicKey ?? null;

    // The topic key for THIS click, computed at the click site (the store can't
    // derive it). Topicless spans (no explicit `topic`) cannot seed a topic
    // interaction — grouping and cross-pane filtering must key identically.
    let clickTopicKey: string | null = null;
    if (rangeIndex !== undefined) {
      const clickStack = relatedStacks.find(s => s.topPost.id === postId);
      const clickRel = clickStack?.topPost.relations?.[rangeIndex];
      clickTopicKey = clickRel ? topicKeyOf(clickRel) : null;
    }

    // Decide the action BEFORE any DOM capture so a no-op never strands the FLIP
    // capture state (which would otherwise leak until the next real toggle).
    let action: 'clear' | 'activate' | 'noop';
    if (rangeIndex === undefined) {
      // Header × / dismiss button: clear the current grouping (no-op if none).
      action = activeAnchorId !== null ? 'clear' : 'noop';
    } else if (activeAnchorId === postId && activeAnchorRange === rangeIndex) {
      // The active anchor span clicked again → toggle the group off.
      action = 'clear';
    } else if (activeTopicKey !== null && clickTopicKey === activeTopicKey) {
      // Re-anchoring a DIFFERENT span on the topic already grouped is a no-op —
      // it would only shuffle which card owns the block (tooltip reads "(shown)").
      action = 'noop';
    } else if (clickTopicKey === null) {
      // Topicless span — cannot start a topic interaction; leave state as-is.
      action = 'noop';
    } else {
      action = 'activate';
    }
    if (action === 'noop') return;

    // Clear hover state — card indices shift after reorder, so old
    // hoveredCardIndex would point at a different card → everything dims.
    setHoveredCardId(null);
    setHoveredSidebarPost(null);
    setHoveredHighlightRangeIndex(null);
    setHoveredCategory(null);
    clearTapped();

    // Capture the anchor's viewport position BEFORE the reorder. Using
    // getBoundingClientRect (not offsetTop) is deliberate: it captures both the
    // reorder and any sticky-header growth, so the post-reorder scroll
    // compensation can keep the clicked card exactly where it was.
    const aside = document.querySelector('[data-testid="col-aside"]') as HTMLElement | null;
    const cardEl = (aside ?? document).querySelector(`[data-post-id="${postId}"]`) as HTMLElement | null;
    pinnedPostIdRef.current = postId;
    pinnedPrevTopRef.current = cardEl ? cardEl.getBoundingClientRect().top : null;

    // FLIP "First": record every card's current viewport top so the layout effect
    // can slide each one from here to its new slot after the reorder.
    const firstTops = new Map<string, number>();
    aside?.querySelectorAll('[data-related-card]').forEach((el) => {
      const pid = el.querySelector('[data-post-id]')?.getAttribute('data-post-id');
      if (pid) firstTops.set(pid, (el as HTMLElement).getBoundingClientRect().top);
    });
    flipFirstTopsRef.current = firstTops;

    // WS6 pre-interaction transaction: capture the order the user CURRENTLY sees
    // as the new base (permanent-reorder) and, on the detail route, record the
    // pre-interaction snapshot on the undo ring — all BEFORE the mutation below,
    // so a Back restores the exact prior view (old base + old grouping). Grouping
    // gestures (activate/switch/cancel) rebase; the feed path is non-undoable.
    const visibleOrderIds = displayStacks.map(s => s.topPost.id);
    if (mode === 'detail-cross-pane') {
      const scope = currentPanelScope();
      if (scope) beginPanelInteraction(scope, visibleOrderIds);
      else setPanelBaseOrder(visibleOrderIds);
    } else {
      setPanelBaseOrder(visibleOrderIds);
    }

    // Apply the interaction. `activateAsideTopic` sets topicInteraction
    // (origin='aside') and, via the store's reducer, clears the category +
    // passage dimensions. In detail-cross-pane mode this also FILTERS the reply
    // pane to the same topic (the reply pane consumes replyTopicFilter — wired
    // in T7); in aside-only mode there is no reply pane, so it only groups here.
    if (action === 'clear') {
      clearTopicInteraction();
    } else {
      activateAsideTopic({ topicKey: clickTopicKey!, anchor: { postId, rangeIndex: rangeIndex! } });
    }
  };

  // Compensate scroll BEFORE paint so the clicked card never visually moves on a
  // regroup. CRITICAL: this is keyed on the grouping state — it must NOT run on
  // every render. A dependency-less version ran (and mutated aside.scrollTop) on
  // every hover-driven re-render, which, combined with cards moving under the
  // cursor, was the page-freeze amplifier. The pinnedPostIdRef guard makes it a
  // no-op unless a toggle just set it.
  useLayoutEffect(() => {
    const aside = document.querySelector('[data-testid="col-aside"]') as HTMLElement | null;

    // 1) Scroll compensation — keep the clicked/anchor card visually fixed.
    const postId = pinnedPostIdRef.current;
    const prevTop = pinnedPrevTopRef.current;
    pinnedPostIdRef.current = null;
    pinnedPrevTopRef.current = null;
    if (aside && postId && prevTop !== null) {
      const cardEl = aside.querySelector(`[data-post-id="${postId}"]`) as HTMLElement | null;
      if (cardEl) {
        const delta = cardEl.getBoundingClientRect().top - prevTop;
        if (Math.abs(delta) > 0.5) {
          const max = Math.max(0, aside.scrollHeight - aside.clientHeight);
          aside.scrollTop = Math.min(max, Math.max(0, aside.scrollTop + delta));
        }
      }
    }

    // 2) FLIP reorder animation — slide each card from its captured "First" top to
    // its new slot. Measured AFTER the scroll compensation, so the anchor's delta
    // is ~0 (it stays put, and is skipped anyway) while the rest animate around
    // it. A manual one-shot CSS transition: fixed-duration and self-terminating,
    // unlike the framer-motion `layout` projection that was removed for never
    // settling in this grouped scroll container (the hover-while-grouped freeze).
    const first = flipFirstTopsRef.current;
    flipFirstTopsRef.current = null;
    if (!aside || !first) return;
    const anchorId = reRankAnchorIds.length > 0 ? reRankAnchorIds[reRankAnchorIds.length - 1] : null;
    const cards = Array.from(aside.querySelectorAll('[data-related-card]')) as HTMLElement[];
    // Reset any leftover transform from a previous (possibly interrupted) FLIP so
    // getBoundingClientRect reads true resting positions.
    cards.forEach((el) => { el.style.transition = 'none'; el.style.transform = ''; });
    const toPlay: HTMLElement[] = [];
    cards.forEach((el) => {
      const pid = el.querySelector('[data-post-id]')?.getAttribute('data-post-id');
      if (!pid || pid === anchorId) return;          // skip the pinned anchor
      const oldTop = first.get(pid);
      if (oldTop === undefined) return;              // not present before the reorder
      const dy = oldTop - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      el.style.transform = `translateY(${dy}px)`;    // Invert (transition already none)
      toPlay.push(el);
    });
    if (toPlay.length === 0) return;
    if (flipRafRef.current) cancelAnimationFrame(flipRafRef.current);
    flipRafRef.current = requestAnimationFrame(() => {              // Play
      for (const el of toPlay) {
        el.style.transition = 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.transform = '';
      }
    });
    return () => { if (flipRafRef.current) cancelAnimationFrame(flipRafRef.current); };
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

  // Badge-hover reveal: after a short dwell, scroll the card so the hovered
  // category's contribution span is visible (block:'nearest' no-ops when it
  // already is). The dwell keeps a cursor sweep across badges from scrolljacking.
  const tagScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleTagScroll = (cardIndex: number, rangeIndex: number) => {
    if (tagScrollTimer.current) clearTimeout(tagScrollTimer.current);
    tagScrollTimer.current = setTimeout(() => {
      tagScrollTimer.current = null;
      const paperEl = paperRefs.current[cardIndex];
      if (!paperEl) return;
      let markEl = paperEl.querySelector(`mark[data-range-id="${rangeIndex}"]`) as HTMLElement | null;
      if (!markEl) {
        // Overlap segments carry the range id in a CSV attribute.
        markEl = (Array.from(paperEl.querySelectorAll('mark[data-overlap-range-ids]')) as HTMLElement[])
          .find((m) => (m.getAttribute('data-overlap-range-ids') ?? '').split(',').includes(String(rangeIndex))) ?? null;
      }
      (markEl ?? paperEl).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 150);
  };
  const cancelTagScroll = () => {
    if (tagScrollTimer.current) { clearTimeout(tagScrollTimer.current); tagScrollTimer.current = null; }
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
  // Related-panel scroll persistence (mirrors the filter persistence above):
  // remember the aside's scroll offset per focus post and restore it when
  // returning — scrolling between focus posts, or entering/leaving a post's full
  // view. panelFocusIdRef tracks whose scroll the live listener is saving;
  // restoringPanelScrollRef suppresses the listener during a programmatic restore.
  const panelFocusIdRef = useRef<string | null>(null);
  const restoringPanelScrollRef = useRef(false);

  useLayoutEffect(() => {
    const focusId = sourcePostId ?? ctxActivePostId ?? null;
    const focusChanged = panelFocusIdRef.current !== focusId;
    // Pass the resolver so a restored topic interaction is validated against the
    // incoming focus's data and dropped WHOLE if its anchor span is gone.
    setPanelFocus(focusId, resolveTopicKey);
    setHoveredCardId(null);
    setHoveredIndex(null);
    hideTooltip();
    if (rangeHoverTimer.current) clearTimeout(rangeHoverTimer.current);
    clearTapped();
    // baseOrderIds is now store-owned and per-focus: setPanelFocus restores the
    // incoming focus's saved base (or []) and, on a real switch, the outgoing
    // focus's was snapshotted — so there is no component-local base to reset here.

    // Restore the incoming focus's scroll only on a real focus switch (not on a
    // same-focus data refresh, which would yank the user's current scroll).
    if (focusChanged) {
      restoringPanelScrollRef.current = true;
      panelFocusIdRef.current = focusId;
      const saved = getPanelScroll(focusId);
      requestAnimationFrame(() => {
        const aside = document.querySelector('[data-testid="col-aside"]') as HTMLElement | null;
        if (aside) aside.scrollTop = saved;
        requestAnimationFrame(() => { restoringPanelScrollRef.current = false; });
      });
    }
  }, [relatedStacks, sourcePostId, ctxActivePostId, resolveTopicKey]);

  // Live-save the aside scroll offset for the current focus post on every scroll
  // (rAF-throttled), so the latest position is always captured before a switch.
  useEffect(() => {
    const aside = document.querySelector('[data-testid="col-aside"]') as HTMLElement | null;
    if (!aside) return;
    let raf = 0;

    const suspendHover = () => {
      const wasAlreadyScrolling = panelScrollingRef.current;
      panelScrollingRef.current = true;
      if (panelScrollEndTimerRef.current) clearTimeout(panelScrollEndTimerRef.current);
      panelScrollEndTimerRef.current = setTimeout(() => {
        panelScrollingRef.current = false;
        panelScrollEndTimerRef.current = null;
      }, 160);

      // Clear once at the beginning of a scroll gesture. Repeating store writes
      // on every scroll event would add needless rendering work while moving.
      if (wasAlreadyScrolling) return;
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
      pendingHoverCardIdRef.current = null;
      if (rangeHoverTimer.current) clearTimeout(rangeHoverTimer.current);
      cancelTagScroll();
      setHoveredCardId(null);
      setHoveredIndex(null);
      setHoveredSidebarPost(null);
      setHoveredHighlightRangeIndex(null);
      setHoveredCategory(null);
      hideTooltip();
    };

    const onScroll = () => {
      suspendHover();
      if (restoringPanelScrollRef.current || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        savePanelScroll(panelFocusIdRef.current, aside.scrollTop);
      });
    };
    // Wheel arrives before the resulting scroll/mouse-boundary events, so it
    // closes the brief window where a card could activate during the first frame.
    aside.addEventListener('wheel', suspendHover, { passive: true });
    aside.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      aside.removeEventListener('wheel', suspendHover);
      aside.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      if (panelScrollEndTimerRef.current) clearTimeout(panelScrollEndTimerRef.current);
    };
  }, []);

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
        // Breathing room so the first row of filter chips doesn't touch the top
        // bar. The padding is part of the sticky (cream) header, so scrolled cards
        // still pass cleanly underneath it.
        background: '#FCFBF5', paddingTop: '0.75rem', paddingBottom: '0.5rem',
      }}>
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

        <Text size="sm" fw={700} c="#374151" mb={6}>Related Posts</Text>

        <Text size="xs" c="dimmed" mb={4}>
          {activeTopicFilterKey
            ? `${displayStacks.length} post${displayStacks.length !== 1 ? 's' : ''} about ${activeTopicFilterKey}`
            : filterCategories.size > 0 && responseFilter !== null
            ? `${displayStacks.length} post${displayStacks.length !== 1 ? 's' : ''} matching category, responding to passage`
            : responseFilter !== null
            ? `${displayStacks.length} post${displayStacks.length !== 1 ? 's' : ''} responding to this passage`
            : filterCategories.size > 0
            ? `${displayStacks.length} ${Array.from(filterCategories).map(c => CATEGORY_LABELS[c] ?? c).join(' + ')} post${displayStacks.length !== 1 ? 's' : ''}`
            : `${displayStacks.length} posts across all categories`}
        </Text>

        {/* Shared "Filtered by" chip row. The passage ("responses to") filter and
            the cross-pane topic filter both render through the shared FilterByChip
            model (also used by ReplyFilterBar). These are mutually exclusive under
            replace-not-stack, so at most one chip shows. The old top-of-panel
            "Grouped by:" pill is gone — aside grouping is shown by the inline
            block markers (header chip / footer / connector rail) only. */}
        {(responseFilter !== null || activeTopicFilterKey) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <Text size="xs" fw={600} c="#5a71a8" style={{ fontSize: 11, flexShrink: 0 }}>
              Filtered by:
            </Text>
            {responseFilter !== null && (
              <FilterByChip kind="response" label={responseFilter.text} maxChars={35} onClear={() => { beginUndoablePanelInteractionIfDetail(); clearResponseFilter(); }} />
            )}
            {activeTopicFilterKey && (
              <FilterByChip kind="topic" label={activeTopicFilterKey} onClear={() => { beginUndoablePanelInteractionIfDetail(); clearTopicInteraction(); }} testId="aside-topic-filter" />
            )}
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
          // Gutter for the group frame's outward right rail (right:
          // -GROUP_LINE_WIDTH*2 on the frame, matching negative marginRight on
          // the header). The aside is a scroll container (overflow-y: auto), so
          // overflow-x can never be truly `visible` — anything painted past the
          // content box becomes 4px of horizontal scrollable overflow that lets
          // the pane shift sideways and clip the border. Reserving the space
          // keeps the rail inside the pane; card widths stay constant whether
          // grouped or not, so the shell divider still never moves.
          paddingRight: GROUP_LINE_WIDTH * 2,
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

          return visibleDisplayStacks.flatMap((stack, index) => {
          const isCardHovered = hoveredCardId === stack.topPost.id;
          const isHighlighted = !!highlightPostId && stack.topPost.id === highlightPostId;
          const colors = getCategoryColors(stack.rel);
          const isExpanded = !!expandedCards[stack.stackId];

          // Strip HTML so the text matches the relations' PLAIN-text offsets.
          // The mock resolver wraps card content as `<p>…</p>`, which both leaks
          // literal tags into view and shifts every highlight by the tag length;
          // the focus post already strips before highlighting, so mirror that.
          const plainContent = (stack.topPost.content || '').replace(/<[^>]*>/g, '');
          const rels = stack.topPost.relations;

          // Smart windowing: show only the highlighted portion unless expanded
          const { text: visibleText, adjustedRelations, hasPrefix, hasSuffix } =
            windowContent(plainContent, rels, isExpanded);
          const isTruncated = hasPrefix || hasSuffix;

          // Calculate indent depth by walking the anchor chain. Per-level indent
          // is small (8px) so deep nesting doesn't overflow the right pane. A
          // claimed post sits one level below its claimer; an anchor (or plain
          // card) sits at its own parent-chain depth. Factored into depthOf so the
          // group's rail can also pin to the anchor's depth (see blockIndentPx).
          const depthOf = (pid: string): number => {
            let d = 0;
            if (claimedBy.has(pid)) {
              let aid = claimedBy.get(pid); // claimed: 1 + claimer's own depth
              while (aid) { d++; aid = anchorParent.get(aid); }
            } else {
              let aid = anchorParent.get(pid); // anchor/plain: own parent chain
              while (aid) { d++; aid = anchorParent.get(aid); }
            }
            return d;
          };
          const indentPx = depthOf(stack.topPost.id) * 8;

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

          // Reverse cross-highlight (focus → aside): while a focus-post span is
          // hovered, this card's relations overlapping the hovered union get
          // their spans brightened and the rest dimmed. Indices are into the
          // ORIGINAL relations array — the same space as tagged rangeIndex
          // (windowing preserves it via __idx).
          const focusHoverMatchedIdx = focusHoverRanges
            ? new Set(
                (rels ?? [])
                  .map((r: Relation, i: number) =>
                    focusHoverRanges.some((u) => r.focusStart < u.end && u.start < r.focusEnd) ? i : -1)
                  .filter((i: number) => i >= 0),
              )
            : null;

          // Build React content nodes with multi-range + 3-level hover
          const contentNodes = buildMultiHighlightNodes(
            visibleText, adjustedRelations, colors,
            {
              isCardHovered: isCardActive,
              anyCardHovered,
              hoveredRangeIndex: isCardActive ? (isCardTapped ? tappedRangeIndex : hoveredHighlightRangeIndex) : null,
              hoveredCategory: isCardActive ? hoveredCategory : null,
              focusHoverMatchedIdx,
              anchoredRangeIndex: anchoredRangeByPost[stack.topPost.id] ?? null,
              activeTopic: activeAnchorTopic,
              inActiveBlock,
              onRangeHover: debouncedRangeHover,
              // Clicking a span on a related card toggles a TOPIC ANCHOR: it
              // re-ranks/groups the panel around that card's topic (with the
              // "Grouped by" pill, group header/footer, connector lines and the
              // F-indicator). This is intentionally DISTINCT from the focus-post
              // span click, which applies the overlap filter (responseFilter).
              onRangeClick: (ri) => handleToggleAnchor(stack.topPost.id, ri),
              otherCountByTopic: (topic: string) => {
                const total = topicTotal.get(topic) ?? 0;
                const hasSelf = postTopics.get(stack.topPost.id)?.has(topic) ? 1 : 0;
                return Math.max(0, total - hasSelf);
              },
              countLinkedToRanges: (ris: number[]) => {
                // N for "Click to focus on N related posts": related posts whose
                // relations overlap the focus region(s) of the clicked span(s) —
                // exactly the set a span click filters the panel down to.
                const rels = ris
                  .map(ri => stack.topPost.relations?.[ri])
                  .filter((r): r is Relation => !!r);
                if (rels.length === 0) return 0;
                return relatedStacks.filter(s =>
                  (s.topPost.relations ?? []).some(r =>
                    rels.some(rel => rel.focusStart < r.focusEnd && r.focusStart < rel.focusEnd)),
                ).length;
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
          const anchorForPrev = index > 0 ? anchorOf(visibleDisplayStacks[index - 1]) : undefined;
          const anchorForNext = index + 1 < visibleDisplayStacks.length ? anchorOf(visibleDisplayStacks[index + 1]) : undefined;

          // Block boundaries: the first card whose anchorOf differs from the
          // previous (and isn't undefined) is the start of the topic block;
          // similarly for the last.
          const isFirstInBlock = !!anchorForThisCard && anchorForThisCard !== anchorForPrev;
          const isLastInBlock = !!anchorForThisCard && anchorForThisCard !== anchorForNext;

          // Rail alignment: every card in a topic block draws its rail (border-left)
          // at the BLOCK's left edge — the anchor's indent — not its own. A claimed
          // member sits one level deeper than its anchor (indentPx = anchorIndent +
          // 8), which would stagger each card's left edge and jog the vertical rail
          // 8px at every member boundary. Pinning the whole block to the anchor's
          // indent keeps the rail one straight line; the bracket itself now conveys
          // the grouping the stagger used to. Ungrouped cards keep their own indent.
          const blockIndentPx = anchorForThisCard ? depthOf(anchorForThisCard) * 8 : indentPx;

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
          // block ends — plus a × that collapses the group (same action as the
          // header ×, so the user doesn't have to scroll back up to dismiss).
          // Rendered INSIDE the last block card, after its Paper: the block's
          // wrap-around border then encloses it, and it escapes the card's
          // absolute bottom-edge hover zone (which extends BELOW the card box
          // with pointerEvents:auto and used to swallow the footer's clicks
          // when the footer dangled outside the card).
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
              // Block the card's touch-tap handler (cardEl onPointerDown) so a
              // tap on the footer doesn't also toggle card-active state.
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', gap: '2px',
                padding: '4px 10px 0',
              }}
            >
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  hideTooltip();
                  handleToggleAnchor(anchorForThisCard);
                }}
                aria-label={`Collapse ${anchorTopic} group`}
                // Same affordance as the header ×: 24px hit target, background
                // appears on hover.
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', fontSize: '16px', lineHeight: 1,
                  padding: '4px 8px',
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
                display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap',
                marginLeft: `${blockIndentPx}px`,
                marginRight: -GROUP_LINE_WIDTH * 2,
                // Top of the group bracket, now a full wrap-around box: this row
                // carries the top rule (border-top) plus BOTH side rails' starts
                // (border-left/right) and both rounded top corners — the tag rides
                // the connected top edge. The first card's connector (below) bridges
                // the flex gap up to this row so the rails stay continuous.
                borderTop: `${GROUP_LINE_WIDTH}px solid ${anchorColors.border}`,
                borderLeft: `${GROUP_LINE_WIDTH}px solid ${anchorColors.border}`,
                borderRight: `${GROUP_LINE_WIDTH}px solid ${anchorColors.border}`,
                borderTopLeftRadius: GROUP_CORNER_R,
                borderTopRightRadius: GROUP_CORNER_R,
                // Extra bottom padding extends the header's border-left DOWN over the
                // flex gap to the first card's top edge; the cancelling negative
                // marginBottom keeps the card's position unchanged. This makes the
                // header's rail meet the first card's rail flush (no gap in the flex
                // `gap`, which Chromium won't paint absolute overflow into).
                padding: `6px 8px ${6 + GROUP_GAP_PX}px 10px`,
                marginBottom: -GROUP_GAP_PX,
              }}
            >
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

          // The group bracket is now a single CONNECTED outline: the header row
          // draws the top rule + rounded top-left corner, each block card's
          // connector draws the continuous vertical rail, and bottomRuleEl draws
          // the bottom rule + rounded bottom-left corner. No separate top-rule
          // element is needed.
          const topRuleEl = null;
          // The bottom rule + rounded bottom-left corner is now drawn by the LAST
          // card's own border-bottom + border-bottom-left-radius (see cardEl), so no
          // separate bottom-rule element is needed.
          const bottomRuleEl = null;

          const scheduleCardHover = () => {
            if (isTouch || isTouchRef.current || panelScrollingRef.current) return;
            const pid = stack.topPost.id;
            if (hoveredCardId === pid || pendingHoverCardIdRef.current === pid) return;
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            pendingHoverCardIdRef.current = pid;
            hoverTimerRef.current = setTimeout(() => {
              hoverTimerRef.current = null;
              pendingHoverCardIdRef.current = null;
              if (panelScrollingRef.current || isTouchRef.current) return;
              setHoveredCardId(pid);
              setHoveredSidebarPost(pid, stack.topPost.relations);
            }, 90);
          };

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
                width: blockIndentPx > 0 ? `calc(100% - ${blockIndentPx}px)` : '100%',
                boxSizing: 'border-box',
                // Grouped-card rails are drawn by an absolute frame below, not by
                // layout borders. The card wrapper keeps the same width, and the
                // right rail can extend outward without moving the divider.
                borderRadius: anchorForThisCard ? 0 : '10px',
                ...cardDimStyle,
                // Every card in the active topic block sits alongside a continuous
                // group connector line (rendered as an absolute child below). The
                // padding leaves room for it; the line itself bridges the flex gap
                // above so the whole block — including the anchor — reads as one
                // continuous thread.
                // Grouped cards (except the last, which the bottom rule closes) extend
                // their box DOWN over the flex gap via paddingBottom + a cancelling
                // negative marginBottom, so the rail (top:0→bottom:0 above) spans that
                // space WITHIN the card box and meets the next card flush. Without it
                // the rail breaks in every inter-card gap (Chromium won't paint
                // absolute overflow into flex `gap`).
                paddingBottom: anchorForThisCard ? GROUP_GAP_PX : undefined,
                marginLeft: blockIndentPx > 0 ? `${blockIndentPx}px` : undefined,
                marginBottom: anchorForThisCard && !isLastInBlock ? -GROUP_GAP_PX : undefined,
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
              {anchorForThisCard && (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: -GROUP_LINE_WIDTH * 2,
                    pointerEvents: 'none',
                    borderLeft: `${GROUP_LINE_WIDTH}px solid ${anchorColors.border}`,
                    borderRight: `${GROUP_LINE_WIDTH}px solid ${anchorColors.border}`,
                    borderBottom: isLastInBlock ? `${GROUP_LINE_WIDTH}px solid ${anchorColors.border}` : undefined,
                    borderBottomLeftRadius: isLastInBlock ? GROUP_CORNER_R : undefined,
                    borderBottomRightRadius: isLastInBlock ? GROUP_CORNER_R : undefined,
                    zIndex: 7,
                  }}
                />
              )}
              {/* The block rail is an absolute visual frame, not a layout border:
                  grouping must not change card width or move the shell divider. */}
              <Paper
                ref={(el) => { paperRefs.current[index] = el; if (isHighlighted) highlightCardRef.current = el; }}
                data-post-id={stack.topPost.id}
                onClick={(e) => handleCardClick(e, stack.topPost.id, stack.stackId)}
                onMouseEnter={() => {
                  if (isTouch || panelScrollingRef.current) return;
                  setHoveredIndex(null);
                  scheduleCardHover();
                }}
                onMouseMove={scheduleCardHover}
                onMouseLeave={(e) => {
                  if (isTouch) return;
                  // A6: ignore Paper-leave events where the mouse went to a
                  // sibling that is still part of the SAME card container
                  // (bottom-edge zone, stack-shadow layers). Without this guard
                  // the cross-highlight/dim breaks every time the cursor brushes
                  // those zones mid-interaction.
                  // relatedTarget can be null OR a non-Node EventTarget (e.g. the
                  // window when the cursor leaves the viewport) — Node.contains()
                  // throws on anything that isn't a Node, so guard with instanceof.
                  const next = e.relatedTarget;
                  if (next instanceof Node && (e.currentTarget as HTMLElement)
                      .closest('[data-related-card]')
                      ?.contains(next)) {
                    return;
                  }
                  // Debounced clear — same coalescing so a sweep doesn't trigger
                  // an expensive un-highlight on every card boundary.
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  pendingHoverCardIdRef.current = null;
                  hoverTimerRef.current = setTimeout(() => {
                    hoverTimerRef.current = null;
                    setHoveredCardId(null); setHoveredSidebarPost(null);
                    setHoveredHighlightRangeIndex(null); setHoveredCategory(null);
                  }, 60);
                }}
                style={{
                  position: 'relative', width: '100%', backgroundColor: '#ffffff', zIndex: isHighlighted ? 6 : 5,
                  borderRadius: '10px', margin: '0 auto', paddingTop: '10px',
                  border: isHighlighted ? `2px solid #1c2b4a` : `2px solid #e2e8f0`,
                  boxShadow: isHighlighted
                    ? '0 0 0 3px rgba(28,43,74,0.18), 0 4px 16px rgba(0,0,0,0.10)'
                    : stack.size > 1 ? 'none' : '0 2px 12px rgba(0,0,0,0.06)',
                  transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
                  cursor: 'pointer',
                }}
              >
                {/* Card header row — author/date first, then compact contribution icons.
                    Text labels live in the tooltip/accessible name so tags never crowd
                    or obscure authorship metadata in the narrow related column. */}
                <div
                  onClick={(e) => { e.stopPropagation(); handleNavigate(stack.topPost.id, stack.stackId); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px 6px', minWidth: 0 }}>
                {/* Avatar + author · date inline (left). */}
                <UnstyledButton onClick={(e) => handleNavigateToUser(e, stack.topPost.account)} className="avatarHoverDim" style={{ flexShrink: 0 }}>
                  <Avatar src={stack.topPost.account.avatar} alt={stack.topPost.account.display_name} radius="xl" />
                </UnstyledButton>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  <Anchor component="button" onClick={(e) => handleNavigateToUser(e, stack.topPost.account)} underline="hover"
                    style={{ color: '#011445', fontWeight: 700, fontSize: 'var(--mantine-font-size-sm)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {stack.topPost.account.display_name}
                  </Anchor>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>· {formatPostDate(stack.topPost.created_at)}</Text>
                </div>
                {/* Category tags — icon-only and pushed right. Kept on one line so
                    author and date retain the readable portion of the header. */}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'nowrap', justifyContent: 'flex-end', marginLeft: 'auto', flexShrink: 0 }}>
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
                          data-related-tag
                          aria-label={CATEGORY_LABELS[cat] ?? cat}
                          onMouseEnter={(e) => { if (!isTouch) { setHoveredCategory(cat); scheduleTagScroll(index, indices[0]); } tagHover(e.clientX, e.clientY); }}
                          onMouseLeave={() => { if (!isTouch) { setHoveredCategory(null); cancelTagScroll(); } hideTooltip(); }}
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
                            width: '24px', height: '22px', padding: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1px solid ${tc.border}`,
                            opacity: tagBright ? 1 : 0.3,
                            transition: 'opacity 200ms ease',
                            cursor: 'pointer',
                          }}
                        >
                          {React.cloneElement(iconMapping[cat] || iconMapping['default'], { color: tc.text, size: 12 })}
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
                  // Color-match the bracket: the group rail + header use the ANCHOR's
                  // category color (anchorColors). A member card that expresses the SAME
                  // topic through a different category (e.g. Evidence-Personal/purple vs
                  // the anchor's green) would otherwise show a mismatched indicator. Use
                  // the anchor color whenever this card sits in a bracket block; fall back
                  // to its own category only for a lone anchor (no block — colors equal).
                  const indicatorColors = anchorForThisCard ? anchorColors : getCategoryColors(indicatorRel.category);
                  // Always show the category color so the chip is recognizable
                  // as the topic-anchor for that highlight color.
                  const indicatorColor = indicatorColors.text;
                  // PANE-LOCAL count: how many cards in THIS panel share the topic.
                  // (topicTotal folds in reply counts for tooltips; using it here
                  // showed "(8)" over a visible 5-card cluster — confusing.)
                  let clusterCount = 0;
                  postTopics.forEach((topics) => { if (topics.has(indicatorTopic)) clusterCount++; });
                  const baseOpacity = isCurrentAnchor ? 1 : 0.75;
                  return (
                    <button
                      type="button"
                      // Stable hook for "aside grouping is active": present on the
                      // active anchor card whenever a topic interaction groups this
                      // pane (independent of cluster size). Replaces the removed
                      // top-of-panel "Grouped by:" pill as the e2e grouping signal.
                      data-testid={isCurrentAnchor ? 'active-group-anchor' : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleAnchor(stack.topPost.id, indicatorRangeIdx);
                      }}
                      aria-label={`Show more posts about ${indicatorTopic}`}
                      aria-pressed={isCurrentAnchor}
                      style={{
                        marginLeft: 'auto',
                        alignSelf: 'flex-start',
                        flexShrink: 0,
                        background: isCurrentAnchor ? indicatorColors.bg : 'transparent',
                        border: isCurrentAnchor ? `1px solid ${indicatorColors.border}55` : 'none',
                        borderRadius: '4px',
                        padding: isCurrentAnchor ? '1px 5px' : '1px 4px',
                        cursor: 'pointer',
                        color: indicatorColor,
                        fontSize: '11px',
                        fontWeight: 600,
                        lineHeight: 1.3,
                        maxWidth: '124px',
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
                      {/* Truncate ONLY the topic; keep the (count) and chevron always
                          visible so a narrower pill never hides the group size. */}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        {indicatorTopic}
                      </span>
                      <span style={{ flexShrink: 0 }}>({clusterCount})</span>
                      <span aria-hidden style={{ flexShrink: 0, fontSize: '10px', marginLeft: '1px' }}>&#x203A;</span>
                    </button>
                  );
                })()}
                </div>

                {/* Content with smart windowing + highlight marks on hover */}
                <div
                  onClick={(e) => { e.stopPropagation(); handleCardClick(e, stack.topPost.id, stack.stackId); }}
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
                        &ldquo;{shortestCommonText}&rdquo;
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

              {bottomRuleEl}

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

          // footerEl renders INSIDE cardEl (after its Paper) so the block's
          // wrap-around border encloses the "see more" row and the card's
          // bottom-edge hover zone can't intercept its clicks.
          return [topRuleEl, headerEl, cardEl].filter(Boolean);
          }); // end visibleDisplayStacks.flatMap
        })()} {/* end activeAnchorTopic IIFE */}

        {remainingCardCount > 0 && (
          <button
            type="button"
            className="related-load-more"
            data-testid="related-load-more"
            onClick={() => setVisibleCardCount(Math.min(displayStacks.length, effectiveVisibleCardCount + RELATED_PAGE_SIZE))}
          >
            Load more
            <span>{Math.min(RELATED_PAGE_SIZE, remainingCardCount)} of {remainingCardCount} remaining</span>
          </button>
        )}
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
