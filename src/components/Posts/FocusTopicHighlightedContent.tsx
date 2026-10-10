"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Relation } from "../../types/PostType";
import {
  activateFocusTopic,
  beginUndoablePanelInteractionIfDetail,
  clearTopicInteraction,
  registerFocusTopicRelations,
  useHighlightStore,
  setFocusHoverRanges,
} from "../../utils/highlightStore";
import { useHoverRestore } from "../../utils/hoverRestore";
import { renderFocusCompositeHtml } from "../../utils/focusHighlightHtml.mjs";
import {
  focusTopicCandidates,
  nextFocusTopic,
  type FocusTopicCandidate,
} from "../../utils/focusTopics.mjs";
import { pointBridgesInlineRects } from "../../utils/inlineHighlightGeometry.mjs";
import { blendHex, getCategoryColors } from "../../utils/categoryStyles";
import { useRelatedStacks } from "../../app/(shell)/related-stacks-context";
import { hideTooltip, showTooltip } from "../HoverTooltip";
import FocusTopicPicker, { type FocusTopicPickerAnchor } from "./FocusTopicPicker";

// Single-topic phrases show a compact "Filter by" hint; multi-topic phrases
// skip it and open their full topic list after one delay, so the reader never
// sees a small tooltip replaced by a large list a moment later.
const TOOLTIP_DELAY_MS = 350;
const PICKER_DELAY_MS = 500;
// After the pointer leaves a related card, its passage stays revealed this long
// before the focus post returns to its original view. A card hover starts 90ms
// after entry, so moving across the gap to a neighbouring card hands over
// without the post flashing back to its opening in between.
const HOVER_RELEASE_MS = 250;

/**
 * The reading window's scroll offset for a passage spanning [top, bottom]
 * (content coordinates, line leading included). It scrolls only as far as the
 * passage needs, so the window keeps as much of the text before the passage as
 * fits, and it stops on a line top so the first visible line is never cut. A
 * passage taller than the window top-aligns instead. Because it never scrolls
 * past what the passage needs, the window never trades text above for the empty
 * spacer below (beyond the remainder of one line).
 */
function revealScrollTop(
  sortedLineTops: number[],
  passage: { top: number; bottom: number },
  windowHeight: number,
): number {
  const needed = passage.bottom - windowHeight;
  if (needed <= 0.5) return 0;
  const lineTop = sortedLineTops.find((top) => top >= needed - 0.5) ?? passage.top;
  return Math.max(0, Math.min(lineTop, passage.top));
}

const COVERED_HIGHLIGHT = "focus-window-covered";

/** Characters hidden under a reading window's leading ellipsis. One highlight
 *  shared by every focus post, named by the ::highlight rule in globals.css.
 *  Null where the CSS Custom Highlight API is missing. */
function coveredHighlight(): Highlight | null {
  if (typeof Highlight === "undefined" || typeof CSS === "undefined" || !CSS.highlights) return null;
  let highlight = CSS.highlights.get(COVERED_HIGHLIGHT);
  if (!highlight) {
    highlight = new Highlight();
    CSS.highlights.set(COVERED_HIGHLIGHT, highlight);
  }
  return highlight;
}

/**
 * While the reading window is scrolled past the post's opening, an ellipsis
 * overwrites the start of its first visible line ("…ccoli foo bar"). It is
 * drawn over the text, never inserted into it, so it cannot change a line
 * break. It covers whole characters at least as wide as itself (whole words
 * when a word and its space are wide enough: "… foo bar"); the caller hides
 * those through the covered highlight. Returns the covered range, or null
 * (ellipsis hidden) when the window shows the post's start.
 */
function placeLeadingEllipsis(element: HTMLElement, lead: HTMLElement): Range | null {
  lead.removeAttribute("data-shown");
  const shell = element.parentElement;
  if (!shell || !element.hasAttribute("data-reveal-window") || element.scrollTop < 0.5) return null;
  const computed = window.getComputedStyle(element);
  lead.style.width = "";
  lead.style.fontSize = computed.fontSize;
  const ellipsisWidth = lead.getBoundingClientRect().width;
  const windowTop = element.getBoundingClientRect().top - 0.5;

  const range = document.createRange();
  let first: DOMRect | null = null;
  let right = 0;
  let start: [Text, number] | null = null;
  let end: [Text, number] | null = null;
  let afterSpace = false;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  scan: for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (!first) {
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
      if (!rects.some((rect) => rect.top >= windowTop)) continue;
    }
    for (let offset = 0; offset < node.length; offset += 1) {
      if (/\s/.test(node.data[offset])) {
        afterSpace = Boolean(first);
        continue;
      }
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const glyph = Array.from(range.getClientRects()).find((rect) => rect.width > 0);
      if (!glyph) continue;
      if (!first) {
        if (glyph.top < windowTop) continue;
        first = glyph;
        start = [node, offset];
      } else if (Math.abs(glyph.top - first.top) > 1) {
        break scan; // the line ended before covering a full ellipsis width
      } else if (afterSpace && glyph.left - first.left >= ellipsisWidth) {
        break scan; // the words already covered leave room for the ellipsis
      }
      afterSpace = false;
      end = [node, offset + 1];
      right = glyph.right;
      if (right - first.left >= ellipsisWidth) break scan;
    }
  }
  if (!first || !start || !end) return null;

  const covered = document.createRange();
  covered.setStart(...start);
  covered.setEnd(...end);
  const shellRect = shell.getBoundingClientRect();
  const lineHeight = Number.parseFloat(computed.lineHeight)
    || Number.parseFloat(computed.fontSize) * 1.5;
  const lineTop = first.top - Math.max(0, (lineHeight - first.height) / 2);
  lead.style.left = `${first.left - shellRect.left}px`;
  lead.style.top = `${lineTop - shellRect.top}px`;
  lead.style.lineHeight = `${lineHeight}px`;
  lead.style.width = `${Math.max(ellipsisWidth, right - first.left)}px`;
  lead.setAttribute("data-shown", "");
  return covered;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

