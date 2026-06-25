"use client";

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
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
import { useHighlightStore, setFilterFocusSpan, clearFilterFocusSpan } from '../../utils/highlightStore';
import { useRelatedStacks } from '../../app/(shell)/related-stacks-context';
import type { Relation } from '../../types/PostType';
import { showTooltip, hideTooltip } from '../HoverTooltip';

// ─── Focus post cross-highlight helpers ──────────────────────────────────────

/** Strip all HTML tags to get plain text for matching */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

const CROSS_HIGHLIGHT_CATEGORY_COLORS: Record<string, { bg: string; border: string }> = {
  agree:              { bg: "#d4f9d3", border: "#4caf50" },
  disagree:           { bg: "#ffe0e0", border: "#f44336" },
  predictions:        { bg: "#fff3cd", border: "#ff9800" },
  evidence_public:    { bg: "#e3f2fd", border: "#2196f3" },
  evidence_personal:  { bg: "#f3e5f5", border: "#9c27b0" },
  connections:        { bg: "#e0f2f1", border: "#009688" },
  questions:          { bg: "#fce4ec", border: "#e91e63" },
  humor:              { bg: "#fff8e1", border: "#ffc107" },
  values:             { bg: "#ede7f6", border: "#673ab7" },
  framing:            { bg: "#e0f7fa", border: "#00bcd4" },
  proposals:          { bg: "#e8eaf6", border: "#3f51b5" },
  pointers:           { bg: "#e8eaf6", border: "#3f51b5" },
};

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
    const catColors = CROSS_HIGHLIGHT_CATEGORY_COLORS[r.category];
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

