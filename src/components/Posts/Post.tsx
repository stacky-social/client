"use client";

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Avatar, Group, Paper, UnstyledButton, Divider, Anchor, Button, Menu, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconHeart, IconBookmark, IconNote, IconMessageCircle, IconHeartFilled, IconBookmarkFilled, IconShare, IconDots, IconTrash, IconExternalLink } from '@tabler/icons-react';
import { copyLink } from '../../utils/share';
import { format } from 'date-fns';
import { formatPostDate } from '../../utils/formatPostDate';
import axios from 'axios';
import AnnotationModal from '../AnnotationModal';
import { PreviewCardType } from '../../types/PostType';
import InteractionControl from '../InteractionControl';
import { toggleFavourite, toggleBookmark, deleteStatus } from '../../utils/mastoActions';
import { getMe, getPost, isLiked as storeIsLiked, isBookmarked as storeIsBookmarked } from '../../utils/localStore';
import { getCurrentUser } from '../../utils/getCurrentUser';
import { useHighlightStore, setPassageFilter, clearResponseFilter, setPendingResponseFilter, setFilterCategories, setFocusHoverRanges, beginUndoablePanelInteractionIfDetail } from '../../utils/highlightStore';
import { CATEGORY_COLORS, CATEGORY_LABELS, categoryIcon, getCategoryColors } from '../../utils/categoryStyles';
import { renderMultiHighlightHtml } from '../../utils/focusHighlightHtml.mjs';
import ReplyHighlightedContent from './ReplyHighlightedContent';
import { useRelatedStacks } from '../../app/(shell)/related-stacks-context';
import type { Relation } from '../../types/PostType';
import { showTooltip, hideTooltip } from '../HoverTooltip';
import { showUndoableAction } from '../../utils/actionNotifications';
import { mastodonLinkHost } from '../../utils/mastodonContent.mjs';
import { pointBridgesInlineRects } from '../../utils/inlineHighlightGeometry.mjs';

/** X-style left-pane indent (px): avatar (Mantine md = 38px) + the header row's
 *  `gap="xs"` (10px) = 48px, i.e. where the username's left edge sits. The post
 *  body, media, divider, and action row all indent by this so content aligns
 *  under the USERNAME (not the avatar), matching the aside's related cards. */
const BODY_INDENT_PX = 48;

// ─── Focus post cross-highlight helpers ──────────────────────────────────────

/** Strip all HTML tags to get plain text for matching */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

type RenderedLineBand = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  target: boolean;
};

/** Measure the browser's actual text lines in content coordinates. Paragraph
 * gaps, font metrics, wrapping, and inline elements are therefore part of the
 * geometry instead of being approximated by one global line-height lattice. */
function measureRenderedLineBands(container: HTMLElement, targetMarks: Set<HTMLElement>): RenderedLineBand[] {
  const containerBox = container.getBoundingClientRect();
  const bands: RenderedLineBand[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!node.textContent || parent?.closest('.focus-window-prefix')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const isTarget = Array.from(targetMarks).some((mark) => mark.contains(node));

    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width < 0.25 || rect.height < 0.25) continue;
      const top = container.scrollTop + rect.top - containerBox.top;
      const bottom = container.scrollTop + rect.bottom - containerBox.top;
      const left = rect.left - containerBox.left;
      const right = rect.right - containerBox.left;
      const existing = bands.find((band) => Math.abs(band.top - top) < 1.25);
      if (existing) {
        existing.top = Math.min(existing.top, top);
        existing.bottom = Math.max(existing.bottom, bottom);
        existing.left = Math.min(existing.left, left);
        existing.right = Math.max(existing.right, right);
        existing.target ||= isTarget;
      } else {
        bands.push({ top, bottom, left, right, target: isTarget });
      }
    }
    range.detach();
  }

  return bands.sort((a, b) => a.top - b.top || a.left - b.left);
}

/** Return the source-text offset of the first real character on a rendered
 * line. The continuation control is skipped because it consumes no source text. */
function firstPlainOffsetOnLine(container: HTMLElement, line: RenderedLineBand): number | null {
  const containerBox = container.getBoundingClientRect();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let plainOffset = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const text = node.textContent ?? '';
    if (node.parentElement?.closest('.focus-window-prefix')) continue;
    if (text.length === 0) continue;
    const range = document.createRange();
    for (let index = 0; index < text.length; index += 1) {
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getClientRects()[0];
      if (!rect || rect.width < 0.1 || rect.height < 0.1) continue;
      const top = container.scrollTop + rect.top - containerBox.top;
      if (Math.abs(top - line.top) < 1.25) {
        range.detach();
        return plainOffset + index;
      }
    }
    range.detach();
    plainOffset += text.length;
  }
  return null;
}

/** Category colors for the aside→focus cross-highlight — the shared table, minus
 *  `uncategorized`: relations with an unknown/uncategorized category are dropped
 *  from the focus post's marks (the guard below relies on undefined). */
function crossColors(category: string): { bg: string; border: string } | undefined {
  if (category === 'uncategorized') return undefined;
  return CATEGORY_COLORS[category];
}

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Blend two hex colours by t (0..1) → OPAQUE rgb (so overlapping/nested marks
 *  never compound into darker bands). Level-1 faint = blend toward white;
 *  level-2 strong = blend the category bg toward its saturated border. */