const isFocusCategory = (category: string) => category !== "uncategorized";

function rangeIdsFor(mark: HTMLElement): number[] {
  return Array.from(
    new Set(
      (mark.getAttribute("data-range-ids") || "")
        .split(/\s+/)
        .filter(Boolean)
        .map(Number)
        .filter(Number.isFinite),
    ),
  ).sort((a, b) => a - b);
}

type PickerState = {
  anchor: FocusTopicPickerAnchor;
  anchorElement: HTMLElement | null;
  topics: FocusTopicCandidate[];
  focusOnOpen: boolean;
  dismissOnPointerLeave: boolean;
  sourceBucket: string;
};

interface FocusTopicHighlightedContentProps {
  postId: string;
  displayText: string;
  rawText: string;
  style: React.CSSProperties;
  className?: string;
  isTextExpanded: boolean;
  focusRelations: Relation[];
  active: boolean;
  postRelatedStacks?: any[];
  onTopicFocusRequest?: (topic: FocusTopicCandidate) => void;
}

/**
 * Persistent semantic phrases for a focus post. Every authored crux turns bold
 * while the reader engages the text (hover, keyboard focus, a related-card
 * cross-highlight, or a mobile engaging tap); hovering one phrase mutes its
 * siblings; topic filtering only begins on click (or an explicit picker
 * choice), so hover never mutates either pane.
 */
const FocusTopicHighlightedContent = React.forwardRef<
  HTMLDivElement,
  FocusTopicHighlightedContentProps