// Subscribes to the highlight store — only mounted for the *active* post so
// inactive posts don't re-render on every sidebar hover.
const ActiveHighlightedContent = React.forwardRef<HTMLDivElement, {
  displayText: string;
  rawText: string;
  style: React.CSSProperties;
  className?: string;
  isTextExpanded: boolean;
  focusRelations?: Relation[];
}>(function ActiveHighlightedContent({ displayText, rawText, style, className, isTextExpanded, focusRelations = [] }, ref) {
  const { hoveredPostId, hoveredRelations, hoveredHighlightRangeIndex, filterFocusSpan } = useHighlightStore();
  // Related stacks of the active (focus) post — used to count "N related posts"
  // for the click-to-filter affordance. Mirrored to a ref so the DOM hover
  // handlers read the latest without re-subscribing.
  const { relatedStacks: ctxRelatedStacks } = useRelatedStacks();
  const relatedStacksRef = useRef(ctxRelatedStacks);
  relatedStacksRef.current = ctxRelatedStacks;

  // Per-mark dwell: index of the mark that has become visible via 1500ms dwell
  const [dwellOnMarkIndex, setDwellOnMarkIndex] = useState<number | null>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether *this instance* is currently the one showing the global hover tooltip,
  // so unmount/cleanup only hides our own tooltip, not someone else's.
  const tooltipShownByMeRef = useRef(false);

  // Refs mirror reactive state so the deferred dwell-timer callback always reads
  // the latest values (otherwise its closure would freeze at timer setup time).
  const filterFocusSpanRef = useRef(filterFocusSpan);
  filterFocusSpanRef.current = filterFocusSpan;
  const focusRelationsRef = useRef(focusRelations);
  focusRelationsRef.current = focusRelations;

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
  const filterIdx = filterFocusSpan
    ? focusRelations.findIndex(r => r.focusStart === filterFocusSpan.start && r.focusEnd === filterFocusSpan.end)
    : -1;
  const visibleMarkIdx = dwellOnMarkIndex !== null ? dwellOnMarkIndex : (filterIdx >= 0 ? filterIdx : null);

  // Expand-to-reveal triggers: the persistent filter span, OR a hovered related
  // span whose linked region sits below the clamp — so the cross-highlight is
  // actually visible. Transient direct hover on this post stays CSS-only.
  const crossActive = hoveredRelations !== null && hoveredHighlightRangeIndex !== null;
  const anyMarkVisuallyActive = (filterFocusSpan !== null && filterIdx >= 0) || crossActive;

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
  const containerIdRef = useRef<string>(`ahc-${Math.random().toString(36).slice(2)}`);

  // ── Expand-to-reveal ──────────────────────────────────────────────────────
  // When a mark is below the 5-line clamp, smoothly grow the box downward.
  // Collapses with a matching animation when marks become invisible.
  //
  // Phase: 'normal' → 'expanded' → 'collapsing' → 'normal'
  //   expanded:   display:block, maxHeight = revealHeight  (large)
  //   collapsing: display:block, maxHeight = clamp height  (CSS transition plays)
  //   normal:     -webkit-box with line-clamp              (after timeout)
  const [revealHeight, setRevealHeight] = useState<number | null>(null);
  const [collapsing, setCollapsing] = useState(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // EXPAND: useLayoutEffect fires synchronously when html changes (marks appear).
  // Triggers on any anyMarkVisuallyActive → true transition (cross-highlight OR dwell OR filter).
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || isTextExpanded || !anyMarkVisuallyActive) return;

    // Reveal only the marks we're actually lighting up: the hovered related
    // span's linked region (by overlap), else the filter/dwell mark. Avoids
    // expanding to the whole article on every sidebar hover.
    const hovered = crossActive && hoveredHighlightRangeIndex !== null ? hoveredRelations![hoveredHighlightRangeIndex] : null;
    let marks: HTMLElement[];
    if (hovered) {
      marks = (Array.from(el.querySelectorAll('mark[data-fs]')) as HTMLElement[]).filter((m) => {
        const a = parseInt(m.getAttribute('data-fs') || 'NaN', 10);
        const b = parseInt(m.getAttribute('data-fe') || 'NaN', 10);
        return a < hovered.focusEnd && hovered.focusStart < b;
      });
    } else if (visibleMarkIdx !== null) {
      marks = Array.from(el.querySelectorAll(`mark[data-range-id="${visibleMarkIdx}"]`));
    } else {
      marks = Array.from(el.querySelectorAll('mark'));
    }
    if (marks.length === 0) return;

    const boxRect = el.getBoundingClientRect();
    let lowestBottom = 0;
    for (const m of marks) {
      const r = m.getBoundingClientRect();
      const relBottom = r.bottom - boxRect.top;
      if (relBottom > lowestBottom) lowestBottom = relBottom;
    }

    const PADDING = 24;
    const needed = lowestBottom + PADDING;
    const clampHeight = el.clientHeight;

    if (needed > clampHeight) {
      // Cancel any pending collapse — we're re-expanding
      if (collapseTimerRef.current) { clearTimeout(collapseTimerRef.current); collapseTimerRef.current = null; }
      setCollapsing(false);
      setRevealHeight(Math.min(needed, el.scrollHeight));
    }
  }, [html, isTextExpanded, anyMarkVisuallyActive, crossActive, hoveredHighlightRangeIndex, hoveredRelations, visibleMarkIdx]);

  // COLLAPSE: when marks become invisible, start the collapse animation.
  // revealHeight stays set (keeping display:block) while CSS transition plays.
  // After 320ms, clear everything → snap to normal -webkit-box style.
  useEffect(() => {
    if (!anyMarkVisuallyActive && revealHeight !== null) {
      setCollapsing(true);
      collapseTimerRef.current = setTimeout(() => {
        setCollapsing(false);
        setRevealHeight(null);
        collapseTimerRef.current = null;
      }, 320);
    }
    return () => {
      if (collapseTimerRef.current) { clearTimeout(collapseTimerRef.current); collapseTimerRef.current = null; }
    };
  }, [anyMarkVisuallyActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Spec hover model (CSS-driven via classes — never re-parses the article):
  //  · enter the post       → faint ALL its spans (.fp-hovering on the container)
  //  · over a span          → DARKEN the union of spans covering the cursor
  //  · dwell 1.5s on a span → tooltip "Click to focus on N related posts"
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

    const onEnter = () => { el.classList.add('fp-hovering'); };
    const onLeave = (e: MouseEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && el.contains(related)) return;
      el.classList.remove('fp-hovering');
      clearDark();
      cancelDwell();
    };
    const onMove = (e: MouseEvent) => {
      latestX = e.clientX; latestY = e.clientY;
      el.classList.add('fp-hovering');
      const mark = (e.target as HTMLElement).closest('mark') as HTMLElement | null;
      if (!mark) { clearDark(); cancelDwell(); return; }
      if (mark.classList.contains('fp-dark')) return; // already the active union
      clearDark();
      const { marks, ranges } = unionFor(mark);
      marks.forEach((m) => m.classList.add('fp-dark'));
      cancelDwell();
      dwellTimerRef.current = setTimeout(() => {
        dwellTimerRef.current = null;
        const n = countRelated(ranges);
        showTooltip({
          content: <>Click to focus on <strong>{n} related {n === 1 ? 'post' : 'posts'}</strong></>,
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
      const ff = filterFocusSpanRef.current;
      if (ff && ff.start === fs && ff.end === fe) { clearFilterFocusSpan(); return; }
      const plain = stripHtml(rawText);
      setFilterFocusSpan({ start: fs, end: fe, text: plain.slice(fs, fe) });
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

  // Cross-highlight: when a related card (or one of its spans) is hovered in the
  // aside, mirror it onto THIS focus post's marks — faint for every focus region
  // the card links to, dark for the specific span under the cursor. Applied as
  // CSS classes on the stable marks (no re-parse — the re-parse was the freeze),
  // in the same neutral grey as direct hover so the two look identical.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const clear = () => el.querySelectorAll('mark.fp-cross, mark.fp-cross-faint')
      .forEach((m) => m.classList.remove('fp-cross', 'fp-cross-faint'));
    clear();
    if (!hoveredRelations || hoveredRelations.length === 0) return clear;
    const overlapMarks = (fs: number, fe: number): HTMLElement[] => {
      const out: HTMLElement[] = [];
      el.querySelectorAll('mark[data-fs]').forEach((m) => {
        const a = parseInt((m as HTMLElement).getAttribute('data-fs') || 'NaN', 10);
        const b = parseInt((m as HTMLElement).getAttribute('data-fe') || 'NaN', 10);
        if (a < fe && fs < b) out.push(m as HTMLElement);
      });
      return out;
    };
    // Faint every focus region this card connects to.
    for (const r of hoveredRelations) {
      overlapMarks(r.focusStart, r.focusEnd).forEach((m) => m.classList.add('fp-cross-faint'));
    }
    // Darken the span under the cursor (the union of overlapping focus regions).
    const hovered = hoveredHighlightRangeIndex !== null ? hoveredRelations[hoveredHighlightRangeIndex] : null;
    if (hovered) {
      overlapMarks(hovered.focusStart, hovered.focusEnd).forEach((m) => {
        m.classList.remove('fp-cross-faint');
        m.classList.add('fp-cross');
      });
    }
    return clear;
  }, [hoveredPostId, hoveredRelations, hoveredHighlightRangeIndex]);

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
    const filterRule = visibleMarkIdx !== null
      ? `#${id} mark[data-range-id="${visibleMarkIdx}"] { background: rgba(100,116,139,0.34) !important; }`
      : '';
    styleEl.textContent =
      `#${id} mark { background: rgba(100,116,139,0); cursor: pointer; border-radius: 3px; transition: background 150ms ease; }` +
      `#${id}.fp-hovering mark { background: rgba(100,116,139,0.12); }` +
      `#${id} mark.fp-dark { background: rgba(100,116,139,0.40); }` +
      // Cross-highlight from a hovered related card — same neutral grey as direct
      // hover (faint for the card's linked regions, dark for the span under the
      // cursor) so the two interactions look identical, never category-coloured.
      `#${id} mark.fp-cross-faint { background: rgba(100,116,139,0.12); }` +
      `#${id} mark.fp-cross { background: rgba(100,116,139,0.40); }` +
      filterRule;
  }, [visibleMarkIdx]);

  // Cleanup scoped style on unmount
  useEffect(() => {
    const id = containerIdRef.current;
    return () => {
      const el = document.getElementById(`d1-hover-${id}`);
      if (el) el.remove();
    };
  }, []);

  // Build the merged style
  const TRANSITION = 'max-height 300ms ease';
  let mergedStyle: React.CSSProperties;

  if (revealHeight && !collapsing) {
    // EXPANDED: display:block, large maxHeight
    mergedStyle = {
      ...style,
      display: 'block',
      WebkitLineClamp: undefined,
      WebkitBoxOrient: undefined,
      overflow: 'hidden',
      maxHeight: `${revealHeight}px`,
      textOverflow: 'clip',
      transition: TRANSITION,
    };
  } else if (revealHeight && collapsing) {
    // COLLAPSING: KEEP display:block + revealHeight in DOM (so browser knows
    // the starting maxHeight for the transition), but target the small height.
    mergedStyle = {
      ...style,
      display: 'block',
      WebkitLineClamp: undefined,
      WebkitBoxOrient: undefined,
      overflow: 'hidden',
      maxHeight: style.maxHeight ?? 'calc(1.5em * 5)',
      textOverflow: 'ellipsis',
      transition: TRANSITION,
    };
  } else {
    // NORMAL: -webkit-box with line-clamp
    mergedStyle = style;
  }

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
    localStorage.setItem('relatedStacks', JSON.stringify(tempRelatedStacks));
    localStorage.setItem('relatedStacksSize', JSON.stringify(stackCount));
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
    // (related responses in the aside). Local-mode stand-in for a real share;
    // swap the host for prod and the link shape is unchanged.
    const url = `${window.location.origin}/ChineseEVs/posts/${id}`;
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
          title: 'Failed to load stacks',
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

  return (
    <div style={{ position: 'relative', marginBottom: '3rem'}}>
      <Paper
        ref={paperRef}
        data-testid="post"
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

        <div
          style={{ paddingLeft: '3rem', paddingRight:'3rem', cursor: 'pointer'}}
          onMouseUp={(e) => handleMouseUp(e)}
        >
          <div>
      {isActive ? (
        <ActiveHighlightedContent
          ref={textRef}
          displayText={displayText}
          rawText={text}
          isTextExpanded={isTextExpanded}
          focusRelations={focusRelations}
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
