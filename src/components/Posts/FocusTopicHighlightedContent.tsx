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
} from "../../utils/highlightStore";
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

const TOOLTIP_DELAY_MS = 350;
const PICKER_DELAY_MS = 1200;

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
  anchorElement: HTMLElement;
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
 * Persistent semantic phrases for a focus post. Every authored crux is bold at
 * rest; hovering one phrase mutes its siblings; topic filtering only begins on
 * click (or an explicit picker choice), so hover never mutates either pane.
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
    hoveredRelations,
    sidebarHoverActive,
    hoveredHighlightRangeIndex,
    hoveredCategory,
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
  const latestMarkRef = useRef<HTMLElement | null>(null);
  const lastPointerTypeRef = useRef("");
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipShownRef = useRef(false);
  const pickerOpenRef = useRef(false);
  const pickerSourceBucketRef = useRef("");
  const [picker, setPicker] = useState<PickerState | null>(null);
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

  const closePicker = useCallback(() => {
    directHoverIdsRef.current = [];
    latestMarkRef.current = null;
    setPicker(null);
  }, []);

  const openPicker = useCallback((
    mark: HTMLElement,
    topics: FocusTopicCandidate[],
    focusOnOpen: boolean,
    dismissOnPointerLeave = false,
  ) => {
    if (topics.length <= 1) return;
    const rect = mark.getBoundingClientRect();
    hideTooltip();
    tooltipShownRef.current = false;
    setPicker({
      anchor: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
      anchorElement: mark,
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

  const reconcileMarks = useCallback(() => {
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
  }, [selectedIndex]);

  // dangerouslySetInnerHTML can replace mark nodes after any state update, so
  // semantic attributes and interaction classes are reconciled after each commit.
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
    let activeBucket = "";

    const topicsFor = (mark: HTMLElement, ids = rangeIdsFor(mark)) =>
      focusTopicCandidates(relationsRef.current, ids, stacksRef.current);

    const paintHover = (ids: number[]) => {
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
      tooltipTimerRef.current = setTimeout(() => {
        tooltipTimerRef.current = null;
        const interaction = topicInteractionRef.current;
        const sameHotspot = interaction?.origin === "focus"
          && interaction.anchor.postId === postId
          && ids.includes(interaction.anchor.rangeIndex);
        const foundIndex = sameHotspot
          ? topics.findIndex((topic) => topic.topicKey === interaction.topicKey)
          : 0;
        const topicIndex = Math.max(0, foundIndex);
        const topic = topics[topicIndex] ?? topics[0];
        showTooltip({
          content: (
            <>
              <strong>{topic.topicKey}</strong>
              {" · "}
              {topic.count} {topic.count === 1 ? "post" : "posts"}
              {topics.length > 1 ? " · " + (topicIndex + 1) + " of " + topics.length : ""}
            </>
          ),
          colors: { text: "#334155", border: "#8abfbd" },
          x,
          y,
        });
        tooltipShownRef.current = true;
      }, TOOLTIP_DELAY_MS);
      if (topics.length > 1) {
        pickerTimerRef.current = setTimeout(() => {
          pickerTimerRef.current = null;
          openPicker(mark, topics, false, true);
        }, PICKER_DELAY_MS);
      }
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

    const onMouseMove = (event: MouseEvent) => {
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
        if (!activeBucket && directHoverIdsRef.current.length === 0) return;
        latestMarkRef.current = null;
        activeBucket = "";
        paintHover([]);
        cancelHoverFeedback();
        return;
      }

      latestMarkRef.current = mark;
      const ids = rangeIdsFor(mark);
      const topics = topicsFor(mark, ids);
      if (topics.length === 0) {
        activeBucket = "";
        paintHover([]);
        cancelHoverFeedback();
        return;
      }
      const bucket = ids.join(",");
      if (pickerOpenRef.current) {
        if (bucket !== pickerSourceBucketRef.current) {
          closePicker();
          activeBucket = bucket;
          paintHover(ids);
          scheduleFeedback(mark, topics, ids, event.clientX, event.clientY);
          return;
        }
        cancelHoverFeedback();
        if (bucket !== activeBucket) paintHover(ids);
        activeBucket = bucket;
        return;
      }
      if (event.shiftKey && topics.length > 1) {
        cancelHoverFeedback();
        if (bucket !== activeBucket || !pickerOpenRef.current) {
          paintHover(ids);
          openPicker(mark, topics, false, true);
        }
        activeBucket = bucket;
        return;
      }
      if (bucket === activeBucket && directHoverIdsRef.current.length > 0) return;
      activeBucket = bucket;
      paintHover(ids);
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
      latestMarkRef.current = null;
      activeBucket = "";
      paintHover([]);
      cancelHoverFeedback();
    };

    const onPointerDown = (event: PointerEvent) => {
      const mark = (event.target as HTMLElement).closest('mark[data-range-ids]') as HTMLElement | null;
      if (!mark || topicsFor(mark).length === 0) return;
      lastPointerTypeRef.current = event.pointerType;
      window.getSelection()?.removeAllRanges();
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
      if (target.closest("a")) return;
      const mark = target.closest('mark[data-range-ids]') as HTMLElement | null;
      if (!mark) return;
      stopAndOwn(event);
      cancelHoverFeedback();
      const ids = rangeIdsFor(mark);
      const topics = topicsFor(mark, ids);
      if (topics.length === 0) return;
      mark.focus({ preventScroll: true });
      window.getSelection()?.removeAllRanges();
      const touch = lastPointerTypeRef.current === "touch"
        || lastPointerTypeRef.current === "pen";
      lastPointerTypeRef.current = "";
      if (topics.length > 1 && (event.shiftKey || touch)) {
        openPicker(mark, topics, !touch);
        return;
      }
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

    element.addEventListener("mousemove", onMouseMove);
    element.addEventListener("mouseover", onMouseMove);
    element.addEventListener("mouseleave", onMouseLeave);
    element.addEventListener("pointerdown", onPointerDown, true);
    element.addEventListener("mousedown", onMouseDown, true);
    element.addEventListener("click", onClick, true);
    element.addEventListener("keydown", onKeyDown, true);
    return () => {
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

  // Preserve the existing fixed-height reveal: when an aside hover, restored
  // focus topic, or legacy passage targets text below the clamp, the prose moves
  // inside its original height instead of expanding the card.
  const revealIndices = useMemo(() => {
    if (!active || isTextExpanded) return [];
    if (hoveredRelations?.length) {
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
        source.some((candidate) =>
          candidate.focusStart < relation.focusEnd
          && relation.focusStart < candidate.focusEnd,
        ) ? [index] : [],
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
    isTextExpanded,
    responseFilter,
    selectedIndex,
  ]);
  const revealKey = revealIndices.join(",");

  useLayoutEffect(() => {
    const element = innerRef.current;
    if (!element) return;
    if (!revealKey) {
      if (element.scrollTop > 0) element.scrollTop = 0;
      setScrollWindowHeight(null);
      return;
    }
    const ids = new Set(revealIndices.map(String));
    const mark = (Array.from(
      element.querySelectorAll<HTMLElement>('mark[data-range-ids]'),
    )).find((candidate) =>
      (candidate.getAttribute("data-range-ids") || "")
        .split(/\s+/)
        .some((id) => ids.has(id)),
    );
    if (!mark) return;
    const elementRect = element.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
    const fullyVisible = markRect.top >= elementRect.top
      && markRect.bottom <= elementRect.bottom;
    if (scrollWindowHeight === null) {
      if (!fullyVisible) setScrollWindowHeight(Math.max(1, elementRect.height));
      return;
    }
    const computed = window.getComputedStyle(element);
    const lineHeight = Number.parseFloat(computed.lineHeight)
      || Number.parseFloat(computed.fontSize) * 1.5;
    const markTop = markRect.top - elementRect.top + element.scrollTop;
    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
    const target = Math.min(maxScroll, Math.max(0, Math.floor(markTop / lineHeight) * lineHeight));
    element.scrollTo({ top: target, behavior: "auto" });
  }, [revealIndices, revealKey, scrollWindowHeight]);

  const mergedStyle: React.CSSProperties = scrollWindowHeight !== null
    ? {
        ...style,
        display: "block",
        WebkitLineClamp: "unset",
        textOverflow: "unset",
        overflow: "hidden",
        height: scrollWindowHeight,
        maxHeight: scrollWindowHeight,
      }
    : style;

  return (
    <>
      <div className="focus-reveal-shell">
        <div
          ref={setRefs}
          data-testid="focus-reveal"
          className={className}
          style={mergedStyle}
          dangerouslySetInnerHTML={{ __html: html }}
        />
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
          onClose={closePicker}
          dismissOnPointerLeave={picker.dismissOnPointerLeave}
        />
      ) : null}
    </>
  );
});

export default FocusTopicHighlightedContent;
