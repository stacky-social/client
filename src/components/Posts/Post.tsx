"use client";

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Avatar, Group, Paper, UnstyledButton, Divider, Anchor } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconHeart, IconBookmark, IconNote, IconMessageCircle, IconHeartFilled, IconBookmarkFilled, IconShare } from '@tabler/icons-react';
import { copyLink } from '../../utils/share';
import { format } from 'date-fns';
import { formatPostDate } from '../../utils/formatPostDate';
import axios from 'axios';
import AnnotationModal from '../AnnotationModal';
import { PreviewCardType } from '../../types/PostType';
import InteractionControl from '../InteractionControl';
import { toggleFavourite, toggleBookmark } from '../../utils/mastoActions';
import { getPost, isLiked as storeIsLiked, isBookmarked as storeIsBookmarked } from '../../utils/localStore';
import { useHighlightStore, setResponseFilter, clearResponseFilter, setPendingResponseFilter, setFilterCategories } from '../../utils/highlightStore';
import { CATEGORY_COLORS, CATEGORY_LABELS, categoryIcon, getCategoryColors } from '../../utils/categoryStyles';
import ReplyHighlightedContent from './ReplyHighlightedContent';
import { useRelatedStacks } from '../../app/(shell)/related-stacks-context';
import type { Relation } from '../../types/PostType';
import { showTooltip, hideTooltip } from '../HoverTooltip';

// ─── Focus post cross-highlight helpers ──────────────────────────────────────

/** Strip all HTML tags to get plain text for matching */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
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
 *  the focus post — the data's OPTIONAL "bold span". Anchored on the smallest mark
 *  that contains it (a mark's text is exactly focusText.slice(data-fs,data-fe), so
 *  offsets are valid even though displayText != focusPlain). Skips gracefully when
 *  the range crosses a nested-mark boundary. */
function boldFocusCommentRange(container: HTMLElement, fcStart: number, fcEnd: number): void {
  const marks = Array.from(container.querySelectorAll('mark[data-fs]')) as HTMLElement[];
  let host: HTMLElement | null = null, hostSpan = Infinity, hostA = 0;
  for (const m of marks) {
    const a = parseInt(m.getAttribute('data-fs') || 'NaN', 10);
    const b = parseInt(m.getAttribute('data-fe') || 'NaN', 10);
    if (a <= fcStart && b >= fcEnd && (b - a) < hostSpan) { host = m; hostSpan = b - a; hostA = a; }
  }
  if (!host) return;
  const relStart = fcStart - hostA, relEnd = fcEnd - hostA;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let pos = 0, sN: Text | null = null, sO = 0, eN: Text | null = null, eO = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = (node.textContent || '').length;
    if (sN === null && pos + len > relStart) { sN = node as Text; sO = relStart - pos; }
    if (pos + len >= relEnd) { eN = node as Text; eO = relEnd - pos; break; }
    pos += len;
  }
  if (!sN || !eN) return;
  try {
    const range = document.createRange();
    range.setStart(sN, sO);
    range.setEnd(eN, eO);
    const b = document.createElement('span');
    b.setAttribute('data-fc', '');
    // Non-reflowing faux-bold: matches the related cards' technique exactly so the
    // emphasis never changes the glyph metrics (real font-weight widens the text and
    // reflows the surrounding article on hover). text-shadow thickens in place.
    b.style.textShadow = '0 0 0.7px currentColor, 0 0 0.7px currentColor';
    range.surroundContents(b);
  } catch { /* range crosses an element boundary — skip the bold */ }
}

/** Hex → "R,G,B" triple for use in a CSS variable (so CSS can vary the alpha per
 *  hover state without re-rendering the mark). */
/** Render multi-range focus highlights into HTML using offset-based Relations.
 *  Highlights are neutral grey (the category guard below just drops unknown
 *  categories); colour lives on the related cards, not the focus article.
 *  Level 2: when hoveredRangeIndex is set, non-active highlights dim their BACKGROUND only.
 *  When dimmed=true, all marks render at low alpha (always-visible default state). */