function blendHex(from: string, to: string, t: number): string {
  const a = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${m(a[0], b[0])},${m(a[1], b[1])},${m(a[2], b[2])})`;
}

/** Remove any previous focus-comment bold wrappers (idempotency before re-wrap). */
function clearFocusCommentBold(container: HTMLElement): void {
  container.querySelectorAll('span[data-fc]').forEach((s) => {
    const p = s.parentNode;
    if (!p) return;
    while (s.firstChild) p.insertBefore(s.firstChild, s);
    p.removeChild(s);
    p.normalize();
  });
}

/** Bold the focus-comment sub-range [fcStart,fcEnd] (focus-plain offsets) inside
 *  the focus post — the data's OPTIONAL "bold span". Marks are now FLAT and split
 *  at every relation boundary, so the crux can span several adjacent marks; bold
 *  the intersection inside EACH mark it touches (a flat mark holds a single text
 *  node, so surroundContents can't cross an element boundary — the old
 *  smallest-containing-mark approach silently failed on the deeply-nested real
 *  data). */
function boldFocusCommentRange(container: HTMLElement, fcStart: number, fcEnd: number): void {
  const marks = Array.from(container.querySelectorAll('mark[data-fs]')) as HTMLElement[];
  for (const m of marks) {
    const a = parseInt(m.getAttribute('data-fs') || 'NaN', 10);
    const b = parseInt(m.getAttribute('data-fe') || 'NaN', 10);
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    const s = Math.max(a, fcStart), e = Math.min(b, fcEnd);
    if (e <= s) continue; // crux doesn't touch this mark
    const relStart = s - a, relEnd = e - a;
    const walker = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
    let pos = 0, sN: Text | null = null, sO = 0, eN: Text | null = null, eO = 0;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const len = (node.textContent || '').length;
      if (sN === null && pos + len > relStart) { sN = node as Text; sO = relStart - pos; }
      if (pos + len >= relEnd) { eN = node as Text; eO = relEnd - pos; break; }
      pos += len;
    }
    if (!sN || !eN) continue;
    try {
      const range = document.createRange();
      range.setStart(sN, sO);
      range.setEnd(eN, eO);
      const span = document.createElement('span');
      span.setAttribute('data-fc', '');
      // Non-reflowing faux-bold: matches the related cards' technique exactly so the
      // emphasis never changes the glyph metrics (real font-weight widens the text
      // and reflows the surrounding article on hover). text-shadow thickens in place.
      span.style.textShadow = '0 0 0.7px currentColor, 0 0 0.7px currentColor';
      range.surroundContents(span);
    } catch { /* skip this mark if the range can't be cleanly wrapped */ }
  }
}

// The focus-post highlight renderer (offset-based flat segmentation) lives in
// utils/focusHighlightHtml.mjs so it is unit-testable without a DOM. Each emitted
// <mark> is FLAT (never nested) and carries data-fs/data-fe (segment bounds) plus
// data-range-ids — the space-separated list of relation indices covering it.
// `isFocusCategory` mirrors crossColors: uncategorized/unknown relations are dropped.
const isFocusCategory = (category: string) => !!crossColors(category);

type PreviewCard = PreviewCardType;

const MastodonInstanceUrl = 'https://beta.stacky.social';

// Temporary product decision: keep posts text-first on every surface. Mastodon
// link-preview images and media attachments made the same status look like two
// different posts between a feed and its detail route. Keeping this switch in
// the shared Post component guarantees Home, search, profiles, and both detail
// routes stay consistent while preserving the original source link in the text.
const POST_IMAGES_ENABLED = false;

interface CleanedPost {
  html: string;
  publishedDate: string | null;
  articleUrl: string | null;
}

function isSameArticleUrl(candidate: string, articleUrl: string): boolean {
  try {
    const candidateUrl = new URL(candidate.replace(/&amp;/gi, '&'));
    const targetUrl = new URL(articleUrl);
    candidateUrl.hash = '';
    targetUrl.hash = '';
    return candidateUrl.toString() === targetUrl.toString();
  } catch {
    return candidate === articleUrl;
  }
}

/** Replace the preview card's duplicated URL with a compact source action while
 *  preserving mentions, hashtags, and any other authored links in the prose. */
function cleanPostHtml(html: string, card: PreviewCard | null | undefined): CleanedPost {
  let cleaned = html;
  let publishedDate: string | null = null;

  if (card?.url) {
    cleaned = cleaned.replace(/<a\b([^>]*)>[\s\S]*?<\/a>/gi, (anchor, attributes) => {
      const href = String(attributes).match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
      return href && isSameArticleUrl(href, card.url) ? '' : anchor;
    });

    // Imported posts sometimes contain the same source as plain text rather
    // than an anchor. Match only that preview URL so unrelated links survive.
    cleaned = cleaned.replace(/https?:\/\/[^\s<]+/gi, (candidate) =>
      isSameArticleUrl(candidate, card.url) ? '' : candidate,
    );
  }

  // Extract "Published: DATE" and remove from text
  cleaned = cleaned.replace(/Published:\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/g, (_match, iso) => {
    try {
      publishedDate = format(new Date(iso), 'MMM d, yyyy');
    } catch {
      publishedDate = iso;
    }
    return '';
  });
  // Also handle already-formatted "Published: Mon DD, YYYY"
  if (!publishedDate) {
    cleaned = cleaned.replace(/Published:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/g, (_match, date) => {
      publishedDate = date;
      return '';
    });
  }

  // Collapse leftover empty <p></p> tags
  cleaned = cleaned.replace(/<p>\s*<\/p>/g, '');

  return { html: cleaned, publishedDate, articleUrl: card?.url ?? null };
}



// Dwell duration (ms) before focus-post marks become visible on hover.
const FOCUS_HOVER_DWELL_MS = 1500;

// Fixed-window focus post (decision 2026-07-06; supersedes the bounded-GROW
// reveal, which read as layout instability): the box NEVER changes height or
// line count on hover. While a cross-highlight/filter is active the clamped box
// becomes a programmatically-scrolled window AT THE SAME HEIGHT and scrolls to
// the whole span union. Scroll offsets snap to whole LINES so the window never
// shows a clipped half-line (a half-line's span was being mistaken for "shown",
// so semi-visible spans didn't scroll — the bug this replaces). Manual "Read
// more" still fully expands; that's the only way to grow the post.
const POST_LINE_HEIGHT_EM = 1.5;

// Renders the interactive highlight spans for ANY post that has relations, not
// just the focused one, so feed posts get span hover + click-to-focus. It
// subscribes to the highlight store, but the store-driven work (cross-highlight,
// filter visual, auto-reveal) is gated on `active`, so non-focused posts only pay
// for shallow re-renders. A span click on a non-focused post focuses it (scroll
// to the active line) and then filters, via onSpanFocusRequest.
const ActiveHighlightedContent = React.forwardRef<HTMLDivElement, {
  displayText: string;
  rawText: string;
  style: React.CSSProperties;
  className?: string;
  isTextExpanded: boolean;
  focusRelations?: Relation[];
  /** Whether this is the focused post. Non-focused feed posts still render the
   *  spans + direct-hover darkening, but skip the store-driven cross-highlight,
   *  the response-filter visual, and the auto-reveal; a span click on them
   *  requests focus instead of filtering directly. */
  active?: boolean;
  /** Non-focused post only: a span was clicked — focus this post then filter. */
  onSpanFocusRequest?: (span: { start: number; end: number; text: string }) => void;
  /** Count of THIS post's related posts linked to the hovered span union — for
   *  the dwell tooltip on non-focused posts (whose stacks aren't in context). */
  relatedCountForSpans?: (ranges: Array<{ fs: number; fe: number }>) => number;
  /** Count of displayed REPLIES linked to the hovered span union — merged into
   *  the focused post's dwell tooltip so a reply-only span never reads
   *  "0 related posts" while its click usefully filters the replies (honest
   *  counts across both panes). Supplied by the detail page; feeds without a
   *  reply pane simply omit it. */
  replyCountForSpans?: (ranges: Array<{ fs: number; fe: number }>) => number;
}>(function ActiveHighlightedContent({ displayText, rawText, style, className, isTextExpanded, focusRelations = [], active = true, onSpanFocusRequest, relatedCountForSpans, replyCountForSpans }, ref) {
  const { hoveredPostId, hoveredRelations, sidebarHoverActive, hoveredHighlightRangeIndex, hoveredCategory, responseFilter, filterCategories } = useHighlightStore();
  // Related stacks of the active (focus) post — used to count "N related posts"
  // for the click-to-filter affordance. Mirrored to a ref so the DOM hover
  // handlers read the latest without re-subscribing.
  const { relatedStacks: ctxRelatedStacks } = useRelatedStacks();
  const relatedStacksRef = useRef(ctxRelatedStacks);
  relatedStacksRef.current = ctxRelatedStacks;

  // Per-mark dwell: index of the mark that has become visible via 1500ms dwell
  const [dwellOnMarkIndex, setDwellOnMarkIndex] = useState<number | null>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Direct-hover state, mirrored to refs so it can be re-applied after a commit
  // (clicking a span re-renders + re-commits the innerHTML, wiping the imperative
  // fp-dark/fp-hovering classes; without this the span goes light until you move).
  const hoveringRef = useRef(false);
  // Keep the exact relation spans in the active hover bucket. Collapsing a
  // disjoint bucket to one min/max envelope would incorrectly darken unrelated
  // marks between its spans after React replaces the innerHTML.
  const hoverRangesRef = useRef<Array<{ fs: number; fe: number }> | null>(null);
  // Tracks whether *this instance* is currently the one showing the global hover tooltip,
  // so unmount/cleanup only hides our own tooltip, not someone else's.
  const tooltipShownByMeRef = useRef(false);
  // Mirror active / onSpanFocusRequest so the [rawText]-scoped event handlers read
  // the latest without re-binding listeners.
  const activeRef = useRef(active);
  activeRef.current = active;
  const onSpanFocusRequestRef = useRef(onSpanFocusRequest);
  onSpanFocusRequestRef.current = onSpanFocusRequest;
  const relatedCountForSpansRef = useRef(relatedCountForSpans);
  relatedCountForSpansRef.current = relatedCountForSpans;
  const replyCountForSpansRef = useRef(replyCountForSpans);
  replyCountForSpansRef.current = replyCountForSpans;

  // Refs mirror reactive state so the deferred dwell-timer callback always reads
  // the latest values (otherwise its closure would freeze at timer setup time).
  const responseFilterRef = useRef(responseFilter);
  responseFilterRef.current = responseFilter;
  const focusRelationsRef = useRef(focusRelations);
  focusRelationsRef.current = focusRelations;
  const filterCategoriesRef = useRef(filterCategories);
  filterCategoriesRef.current = filterCategories;

  // Reverse cross-highlight (focus → aside): publish the hovered focus-span
  // union so the related cards can brighten their overlapping spans and dim the
  // rest. Coalesced (90ms in / 60ms out — the same rhythm as the card hover)
  // so sweeping the cursor across the post's many segments settles into one
  // store update instead of re-rendering the aside per mousemove.
  const focusHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusHoverPendingRef = useRef(false);
  const publishFocusHover = (ranges: Array<{ fs: number; fe: number }> | null) => {
    if (!activeRef.current) return; // only the FOCUSED post drives the panel
    if (ranges === null && !focusHoverPendingRef.current) return; // nothing to clear
    if (focusHoverTimerRef.current) clearTimeout(focusHoverTimerRef.current);
    focusHoverPendingRef.current = ranges !== null;
    focusHoverTimerRef.current = setTimeout(() => {
      setFocusHoverRanges(ranges ? ranges.map((r) => ({ start: r.fs, end: r.fe })) : null);
    }, ranges ? 90 : 60);
  };

  // Cleanup dwell timer on unmount
  useEffect(() => {
    return () => {
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
      if (tooltipShownByMeRef.current) {
        hideTooltip();
        tooltipShownByMeRef.current = false;
      }
      if (focusHoverTimerRef.current) clearTimeout(focusHoverTimerRef.current);
      if (focusHoverPendingRef.current) {
        setFocusHoverRanges(null);
        focusHoverPendingRef.current = false;
      }
    };
  }, []);

  // Compute which mark index (if any) should be visible in neutral grey
  const filterIdx = responseFilter
    ? focusRelations.findIndex(r => r.focusStart === responseFilter.start && r.focusEnd === responseFilter.end)
    : -1;
  const visibleMarkIdx = dwellOnMarkIndex !== null ? dwellOnMarkIndex : (filterIdx >= 0 ? filterIdx : null);

  // Expand-to-reveal triggers: the persistent filter span, OR a hovered related
  // card whose linked regions sit below the clamp — so the cross-highlight is
  // actually visible. Transient direct hover on this post stays CSS-only.
  const crossActive = hoveredRelations !== null && hoveredRelations.length > 0;
  const anyMarkVisuallyActive = (responseFilter !== null && filterIdx >= 0) || crossActive;
  const revealKey = active && !isTextExpanded && anyMarkVisuallyActive
    ? crossActive
      ? [
          'cross',
          hoveredPostId ?? '',
          hoveredHighlightRangeIndex ?? 'all',
          hoveredCategory ?? '',
          hoveredRelations.length,
        ].join(':')
      : visibleMarkIdx !== null
      ? `mark:${visibleMarkIdx}`
      : null
    : null;
  const revealKeyRef = useRef(revealKey);
  revealKeyRef.current = revealKey;
  const [scrollWindow, setScrollWindow] = useState<{ key: string; height: number } | null>(null);
  const [isWindowOffset, setIsWindowOffset] = useState(false);
  // Source-text offset for the continuation control. It is emitted directly
  // before the first real character in the visible excerpt, so `…` is genuine
  // inline text rather than a floated control parked near an estimated Y.
  const [windowPrefixOffset, setWindowPrefixOffset] = useState<number | null>(null);
  // The semantic destination, not the hovered card id, owns the animation.
  // Several related posts often cite the same focus passage; retaining this
  // target prevents a second hover from restarting the same smooth scroll.
  const lastScrollTargetRef = useRef<number | null>(null);
  // Clicking the leading ellipsis is an explicit request to read from the top.
  // Suppress only the currently-active reveal key so a later card/passage hover
  // can establish a new automatic reading position normally.
  const suppressedRevealKeyRef = useRef<string | null>(null);

  // PERF: the marks are rendered ONCE from this post's own spans (focusRelations)
  // and never re-parsed on hover. Hover/cross-highlight states are applied as CSS
  // classes on the stable marks (see the effects below) instead of rebuilding the
  // article HTML — re-parsing the long article on every sidebar hover was the
  // ~300ms-per-hover cost behind the page-freeze.
  const html = useMemo(() => {
    if (!focusRelations || focusRelations.length === 0) return displayText;
    return renderMultiHighlightHtml(displayText, stripHtml(rawText), focusRelations, isFocusCategory);
  }, [displayText, rawText, focusRelations]);

  const innerRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (el: HTMLDivElement | null) => {
    innerRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  // D1/D2: stable container ID for scoped CSS and event delegation
  // Stable across SSR + client hydration. Math.random() here caused a hydration
  // mismatch (server/client generated different ids); useId() is deterministic.
  // Strip non-alphanumerics so the id stays valid inside the `#${id}` CSS rules below.
  const containerIdRef = useRef<string>(`ahc-${useId().replace(/[^a-zA-Z0-9]/g, '')}`);

  // ── Fixed-window scroll-to-span ───────────────────────────────────────────
  // The focus post NEVER changes height or line count on hover. First measure the
  // target while the post is still in its normal line-clamped layout; only if the
  // target is actually clipped do we switch to a fixed-height internal scroll
  // window. A visible span must not force `-webkit-box` -> `block`, because that
  // display-mode swap exposes fractional next-lines in Chromium/WebKit.
  // Once the fixed-height window is measured, keep it alive while any reveal is
  // active. Changing related cards must not briefly restore the line clamp (and
  // scrollTop=0) just because the card-specific reveal key changed.
  const scrollMode = revealKey !== null && scrollWindow !== null;

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (!revealKey) {
      suppressedRevealKeyRef.current = null;
      setScrollWindow((prev) => (prev === null ? prev : null));
      setIsWindowOffset(false);
      setWindowPrefixOffset(null);
      lastScrollTargetRef.current = null;
      // Rest state: park the window back at the top of the clamp.
      if (el.scrollTop > 0) el.scrollTop = 0;
      return;
    }
    if (suppressedRevealKeyRef.current === revealKey) {
      setIsWindowOffset(false);
      setWindowPrefixOffset(null);
      lastScrollTargetRef.current = 0;
      if (el.scrollTop > 0) el.scrollTop = 0;
      return;
    }
    suppressedRevealKeyRef.current = null;
    if (!scrollMode && el.scrollTop > 0) el.scrollTop = 0;
    // Only the marks we're actually lighting up: the regions the hovered card
    // links to, else the filter/dwell mark. When the cursor is on a SPECIFIC
    // contribution within the card (Level 2 — a single range, or a category
    // tag), scroll to THAT relation's focus span, not the whole card's largest
    // passage — otherwise hovering the red span but scrolling to the green one.
    // Mirrors the paint path's level2/level2Cats selection (see below).
    let marks: HTMLElement[];
    if (crossActive && hoveredRelations) {
      let rels = hoveredRelations;
      if (hoveredHighlightRangeIndex != null && hoveredRelations[hoveredHighlightRangeIndex]) {
        rels = [hoveredRelations[hoveredHighlightRangeIndex]];
      } else if (hoveredCategory) {
        const byCat = hoveredRelations.filter((r) => r.category === hoveredCategory);
        if (byCat.length > 0) rels = byCat;
      }
      marks = (Array.from(el.querySelectorAll('mark[data-fs]')) as HTMLElement[]).filter((m) => {
        const a = parseInt(m.getAttribute('data-fs') || 'NaN', 10);
        const b = parseInt(m.getAttribute('data-fe') || 'NaN', 10);
        return rels.some((r) => a < r.focusEnd && r.focusStart < b);
      });
    } else if (visibleMarkIdx !== null) {
      marks = Array.from(el.querySelectorAll(`mark[data-range-ids~="${visibleMarkIdx}"]`));
    } else {
      marks = Array.from(el.querySelectorAll('mark'));
    }
    const targetMarks = new Set(marks);
    const lines = measureRenderedLineBands(el, targetMarks);
    const targetLineIndices = lines.flatMap((line, index) => line.target ? [index] : []);
    if (targetLineIndices.length === 0) return;

    // A card can relate to several passages scattered across the post. Split
    // those into runs of actual rendered lines, then choose the largest run.
    // This is paragraph-aware: a 12px paragraph gap is measured, never rounded
    // onto a fictional global 24px grid.
    const runs: number[][] = [];
    for (const lineIndex of targetLineIndices) {
      const last = runs[runs.length - 1];
      if (last && lineIndex === last[last.length - 1] + 1) last.push(lineIndex);
      else runs.push([lineIndex]);
    }
    let run = runs[0];
    for (const candidate of runs) {
      const candidateHeight = lines[candidate[candidate.length - 1]].bottom - lines[candidate[0]].top;
      const runHeight = lines[run[run.length - 1]].bottom - lines[run[0]].top;
      if (candidateHeight > runHeight) run = candidate;
    }
    const runTop = lines[run[0]].top;
    const runBottom = lines[run[run.length - 1]].bottom;

    const visibleTop = el.scrollTop;
    const visibleBottom = visibleTop + el.clientHeight;
    const fullyVisible = runTop >= visibleTop - 0.5 && runBottom <= visibleBottom + 0.5;

    if (!scrollMode) {
      if (fullyVisible) {
        setScrollWindow((prev) => (prev === null ? prev : null));
        setIsWindowOffset(false);
        setWindowPrefixOffset(null);
        lastScrollTargetRef.current = 0;
        return;
      }
      const lockedHeight = Math.max(1, el.getBoundingClientRect().height);
      setScrollWindow((prev) =>
        prev?.key === revealKey && Math.abs(prev.height - lockedHeight) < 0.5
          ? prev
          : { key: revealKey, height: lockedHeight }
      );
      return;
    }

    const viewportHeight = el.clientHeight;
    const maxScroll = Math.max(0, el.scrollHeight - viewportHeight);
    const clampTarget = (value: number) => Math.min(maxScroll, Math.max(0, value));
    const candidateTargets = new Set<number>([0, maxScroll]);
    for (const line of lines) {
      candidateTargets.add(clampTarget(line.top));
      candidateTargets.add(clampTarget(line.bottom - viewportHeight));
    }

    // Pick a real text boundary. Priority is: show the target; expose no sliced
    // line at either edge; show the full target run when it fits; maximize target
    // lines; then keep the passage visually centered. The result can be 46.66px
    // or 58px—actual typography owns the position, not a line-height multiple.
    const runFits = runBottom - runTop <= viewportHeight + 0.5;
    const runSet = new Set(run);
    let target = 0;
    let bestScore: number[] | null = null;
    for (const rawCandidate of Array.from(candidateTargets)) {
      const candidate = clampTarget(rawCandidate);
      const bottom = candidate + viewportHeight;
      const partialLines = lines.filter((line) =>
        (line.top < candidate - 0.25 && line.bottom > candidate + 0.25)
        || (line.top < bottom - 0.25 && line.bottom > bottom + 0.25)
      ).length;
      const fullyVisibleTargets = run.filter((lineIndex) => {
        const line = lines[lineIndex];
        return line.top >= candidate - 0.25 && line.bottom <= bottom + 0.25;
      }).length;
      const anyTargetVisible = fullyVisibleTargets > 0 ? 1 : 0;
      const wholeRunVisible = !runFits || fullyVisibleTargets === runSet.size ? 1 : 0;
      const centerDistance = Math.abs((candidate + bottom) / 2 - (runTop + runBottom) / 2);
      const score = [anyTargetVisible, -partialLines, wholeRunVisible, fullyVisibleTargets, -centerDistance];
      const firstDifference = bestScore?.findIndex((value, index) => value !== score[index]) ?? -1;
      if (!bestScore || (firstDifference >= 0 && score[firstDifference] > bestScore[firstDifference])) {
        bestScore = score;
        target = candidate;
      }
    }

    const hasOffset = target > 0.5;
    setIsWindowOffset(hasOffset);

    // Put the continuation control at the exact first character on the first
    // fully visible line. Rendering it can rewrap that line, so commit the
    // zero-width source insertion first and remeasure once on the final DOM.
    const firstVisibleLine = lines.find((line) =>
      line.top >= target - 0.25 && line.bottom <= target + viewportHeight + 0.25
    );
    const nextPrefixOffset = hasOffset && firstVisibleLine
      ? firstPlainOffsetOnLine(el, firstVisibleLine)
      : null;
    if (windowPrefixOffset !== nextPrefixOffset) {
      setWindowPrefixOffset(nextPrefixOffset);
      return;
    }

    // A new card/highlight can map to the exact same canonical line. Do not
    // issue another positioning update when the excerpt is already correct.
    if (lastScrollTargetRef.current !== null && Math.abs(target - lastScrollTargetRef.current) < 1) return;
    lastScrollTargetRef.current = target;
    if (Math.abs(target - el.scrollTop) < 1) return; // already at the canonical spot
    // A smooth pixel animation necessarily exposes partial lines between valid
    // boundaries. Jump directly between legal whole-line excerpts instead.
    el.scrollTo({ top: target, behavior: 'auto' });
  }, [revealKey, scrollMode, crossActive, hoveredRelations, hoveredHighlightRangeIndex, hoveredCategory, visibleMarkIdx, html, windowPrefixOffset]);

  // Spec hover model (CSS-driven via classes — never re-parses the article):
  //  · enter the post       → faint ALL its spans (.fp-hovering on the container)
  //  · over a span          → DARKEN the union of spans covering the cursor
  //  · dwell 1.5s on a span → tooltip "Click to show/focus on N related posts"
  //  · click a span         → filter to those posts (post is already focused)
  //  · click a non-span     → falls through to the card-level navigate handler
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    let latestX = 0, latestY = 0;
    let latestMark: HTMLElement | null = null;
    let activeBucketKey: string | null = null;

    const clearDark = () => el.querySelectorAll('mark.fp-dark').forEach((m) => m.classList.remove('fp-dark'));
    const cancelDwell = () => {
      if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
      if (tooltipShownByMeRef.current) { hideTooltip(); tooltipShownByMeRef.current = false; }
    };
    // The FULL relation spans covering the hovered segment = the union (never a
    // partial segment). A hovered mark is now a flat SEGMENT; its data-range-ids
    // map back to the relations whose whole focus spans pass through the cursor.
    // We darken every segment those relations touch — reproducing the old "union
    // of full spans" from the flat model. `ranges` (relation spans) feed the
    // related-post counts, so they must be the full spans, not the segment.
    const unionFor = (mark: HTMLElement) => {
      const rels = focusRelationsRef.current || [];
      const ranges: Array<{ fs: number; fe: number }> = (mark.getAttribute('data-range-ids') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => rels[parseInt(s, 10)])
        .filter(Boolean)
        .map((r) => ({ fs: r.focusStart, fe: r.focusEnd }));
      if (ranges.length === 0) {
        const a = parseInt(mark.getAttribute('data-fs') || 'NaN', 10);
        const b = parseInt(mark.getAttribute('data-fe') || 'NaN', 10);
        if (!Number.isNaN(a) && !Number.isNaN(b)) ranges.push({ fs: a, fe: b });
      }
      const marks: HTMLElement[] = [];
      el.querySelectorAll('mark[data-fs]').forEach((m) => {
        const a = parseInt((m as HTMLElement).getAttribute('data-fs') || 'NaN', 10);
        const b = parseInt((m as HTMLElement).getAttribute('data-fe') || 'NaN', 10);
        if (ranges.some((u) => a < u.fe && u.fs < b)) marks.push(m as HTMLElement);
      });
      return { marks, ranges };
    };
    // A dark mark is not necessarily the bucket currently under the cursor: an
    // adjacent overlap segment can already be dark because the PREVIOUS bucket
    // reaches it while also adding/removing relation IDs of its own. Identity
    // therefore comes from the segment's canonical relation set, never paint.
    const bucketKeyFor = (mark: HTMLElement) => {
      const ids = (mark.getAttribute('data-range-ids') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const uniqueIds = ids.filter((id, index) => index === 0 || id !== ids[index - 1]);
      return uniqueIds.length > 0
        ? `relations:${uniqueIds.join(',')}`
        : `segment:${mark.getAttribute('data-fs') ?? ''}:${mark.getAttribute('data-fe') ?? ''}`;
    };
    const countRelated = (ranges: Array<{ fs: number; fe: number }>) =>
      (relatedStacksRef.current || []).filter((s: any) =>
        (s.topPost?.relations ?? []).some((r: any) =>
          ranges.some((u) => r.focusStart < u.fe && u.fs < r.focusEnd))).length;

    const onEnter = () => {
      hoveringRef.current = true;
      el.classList.add('fp-hovering');
      // Direct-hover grey has CSS precedence over retained category colours.
      // Keep those inline colours underneath so the last reading anchor returns
      // immediately when the pointer leaves the focus post.
    };
    const onLeave = (e: MouseEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && el.contains(related)) return;
      hoveringRef.current = false;
      hoverRangesRef.current = null;
      activeBucketKey = null;
      el.classList.remove('fp-hovering');
      clearDark();
      cancelDwell();
      publishFocusHover(null);
    };
    const onMove = (e: MouseEvent) => {
      latestX = e.clientX; latestY = e.clientY;
      hoveringRef.current = true;
      el.classList.add('fp-hovering');
      let mark = (e.target as HTMLElement).closest('mark') as HTMLElement | null;
      // Treat the line-height space between wrapped fragments as part of the
      // last mark. Without this bridge, moving vertically through one passage
      // briefly cleared and re-applied both panes' highlights.
      if (!mark && latestMark && pointBridgesInlineRects(
        latestMark.getClientRects(),
        e.clientX,
        e.clientY,
      )) mark = latestMark;
      if (!mark) {
        latestMark = null;
        hoverRangesRef.current = null;
        activeBucketKey = null;
        clearDark();
        cancelDwell();
        publishFocusHover(null);
        return;
      }
      latestMark = mark;
      const { marks, ranges } = unionFor(mark);
      const bucketKey = bucketKeyFor(mark);
      if (bucketKey === activeBucketKey) return;
      activeBucketKey = bucketKey;
      clearDark();
      marks.forEach((m) => m.classList.add('fp-dark'));
      // Reverse cross-highlight: the corresponding aside spans light up while
      // this union is under the cursor (the aside dims its other spans).
      publishFocusHover(ranges);
      // Preserve the exact union so a post-commit re-apply neither loses a
      // disjoint member nor darkens unrelated marks inside a min/max envelope.
      hoverRangesRef.current = ranges.length ? ranges : null;
      cancelDwell();
      dwellTimerRef.current = setTimeout(() => {
        dwellTimerRef.current = null;
        // Verb encodes the click's effect: the FOCUSED post's span click SHOWS
        // (filters to) its linked responses; a non-focused post's click FOCUSES
        // that post first. Both carry the count — the focused post counts from
        // the context's stacks, a non-focused post through the counter its page
        // supplies (its stacks aren't in context).
        const content = activeRef.current
          ? (() => {
              const n = countRelated(ranges);
              const m = replyCountForSpansRef.current ? replyCountForSpansRef.current(ranges) : 0;
              // Honest counts across BOTH panes: a reply-only span reads
              // "… 2 replies", never a misleading "0 related posts".
              if (m > 0) {
                return (
                  <>Click to show <strong>{n} related {n === 1 ? 'post' : 'posts'} · {m} {m === 1 ? 'reply' : 'replies'}</strong></>
                );
              }
              return <>Click to show <strong>{n} related {n === 1 ? 'post' : 'posts'}</strong></>;
            })()
          : (() => {
              const counter = relatedCountForSpansRef.current;
              if (!counter) return <>Click to <strong>focus this post</strong></>;
              const n = counter(ranges);
              return <>Click to focus on <strong>{n} related {n === 1 ? 'post' : 'posts'}</strong></>;
            })();
        showTooltip({
          content,
          colors: { text: '#334155', border: '#cbd5e1' },
          x: latestX, y: latestY,
        });
        tooltipShownByMeRef.current = true;
      }, FOCUS_HOVER_DWELL_MS);
    };
    const showBeginning = (e: Event) => {
      // The inline ellipsis is a reading-position control, not a relation span
      // and not a post-navigation click.
      e.preventDefault();
      e.stopPropagation();
      if ('stopImmediatePropagation' in e) e.stopImmediatePropagation();
      suppressedRevealKeyRef.current = revealKeyRef.current;
      lastScrollTargetRef.current = 0;
      el.scrollTop = 0;
      setWindowPrefixOffset(null);
      setIsWindowOffset(false);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.focus-window-prefix')) {
        showBeginning(e);
        return;
      }
      const mark = target.closest('mark') as HTMLElement | null;
      if (!mark) return; // non-span pixel → let the card-level navigate handler run
      // Filter by the FULL union under the cursor, not the tiny segment: a flat
      // segment is only a slice of its relations' spans, so the passage filter
      // spans the whole highlighted region the way clicking one relation used to.
      const { ranges } = unionFor(mark);
      if (ranges.length === 0) return;
      const fs = Math.min(...ranges.map((r) => r.fs));
      const fe = Math.max(...ranges.map((r) => r.fe));
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const plain = stripHtml(rawText);
      const span = { start: fs, end: fe, text: plain.slice(fs, fe) };
      // Non-focused feed post: clicking a span focuses this post (scroll + filter)
      // rather than filtering the wrong post's panel.
      if (!activeRef.current) { onSpanFocusRequestRef.current?.(span); return; }
      // WS6: a focus-post passage click is an undoable filter action on the detail
      // route (both the APPLY and the toggle-off CLEAR). Record the pre-interaction
      // snapshot BEFORE any mutation below. This branch only runs for the ACTIVE
      // post (guarded above), which on the detail route IS the focus, so the
      // detail-pathname guard is the right scope; the feed span-focus path
      // returned above stays non-undoable. Null order — passage doesn't rebase.
      beginUndoablePanelInteractionIfDetail();
      const ff = responseFilterRef.current;
      if (ff && ff.start === fs && ff.end === fe) { clearResponseFilter(); return; }
      // A passage click with category chips active can compose into an empty
      // result (the chips have their own stack/switch logic, but this path had
      // none). Mirror it: keep chips that can coexist with the passage, drop
      // them when no responding post satisfies them — never a dead-end panel.
      const cats = filterCategoriesRef.current;
      if (cats && cats.size > 0) {
        const compatible = (relatedStacksRef.current || []).some((s: any) => {
          const rels = s?.topPost?.relations ?? [];
          const responds = rels.some((r: any) => r.focusStart < fe && fs < r.focusEnd);
          if (!responds) return false;
          const own = new Set(rels.map((r: any) => r.category));
          return Array.from(cats).every((c) => own.has(c));
        });
        if (!compatible) setFilterCategories(new Set());
      }
      // Atomic setter → replace-not-stack: a passage click is the active
      // interaction, clearing any topic grouping (+ category) in one transition.
      setPassageFilter(span);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.target as HTMLElement).closest('.focus-window-prefix')) return;
      if (e.key === 'Enter' || e.key === ' ') showBeginning(e);
    };

    const stopPrefixMouseBoundary = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.focus-window-prefix')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mousedown', stopPrefixMouseBoundary);
    el.addEventListener('mouseup', stopPrefixMouseBoundary);
    el.addEventListener('click', onClick, true); // capture: before card navigation
    el.addEventListener('keydown', onKeyDown, true);
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mousedown', stopPrefixMouseBoundary);
      el.removeEventListener('mouseup', stopPrefixMouseBoundary);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('keydown', onKeyDown, true);
    };
  }, [rawText]);

  // Cross-highlight from the aside, two levels (category colour, never grey):
  //   Level 1 — a related CARD is hovered: faint colour on every region it links
  //             to, normal weight.
  //   Level 2 — a specific SPAN on that card is hovered: that one region gets a
  //             STRONGER colour, and ONLY the data's optional "bold span"
  //             (focusComment) inside it goes bold — not the whole region. The
  //             other regions stay at level 1.
  // Direct hover on the focus post itself stays neutral grey (the CSS classes).
  // Runs after EVERY commit (no deps): React re-applies dangerouslySetInnerHTML on
  // re-render, replacing the mark nodes and wiping imperative styles, so reconcile
  // after the commit, not only on store change. Colours are OPAQUE so overlapping/
  // nested marks render at one uniform shade (no compounding).
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    // The aside cross-highlight belongs to the FOCUSED post only. Non-focused feed
    // posts render the same spans but must not category-colour them from another
    // post's card hover (their direct grey hover still works via CSS classes).
    if (!active) { clearFocusCommentBold(el); return; }
    clearFocusCommentBold(el);
    const marks = Array.from(el.querySelectorAll('mark[data-fs]')) as HTMLElement[];
    if (!sidebarHoverActive) {
      // The semantic relation remains retained to hold the excerpt's scroll
      // position, but cross-highlight colour is strictly live-hover feedback.
      marks.forEach((mark) => { mark.style.backgroundColor = ''; });
      return;
    }
    const level2 = (hoveredRelations && hoveredHighlightRangeIndex != null)
      ? hoveredRelations[hoveredHighlightRangeIndex] : null;
    // Category-badge hover: every hovered-card relation OF THAT CATEGORY gets
    // the level-2 shade (a badge is "the same relation at category grain"), the
    // rest stay level-1. A specific span hover still wins over the badge.
    const level2Cats = (!level2 && hoveredCategory && hoveredRelations)
      ? hoveredRelations.filter((r) => r.category === hoveredCategory)
      : null;
    marks.forEach((m) => {
      const a = parseInt(m.getAttribute('data-fs') || 'NaN', 10);
      const b = parseInt(m.getAttribute('data-fe') || 'NaN', 10);
      if (level2 && a < level2.focusEnd && level2.focusStart < b) {
        const c = crossColors(level2.category);
        // L2 = a stronger shade of the SAME category colour, but only lightly toward
        // the saturated border (0.15, was 0.30 which read as too dark). Still clearly
        // stronger than the L1 faint (blend toward white), still pastel — not dark.
        m.style.backgroundColor = c ? blendHex(c.bg, c.border, 0.15) : '#cbd5e1';
        return;
      }
      if (level2Cats && level2Cats.some((r) => a < r.focusEnd && r.focusStart < b)) {
        const c = crossColors(hoveredCategory!);
        m.style.backgroundColor = c ? blendHex(c.bg, c.border, 0.15) : '#cbd5e1';
        return;
      }
      const matched = hoveredRelations?.find((r) => a < r.focusEnd && r.focusStart < b);
      const matchedColors = matched ? crossColors(matched.category) : undefined;
      m.style.backgroundColor = matched
        ? (matchedColors ? blendHex(matchedColors.bg, '#ffffff', 0.35) : '#eef0f3')
        : '';
    });
    // Level 2: bold ONLY the data's optional bold sub-span, not the whole region.
    if (level2 && level2.focusCommentEnd > level2.focusCommentStart) {
      boldFocusCommentRange(el, level2.focusCommentStart, level2.focusCommentEnd);
    }
  });

  // Re-apply the DIRECT-hover grey after every commit. Clicking a span re-renders
  // (sets the filter), React re-commits the innerHTML and replaces the mark nodes,
  // wiping the imperatively-set fp-dark — so the span would go light until the next
  // mousemove. Re-add it from the tracked hover refs. A retained card anchor may
  // still exist, but the pointer's direct focus-post hover owns the temporary
  // presentation.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || !hoveringRef.current) return;
    el.classList.add('fp-hovering');
    const ranges = hoverRangesRef.current;
    if (!ranges) return;
    el.querySelectorAll('mark[data-fs]').forEach((mark) => {
      const m = mark as HTMLElement;
      const a = parseInt(m.getAttribute('data-fs') || 'NaN', 10);
      const b = parseInt(m.getAttribute('data-fe') || 'NaN', 10);
      if (ranges.some((r) => a < r.fe && r.fs < b) && !m.classList.contains('fp-dark')) {
        // Apply WITHOUT the 150ms fade: this mark was just re-committed (e.g. by a
        // span click setting the filter); transitioning from faint → dark reads as
        // a blink. Suppress the transition for this instant re-apply, then restore.
        m.style.transition = 'none';
        m.classList.add('fp-dark');
        void m.offsetHeight; // force reflow so the dark paints immediately
        m.style.transition = '';
      }
    });
  });

  // D1: inject a scoped <style> to control mark visibility
  // Default: all marks hidden (transparent). Override: dwell/filter mark visible in neutral grey.
  // Cross-highlight: clear overrides so inline category colors win.
  useEffect(() => {
    const id = containerIdRef.current;
    const styleId = `d1-hover-${id}`;
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    // Spec states, all CSS so hover never re-renders the article:
    //   default            → invisible
    //   .fp-hovering mark   → faint (post hovered)
    //   mark.fp-dark        → dark (span union under the cursor)
    //   active filter span  → neutral grey
    // Clicked/filtered span stays VISIBLY DARK. This is a stable stylesheet rule
    // keyed on data-range-id (which lives in the HTML), so it survives any re-commit
    // and paints the final colour on freshly committed marks with no transition
    // replay — i.e. no blink and no "turns off until you move the mouse". Matches the
    // direct-hover .fp-dark shade so clicking a hovered span is seamless (it simply
    // stays as dark as it already was) rather than dropping to a lighter filter tint.
    // Only the FOCUSED post shows the persistent filter/dwell mark. On non-focused
    // feed posts visibleMarkIdx could coincidentally match the focused post's
    // filter offsets; gate on `active` so it never lights the wrong post.
    // Base + hover mark styles now live in globals.css (keyed on data-testid) so a
    // random container-id mismatch can't leave the UA-default <mark> yellow showing
    // through. This injected rule is ONLY the persistent filter mark for the
    // focused post's clicked span (per-instance because it targets a data-range-id).
    styleEl.textContent = active && visibleMarkIdx !== null
      ? `#${id} mark[data-range-ids~="${visibleMarkIdx}"] { background: rgb(193,199,209) !important; }`
      : '';
  }, [visibleMarkIdx, active]);

  // Cleanup scoped style on unmount
  useEffect(() => {
    const id = containerIdRef.current;
    return () => {
      const el = document.getElementById(`d1-hover-${id}`);
      if (el) el.remove();
    };
  }, []);

  // Expansion is owned by the parent's isTextExpanded (Read-more) render, which
  // supplies the clamp/expanded style via the `style` prop. In scroll mode we
  // keep the SAME box height — scrollWindow.height, measured from the clamped
  // layout by the reveal effect above (whole lines including paragraph gaps;
  // the clamp itself no longer carries a static maxHeight, which undercounted
  // those gaps and cropped the last line in half) — and only drop the
  // line-clamp so the full text lays out inside the fixed window; overflow
  // stays HIDDEN (the effect above scrolls it programmatically), so no
  // scrollbar pops in and nothing shifts but the text. The rendered height
  // cannot change. (.postClampedText only styles paragraph margins, so the
  // class stays on in both modes.)
  const mergedStyle: React.CSSProperties = scrollMode && scrollWindow
    ? {
        ...style,
        display: 'block',
        WebkitLineClamp: 'unset',
        textOverflow: 'unset',
        overflow: 'hidden',
        height: `${scrollWindow.height}px`,
        maxHeight: `${scrollWindow.height}px`,
      }
    : style;

  const focusPlainText = stripHtml(rawText);
  const prefixWordLength = windowPrefixOffset !== null
    ? (focusPlainText.slice(windowPrefixOffset).match(/^\S+/)?.[0].length ?? 1)
    : 0;
  const renderedHtml = isWindowOffset && windowPrefixOffset !== null
    ? renderMultiHighlightHtml(
        displayText,
        focusPlainText,
        focusRelations ?? [],
        isFocusCategory,
        {
          plainOffset: windowPrefixOffset,
          // Keep the ellipsis and the remainder of the first visible word as
          // one inline unit. Otherwise the glyph can fit at the hidden end of
          // the preceding line while the word itself wraps into the viewport.
          html: '<span class="focus-window-prefix-group"><span class="focus-window-prefix" role="button" tabindex="0" aria-label="Show beginning of post" title="Show beginning of post">… </span>',
          closeOffset: windowPrefixOffset + prefixWordLength,
          closeHtml: '</span>',
        },
      )
    : html;

  return (
    <div
      className="focus-reveal-shell"
      data-focus-window-offset={isWindowOffset ? 'true' : 'false'}
    >
      <div
        ref={setRefs}
        id={containerIdRef.current}
        data-testid="focus-reveal"
        className={className}
        style={mergedStyle}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
});