>(function FocusTopicHighlightedContent(
  {
    postId,
    displayText,
    rawText,
    style,
    className,
    isTextExpanded,
    focusRelations,
    active,
    postRelatedStacks = [],
    onTopicFocusRequest,
  },
  forwardedRef,
) {
  const {
    hoveredPostId,
    hoveredRelations,
    sidebarHoverActive,
    hoveredHighlightRangeIndex,
    hoveredCategory,
    tappedCardPostId,
    responseFilter,
    topicInteraction,
  } = useHighlightStore();
  const { relatedStacks: contextRelatedStacks } = useRelatedStacks();
  const innerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(active);
  const relationsRef = useRef(focusRelations);
  const stacksRef = useRef<any[]>(postRelatedStacks);
  const topicInteractionRef = useRef(topicInteraction);
  const focusRequestRef = useRef(onTopicFocusRequest);
  const directHoverIdsRef = useRef<number[]>([]);
  const latestPointerRef = useRef<{ x: number; y: number } | null>(null);
  const latestMarkRef = useRef<HTMLElement | null>(null);
  const lastPointerTypeRef = useRef("");
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipShownRef = useRef(false);
  const pickerOpenRef = useRef(false);
  const pickerSourceBucketRef = useRef("");
  // The phrase under the pointer. A ref, not a listener-local, so it survives
  // re-renders: resetting it made the next 1px of jitter after a click count
  // as a fresh hover and re-arm the tooltip and picker.
  const activeBucketRef = useRef("");
  // A clicked phrase stays quiet (no tooltip, no picker) until the pointer
  // leaves it; the click already said what the reader wanted.
  const suppressedBucketRef = useRef("");
  // The type of the most recent pointer event over the text. Touch taps also
  // emit compatibility mouse events, which must not read as a hover.
  const hoverPointerTypeRef = useRef("");
  // Mobile: the first tap on a post's text only engages it (emphasis on).
  const engagedRef = useRef(false);
  const engageTapRef = useRef(false);
  const [engaged, setEngaged] = useState(false);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [textWidth, setTextWidth] = useState(0);
  const [scrollWindowHeight, setScrollWindowHeight] = useState<number | null>(null);

  activeRef.current = active;
  relationsRef.current = focusRelations;
  topicInteractionRef.current = topicInteraction;
  focusRequestRef.current = onTopicFocusRequest;
  pickerOpenRef.current = picker !== null;
  pickerSourceBucketRef.current = picker?.sourceBucket ?? "";
  stacksRef.current = active && contextRelatedStacks.length > 0
    ? contextRelatedStacks
    : postRelatedStacks;

  useEffect(
    () => registerFocusTopicRelations(postId, focusRelations),
    [postId, focusRelations],
  );

  useEffect(() => {
    if (
      !active
      || topicInteraction?.origin !== "focus"
      || topicInteraction.anchor.postId !== postId
    ) return;
    const currentTopic = focusRelations[topicInteraction.anchor.rangeIndex]?.topic ?? null;
    if (currentTopic !== topicInteraction.topicKey) clearTopicInteraction();
  }, [active, focusRelations, postId, topicInteraction]);

  const html = useMemo(
    () => renderFocusCompositeHtml(
      displayText,
      stripHtml(rawText),
      focusRelations,
      isFocusCategory,
    ),
    [displayText, focusRelations, rawText],
  );
  // The App Router's React re-applies dangerouslySetInnerHTML whenever the
  // prop object's identity changes, even for an identical string. A fresh
  // object per render therefore replaced every <mark> on every state update;
  // one between mousedown and mouseup cost the browser its click (a phrase
  // click that never rotated). Key the object on the string itself.
  const innerHtml = useMemo(() => ({ __html: html }), [html]);

  const setRefs = (element: HTMLDivElement | null) => {
    innerRef.current = element;
    if (typeof forwardedRef === "function") forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  };

  const scrollRelatedPanelToStart = useCallback((defer = false) => {
    const run = () => {
      const aside = document.querySelector('[data-testid="col-aside"]') as HTMLElement | null;
      aside?.scrollTo({ top: 0, behavior: "smooth" });
    };
    if (defer) window.setTimeout(run, 80);
    else window.requestAnimationFrame(run);
  }, []);

  const applyTopic = useCallback((topic: FocusTopicCandidate) => {
    if (!activeRef.current) {
      focusRequestRef.current?.(topic);
      scrollRelatedPanelToStart(true);
      return;
    }
    beginUndoablePanelInteractionIfDetail(postId);
    activateFocusTopic({
      topicKey: topic.topicKey,
      anchor: { postId, rangeIndex: topic.rangeIndex },
    });
    scrollRelatedPanelToStart();
  }, [postId, scrollRelatedPanelToStart]);

  const clearTopic = useCallback(() => {
    if (!activeRef.current) return;
    beginUndoablePanelInteractionIfDetail(postId);
    clearTopicInteraction();
  }, [postId]);

  // keepHover: a phrase click closes the picker while the pointer is still on
  // that phrase, so its hover paint (and the muted siblings) must stay put.
  const closePicker = useCallback((keepHover = false) => {
    pickerOpenRef.current = false;
    pickerSourceBucketRef.current = "";
    if (!keepHover) {
      directHoverIdsRef.current = [];
      latestMarkRef.current = null;
    }
    setPicker(null);
  }, []);

  const closePickerFromPicker = useCallback(() => closePicker(), [closePicker]);

  const ownsPointerDown = useCallback((target: Node) => Boolean(
    innerRef.current?.contains(target)
    && target instanceof Element
    && target.closest("mark[data-range-ids]"),
  ), []);

  const openPicker = useCallback((
    mark: HTMLElement,
    topics: FocusTopicCandidate[],
    focusOnOpen: boolean,
    dismissOnPointerLeave = false,
    pointer?: { x: number; y: number },
  ) => {
    if (topics.length <= 1) return;
    // Keep the menu below the entire hovered line, even when the pointer is
    // near its top. A multiline mark's bounding box would jump to its last line.
    const hoveredLine = pointer
      ? Array.from(mark.getClientRects()).find((line) => pointer.y >= line.top && pointer.y <= line.bottom)
      : undefined;
    const rect = pointer ? {
      left: pointer.x, right: pointer.x,
      top: Math.min(hoveredLine?.top ?? pointer.y, pointer.y - 18),
      bottom: Math.max(hoveredLine?.bottom ?? pointer.y, pointer.y + 18),
    } : mark.getBoundingClientRect();
    hideTooltip();
    tooltipShownRef.current = false;
    setPicker({
      anchor: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
      anchorElement: pointer ? null : mark,
      topics,
      focusOnOpen,
      dismissOnPointerLeave,
      sourceBucket: rangeIdsFor(mark).join(","),
    });
  }, []);

  const cancelHoverFeedback = useCallback(() => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
    tooltipTimerRef.current = null;
    pickerTimerRef.current = null;
    if (tooltipShownRef.current) hideTooltip();
    tooltipShownRef.current = false;
  }, []);

  useEffect(() => cancelHoverFeedback, [cancelHoverFeedback]);

  const selectedIndex = topicInteraction?.origin === "focus"
    && topicInteraction.anchor.postId === postId
    ? topicInteraction.anchor.rangeIndex
    : null;
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  // Reads the selection through a ref so this callback, and the listener
  // effect that depends on it, stay stable across selection changes.
  const reconcileMarks = useCallback(() => {
    const selectedIndex = selectedIndexRef.current;
    const element = innerRef.current;
    if (!element) return;
    const hoveredIds = directHoverIdsRef.current;
    const hot = new Set(hoveredIds);

    element.querySelectorAll<HTMLElement>('mark[data-range-ids]').forEach((mark) => {
      const ids = rangeIdsFor(mark);
      const topics = focusTopicCandidates(relationsRef.current, ids, stacksRef.current);
      mark.classList.remove("fp-hot", "fp-muted", "fp-selected", "fp-static");
      if (topics.length > 0) {
        mark.tabIndex = 0;
        mark.setAttribute("role", "button");
        mark.setAttribute(
          "aria-label",
          topics.length === 1
            ? "Filter by topic: " + topics[0].topicKey
            : "Choose among " + topics.length + " topics",
        );
      } else {
        mark.classList.add("fp-static");
        mark.removeAttribute("tabindex");
        mark.removeAttribute("role");
        mark.removeAttribute("aria-label");
      }
      if (selectedIndex !== null && ids.includes(selectedIndex)) {
        mark.classList.add("fp-selected");
      }
      if (hot.size > 0) {
        mark.classList.add(ids.some((id) => hot.has(id)) ? "fp-hot" : "fp-muted");
      }
    });
  }, []);

  // dangerouslySetInnerHTML replaces the mark nodes whenever the text changes,
  // so semantic attributes and interaction classes are reconciled after each commit.
  useLayoutEffect(reconcileMarks);

  // Related-card hover keeps its original full-passage category wash beneath
  // the new always-bold topic phrases. Card hover paints every linked passage
  // faintly; a specific related span strengthens only its own passage.
  useLayoutEffect(() => {
    const element = innerRef.current;
    if (!element) return;
    const passages = Array.from(
      element.querySelectorAll<HTMLElement>('[data-focus-passage-ids]'),
    );
    passages.forEach((passage) => {
      passage.classList.remove("fp-aside-passage");
      passage.style.removeProperty("--fp-passage-bg");
      passage.removeAttribute("data-aside-highlight");
    });
    const marks = Array.from(element.querySelectorAll<HTMLElement>('mark[data-range-ids]'));
    marks.forEach((mark) => mark.classList.remove("fp-aside-muted"));
    if (!active || !sidebarHoverActive || !hoveredRelations?.length) return;

    const level2 = hoveredHighlightRangeIndex != null
      ? hoveredRelations[hoveredHighlightRangeIndex] ?? null
      : null;
    const categoryLevel2 = !level2 && hoveredCategory
      ? hoveredRelations.filter((relation) => relation.category === hoveredCategory)
      : [];
    const intersects = (passage: HTMLElement, relation: Relation) => {
      const start = Number(passage.dataset.fs);
      const end = Number(passage.dataset.fe);
      return Number.isFinite(start)
        && Number.isFinite(end)
        && start < relation.focusEnd
        && relation.focusStart < end;
    };

    const directed = level2 ? [level2] : categoryLevel2;
    if (directed.length > 0) {
      marks.forEach((mark) => {
        const matches = rangeIdsFor(mark).some((id) => {
          const own = relationsRef.current[id];
          return own && directed.some((relation) =>
            own.focusStart === relation.focusStart && own.focusEnd === relation.focusEnd
            && own.focusCommentStart === relation.focusCommentStart
            && own.focusCommentEnd === relation.focusCommentEnd);
        });
        mark.classList.toggle("fp-aside-muted", !matches);
      });
    }
    passages.forEach((passage) => {
      const strong = level2 && intersects(passage, level2)
        ? level2
        : categoryLevel2.find((relation) => intersects(passage, relation)) ?? null;
      const matched = strong
        ?? hoveredRelations.find((relation) => intersects(passage, relation))
        ?? null;
      if (!matched) return;
      const colors = getCategoryColors(matched.category);
      const background = strong
        ? blendHex(colors.bg, colors.border, 0.15)
        : blendHex(colors.bg, "#ffffff", 0.35);
      passage.style.setProperty("--fp-passage-bg", background);
      passage.classList.add("fp-aside-passage");
      passage.dataset.asideHighlight = strong ? "strong" : "faint";
    });
  });

  useEffect(() => {
    const element = innerRef.current;
    if (!element) return;

    const topicsFor = (mark: HTMLElement, ids = rangeIdsFor(mark)) =>
      focusTopicCandidates(relationsRef.current, ids, stacksRef.current);

    let publishedFocusHover = false;
    const paintHover = (ids: number[]) => {
      if (activeRef.current) {
        setFocusHoverRanges(ids.length ? ids.flatMap((id) => {
          const relation = relationsRef.current[id];
          return relation ? [{ start: relation.focusCommentEnd > relation.focusCommentStart ? relation.focusCommentStart : relation.focusStart,
            end: relation.focusCommentEnd > relation.focusCommentStart ? relation.focusCommentEnd : relation.focusEnd }] : [];
        }) : null);
        publishedFocusHover = ids.length > 0;
      }
      directHoverIdsRef.current = ids;
      reconcileMarks();
    };

    const scheduleFeedback = (
      mark: HTMLElement,
      topics: FocusTopicCandidate[],
      ids: number[],
      x: number,
      y: number,
    ) => {
      cancelHoverFeedback();
      if (topics.length === 0) return;
      if (topics.length > 1) {
        pickerTimerRef.current = setTimeout(() => {
          pickerTimerRef.current = null;
          openPicker(mark, topics, false, true, latestPointerRef.current ?? { x, y });
        }, PICKER_DELAY_MS);
        return;
      }
      tooltipTimerRef.current = setTimeout(() => {
        tooltipTimerRef.current = null;
        showTooltip({
          content: (
            <>
              Filter by: <strong>{topics[0].topicKey}</strong>
            </>
          ),
          colors: { text: "#334155", border: "#8abfbd" },
          x,
          y,
        });
        tooltipShownRef.current = true;
      }, TOOLTIP_DELAY_MS);
    };

    const clearHover = () => {
      latestMarkRef.current = null;
      activeBucketRef.current = "";
      suppressedBucketRef.current = "";
      paintHover([]);
      cancelHoverFeedback();
    };

    const cycle = (mark: HTMLElement) => {
      const ids = rangeIdsFor(mark);
      const topics = topicsFor(mark, ids);
      if (topics.length === 0) return;
      const next = nextFocusTopic(
        topics,
        topicInteractionRef.current,
        postId,
        ids,
      );
      if (next) applyTopic(next);
      else clearTopic();
    };

    const onPointerOver = (event: PointerEvent) => {
      hoverPointerTypeRef.current = event.pointerType;
    };

    const onMouseMove = (event: MouseEvent) => {
      // A touch tap's compatibility mouse events are not a hover: they would
      // mute the siblings, cross-highlight the aside, and open a picker on a
      // tap that should only engage the post.
      if (hoverPointerTypeRef.current === "touch") return;
      latestPointerRef.current = { x: event.clientX, y: event.clientY };
      let mark = (event.target as HTMLElement).closest(
        'mark[data-range-ids]',
      ) as HTMLElement | null;
      if (
        !mark
        && latestMarkRef.current
        && pointBridgesInlineRects(
          latestMarkRef.current.getClientRects(),
          event.clientX,
          event.clientY,
        )
      ) {
        mark = latestMarkRef.current;
      }
      if (!mark) {
        suppressedBucketRef.current = "";
        if (!activeBucketRef.current && directHoverIdsRef.current.length === 0) return;
        clearHover();
        return;
      }

      latestMarkRef.current = mark;
      const ids = rangeIdsFor(mark);
      const topics = topicsFor(mark, ids);
      const bucket = ids.join(",");
      if (bucket !== suppressedBucketRef.current) suppressedBucketRef.current = "";
      if (topics.length === 0) {
        // Reply-only passages still cross-highlight even without an aside
        // topic to offer in the picker.
        activeBucketRef.current = bucket;
        paintHover(ids);
        cancelHoverFeedback();
        return;
      }
      if (pickerOpenRef.current) {
        if (bucket !== pickerSourceBucketRef.current) {
          closePicker();
          activeBucketRef.current = bucket;
          paintHover(ids);
          scheduleFeedback(mark, topics, ids, event.clientX, event.clientY);
          return;
        }
        cancelHoverFeedback();
        if (bucket !== activeBucketRef.current) paintHover(ids);
        activeBucketRef.current = bucket;
        return;
      }
      if (event.shiftKey && topics.length > 1) {
        cancelHoverFeedback();
        if (bucket !== activeBucketRef.current || !pickerOpenRef.current) {
          paintHover(ids);
          openPicker(mark, topics, false, true, { x: event.clientX, y: event.clientY });
        }
        activeBucketRef.current = bucket;
        return;
      }
      if (bucket === activeBucketRef.current && directHoverIdsRef.current.length > 0) return;
      activeBucketRef.current = bucket;
      paintHover(ids);
      if (bucket === suppressedBucketRef.current) return;
      scheduleFeedback(mark, topics, ids, event.clientX, event.clientY);
    };

    const onMouseLeave = (event: MouseEvent) => {
      if (event.relatedTarget && element.contains(event.relatedTarget as Node)) return;
      if (
        event.relatedTarget instanceof Element
        && event.relatedTarget.closest('[data-testid="focus-topic-picker"]')
      ) {
        return;
      }
      clearHover();
    };

    const onPointerDown = (event: PointerEvent) => {
      hoverPointerTypeRef.current = event.pointerType;
      // Mobile tap protocol: a tap on a post that is not engaged only engages
      // it. Decided here, before the compatibility mouse events, so mouseup and
      // click agree on it.
      engageTapRef.current = event.pointerType === "touch" && !engagedRef.current;
      const mark = (event.target as HTMLElement).closest('mark[data-range-ids]') as HTMLElement | null;
      if (!mark || topicsFor(mark).length === 0) return;
      lastPointerTypeRef.current = event.pointerType;
      window.getSelection()?.removeAllRanges();
    };

    const onMouseUp = (event: MouseEvent) => {
      // The post body opens the post on mouseup; an engaging tap must not.
      if (engageTapRef.current) event.stopPropagation();
    };

    const onMouseDown = (event: MouseEvent) => {
      const mark = (event.target as HTMLElement).closest('mark[data-range-ids]') as HTMLElement | null;
      if (!mark || topicsFor(mark).length === 0) return;
      // Prevent double/triple-click selection while a phrase is being cycled.
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
    };

    const stopAndOwn = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (engageTapRef.current) {
        engageTapRef.current = false;
        stopAndOwn(event);
        lastPointerTypeRef.current = "";
        engagedRef.current = true;
        setEngaged(true);
        return;
      }
      if (target.closest("a")) return;
      const mark = target.closest('mark[data-range-ids]') as HTMLElement | null;
      if (!mark) return;
      stopAndOwn(event);
      cancelHoverFeedback();
      const ids = rangeIdsFor(mark);
      const topics = topicsFor(mark, ids);
      if (topics.length === 0) return;
      // Only a non-pointer click (detail 0) moves focus. With mousedown's
      // default prevented, a scripted focus after a pointer press matches
      // :focus-visible, which would leave a focus ring and the engagement
      // emphasis stuck on after the pointer has left.
      if (event.detail === 0) mark.focus({ preventScroll: true });
      window.getSelection()?.removeAllRanges();
      const touch = lastPointerTypeRef.current === "touch"
        || lastPointerTypeRef.current === "pen";
      lastPointerTypeRef.current = "";
      suppressedBucketRef.current = ids.join(",");
      if (topics.length > 1 && (event.shiftKey || touch)) {
        openPicker(mark, topics, !touch);
        return;
      }
      if (pickerOpenRef.current) closePicker(true);
      cycle(mark);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const mark = (event.target as HTMLElement).closest(
        'mark[data-range-ids]',
      ) as HTMLElement | null;
      if (!mark) return;
      if (event.key === "Escape") {
        stopAndOwn(event);
        if (pickerOpenRef.current) closePicker();
        else if (
          activeRef.current
          && topicInteractionRef.current?.origin === "focus"
          && topicInteractionRef.current.anchor.postId === postId
        ) {
          clearTopic();
        }
        return;
      }
      const topics = topicsFor(mark);
      if (
        topics.length > 1
        && (
          event.key === "ArrowDown"
          || event.key === "ArrowUp"
          || ((event.key === "Enter" || event.key === " ") && event.shiftKey)
        )
      ) {
        stopAndOwn(event);
        openPicker(mark, topics, true);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        stopAndOwn(event);
        cycle(mark);
      }
    };

    const onOutsidePointerMove = (event: PointerEvent) => {
      if (directHoverIdsRef.current.length > 0 && !pickerOpenRef.current
        && event.target instanceof Node && !element.contains(event.target)) {
        clearHover();
      }
    };
    document.addEventListener("pointermove", onOutsidePointerMove);
    element.addEventListener("pointerover", onPointerOver, true);
    element.addEventListener("pointermove", onPointerOver, true);
    element.addEventListener("mouseup", onMouseUp, true);
    element.addEventListener("mousemove", onMouseMove);
    element.addEventListener("mouseover", onMouseMove);
    element.addEventListener("mouseleave", onMouseLeave);
    element.addEventListener("pointerdown", onPointerDown, true);
    element.addEventListener("mousedown", onMouseDown, true);
    element.addEventListener("click", onClick, true);
    element.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointermove", onOutsidePointerMove);
      if (publishedFocusHover) setFocusHoverRanges(null);
      element.removeEventListener("pointerover", onPointerOver, true);
      element.removeEventListener("pointermove", onPointerOver, true);
      element.removeEventListener("mouseup", onMouseUp, true);
      element.removeEventListener("mousemove", onMouseMove);
      element.removeEventListener("mouseover", onMouseMove);
      element.removeEventListener("mouseleave", onMouseLeave);
      element.removeEventListener("pointerdown", onPointerDown, true);
      element.removeEventListener("mousedown", onMouseDown, true);
      element.removeEventListener("click", onClick, true);
      element.removeEventListener("keydown", onKeyDown, true);
      cancelHoverFeedback();
    };
  }, [
    applyTopic,
    cancelHoverFeedback,
    clearTopic,
    closePicker,
    openPicker,
    postId,
    reconcileMarks,
  ]);

  // An engaged post (mobile) disengages on a tap outside its text, or once it
  // scrolls out of view. The topic picker a phrase tap opened counts as part
  // of the text, so choosing from it keeps the emphasis on.
  useEffect(() => {
    const element = innerRef.current;
    if (!engaged || !element) return;
    const disengage = () => {
      engagedRef.current = false;
      setEngaged(false);
    };
    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || element.contains(target)) return;
      if (target instanceof Element && target.closest('[data-testid="focus-topic-picker"]')) return;
      disengage();
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) disengage();
    });
    observer.observe(element);
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    };
  }, [engaged]);

  // A related-card hover reveals its passage here. The store keeps the last
  // hovered relations after the pointer leaves; they stay revealed only for
  // HOVER_RELEASE_MS, after which the post returns to its original view. With
  // restoring switched off (Shift+R), the last passage stays revealed until
  // the next hover replaces it. A tapped card (touch) has no leave, so it
  // holds until the reader taps away.
  const restoreOnLeave = useHoverRestore();
  const liveHover = Boolean(hoveredRelations?.length)
    && (sidebarHoverActive || (tappedCardPostId !== null && tappedCardPostId === hoveredPostId));
  const [hoverReleased, setHoverReleased] = useState(!liveHover);
  useEffect(() => {
    if (liveHover) {
      setHoverReleased(false);
      return;
    }
    if (!restoreOnLeave) return;
    const timer = window.setTimeout(() => setHoverReleased(true), HOVER_RELEASE_MS);
    return () => window.clearTimeout(timer);
  }, [liveHover, restoreOnLeave]);
  const hoverRevealed = Boolean(hoveredRelations?.length) && (liveHover || !hoverReleased);
  const hoverRevealRef = useRef(false);
  const preHoverScrollRef = useRef(0);
  const leadRef = useRef<HTMLSpanElement | null>(null);
  const coveredRef = useRef<Range | null>(null);
  // Show or hide the leading ellipsis for the window's current scroll.
  const syncLeadingEllipsis = useCallback(() => {
    const element = innerRef.current;
    const lead = leadRef.current;
    const highlight = coveredHighlight();
    if (coveredRef.current) highlight?.delete(coveredRef.current);
    coveredRef.current = element && lead ? placeLeadingEllipsis(element, lead) : null;
    if (!coveredRef.current) return;
    // Without the highlight API the ellipsis paints an opaque box instead.
    if (highlight) highlight.add(coveredRef.current);
    else lead?.setAttribute("data-opaque", "");
  }, []);
  useEffect(() => () => {
    if (coveredRef.current) coveredHighlight()?.delete(coveredRef.current);
  }, []);

  // Preserve the existing fixed-height reveal: when an aside hover, restored
  // focus topic, or legacy passage targets text below the clamp, the prose moves
  // inside its original height instead of expanding the card.
  const revealIndices = useMemo(() => {
    if (!active || isTextExpanded) return [];
    if (hoverRevealed && hoveredRelations?.length) {
      let source = hoveredRelations;
      if (
        hoveredHighlightRangeIndex != null
        && hoveredRelations[hoveredHighlightRangeIndex]
      ) source = [hoveredRelations[hoveredHighlightRangeIndex]];
      else if (hoveredCategory) {
        const matches = hoveredRelations.filter((relation) => relation.category === hoveredCategory);
        if (matches.length > 0) source = matches;
      }
      return focusRelations.flatMap((relation, index) =>
        source.some((candidate) => {
          const sourceStart = candidate.focusCommentEnd > candidate.focusCommentStart ? candidate.focusCommentStart : candidate.focusStart;
          const sourceEnd = candidate.focusCommentEnd > candidate.focusCommentStart ? candidate.focusCommentEnd : candidate.focusEnd;
          const start = relation.focusCommentEnd > relation.focusCommentStart ? relation.focusCommentStart : relation.focusStart;
          const end = relation.focusCommentEnd > relation.focusCommentStart ? relation.focusCommentEnd : relation.focusEnd;
          return sourceStart < end && start < sourceEnd;
        }) ? [index] : [],
      );
    }
    if (selectedIndex !== null) return [selectedIndex];
    if (responseFilter) {
      return focusRelations.flatMap((relation, index) =>
        relation.focusStart < responseFilter.end
        && responseFilter.start < relation.focusEnd ? [index] : [],
      );
    }
    return [];
  }, [
    active,
    focusRelations,
    hoveredCategory,
    hoveredHighlightRangeIndex,
    hoveredRelations,
    hoverRevealed,
    isTextExpanded,
    responseFilter,
    selectedIndex,
  ]);
  const revealKey = revealIndices.join(",");

  useLayoutEffect(() => { setScrollWindowHeight(null); }, [style?.WebkitLineClamp, style?.fontSize]);

  useLayoutEffect(() => {
    const element = innerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setTextWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = innerRef.current;
    if (!element) return;
    // Ending a hover returns the window to where it stood before the hover
    // began: the post's opening, or wherever the reader's selection had it.
    const wasHoverReveal = hoverRevealRef.current;
    hoverRevealRef.current = hoverRevealed;
    if (hoverRevealed && !wasHoverReveal) preHoverScrollRef.current = element.scrollTop;
    if (!revealKey) {
      element.style.clipPath = "";
      delete element.dataset.revealPaintBottom;
      if (element.scrollTop > 0) element.scrollTop = 0;
      setScrollWindowHeight(null);
      syncLeadingEllipsis();
      return;
    }
    const ids = new Set(revealIndices.map(String));
    const candidates = Array.from(element.querySelectorAll<HTMLElement>('mark[data-range-ids]'));
    const targetRelation = hoverRevealed ? hoveredRelations?.[hoveredHighlightRangeIndex ?? 0] : undefined;
    const segmentsWithin = (start: number, end: number) =>
      Array.from(element.querySelectorAll<HTMLElement>("[data-fs]")).filter((segment) =>
        Number(segment.dataset.fs) < end && start < Number(segment.dataset.fe));
    // A hovered relation reveals its whole passage (the wash, rendered as many
    // segments split at every relation boundary) and, above all, the key phrase
    // bolded inside it.
    let segments: HTMLElement[] = [];
    let keySegments: HTMLElement[] = [];
    if (targetRelation) {
      const { focusStart, focusEnd, focusCommentStart, focusCommentEnd } = targetRelation;
      const hasKey = focusCommentEnd > focusCommentStart;
      if (hasKey) keySegments = segmentsWithin(focusCommentStart, focusCommentEnd);
      segments = segmentsWithin(
        hasKey ? Math.min(focusStart, focusCommentStart) : focusStart,
        hasKey ? Math.max(focusEnd, focusCommentEnd) : focusEnd,
      );
    }
    if (!segments.length) {
      const first = candidates.find((candidate) => rangeIdsFor(candidate).some((id) => ids.has(String(id))));
      const id = first && rangeIdsFor(first).find((rangeId) => ids.has(String(rangeId)));
      if (id != null) segments = candidates.filter((candidate) => rangeIdsFor(candidate).includes(id));
    }
    if (!segments.length) return;
    const elementRect = element.getBoundingClientRect();
    // Measure glyphs, not segment boxes: the passage wash pads every segment
    // past its line, so a passage on the first or last line read as cut off
    // and opened a window (and a "Read more") on a post that fits.
    const visibilityRange = document.createRange();
    const fullyVisible = segments.every((segment) => {
      if (!segment.textContent?.trim()) return true;
      visibilityRange.selectNodeContents(segment);
      const rects = Array.from(visibilityRange.getClientRects()).filter((rect) => rect.width > 0);
      return rects.length > 0 && rects.every((rect) =>
        rect.top >= elementRect.top - 0.5 && rect.bottom <= elementRect.bottom + 0.5);
    });
    if (scrollWindowHeight === null) {
      // Keyboard focus and browser scrollIntoView can scroll overflow:hidden
      // text before the topic click arrives. WebKit's clamped paragraphs still
      // have truncated layout boxes there, so reveal them in normal block flow.
      if (!fullyVisible || element.scrollTop > 0) setScrollWindowHeight(Math.max(1, elementRect.height));
      syncLeadingEllipsis();
      return;
    }
    if (wasHoverReveal && !hoverRevealed) element.scrollTop = preHoverScrollRef.current;
    const computed = window.getComputedStyle(element);
    const lineHeight = Number.parseFloat(computed.lineHeight)
      || Number.parseFloat(computed.fontSize) * 1.5;
    const leadingOf = (rect: DOMRect) => Math.max(0, (lineHeight - rect.height) / 2);
    const toContent = (y: number) => y - elementRect.top + element.scrollTop;
    // Measure glyphs, not mark boxes: highlight padding must never affect the
    // reading window.
    const range = document.createRange();
    const glyphsOf = (elements: HTMLElement[]) => elements.flatMap((segment) => {
      range.selectNodeContents(segment);
      return Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
    });
    const extentOf = (rects: DOMRect[]) => ({
      top: Math.min(...rects.map((rect) => toContent(rect.top) - leadingOf(rect))),
      bottom: Math.max(...rects.map((rect) => toContent(rect.bottom) + leadingOf(rect))),
    });
    const glyphs = glyphsOf(segments);
    if (!glyphs.length) return;
    const keyGlyphs = glyphsOf(keySegments);
    const lineTops: number[] = [];
    const lineWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let text = lineWalker.nextNode(); text; text = lineWalker.nextNode()) {
      range.selectNodeContents(text);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0) lineTops.push(toContent(rect.top) - leadingOf(rect));
      }
    }
    lineTops.sort((a, b) => a - b);
    // A post that already fits its window gets 0 here: nothing is worth
    // scrolling to when the whole post was on screen to begin with.
    let target = revealScrollTop(lineTops, extentOf(glyphs), elementRect.height);
    // A passage taller than the window shows only its start; it must never
    // leave the key phrase out of view.
    if (keyGlyphs.length) {
      const key = extentOf(keyGlyphs);
      if (key.bottom > target + elementRect.height + 0.5) {
        target = revealScrollTop(lineTops, key, elementRect.height);
      }
    }
    // A phrase the reader just clicked (or rotated) must not move: when the
    // selected phrase is already wholly inside the window, leave the window
    // where it is.
    const selectionReveal = !hoverRevealed && selectedIndexRef.current !== null;
    const selectedInView = selectionReveal
      && glyphs.every((rect) => rect.top >= elementRect.top - 0.5 && rect.bottom <= elementRect.bottom + 0.5);
    if (!selectedInView) element.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });

    // Paragraph spacing is not necessarily a multiple of the line height.
    // Paint only complete lines at the lower edge, keeping the card's footprint
    // fixed. This clips decoration too, without modifying any text or offsets.
    let paintBottom = elementRect.height;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0 && rect.top < elementRect.bottom && rect.bottom > elementRect.bottom + 0.5) {
          paintBottom = Math.min(paintBottom, Math.max(0, rect.top - elementRect.top - leadingOf(rect)));
        }
      }
    }
    element.style.clipPath = `inset(0 0 ${elementRect.height - paintBottom}px 0)`;
    // Post.tsx anchors the trailing ellipsis to the last line painted here.
    element.dataset.revealPaintBottom = String(paintBottom);
    syncLeadingEllipsis();
  }, [revealIndices, revealKey, scrollWindowHeight, hoveredRelations, hoveredHighlightRangeIndex, hoverRevealed, style?.WebkitLineClamp, style?.fontSize, syncLeadingEllipsis, textWidth]);

  const mergedStyle: React.CSSProperties = scrollWindowHeight !== null
    ? {
        ...style,
        display: "block",
        WebkitLineClamp: "unset",
        textOverflow: "unset",
        overflow: "hidden",
        height: scrollWindowHeight,
        maxHeight: scrollWindowHeight,
        "--reveal-window-height": `${scrollWindowHeight}px`,
      } as React.CSSProperties
    : style;

  // Same condition under which the passage wash below paints this post.
  const asideHover = active && sidebarHoverActive && Boolean(hoveredRelations?.length);

  return (
    <>
      <div className="focus-reveal-shell">
        <div
          ref={setRefs}
          data-testid="focus-reveal"
          data-reveal-window={scrollWindowHeight !== null ? "" : undefined}
          // Emphasis is shown only on engagement (see globals.css): a related
          // card cross-highlighting this post, or a mobile tap engaging it.
          data-aside-hover={asideHover ? "" : undefined}
          data-engaged={engaged ? "" : undefined}
          className={className}
          style={mergedStyle}
          dangerouslySetInnerHTML={innerHtml}
        />
        <span
          ref={leadRef}
          className="focus-window-lead"
          data-testid="focus-window-lead"
          aria-hidden="true"
        >…</span>
      </div>
      {picker ? (
        <FocusTopicPicker
          anchor={picker.anchor}
          anchorElement={picker.anchorElement}
          topics={picker.topics}
          selectedTopic={selectedIndex !== null ? topicInteraction?.topicKey ?? null : null}
          focusOnOpen={picker.focusOnOpen}
          onSelect={(topic) => {
            applyTopic(topic);
            closePicker();
          }}
          onClose={closePickerFromPicker}
          dismissOnPointerLeave={picker.dismissOnPointerLeave}
          ownsPointerDown={ownsPointerDown}
        />
      ) : null}
    </>
  );
});

export default FocusTopicHighlightedContent;