function renderMultiHighlightHtml(
  displayHtml: string,
  focusPlainText: string,
  relations: Relation[],
  hoveredRangeIndex: number | null,
  dimmed?: boolean,
): string {
  if (relations.length === 0) return displayHtml;

  const entries = relations.map((r, i) => {
    const catColors = crossColors(r.category);
    if (!catColors) return null;

    const snippet = focusPlainText.slice(r.focusStart, r.focusEnd);
    // Guard: an empty/invalid focus span yields an empty snippet. Below we build
    // `new RegExp('', 'g')` and drive it with exec() in a while loop — an empty
    // pattern matches zero-width, lastIndex never advances, and the loop spins
    // FOREVER (the page-freeze: hovering a related post with such a relation
    // cross-highlights the focus post and hangs the thread). Skip empty snippets.
    if (!snippet) return null;
    // The mark renders invisible by default; CSS varies the alpha per hover state
    // (faint on post hover, dark on span hover) WITHOUT re-rendering. The focus
    // post's highlights are neutral grey — not category-coloured — so the article
    // text stays calm; category colour lives only on the related cards.
    return { snippet, index: i, fs: r.focusStart, fe: r.focusEnd };
  }).filter(Boolean) as Array<{ snippet: string; index: number; fs: number; fe: number }>;

  // Sort by longest snippet first to avoid partial matches
  entries.sort((a, b) => b.snippet.length - a.snippet.length);

  let result = displayHtml;
  const usedPositions = new Set<number>();

  for (const entry of entries) {
    if (!entry.snippet) continue; // defensive: never build a zero-width regex
    const escaped = entry.snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(result)) !== null) {
      // Defensive: a zero-width match would not advance lastIndex → infinite loop.
      if (match.index === regex.lastIndex) { regex.lastIndex++; continue; }
      if (!usedPositions.has(match.index)) {
        usedPositions.add(match.index);
        const markHtml = `<mark data-range-id="${entry.index}" data-fs="${entry.fs}" data-fe="${entry.fe}" style="padding:1px 0;color:inherit">${entry.snippet}</mark>`;
        result = result.slice(0, match.index) + markHtml + result.slice(match.index + entry.snippet.length);
        break;
      }
    }
  }

  return result;
}

type PreviewCard = PreviewCardType;

const MastodonInstanceUrl = 'https://beta.stacky.social';

interface CleanedPost {
  html: string;
  publishedDate: string | null;
  articleUrl: string | null;
}

/** Strip external URLs and extract "Published" date from post HTML.
 *  Only strips URLs when a preview card exists to preserve legitimate links in conversational posts. */