interface PostProps {
  id: string;
  text: string;
  author: string;
  account: string;
  /** Stable Mastodon account id, used for exact owner-only action gating. */
  accountId?: string;
  avatar: string;
  repliesCount: number;
  createdAt: string;
  stackCount: number | null;
  favouritesCount: number;
  favourited: boolean;
  bookmarked: boolean;
  mediaAttachments: string[];
  onStackIconClick: (relatedStacks: any[], postId: string, position: { top: number, height: number }) => void;
  setIsModalOpen: (isOpen: boolean) => void;
  setIsExpandModalOpen: (isOpen: boolean) => void;
  relatedStacks: any[];
  activePostId: string | null;
  setActivePostId: (id: string | null) => void;
  initialCard?: PreviewCard | null;
  /** When provided, intercepts post navigation instead of routing to /posts/{id} */
  onNavigate?: (postId: string) => void;
  /** Relations for the focus post's own text spans — used to render dimmed marks in the default state */
  focusRelations?: Relation[];
  /** Collapsed line-clamp before "Read more" (feed uses 5; the full-post view passes more, e.g. 10). */
  clampLines?: number;
  /** Related-card-style relations whose content offsets index THIS post's own
   *  text (replies in the thread view). Renders colored category spans. */
  contentRelations?: Relation[];
  /** Deduped contribution categories shown as a badge row under the header. */
  categoryBadges?: string[];
  /** A contribution span in this post was clicked (rangeIndex into contentRelations). */
  onContentSpanClick?: (rangeIndex: number) => void;
  /** Optional cross-pane count for the reply span tooltip ("N more <topic>"). */
  replyTopicCount?: (topic: string) => number;
  /** The reply pane's active grouping topic — threaded to the reply spans so an
   *  already-grouped topic's tooltip reads "(shown)" (R-REORDER-9 parity). */
  activeClusterTopic?: string | null;
  /** Count of THIS post's related posts linked to a span union — feeds the
   *  dwell tooltip on non-focused posts, whose stacks aren't in context. */
  relatedCountForSpans?: (ranges: Array<{ fs: number; fe: number }>) => number;
  /** Count of displayed replies linked to a span union — merged into the
   *  focused post's dwell tooltip on the thread view (honest two-pane counts). */
  replyCountForSpans?: (ranges: Array<{ fs: number; fe: number }>) => number;
  /** Parent account handle displayed as reply provenance in feed views. */
  replyingToAccount?: string | null;
}