function cleanPostHtml(html: string, card: PreviewCard | null | undefined): CleanedPost {
  let cleaned = html;
  let publishedDate: string | null = null;

  if (card) {
    // Remove all <a> tags linking to external URLs (entire tag + contents)
    cleaned = cleaned.replace(/<a[^>]*href=["']https?:\/\/[^"']+["'][^>]*>[\s\S]*?<\/a>/gi, '');

    // Remove bare URLs in text (not inside tags)
    cleaned = cleaned.replace(/https?:\/\/[^\s<]+/g, '');
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

// D-EXPAND (R-EXPAND-2): the auto-reveal is BOUNDED — the box grows to at most
// this many lines (or 40vh, whichever is smaller) and scrolls internally to the
// highlighted span, so a hover-preview never balloons the post to full height
// or shoves the feed below it. Manual "Read more" still fully expands.
const AUTO_REVEAL_CAP_LINES = 12;
const AUTO_REVEAL_MAX_HEIGHT = `min(calc(1.5em * ${AUTO_REVEAL_CAP_LINES}), 40vh)`;
/** One line of context kept above the span the reveal scrolls to. */
const AUTO_REVEAL_SCROLL_CONTEXT_PX = 24;

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
  /** Bounded auto-reveal is active: the box is capped (AUTO_REVEAL_MAX_HEIGHT)
   *  and this component scrolls it internally to the highlighted span. */
  autoRevealed?: boolean;
  focusRelations?: Relation[];
  /** Ask the parent to open/close the BOUNDED reveal (capped box + internal
   *  scroll-to-span) when a highlight sits below the clamp. The parent only
   *  auto-collapses what it auto-opened; manual Read-more is independent. */
  onAutoReveal?: (reveal: boolean) => void;
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
}>(function ActiveHighlightedContent({ displayText, rawText, style, className, isTextExpanded, autoRevealed = false, focusRelations = [], onAutoReveal, active = true, onSpanFocusRequest, relatedCountForSpans, replyCountForSpans }, ref) {
  const { hoveredPostId, hoveredRelations, hoveredHighlightRangeIndex, hoveredCategory, responseFilter, filterCategories } = useHighlightStore();
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
  const hoverRangeRef = useRef<{ fs: number; fe: number } | null>(null);
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

  // Cleanup dwell timer on unmount
  useEffect(() => {
    return () => {
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
      if (tooltipShownByMeRef.current) {
        hideTooltip();
        tooltipShownByMeRef.current = false;
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

  // PERF: the marks are rendered ONCE from this post's own spans (focusRelations)
  // and never re-parsed on hover. Hover/cross-highlight states are applied as CSS
  // classes on the stable marks (see the effects below) instead of rebuilding the
  // article HTML — re-parsing the long article on every sidebar hover was the
  // ~300ms-per-hover cost behind the page-freeze.
  const html = useMemo(() => {
    if (!focusRelations || focusRelations.length === 0) return displayText;
    return renderMultiHighlightHtml(displayText, stripHtml(rawText), focusRelations, null, /* dimmed */ false);
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

  // ── Expand-to-reveal (collapsed fold) ─────────────────────────────────────
  // When a highlighted mark sits below the "Read more" clamp, ask the PARENT to
  // expand the post via its existing isTextExpanded (Read-more) render. We drive
  // that state instead of measuring a target height ourselves: lifting the clamp
  // to measure mis-reports height badly here because nested <mark>s under
  // display:block inflate the scrollHeight (~6×), so the old manual revealHeight
  // overshot. The Read-more layout already renders the natural expanded height
  // correctly, so reuse it. The parent only auto-collapses what WE auto-expanded;
  // a manual Read-more is left untouched (see handleAutoReveal in the parent).

  // EXPAND: when a relevant mark is clipped below the fold, request the bounded reveal.
  useLayoutEffect(() => {
    const el = innerRef.current;
    // Auto-reveal is a FOCUSED-post affordance: anyMarkVisuallyActive reflects the
    // focus post's filter/cross-highlight, so non-focused feed posts must not react.
    if (!el || !active || isTextExpanded || autoRevealed || !anyMarkVisuallyActive || !onAutoReveal) return;

    // Only consider the marks we're actually lighting up: every region the hovered
    // related card links to (by overlap), else the filter/dwell mark. Avoids
    // expanding the whole article on every sidebar hover.
    let marks: HTMLElement[];
    if (crossActive && hoveredRelations) {
      const rels = hoveredRelations;
      marks = (Array.from(el.querySelectorAll('mark[data-fs]')) as HTMLElement[]).filter((m) => {
        const a = parseInt(m.getAttribute('data-fs') || 'NaN', 10);
        const b = parseInt(m.getAttribute('data-fe') || 'NaN', 10);
        return rels.some((r) => a < r.focusEnd && r.focusStart < b);
      });
    } else if (visibleMarkIdx !== null) {
      marks = Array.from(el.querySelectorAll(`mark[data-range-id="${visibleMarkIdx}"]`));
    } else {
      marks = Array.from(el.querySelectorAll('mark'));
    }
    if (marks.length === 0) return;

    // A mark whose bottom falls past the clamped box bottom is hidden by the fold.
    const boxBottom = el.getBoundingClientRect().bottom;
    const clipped = marks.some((m) => m.getBoundingClientRect().bottom > boxBottom + 1);
    if (clipped) onAutoReveal(true);
  }, [html, isTextExpanded, autoRevealed, anyMarkVisuallyActive, crossActive, hoveredRelations, visibleMarkIdx, onAutoReveal, active]);

  // SCROLL-TO-SPAN (D-EXPAND): once the bounded reveal is open, scroll the capped
  // box so the first relevant mark is visible (one line of context above it). If
  // the span already fits inside the cap, nothing moves. Layout truth comes from
  // getBoundingClientRect, so the nested-mark scrollHeight inflation that broke
  // the old measured reveal doesn't apply here.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || !active || isTextExpanded || !autoRevealed || !anyMarkVisuallyActive) return;
    let marks: HTMLElement[];
    if (crossActive && hoveredRelations) {
      const rels = hoveredRelations;
      marks = (Array.from(el.querySelectorAll('mark[data-fs]')) as HTMLElement[]).filter((m) => {
        const a = parseInt(m.getAttribute('data-fs') || 'NaN', 10);
        const b = parseInt(m.getAttribute('data-fe') || 'NaN', 10);
        return rels.some((r) => a < r.focusEnd && r.focusStart < b);
      });
    } else if (visibleMarkIdx !== null) {
      marks = Array.from(el.querySelectorAll(`mark[data-range-id="${visibleMarkIdx}"]`));
    } else {
      marks = Array.from(el.querySelectorAll('mark'));
    }
    if (marks.length === 0) return;
    const target = marks.reduce((top, m) =>
      m.getBoundingClientRect().top < top.getBoundingClientRect().top ? m : top
    );
    const boxRect = el.getBoundingClientRect();
    const markRect = target.getBoundingClientRect();
    const fullyVisible = markRect.top >= boxRect.top && markRect.bottom <= boxRect.bottom;
    if (fullyVisible) return;
    const top = Math.max(0, el.scrollTop + (markRect.top - boxRect.top) - AUTO_REVEAL_SCROLL_CONTEXT_PX);
    el.scrollTo({ top, behavior: 'smooth' });
  }, [autoRevealed, isTextExpanded, anyMarkVisuallyActive, crossActive, hoveredRelations, visibleMarkIdx, active, html]);

  // COLLAPSE: when nothing is highlighted anymore, restore the collapsed state —
  // but only if WE auto-opened it (the parent guards a manual Read-more). Reset
  // the internal scroll so the next reveal starts from the top of the box.
  useEffect(() => {
    if (!anyMarkVisuallyActive && onAutoReveal) {
      onAutoReveal(false);
      const el = innerRef.current;
      if (el) el.scrollTop = 0;
    }
  }, [anyMarkVisuallyActive, onAutoReveal]);

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

    const clearDark = () => el.querySelectorAll('mark.fp-dark').forEach((m) => m.classList.remove('fp-dark'));
    const cancelDwell = () => {
      if (dwellTimerRef.current) { clearTimeout(dwellTimerRef.current); dwellTimerRef.current = null; }
      if (tooltipShownByMeRef.current) { hideTooltip(); tooltipShownByMeRef.current = false; }
    };
    // Full spans overlapping the hovered mark = the union (never a partial span).
    const unionFor = (mark: HTMLElement) => {
      const fs = parseInt(mark.getAttribute('data-fs') || 'NaN', 10);
      const fe = parseInt(mark.getAttribute('data-fe') || 'NaN', 10);
      const marks: HTMLElement[] = [];
      const ranges: Array<{ fs: number; fe: number }> = [];
      el.querySelectorAll('mark[data-fs]').forEach((m) => {
        const a = parseInt((m as HTMLElement).getAttribute('data-fs') || 'NaN', 10);
        const b = parseInt((m as HTMLElement).getAttribute('data-fe') || 'NaN', 10);
        if (a < fe && fs < b) { marks.push(m as HTMLElement); ranges.push({ fs: a, fe: b }); }
      });
      return { marks, ranges };
    };
    const countRelated = (ranges: Array<{ fs: number; fe: number }>) =>
      (relatedStacksRef.current || []).filter((s: any) =>
        (s.topPost?.relations ?? []).some((r: any) =>
          ranges.some((u) => r.focusStart < u.fe && u.fs < r.focusEnd))).length;

    const onEnter = () => {
      hoveringRef.current = true;
      el.classList.add('fp-hovering');
      // Entering the focus post means DIRECT-hover mode (neutral grey), not the
      // related-card cross-highlight (category colour). Clear any inline
      // backgroundColor the cross-highlight left on the marks — otherwise that
      // residue (e.g. after grouping/ungrouping by hovering+clicking a card span)
      // overrides the .fp-dark grey via inline-beats-CSS, so the span "won't
      // darken". A real card hover re-paints on its next commit, so this is safe.
      el.querySelectorAll('mark[data-fs]').forEach((m) => { (m as HTMLElement).style.backgroundColor = ''; });
    };
    const onLeave = (e: MouseEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && el.contains(related)) return;
      hoveringRef.current = false;
      hoverRangeRef.current = null;
      el.classList.remove('fp-hovering');
      clearDark();
      cancelDwell();
    };
    const onMove = (e: MouseEvent) => {
      latestX = e.clientX; latestY = e.clientY;
      hoveringRef.current = true;
      el.classList.add('fp-hovering');
      const mark = (e.target as HTMLElement).closest('mark') as HTMLElement | null;
      if (!mark) { hoverRangeRef.current = null; clearDark(); cancelDwell(); return; }
      const fsHover = parseInt(mark.getAttribute('data-fs') || 'NaN', 10);
      const feHover = parseInt(mark.getAttribute('data-fe') || 'NaN', 10);
      hoverRangeRef.current = (Number.isNaN(fsHover) || Number.isNaN(feHover)) ? null : { fs: fsHover, fe: feHover };
      if (mark.classList.contains('fp-dark')) return; // already the active union
      clearDark();
      const { marks, ranges } = unionFor(mark);
      marks.forEach((m) => m.classList.add('fp-dark'));
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
    const onClick = (e: MouseEvent) => {
      const mark = (e.target as HTMLElement).closest('mark') as HTMLElement | null;
      if (!mark) return; // non-span pixel → let the card-level navigate handler run
      const fs = parseInt(mark.getAttribute('data-fs') || 'NaN', 10);
      const fe = parseInt(mark.getAttribute('data-fe') || 'NaN', 10);
      if (Number.isNaN(fs) || Number.isNaN(fe)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const plain = stripHtml(rawText);
      const span = { start: fs, end: fe, text: plain.slice(fs, fe) };
      // Non-focused feed post: clicking a span focuses this post (scroll + filter)
      // rather than filtering the wrong post's panel.
      if (!activeRef.current) { onSpanFocusRequestRef.current?.(span); return; }
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
      setResponseFilter(span);
    };

    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('click', onClick, true); // capture: before card navigation
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('click', onClick, true);
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
    const level2 = (hoveredRelations && hoveredHighlightRangeIndex != null)
      ? hoveredRelations[hoveredHighlightRangeIndex] : null;
    // Category-badge hover: every hovered-card relation OF THAT CATEGORY gets
    // the level-2 shade (a badge is "the same relation at category grain"), the
    // rest stay level-1. A specific span hover still wins over the badge.
    const level2Cats = (!level2 && hoveredCategory && hoveredRelations)
      ? hoveredRelations.filter((r) => r.category === hoveredCategory)
      : null;
    const marks = Array.from(el.querySelectorAll('mark[data-fs]')) as HTMLElement[];
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
  // mousemove. Re-add it from the tracked hover refs. (Skip when a card is hovered:
  // the cross-highlight owns the marks then.)
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || hoveredRelations || !hoveringRef.current) return;
    el.classList.add('fp-hovering');
    const r = hoverRangeRef.current;
    if (!r) return;
    el.querySelectorAll('mark[data-fs]').forEach((mark) => {
      const m = mark as HTMLElement;
      const a = parseInt(m.getAttribute('data-fs') || 'NaN', 10);
      const b = parseInt(m.getAttribute('data-fe') || 'NaN', 10);
      if (a < r.fe && r.fs < b && !m.classList.contains('fp-dark')) {
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
      ? `#${id} mark[data-range-id="${visibleMarkIdx}"] { background: rgb(193,199,209) !important; }`
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

  // Expansion is now owned by the parent's isTextExpanded (Read-more) render —
  // which already supplies the correct clamp/expanded style via the `style` prop.
  const mergedStyle = style;

  return (
    <div
      ref={setRefs}
      id={containerIdRef.current}
      data-testid="focus-reveal"
      className={className}
      style={mergedStyle}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

interface PostProps {
  id: string;
  text: string;
  author: string;
  account: string;
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
}

function Post({
  id,
  text,
  author,
  account,
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
}: PostProps) {
  const router = useRouter();
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
  const [mediaAttachments, setMediaAttachments] = useState<string[]>(initialMedia);
  const isActive = activePostId === id;
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  // Bounded auto-reveal (D-EXPAND): capped box + internal scroll-to-span,
  // driven by the highlight layer; independent of the manual Read-more.
  const [isAutoRevealed, setIsAutoRevealed] = useState(false);
  // Mirror for handleAutoReveal so it can read the latest without a stale closure
  // or impure state-updater (see the note there).
  const isTextExpandedRef = useRef(isTextExpanded);
  isTextExpandedRef.current = isTextExpanded;
  const [hovered, setHovered] = useState(false);

  const [previewCards, setPreviewCards] = useState<PreviewCard[]>(initialCard ? [initialCard] : []);
  const [tempRelatedStacks, setTempRelatedStacks] = useState<any[]>(relatedStacks);
  const { html: displayText, publishedDate, articleUrl } = useMemo(
    () => cleanPostHtml(text, previewCards[0]),
    [text, previewCards],
  );

  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  // Guards against setState after unmount: under feed virtualization a post can
  // unmount while a post-action refetch is still in flight.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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
    const url = `/posts/${id}`;
    sessionStorage.setItem(`previousPath:${url}`, window.location.pathname);
    sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
    router.push(url);
  };

  const handleReply = () => {
    if (onNavigate) { onNavigate(id); return; }
    const url = `/posts/${id}`;
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
    const url = `/user/${account}`;
    router.push(url);
  };

  const handleLike = async () => {
    // Optimistic update so the heart reflects the tap instantly.
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => Math.max(0, c + (wasLiked ? -1 : 1)));

    try {
      // Persists to the local store (flips liked[] + favourites_count) and returns
      // { ok: true, value: <new liked state> }. ok is always true in local mode,
      // so this just confirms the optimistic update; the revert path is retained
      // for the future swap back to REST.
      const result = await toggleFavourite(id, wasLiked);
      if (!mountedRef.current) return;
      if (result.ok) {
        // Confirm against the store's authoritative new state.
        setLiked(result.value);
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
      // Persists to the local store (flips bookmarked[]) and returns
      // { ok: true, value: <new bookmarked state> }. ok is always true in local
      // mode; the revert path is retained for the future swap back to REST.
      const result = await toggleBookmark(id, wasBookmarked);
      if (!mountedRef.current) return;
      if (result.ok) {
        setBookmarkedState(result.value);
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
    // (related responses in the aside). The route prefix follows the surface the
    // post is being shared FROM: live-backend surfaces (/posts, /tag) link to the
    // API-backed detail page — their ids don't exist in the mock resolver — while
    // every store/demo surface links to the mock-backed detail route.
    const pathname = window.location.pathname;
    const isLiveSurface = pathname.startsWith('/posts') || pathname.startsWith('/tag');
    const url = `${window.location.origin}${isLiveSurface ? '/posts/' : '/ChineseEVs/posts/'}${id}`;
    copyLink(url, "Post link copied");
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

  // Auto-reveal (D-EXPAND, bounded): the active post's highlight layer asks us to
  // open the CAPPED reveal box when a highlighted span sits below the Read-more
  // fold — a separate state from the manual Read-more, which still fully expands.
  // setState with a boolean is idempotent, so this stays StrictMode-safe without
  // ref bookkeeping; a manual Read-more simply wins in the style computation.
  const handleAutoReveal = useCallback((reveal: boolean) => {
    if (reveal) {
      if (!isTextExpandedRef.current) setIsAutoRevealed(true);
    } else {
      setIsAutoRevealed(false);
    }
  }, []);

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
    // User now owns the expanded state; the bounded reveal yields to it (and
    // will re-open from its effect if a cross-highlight is still active later).
    setIsAutoRevealed(false);
    setIsTextExpanded(true);
    setIsOverflowing(false);
  };

  const handleCollapseText = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setIsAutoRevealed(false);
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

  return (
    <div style={{ position: 'relative', marginBottom: '3rem'}}>
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
          border: isActive ? '2px solid rgb(156, 184, 255)' : '2px solid #e7e7e7',
          boxShadow: isActive ? 'rgba(0, 0, 0, 0.18) 0px 12px 24px, rgba(0, 0, 0, 0.12) 0px 6px 12px' : 'none',
          transform: isActive ? 'translateY(-2px)' : 'none',
          // Border switches instantly (not transitioned) so the active outline
          // can't be caught mid-fade showing the inactive colour during scroll
          // re-renders (R-FEED-5). Elevation/lift still animate.
          transition: 'box-shadow 150ms ease, transform 150ms ease',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: '1rem',
          cursor: 'pointer',
        }}
        onMouseEnter={() => { setHovered(true); }}
        onMouseLeave={() => { setHovered(false); }}
      >
{/* The stack / category-count icon column on the focus post is permanently
    removed (RG-1 / R-NOSTACK-1). Related stacks live in the aside panel, not in a
    per-post icon column. Do NOT reinstate this — it has regressed via merges
    before (it reappeared on the detail route via `stackCount={p.stackCount}`). */}

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
          <Group>
            <UnstyledButton onClick={handleNavigateToUser} className="avatarHoverDim">
              <Avatar src={avatar} alt={author} radius="xl" />
            </UnstyledButton>
            <div>
              <Anchor
                component="button"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  handleNavigateToUser(e);
                }}
                underline="hover"
                style={{ color: '#011445', fontWeight: 700, fontSize: 'var(--mantine-font-size-md)' }}
              >
                {author}
              </Anchor>
              <Text size="xs" c="dimmed">{formatPostDate(createdAt)}</Text>
            </div>
          </Group>
        </div>

        {categoryBadges && categoryBadges.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', margin: '6px 0 2px 3rem' }}>
            {categoryBadges.map((cat) => {
              const tc = getCategoryColors(cat);
              return (
                <span
                  key={cat}
                  data-reply-badge={cat}
                  style={{
                    background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`,
                    borderRadius: '5px', padding: '2px 7px',
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '10px', fontWeight: 700,
                  }}
                >
                  {categoryIcon(cat, 12, tc.text)}
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
              );
            })}
          </div>
        )}

        <div
          style={{ paddingLeft: '3rem', paddingRight:'3rem', cursor: 'pointer'}}
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
            maxHeight: isTextExpanded ? undefined : `calc(1.5em * ${clampLines})`,
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
          autoRevealed={isAutoRevealed && !isTextExpanded}
          focusRelations={focusRelations}
          active={isActive}
          onSpanFocusRequest={handleSpanFocusRequest}
          relatedCountForSpans={relatedCountForSpans}
          replyCountForSpans={replyCountForSpans}
          onAutoReveal={handleAutoReveal}
          className={isTextExpanded || isAutoRevealed ? undefined : 'postClampedText'}
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
              : isAutoRevealed
              ? {
                  // Bounded auto-reveal (D-EXPAND): grow to the cap, scroll
                  // internally to the span — never full height, minimal shove.
                  display: 'block',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  textOverflow: 'unset',
                  maxHeight: AUTO_REVEAL_MAX_HEIGHT,
                  marginTop: '0px',
                  lineHeight: '1.5',
                  color: '#011445',
                }
              : {
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: clampLines,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxHeight: `calc(1.5em * ${clampLines})`,
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
            maxHeight: isTextExpanded ? undefined : `calc(1.5em * ${clampLines})`,
            marginTop: '0px',
            lineHeight: '1.5',
            color: '#011445'
          }}
          dangerouslySetInnerHTML={{ __html: displayText }}
        />
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
              color: '#5a71a8',
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
          {mediaAttachments.length > 0 && (
            <div style={{ paddingLeft: '3rem', paddingRight: '4rem', paddingTop: '1rem' }}>
              {mediaAttachments.map((url, index) => (
                <img key={index} src={url} alt={`Attachment ${index + 1}`} loading="lazy" decoding="async" style={{ width: '100%', marginBottom: '10px' }} />
              ))}
            </div>
          )}

          {previewCards.slice(0, 1).map((card, index) =>
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

        <Divider style={{ marginTop:'1.5rem'}}/>
        <div style={{ paddingLeft: '3rem', paddingRight: '3rem' }}>
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