function Post({
  id,
  text,
  author,
  account,
  accountId,
  avatar,
  repliesCount,
  createdAt,
  stackCount,
  favouritesCount,
  favourited,
  bookmarked,
  mediaAttachments: initialMedia = [],
  onStackIconClick,
  relatedStacks,
  activePostId,
  setActivePostId,
  initialCard,
  onNavigate,
  focusRelations = [],
  clampLines = 5,
  contentRelations,
  categoryBadges,
  onContentSpanClick,
  replyTopicCount,
  activeClusterTopic = null,
  relatedCountForSpans,
  replyCountForSpans,
  replyingToAccount = null,
}: PostProps) {
  const router = useRouter();
  const { clear: clearRelatedStacks } = useRelatedStacks();
  const [cardHeight, setCardHeight] = useState(0);
  const paperRef = useRef<HTMLDivElement>(null);

  const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);

  // Initialize interaction state from the local store so persisted likes/bookmarks
  // survive reload and show consistently across routes (e.g. a post liked on
  // /ChineseEVs shows as liked there, on /liked, and after a refresh). When
  // the post is not yet in the store, fall back to the props from the parent.
  // Initialize from the PARENT PROPS only so the first render matches the server
  // HTML. The store reads localStorage (invisible to the server), so reading it
  // during the initial render would cause a hydration mismatch. The effect below
  // re-syncs liked/bookmarked/count from the store immediately after mount.
  const [liked, setLiked] = useState(favourited);
  const [bookmarkedState, setBookmarkedState] = useState(bookmarked);
  const [likeCount, setLikeCount] = useState(favouritesCount);
  const [replyCount, setReplyCount] = useState(repliesCount);
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [mediaAttachments, setMediaAttachments] = useState<string[]>(initialMedia);
  const isActive = activePostId === id;
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  // NB: the highlight layer's scroll-to-span is fully self-contained inside
  // ActiveHighlightedContent (fixed-window mode) — no reveal state lives here.
  const isTextExpandedRef = useRef(isTextExpanded);
  isTextExpandedRef.current = isTextExpanded;
  const [previewCards, setPreviewCards] = useState<PreviewCard[]>(initialCard ? [initialCard] : []);
  const [tempRelatedStacks, setTempRelatedStacks] = useState<any[]>(relatedStacks);
  const { html: displayText, publishedDate, articleUrl } = useMemo(
    () => cleanPostHtml(text, previewCards[0]),
    [text, previewCards],
  );
  const articleHost = articleUrl ? mastodonLinkHost(articleUrl) : '';

  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  // Guards against setState after unmount: under feed virtualization a post can
  // unmount while a post-action refetch is still in flight.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Ownership is resolved after hydration so the server and first client render
  // match. Local posts use the local-store identity; Mastodon posts prefer the
  // immutable account id and fall back to the exact `acct` string.
  useEffect(() => {
    const stored = getPost(id);
    if (stored) {
      setCanDelete(stored.account.acct === getMe().acct);
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
      setCanDelete(false);
      return;
    }
    const sameId = Boolean(accountId && currentUser.id && String(accountId) === String(currentUser.id));
    const normalizedRenderedAcct = account.trim().replace(/^@/, '').toLowerCase();
    const normalizedCurrentAcct = String(currentUser.acct ?? currentUser.username ?? '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase();
    setCanDelete(sameId || Boolean(normalizedRenderedAcct && normalizedRenderedAcct === normalizedCurrentAcct));
  }, [account, accountId, id]);

  // Re-sync interaction state from the store whenever the rendered post id (or its
  // incoming props) changes — under feed virtualization a Post instance can be
  // reused for a different id, and this keeps the heart/bookmark/count accurate.
  useEffect(() => {
    const stored = getPost(id);
    if (stored) {
      setLiked(storeIsLiked(id));
      setBookmarkedState(storeIsBookmarked(id));
      setLikeCount(stored.favourites_count);
    } else {
      setLiked(favourited);
      setBookmarkedState(bookmarked);
      setLikeCount(favouritesCount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, favourited, bookmarked, favouritesCount]);

  // Reply counts can change after a local reply or a background Mastodon
  // refresh. Keep the stateful action row aligned with the latest parent prop;
  // previously it permanently retained the value from the first render.
  useEffect(() => {
    setReplyCount(repliesCount);
  }, [id, repliesCount]);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;

    if (isTextExpanded) {
      setIsOverflowing(false);
      return;
    }

    setIsOverflowing(element.scrollHeight > element.clientHeight);
  }, [text, isTextExpanded]);
  useEffect(() => {
    setTempRelatedStacks(relatedStacks);
  }, [relatedStacks]);

  useEffect(() => {
    if (initialCard) {
      setPreviewCards([initialCard]);
    }
  }, [initialCard]);

  useEffect(() => {
    if (paperRef.current) {
      setCardHeight(paperRef.current.clientHeight);
    }
  }, [text, mediaAttachments, previewCards]);

  // Counts, flags, card and media all arrive via props (from the parent's list/
  // thread fetch), so we no longer refetch each post's full status on mount —
  // that fired one /api/v1/statuses/{id} per mounted post and stormed the server
  // on long feeds/threads. fetchPostData remains for refreshing after an action.

  useEffect(() => {
    // Sync isExpanded with isActive state
    setIsExpanded(isActive);
  }, [isActive]);


  const handleNavigate = () => {
    if (onNavigate) { onNavigate(id); return; }
    // Store-backed posts (seeded study content, user posts, and local replies)
    // must stay on the compatible local thread route. Unknown ids are assumed
    // to belong to a live Mastodon surface and keep the API-backed route.
    const url = getPost(id) ? `/ChineseEVs/posts/${id}` : `/posts/${id}`;
    sessionStorage.setItem(`previousPath:${url}`, window.location.pathname);
    sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
    router.push(url);
  };

  const handleReply = () => {
    if (onNavigate) { onNavigate(id); return; }
    const url = getPost(id) ? `/ChineseEVs/posts/${id}` : `/posts/${id}`;
    sessionStorage.setItem(`previousPath:${url}`, window.location.pathname);
    sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
    router.push(url);
  };

  const getAccessToken = () => {
    return localStorage.getItem('accessToken');
  };

  const fetchPostData = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    try {
      const response = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${id}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      // Bail if the post unmounted while the request was in flight, so we don't
      // setState on an unmounted component.
      if (!mountedRef.current) return;
      const data = response.data;
      const mediaAttachments = data.media_attachments.map((attachment: any) => attachment.url);
      setLikeCount(data.favourites_count);
      setReplyCount(data.replies_count);
      setLiked(data.favourited);
      setBookmarkedState(data.bookmarked);
      setMediaAttachments(mediaAttachments);

      const card = data.card;
      if (card) {
        const normalized: PreviewCard = {
          title: card.title || '',
          description: card.description || '',
          image: card.image || undefined,
          url: card.url,
        };
        setPreviewCards([normalized]);
      } else {
        setPreviewCards([]);
      }
    } catch (error) {
      console.error('Error fetching post data:', error);
    }
  };

  const handleNavigateToUser = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!account) return;
    const profileHandle = account.trim().replace(/^@/, '');
    const mastodonSource = accountId
      ? `?source=mastodon&id=${encodeURIComponent(accountId)}`
      : '';
    const url = `/user/${encodeURIComponent(profileHandle)}${mastodonSource}`;
    router.push(url);
  };

  const handleLike = async () => {
    // Optimistic update so the heart reflects the tap instantly.
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => Math.max(0, c + (wasLiked ? -1 : 1)));

    try {
      // Persists to Mastodon when authenticated and to the local JSON store in
      // demo mode, then confirms or reverts the optimistic state.
      const result = await toggleFavourite(id, wasLiked);
      if (!mountedRef.current) return;
      if (result.ok) {
        // Confirm against the active data source's authoritative state.
        setLiked(result.value);
        showUndoableAction({
          title: result.value ? 'Post liked' : 'Like removed',
          message: result.value ? 'This post was added to your likes.' : 'This post was removed from your likes.',
          onUndo: async () => {
            try {
              const undoResult = await toggleFavourite(id, result.value);
              if (!mountedRef.current) return;
              if (!undoResult.ok) throw new Error('toggleFavourite undo returned ok: false');
              setLiked(undoResult.value);
              setLikeCount((c) => Math.max(0, c + (undoResult.value ? 1 : -1)));
            } catch (error) {
              console.error('Error undoing like:', error);
              notifications.show({
                title: 'Error',
                message: 'Could not undo like. Please try again.',
                color: 'red',
              });
            }
          },
        });
      } else {
        throw new Error('toggleFavourite returned ok: false');
      }
    } catch (error) {
      console.error('Error liking post:', error);
      // Revert optimistic UI on failure.
      if (mountedRef.current) {
        setLiked(wasLiked);
        setLikeCount((c) => Math.max(0, c + (wasLiked ? 1 : -1)));
      }
      notifications.show({
        title: 'Error',
        message: 'Could not update like. Please try again.',
        color: 'red',
      });
    }
  };

  const handleSave = async () => {
    // Optimistic update so the bookmark icon reflects the tap instantly.
    const wasBookmarked = bookmarkedState;
    setBookmarkedState(!wasBookmarked);

    try {
      // Persists to Mastodon when authenticated and to the local JSON store in
      // demo mode, then confirms or reverts the optimistic state.
      const result = await toggleBookmark(id, wasBookmarked);
      if (!mountedRef.current) return;
      if (result.ok) {
        setBookmarkedState(result.value);
        showUndoableAction({
          title: result.value ? 'Post saved' : 'Bookmark removed',
          message: result.value ? 'This post was added to your bookmarks.' : 'This post was removed from your bookmarks.',
          onUndo: async () => {
            try {
              const undoResult = await toggleBookmark(id, result.value);
              if (!mountedRef.current) return;
              if (!undoResult.ok) throw new Error('toggleBookmark undo returned ok: false');
              setBookmarkedState(undoResult.value);
            } catch (error) {
              console.error('Error undoing bookmark:', error);
              notifications.show({
                title: 'Error',
                message: 'Could not undo bookmark. Please try again.',
                color: 'red',
              });
            }
          },
        });
      } else {
        throw new Error('toggleBookmark returned ok: false');
      }
    } catch (error) {
      console.error('Error bookmarking post:', error);
      // Revert optimistic UI on failure.
      if (mountedRef.current) setBookmarkedState(wasBookmarked);
      notifications.show({
        title: 'Error',
        message: 'Could not update bookmark. Please try again.',
        color: 'red',
      });
    }
  };

  const handleAnnotation = () => {
    setAnnotationModalOpen(true);
  };

  const handleShare = () => {
    // Copy the in-app post link so a recipient lands on this post's focus view
    // (related responses in the aside). Route from the post's identity, not the
    // current page: Home, Likes, Bookmarks, search and hashtag feeds can all mix
    // Mastodon and frontend-backed posts in the same viewport.
    const route = getPost(id) ? '/ChineseEVs/posts/' : '/posts/';
    const url = `${window.location.origin}${route}${id}`;
    copyLink(url, "Post link copied");
  };

  const handleDelete = async () => {
    if (!canDelete || isDeleting) return;
    setIsDeleting(true);
    const result = await deleteStatus(id);

    if (!result.ok) {
      if (mountedRef.current) setIsDeleting(false);
      notifications.show({
        title: 'Post not deleted',
        message: result.error,
        color: 'red',
      });
      return;
    }

    if (isActive) clearRelatedStacks();
    if (mountedRef.current) {
      setDeleteModalOpen(false);
      setIsDeleted(true);
      setIsDeleting(false);
    }
    notifications.show({
      title: 'Post deleted',
      message: 'Your post was permanently deleted.',
      color: 'green',
    });

    const currentPath = decodeURIComponent(window.location.pathname);
    if (currentPath === `/posts/${id}` || currentPath === `/ChineseEVs/posts/${id}`) {
      router.replace('/home');
    }
  };

  const handleStackCountClick = async () => {
    setIsExpanded(true);
    const position = paperRef.current ? paperRef.current.getBoundingClientRect() : { top: 0, height: 0 };
    const adjustedPosition = { top: position.top + window.scrollY, height: position.height };

    // Set active post first to lock the highlight
    setActivePostId(id);

    let stacks = tempRelatedStacks;
    // If stacks are missing, fetch them
    if (!Array.isArray(stacks) || stacks.length === 0) {
      try {
        const accessToken = getAccessToken();
        if (accessToken) {
          const response = await axios.get(`${MastodonInstanceUrl}:3002/stacks/${id}/related`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          stacks = response.data.relatedStacks || [];
          setTempRelatedStacks(stacks);
        }
      } catch (error) {
        console.error('Failed to fetch related stacks on click:', error);
        notifications.show({
          color: 'red',
          title: 'Failed to load related posts',
          message: 'Please try again later.',
        });
      }
    }
    onStackIconClick(Array.isArray(stacks) ? stacks : [], id, adjustedPosition);
  };

  const handleStackClick = (index: number) => {
    const newRelatedStacks = [...tempRelatedStacks];
    const [clickedStack] = newRelatedStacks.splice(index, 1);
    newRelatedStacks.unshift(clickedStack);
    setTempRelatedStacks(newRelatedStacks);

    const position = paperRef.current ? paperRef.current.getBoundingClientRect() : { top: 0, height: 0 };
    const adjustedPosition = { top: position.top + window.scrollY, height: position.height };
    onStackIconClick(newRelatedStacks, id, adjustedPosition);
  };

  // Span clicked on a NON-focused feed post: make this post the focus (scroll it
  // to the viewport centre, which is the active-post criterion, and lock it), then
  // apply the "Responses to" filter. The filter is stashed as pending so it
  // survives the focus switch (setPanelFocus would otherwise clear it).
  const handleSpanFocusRequest = useCallback((span: { start: number; end: number; text: string }) => {
    setPendingResponseFilter(id, span);
    setActivePostId(id);
    // Scroll this post's top to the feed's "active line" (30% of the viewport, the
    // same line the feed uses to pick the focused post) so it settles focused —
    // centring it would leave a higher post on the line. Instant (not animated):
    // a smooth animation fires a scroll event per frame, and the feed re-evaluates
    // the active post on every one, which — now that every feed post renders the
    // highlight layer — is a re-render storm. One jump = one active switch.
    const el = paperRef.current;
    if (el) {
      const targetY = window.scrollY + (el.getBoundingClientRect().top - window.innerHeight * 0.3) + 4;
      window.scrollTo(0, Math.max(0, targetY));
    }
  }, [id, setActivePostId]);

  const handleExpandText = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setIsTextExpanded(true);
    setIsOverflowing(false);
  };

  const handleCollapseText = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setIsTextExpanded(false);
    // isOverflowing will be recalculated by the useEffect on next render
  };

  const handleSingleClick = (e: React.MouseEvent) => {
    // If the click originated from a highlighted mark, let the mark's own
    // capture-phase handler deal with it — do not navigate.
    if ((e.target as HTMLElement).closest('mark')) return;
    e.stopPropagation();
    handleNavigate();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // If the mouseup came from a highlighted mark, do not navigate.
    if ((e.target as HTMLElement).closest('mark')) return;
    const selection = window.getSelection();
    if (selection && selection.toString().length === 0) {
      handleNavigate();
    }
  };

  if (isDeleted) return null;

  return (
    <div style={{ position: 'relative', marginBottom: '1rem' }}>
      <Paper
        ref={paperRef}
        data-testid="post"
        data-post-id={id}
        data-active={isActive ? 'true' : 'false'}
        style={{
          position: 'relative',
          width: "100%",
          backgroundColor: '#fff',
          zIndex: 5,
          borderRadius: '10px',
          borderStyle: 'solid',
          borderWidth: '2px',
          borderColor: isActive ? '#45a99e' : '#dfe4ea',
          boxShadow: isActive
            ? '0 14px 30px rgba(28, 43, 74, 0.16), 0 5px 12px rgba(28, 43, 74, 0.10)'
            : '0 2px 9px rgba(28, 43, 74, 0.055)',
          transform: isActive ? 'translateY(-2px)' : 'none',
          // Border switches instantly (not transitioned) so the active outline
          // can't be caught mid-fade showing the inactive colour during scroll
          // re-renders (R-FEED-5). Elevation/lift still animate.
          transition: 'background-color 120ms ease, box-shadow 150ms ease, transform 150ms ease',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: '1rem',
          cursor: 'pointer',
        }}
      >
{/* The stack / category-count icon column on the focus post is permanently
    removed (RG-1 / R-NOSTACK-1). Related stacks live in the aside panel, not in a
    per-post icon column. Do NOT reinstate this — it has regressed via merges
    before (it reappeared on the detail route via `stackCount={p.stackCount}`). */}

        {canDelete && (
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 7 }}>
            <Menu position="bottom-end" shadow="md" width={176} withinPortal>
              <Menu.Target>
                <UnstyledButton
                  aria-label="More post actions"
                  title="More post actions"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#5f6b7a',
                    background: '#fff',
                  }}
                >
                  <IconDots size={19} aria-hidden="true" />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={16} aria-hidden="true" />}
                  onClick={() => setDeleteModalOpen(true)}
                >
                  Delete post
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        )}

        <div
          onClick={handleSingleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleNavigate();
            }
          }}
          role="button"
          tabIndex={0}
          style={{ width: '100%', cursor: 'pointer' }}
        >
          <Group wrap="nowrap" gap="xs" style={{ alignItems: 'center', paddingRight: canDelete ? 34 : 0 }}>
            <UnstyledButton onClick={handleNavigateToUser} className="avatarHoverDim">
              <Avatar src={avatar} alt={author} radius="xl" />
            </UnstyledButton>
            <Anchor
              component="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleNavigateToUser(e);
              }}
              underline="hover"
              // Username at body-text size (weight/colour carry the hierarchy,
              // not size) so the header reads denser — `inherit` tracks the card's
              // own font size (14px reply / 16px focus) so it always equals the
              // body text, X/YouTube-style. Truncate rather than push the inline
              // date/badges off the row.
              style={{
                color: '#011445', fontWeight: 700, minWidth: 0, fontSize: 'inherit',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {author}
            </Anchor>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              · {formatPostDate(createdAt)}
            </Text>

            {categoryBadges && categoryBadges.length > 0 && (
              // Category tags live in the header row, pushed right. They compress
              // to icon-only when the card's container gets narrow (the
              // `.post-tag-text` label hides via a CSS @container query — see
              // globals.css); `title`/`aria-label` keep the meaning available.
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto', flexShrink: 0 }}>
                {categoryBadges.map((cat) => {
                  const tc = getCategoryColors(cat);
                  const label = CATEGORY_LABELS[cat] ?? cat;
                  return (
                    <span
                      key={cat}
                      data-reply-badge={cat}
                      title={label}
                      aria-label={label}
                      style={{
                        background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`,
                        borderRadius: '5px', padding: '2px 7px',
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap',
                      }}
                    >
                      {categoryIcon(cat, 12, tc.text)}
                      <span className="post-tag-text">{label}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </Group>
        </div>

        {replyingToAccount && (
          <Text
            data-testid="reply-context"
            size="xs"
            style={{
              paddingLeft: `${BODY_INDENT_PX}px`,
              marginTop: '2px',
              marginBottom: '3px',
              color: '#6b7280',
            }}
          >
            Replying to <span style={{ color: '#4f669d', fontWeight: 600 }}>@{replyingToAccount.split('@')[0]}</span>
          </Text>
        )}

        <div
          // X-style: the body + media indent to align under the USERNAME, past the
          // avatar (avatar 38px + the header row's 10px gap = 48px) — matching the
          // aside's related cards. The action row below uses the same indent.
          style={{ paddingLeft: `${BODY_INDENT_PX}px`, paddingRight: '0', cursor: 'pointer'}}
          onMouseUp={(e) => handleMouseUp(e)}
        >
          <div>
      {contentRelations && contentRelations.length > 0 ? (
        // Reply with contributions: colored category spans over its own text
        // (the left-pane counterpart of a related card). Clamp/Read-more reuse
        // the same wrapper the plain branch uses.
        <div
          ref={textRef}
          className={isTextExpanded ? undefined : 'postClampedText'}
          style={{
            display: isTextExpanded ? 'block' : '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: isTextExpanded ? undefined : clampLines,
            overflow: isTextExpanded ? 'visible' : 'hidden',
            textOverflow: isTextExpanded ? 'unset' : 'ellipsis',
            // No maxHeight: the line-clamp owns the collapsed height. A static
            // calc(1.5em * N) missed the paragraph gaps inside the window and
            // cropped the last visible line in half.
            marginTop: '0px',
            lineHeight: '1.5',
            color: '#011445',
          }}
        >
          <ReplyHighlightedContent
            plainText={stripHtml(text)}
            relations={contentRelations}
            replyId={id}
            onSpanClick={onContentSpanClick}
            otherCountByTopic={replyTopicCount}
            activeClusterTopic={activeClusterTopic}
          />
        </div>
      ) : focusRelations.length > 0 ? (
        // Render the interactive spans for EVERY post that has them — not just the
        // focused one — so feed posts get span hover + click-to-focus. active gates
        // the focused-only behaviour (cross-highlight, filter visual, auto-reveal).
        <ActiveHighlightedContent
          ref={textRef}
          displayText={displayText}
          rawText={text}
          isTextExpanded={isTextExpanded}
          focusRelations={focusRelations}
          active={isActive}
          onSpanFocusRequest={handleSpanFocusRequest}
          relatedCountForSpans={relatedCountForSpans}
          replyCountForSpans={replyCountForSpans}
          className={isTextExpanded ? undefined : 'postClampedText'}
          style={
            isTextExpanded
              ? {
                  // Manual Read-more: full natural height.
                  display: 'block',
                  overflow: 'visible',
                  textOverflow: 'unset',
                  marginTop: '0px',
                  lineHeight: '1.5',
                  color: '#011445',
                }
              : {
                  // Clamp. The line-clamp owns the collapsed height (a static
                  // calc(1.5em * N) maxHeight missed the paragraph gaps inside
                  // the window and cropped the last visible line in half). The
                  // highlight layer switches this box to an internally-scrolled
                  // window at the MEASURED clamp height while a cross-highlight
                  // is active (fixed window — never grows).
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: clampLines,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: '0px',
                  lineHeight: '1.5',
                  color: '#011445',
                }
          }
        />
      ) : (
        <div
          ref={textRef}
          className={isTextExpanded ? undefined : 'postClampedText'}
          style={{
            display: isTextExpanded ? 'block' : '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: isTextExpanded ? undefined : clampLines,
            overflow: isTextExpanded ? 'visible' : 'hidden',
            textOverflow: isTextExpanded ? 'unset' : 'ellipsis',
            // No maxHeight — see the clamp comment above (half-line crop).
            marginTop: '0px',
            lineHeight: '1.5',
            color: '#011445'
          }}
          dangerouslySetInnerHTML={{ __html: displayText }}
        />
      )}
      {articleUrl && (
        <Anchor
          href={articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-focus-article-link
          size="xs"
          underline="hover"
          onClick={(event: React.MouseEvent) => event.stopPropagation()}
          onMouseDown={(event: React.MouseEvent) => event.stopPropagation()}
          onMouseUp={(event: React.MouseEvent) => event.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: '0.3rem',
            marginBottom: '0.35rem',
            color: '#2f6f68',
            fontWeight: 650,
          }}
        >
          <IconExternalLink size={13} aria-hidden />
          Read article{articleHost ? ` · ${articleHost}` : ''}
        </Anchor>
      )}
      {(isOverflowing || isTextExpanded) && (
        <Anchor
          component="button"
          type="button"
          size="sm"
          underline="hover"
          styles={(theme) => ({
            root: {
              padding: 0,
              background: 'none',
              color: '#1c2b4a',
              fontWeight: 600,
              cursor: 'pointer',
              '&:hover': {
                color: theme.colors.blue[7],
              },
            },
          })}
          onClick={isTextExpanded ? handleCollapseText : handleExpandText}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
        >
          {isTextExpanded ? 'Read less' : 'Read more'}
        </Anchor>
      )}
    </div>
          {POST_IMAGES_ENABLED && mediaAttachments.length > 0 && (
            <div style={{ paddingLeft: '0', paddingRight: '0', paddingTop: '1rem' }}>
              {mediaAttachments.map((url, index) => (
                <img key={index} src={url} alt={`Attachment ${index + 1}`} loading="lazy" decoding="async" style={{ width: '100%', marginBottom: '10px' }} />
              ))}
            </div>
          )}

          {POST_IMAGES_ENABLED && previewCards.slice(0, 1).map((card, index) =>
            card.image ? (
              <a
                key={index}
                href={card.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                style={{ display: 'block', marginTop: '0.5rem', marginRight: '0.5rem' }}
              >
                <img
                  src={card.image}
                  alt={card.title}
                  loading="lazy"
                  decoding="async"
                  style={{ width: '100%', borderRadius: '8px', display: 'block' }}
                />
              </a>
            ) : null
          )}
          {publishedDate && (
            <Text size="xs" c="dimmed" style={{ marginTop: '0.5rem' }}>
              Published: {publishedDate}
            </Text>
          )}
        </div>

        <Divider style={{ marginTop:'1rem', marginLeft: BODY_INDENT_PX }}/>
        <div style={{ paddingLeft: `${BODY_INDENT_PX}px`, paddingRight: '0' }}>
          <Group style={{ display: 'flex', justifyContent: 'space-between', paddingTop:'0.1rem', paddingBottom:'0.1rem', marginBottom: stackCount !== null && stackCount > 1 ? '0px' : '0px' }}>
            <InteractionControl
              icon={<IconMessageCircle size={20} />}
              label={replyCount}
              ariaLabel="Reply"
              onClick={handleReply}
            />
            <InteractionControl
              icon={liked ? <IconHeartFilled size={20} /> : <IconHeart size={20} />}
              label={likeCount}
              ariaLabel="Like"
            onClick={handleLike}
            active={liked}
            />
            <InteractionControl
              icon={bookmarkedState ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
              ariaLabel="Bookmark"
            onClick={handleSave}
            active={bookmarkedState}
            />
            {/* Annotate action hidden in local mode. The trigger button and the
                AnnotationModal below are not rendered; AnnotationModal import +
                handleAnnotation remain in place for when it is re-enabled.
            <InteractionControl
              icon={<IconNote size={20} />}
              ariaLabel="Annotate"
              onClick={handleAnnotation}
            /> */}
            <InteractionControl
              icon={<IconShare size={20} />}
              ariaLabel="Share post"
              onClick={handleShare}
            />
          </Group>
        </div>
      </Paper>
      <Modal
        opened={deleteModalOpen}
        onClose={() => { if (!isDeleting) setDeleteModalOpen(false); }}
        title="Delete post?"
        centered
        size="sm"
        closeOnClickOutside={!isDeleting}
        closeOnEscape={!isDeleting}
        withCloseButton={!isDeleting}
      >
        <Text size="sm" c="dimmed">
          This permanently removes the post. This action can’t be undone.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setDeleteModalOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button color="red" leftSection={<IconTrash size={16} />} loading={isDeleting} onClick={handleDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
      {/* AnnotationModal hidden in local mode (see hidden Annotate trigger above).
      <AnnotationModal
        isOpen={annotationModalOpen}
        onClose={() => setAnnotationModalOpen(false)}
        stackId={id}
      /> */}
    </div>
  );
}

// Skip re-rendering a post when only `activePostId` changed but THIS post's own
// active state didn't flip (Post uses activePostId solely to derive isActive).
// Any other prop change still re-renders via shallow compare, so no stale UI.
// On the feed this stops every mounted post re-rendering on each scroll-focus
// change — only the two posts whose active state actually flips re-render.
function postPropsEqual(prev: PostProps, next: PostProps): boolean {
  if ((prev.activePostId === prev.id) !== (next.activePostId === next.id)) return false;
  const keys = Object.keys(next) as (keyof PostProps)[];
  if (keys.length !== Object.keys(prev).length) return false;
  for (const k of keys) {
    if (k === "activePostId") continue;
    if (prev[k] !== next[k]) return false;
  }
  return true;
}

export default React.memo(Post, postPropsEqual);
