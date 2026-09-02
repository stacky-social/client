"use client";

import { useSyncExternalStore } from "react";
import type { Relation } from "../types/PostType";
import {
  reduceInteraction,
  validateTopicInteraction,
  pushUndoEntry,
  ringTopMatchesScope,
  detailFocusIdFromPath,
} from "./highlightStoreCore.mjs";
import { FILTER_HISTORY_CAP, historyWriteMode } from "./filterUrlState.mjs";
// Re-export the pure selectors/topic-key helper so components import them from
// the store surface (the .mjs holds the framework-free, unit-tested logic).
export {
  topicKeyOf,
  relationsMatchTopic,
  asideGrouping,
  asideTopicFilter,
  replyGrouping,
  replyTopicFilter,
} from "./highlightStoreCore.mjs";

// ─── State ──────────────────────────────────────────────────────────────────

/**
 * The single atomic panel-interaction primitive (replaces the anchor-derived
 * `reRankAnchorIds`/`anchoredRangeByPost`/`replyAnchor` model as the *UI
 * interaction* source of truth once T4 migrates the components). Exactly one is
 * active at a time. `origin` is the pane the user clicked; that pane GROUPS by
 * `topicKey` and the other pane is FILTERED by it. `anchor` is the clicked span
 * on the ORIGIN pane.
 */
export interface TopicInteraction {
  origin: "aside" | "replies";
  topicKey: string;
  anchor: { postId: string; rangeIndex: number };
}

interface HighlightState {
  /** ID of the sidebar post currently being hovered (drives focus-post cross-highlighting) */
  hoveredPostId: string | null;
  /** Relations for the hovered post (offset-based substring pairs) */
  hoveredRelations: Relation[] | null;
  /**
   * Whether the pointer/touch is still actively presenting the retained sidebar
   * relation. The relation itself may remain after leave as a semantic reading
   * anchor, but its temporary cross-highlight paint must not.
   */
  sidebarHoverActive: boolean;
  /**
   * Set of categories to filter the sidebar by (empty = show all).
   * Multiple categories use AND semantics — a post must carry EVERY active
   * category to survive (see decideFilterMode in RelatedStacks and
   * threadFilter.mjs; URL_SCHEMA.md documents the same for `fc`).
   */
  filterCategories: Set<string>;
  /** Level 2: which specific substring within the hovered card is being hovered (index into bracket pairs) */
  hoveredHighlightRangeIndex: number | null;
  /**
   * Reverse cross-highlight (focus → aside): the union of relation focus-ranges
   * under the cursor while a FOCUS-POST span is hovered. The related cards
   * brighten their spans whose relations overlap these ranges and dim the rest
   * (the paper's "hovering an A span highlights the corresponding B spans,
   * temporarily dimming other B spans"). Null when no focus span is hovered.
   */
  focusHoverRanges: Array<{ start: number; end: number }> | null;
  /** Category tag hover: when set, all ranges of this category behave as hovered (within the hovered card) */
  hoveredCategory: string | null;
  /** Touch: card that has been tapped-to-activate (sticky until tapped elsewhere or tapped again for rerank) */
  tappedCardPostId: string | null;
  /** Touch: range within the tapped card that is active (sticky) */
  tappedRangeIndex: number | null;
  /** "More like this" anchor post IDs for nested re-ranking (ordered by when added) */
  reRankAnchorIds: string[];
  /** Which highlight range triggered each anchor (postId -> rangeIndex) */
  anchoredRangeByPost: Record<string, number>;
  /**
   * "Responses to" filter: a passage of the focus post was clicked — filter the
   * sidebar to stacks whose relations overlap this passage (the posts responding
   * to it). Carries the text snippet so RelatedStacks can render the label and
   * compute the shortest-common phrase without the full focus post text.
   */
  responseFilter: { start: number; end: number; text: string } | null;
  /**
   * Left-pane anchor: the thread reply whose contribution span was clicked.
   * Reranks the reply list in place (mirrors reRankAnchorIds for the aside).
   * Topic grouping is SYMMETRIC: one topic groups BOTH panes (each reranks in
   * place around its own anchor) — the panes' anchors are kept in sync by the
   * thread page, and neither pane is ever filtered by a topic.
   */
  replyAnchor: { replyId: string; rangeIndex: number } | null;
  /**
   * Topic → count of currently displayed thread replies carrying that topic.
   * Published by the thread page so the related panel's "N more <topic>"
   * tooltips can count across both panes.
   */
  replyTopicCounts: Record<string, number>;
  /**
   * Atomic panel-interaction primitive (see {@link TopicInteraction}). Added
   * alongside the legacy anchor fields; T4 migrates the components onto it and
   * retires the legacy fields. Set/cleared only through the atomic actions
   * (`activateAsideTopic`/`activateReplyTopic`/`setCategoryFilter`/
   * `setPassageFilter`/`clearTopicInteraction`/`clearAll`) so replace-not-stack
   * holds: activating any dimension clears the others.
   */
  topicInteraction: TopicInteraction | null;
  /**
   * The visible related-panel order captured just before the current
   * interaction began, so a Back-undo can restore the exact prior view (WS6).
   * T3 defines the field + persistence; T6 wires the capture path that
   * populates it.
   */
  baseOrderIds: string[];
  /**
   * The reply pane's counterpart to `baseOrderIds`: the last cluster-arranged
   * top-level order, written through while a reply cluster is active so that
   * DISMISSING the cluster leaves replies in place (permanence rule). Empty ⇒
   * order derives from the active sort tab; a tab switch (explicit re-sort)
   * clears it. Snapshotted/restored with the panel like the aside's base.
   */
  replyBaseOrderIds: string[];
}

const INITIAL: HighlightState = {
  hoveredPostId: null,
  hoveredRelations: null,
  sidebarHoverActive: false,
  filterCategories: new Set(),
  hoveredHighlightRangeIndex: null,
  focusHoverRanges: null,
  hoveredCategory: null,
  tappedCardPostId: null,
  tappedRangeIndex: null,
  reRankAnchorIds: [],
  anchoredRangeByPost: {},
  responseFilter: null,
  replyAnchor: null,
  replyTopicCounts: {},
  topicInteraction: null,
  baseOrderIds: [],
  replyBaseOrderIds: [],
};

// ─── Module-level store ─────────────────────────────────────────────────────

let state: HighlightState = { ...INITIAL };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

// ─── Actions ────────────────────────────────────────────────────────────────

export function setHoveredSidebarPost(
  postId: string | null,
  relations?: Relation[] | null,
): void {
  const nextActive = postId !== null;
  if (state.hoveredPostId === postId && state.sidebarHoverActive === nextActive) return;
  state = {
    ...state,
    hoveredPostId: postId,
    hoveredRelations: postId ? (relations ?? null) : null,
    sidebarHoverActive: nextActive,
    hoveredHighlightRangeIndex: null,
  };
  notify();
}

/** End only the transient aside→focus paint. The last relation/range/category
 * stays retained so the focus post keeps its exact reading position. */
export function setSidebarHoverActive(active: boolean): void {
  if (state.sidebarHoverActive === active) return;
  state = { ...state, sidebarHoverActive: active };
  notify();
}

export function setHoveredHighlightRangeIndex(index: number | null): void {
  if (state.hoveredHighlightRangeIndex === index) return;
  state = { ...state, hoveredHighlightRangeIndex: index };
  notify();
}

export function setHoveredCategory(category: string | null): void {
  if (state.hoveredCategory === category) return;
  state = { ...state, hoveredCategory: category };
  notify();
}

/** Publish/clear the hovered focus-post span union (reverse cross-highlight,
 *  focus → aside). Bails when the ranges are unchanged so the caller can fire
 *  it freely from mousemove-driven code without re-render churn. */
export function setFocusHoverRanges(
  ranges: Array<{ start: number; end: number }> | null,
): void {
  const prev = state.focusHoverRanges;
  if (prev === null && ranges === null) return;
  if (
    prev !== null &&
    ranges !== null &&
    prev.length === ranges.length &&
    prev.every((r, i) => r.start === ranges[i].start && r.end === ranges[i].end)
  ) {
    return;
  }
  state = { ...state, focusHoverRanges: ranges };
  notify();
}

export function setTapped(postId: string | null, rangeIndex: number | null = null): void {
  if (state.tappedCardPostId === postId && state.tappedRangeIndex === rangeIndex) return;
  state = { ...state, tappedCardPostId: postId, tappedRangeIndex: rangeIndex };
  notify();
}

export function clearTapped(): void {
  if (state.tappedCardPostId === null && state.tappedRangeIndex === null) return;
  state = { ...state, tappedCardPostId: null, tappedRangeIndex: null };
  notify();
}

/**
 * Toggle a post as an anchor. Optionally records which highlight range triggered it.
 *
 * Single-anchor invariant: at most one anchor is active at any time.
 * - Toggling the same anchor that is already active clears it (empty state).
 * - Selecting a different anchor while one is active replaces the old one entirely;
 *   the old anchor and its anchoredRangeByPost entry are removed before the new one
 *   is added. reRankAnchorIds.length is therefore always 0 or 1.
 */
export function toggleReRankAnchor(postId: string, rangeIndex?: number): void {
  const idx = state.reRankAnchorIds.indexOf(postId);
  if (idx >= 0) {
    // Same anchor toggled again — clear it.
    const { [postId]: _, ...rest } = state.anchoredRangeByPost;
    state = { ...state, reRankAnchorIds: [], anchoredRangeByPost: rest };
  } else {
    // New anchor selected — replace any existing anchor entirely.
    const newAnchored = rangeIndex !== undefined ? { [postId]: rangeIndex } : {};
    state = { ...state, reRankAnchorIds: [postId], anchoredRangeByPost: newAnchored };
  }
  notify();
}

/** Non-toggle setter: make `postId` THE anchor (used by the thread page to sync
 *  the related panel's grouping to a reply-initiated topic group). */
export function setReRankAnchor(postId: string, rangeIndex: number): void {
  if (
    state.reRankAnchorIds.length === 1 &&
    state.reRankAnchorIds[0] === postId &&
    state.anchoredRangeByPost[postId] === rangeIndex
  ) return;
  state = { ...state, reRankAnchorIds: [postId], anchoredRangeByPost: { [postId]: rangeIndex } };
  notify();
}

export function clearReRankAnchors(): void {
  if (state.reRankAnchorIds.length === 0) return;
  state = { ...state, reRankAnchorIds: [], anchoredRangeByPost: {} };
  notify();
}

/** Toggle a thread reply as the left-pane anchor (reranks replies in place). */
export function toggleReplyAnchor(replyId: string, rangeIndex: number): void {
  if (state.replyAnchor?.replyId === replyId && state.replyAnchor.rangeIndex === rangeIndex) {
    state = { ...state, replyAnchor: null };
  } else {
    state = { ...state, replyAnchor: { replyId, rangeIndex } };
  }
  notify();
}

/** Non-toggle setter for the reply anchor (thread-page grouping sync). */
export function setReplyAnchor(anchor: { replyId: string; rangeIndex: number } | null): void {
  const same =
    (anchor === null && state.replyAnchor === null) ||
    (anchor !== null &&
      state.replyAnchor?.replyId === anchor.replyId &&
      state.replyAnchor.rangeIndex === anchor.rangeIndex);
  if (same) return;
  state = { ...state, replyAnchor: anchor };
  notify();
}

export function clearReplyAnchor(): void {
  if (state.replyAnchor === null) return;
  state = { ...state, replyAnchor: null };
  notify();
}

/** Publish reply-topic counts (thread page → related panel tooltips). */
export function setReplyTopicCounts(counts: Record<string, number>): void {
  const prev = state.replyTopicCounts;
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(counts);
  if (prevKeys.length === nextKeys.length && nextKeys.every((k) => prev[k] === counts[k])) return;
  state = { ...state, replyTopicCounts: counts };
  notify();
}

/** Directly set the filter categories set. Pass an empty Set to clear all filters. */
export function setFilterCategories(cats: Set<string>): void {
  state = { ...state, filterCategories: new Set(cats) };
  notify();
}

/**
 * @deprecated Use setFilterCategories. Kept for backward compatibility.
 * Sets a single category filter (replaces any existing selection).
 */
export function setFilterCategory(category: string | null): void {
  state = { ...state, filterCategories: category ? new Set([category]) : new Set() };
  notify();
}

/**
 * Single-category toggle for StackCount and legacy callers.
 * Clicking the active category clears the filter; clicking a new one REPLACES.
 */
export function toggleFilterCategory(category: string): void {
  const active = state.filterCategories;
  const next = active.has(category) && active.size === 1 ? new Set<string>() : new Set([category]);
  state = { ...state, filterCategories: next };
  notify();
}

// ─── Atomic panel-interaction actions (replace-not-stack) ────────────────────
// The single entry point onto `topicInteraction` + the two filter dimensions.
// Every action fires ONE notification and, via reduceInteraction, clears the
// dimensions it does not set — so exactly one interaction is ever active. T4
// routes chip clicks, span clicks, URL hydration, and per-focus restore through
// these (never the legacy primitive setters) so the invariant can't leak.

/** Apply an interaction transition: reduce the three-dimension slice and merge
 *  it back into state in one notified update. */
function applyInteraction(action: Parameters<typeof reduceInteraction>[1]): void {
  const dims = reduceInteraction(
    {
      topicInteraction: state.topicInteraction,
      filterCategories: state.filterCategories,
      responseFilter: state.responseFilter,
    },
    action,
  );
  state = {
    ...state,
    topicInteraction: dims.topicInteraction,
    filterCategories: dims.filterCategories,
    responseFilter: dims.responseFilter,
  };
  notify();
}

/** Group the aside by a clicked card span; filters the reply pane by the same
 *  topic. Clears any category/passage filter. */
export function activateAsideTopic(payload: {
  topicKey: string;
  anchor: { postId: string; rangeIndex: number };
}): void {
  applyInteraction({ type: "asideTopic", topicKey: payload.topicKey, anchor: payload.anchor });
}

/** Cluster the reply list by a clicked reply span; filters the aside by the same
 *  topic. Clears any category/passage filter. */
export function activateReplyTopic(payload: {
  topicKey: string;
  anchor: { postId: string; rangeIndex: number };
}): void {
  applyInteraction({ type: "replyTopic", topicKey: payload.topicKey, anchor: payload.anchor });
}

/** Set the category filter across both panes; clears any topic/passage interaction. */
export function setCategoryFilter(cats: Set<string> | string[]): void {
  applyInteraction({ type: "category", cats: Array.from(cats) });
}

/** Set the passage ("responses to") filter; clears any topic/category interaction. */
export function setPassageFilter(span: { start: number; end: number; text: string }): void {
  applyInteraction({ type: "passage", span });
}

/** Clear only the topic interaction (leaves any filter untouched). */
export function clearTopicInteraction(): void {
  applyInteraction({ type: "clearTopic" });
}

/** Clear every interaction dimension (topic + category + passage) at once. */
export function clearAll(): void {
  applyInteraction({ type: "clearAll" });
}

export function resetHighlightStore(): void {
  state = { ...INITIAL, filterCategories: new Set(), responseFilter: null };
  notify();
}

// ─── Per-focus-post panel persistence ───────────────────────────────────────
// Grouping + category/"responses to" filters are scoped to the focus post they were made
// on. Snapshotting them per focus id lets navigation (back button, a feed post →
// its full view, scrolling between focus posts) restore the work the user did in
// the related panel instead of clearing it. In-memory, so it survives SPA
// navigation within the session (a hard refresh starts fresh).

interface PanelSnapshot {
  filterCategories: string[];
  reRankAnchorIds: string[];
  anchoredRangeByPost: Record<string, number>;
  responseFilter: { start: number; end: number; text: string } | null;
  replyAnchor: { replyId: string; rangeIndex: number } | null;
  /** Atomic interaction primitive (see {@link TopicInteraction}); restored with
   *  validation on focus switch (dropped whole if the anchor/topic is gone). */
  topicInteraction: TopicInteraction | null;
  /** Pre-interaction visible order, for Back-undo restore (WS6). T6 wires the
   *  capture; T3 persists whatever `state.baseOrderIds` holds. */
  baseOrderIds: string[];
  /** Reply-pane permanent order (see {@link HighlightState.replyBaseOrderIds}). */
  replyBaseOrderIds: string[];
}

const panelStateByFocus = new Map<string, PanelSnapshot>();
let currentPanelFocusId: string | null = null;

// Related-panel VIEWPORT, scoped per focus post (kept separate from the filter
// snapshot so it can be updated live on every scroll, not only on focus switch).
// The semantic card anchor survives pagination, card-height changes, and panel
// resizing more reliably than a raw pixel offset alone. `scrollTop` remains the
// fallback when that card is no longer present after a data/filter change.
export interface PanelViewportSnapshot {
  scrollTop: number;
  anchorPostId: string | null;
  anchorOffset: number;
  visibleCardCount: number;
}

const panelViewportByFocus = new Map<string, PanelViewportSnapshot>();
const panelViewportStorageKey = (focusId: string) => `crossweave:related-viewport:${focusId}`;

export function savePanelViewport(
  focusId: string | null,
  viewport: PanelViewportSnapshot,
): void {
  if (!focusId) return;
  panelViewportByFocus.set(focusId, {
    scrollTop: Math.max(0, viewport.scrollTop),
    anchorPostId: viewport.anchorPostId,
    anchorOffset: viewport.anchorOffset,
    visibleCardCount: Math.max(1, Math.trunc(viewport.visibleCardCount)),
  });
  // Back/forward can recreate the App Router subtree (and a hard reload should
  // not erase the reader's place either), so mirror the small in-memory record
  // into this tab's session storage. Never use localStorage: another visit or
  // tab should still begin at the top unless it has its own navigation history.
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        panelViewportStorageKey(focusId),
        JSON.stringify(panelViewportByFocus.get(focusId)),
      );
    } catch {
      // Storage can be unavailable in restricted/private browsing. The module
      // cache remains a fully functional fallback for ordinary SPA navigation.
    }
  }
}

export function getPanelViewport(focusId: string | null): PanelViewportSnapshot | null {
  if (focusId == null) return null;
  const inMemory = panelViewportByFocus.get(focusId);
  if (inMemory) return inMemory;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(panelViewportStorageKey(focusId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelViewportSnapshot>;
    if (typeof parsed.scrollTop !== 'number' || typeof parsed.visibleCardCount !== 'number') return null;
    const restored: PanelViewportSnapshot = {
      scrollTop: Math.max(0, parsed.scrollTop),
      anchorPostId: typeof parsed.anchorPostId === 'string' ? parsed.anchorPostId : null,
      anchorOffset: typeof parsed.anchorOffset === 'number' ? parsed.anchorOffset : 0,
      visibleCardCount: Math.max(1, Math.trunc(parsed.visibleCardCount)),
    };
    panelViewportByFocus.set(focusId, restored);
    return restored;
  } catch {
    return null;
  }
}

/** Record the related-panel scroll offset for a focus post (called on scroll). */
export function savePanelScroll(focusId: string | null, scrollTop: number): void {
  if (!focusId) return;
  const previous = panelViewportByFocus.get(focusId);
  savePanelViewport(focusId, {
    scrollTop,
    anchorPostId: previous?.anchorPostId ?? null,
    anchorOffset: previous?.anchorOffset ?? 0,
    visibleCardCount: previous?.visibleCardCount ?? 10,
  });
}

/** Read the saved related-panel scroll offset for a focus post (0 if none). */
export function getPanelScroll(focusId: string | null): number {
  return getPanelViewport(focusId)?.scrollTop ?? 0;
}

function snapshotPanel(): PanelSnapshot {
  return {
    filterCategories: Array.from(state.filterCategories),
    reRankAnchorIds: [...state.reRankAnchorIds],
    anchoredRangeByPost: { ...state.anchoredRangeByPost },
    responseFilter: state.responseFilter,
    replyAnchor: state.replyAnchor,
    topicInteraction: state.topicInteraction,
    baseOrderIds: [...state.baseOrderIds],
    replyBaseOrderIds: [...state.replyBaseOrderIds],
  };
}

/**
 * Tell the store which focus post the related panel is showing. Saves the
 * outgoing post's grouping/filters and restores the incoming post's (or resets
 * to a clean panel if it has none). No-op when the focus id is unchanged, so it
 * is safe to call on every render/effect. Transient hover/tap state always
 * resets on a real switch.
 *
 * `resolveTopicKey` (optional) validates a restored `topicInteraction` against
 * the incoming focus's current data: it returns the topic key that currently
 * lives at the interaction's anchor (or null if that span is gone). The whole
 * interaction is dropped unless the anchor still resolves to the same key —
 * never a partial restore. When omitted (e.g. legacy callers), a saved
 * interaction is restored as-is; T4 passes the resolver from the components.
 * The interaction's `origin` is forwarded so the resolver can route an
 * aside-origin anchor against the related cards and a reply-origin anchor
 * against the thread's reply relations (T7).
 */
export function setPanelFocus(
  focusId: string | null,
  resolveTopicKey?: (
    anchor: { postId: string; rangeIndex: number },
    origin?: "aside" | "replies",
  ) => string | null | undefined,
): void {
  if (focusId === currentPanelFocusId) return;
  if (currentPanelFocusId) {
    panelStateByFocus.set(currentPanelFocusId, snapshotPanel());
  }
  currentPanelFocusId = focusId;
  const saved = focusId ? panelStateByFocus.get(focusId) : undefined;
  // The @aside parallel route can mount after the detail page's passive URL
  // hydration. In that order, a normal focus restore must not overwrite the
  // explicit shared filter that is already live in the store. If the URL owns
  // an interaction, useUrlSync will finish (or has finished) hydrating it.
  const urlOwnsInteraction =
    typeof window !== "undefined" &&
    ["fc", "fs", "ft", "fo", "fa", "fi"].some((key) =>
      new URLSearchParams(window.location.search).has(key),
    );
  // A span click on a non-focused post focuses it AND filters by that span. The
  // filter is stashed as "pending" and applied here — after the saved-panel
  // restore that would otherwise wipe it on the focus switch.
  let incomingResponseFilter = urlOwnsInteraction
    ? state.responseFilter
    : saved
      ? saved.responseFilter
      : null;
  // Restore the atomic interaction, validated against the incoming focus data.
  let incomingTopicInteraction = urlOwnsInteraction
    ? state.topicInteraction
    : saved
    ? resolveTopicKey
      ? validateTopicInteraction(saved.topicInteraction, resolveTopicKey)
      : saved.topicInteraction
    : null;
  const appliesPendingPassage = !!pendingResponseFilter && pendingResponseFilter.postId === focusId;
  if (appliesPendingPassage && pendingResponseFilter) {
    incomingResponseFilter = pendingResponseFilter.span;
    pendingResponseFilter = null;
    // A fresh passage filter is the active interaction — replace-not-stack means
    // it supersedes any topic interaction that would otherwise be restored.
    incomingTopicInteraction = null;
  }
  state = {
    ...state,
    filterCategories: appliesPendingPassage
      ? new Set()
      : urlOwnsInteraction
      ? new Set(state.filterCategories)
      : saved
        ? new Set(saved.filterCategories)
        : new Set(),
    reRankAnchorIds: saved ? [...saved.reRankAnchorIds] : [],
    anchoredRangeByPost: saved ? { ...saved.anchoredRangeByPost } : {},
    responseFilter: incomingResponseFilter,
    replyAnchor: saved ? saved.replyAnchor : null,
    topicInteraction: incomingTopicInteraction,
    baseOrderIds: saved ? [...saved.baseOrderIds] : [],
    replyBaseOrderIds: saved ? [...(saved.replyBaseOrderIds ?? [])] : [],
    // reply-topic counts are re-published by the incoming thread page
    replyTopicCounts: {},
    // transient view state never persists across a focus switch
    hoveredPostId: null,
    hoveredRelations: null,
    sidebarHoverActive: false,
    hoveredHighlightRangeIndex: null,
    hoveredCategory: null,
    tappedCardPostId: null,
    tappedRangeIndex: null,
  };
  notify();
}

/** D2: Set the span filter from a clicked focus-post mark. */
export function setResponseFilter(span: { start: number; end: number; text: string }): void {
  state = { ...state, responseFilter: span };
  notify();
}

/** D2: Clear the span filter. */
export function clearResponseFilter(): void {
  if (state.responseFilter === null) return;
  state = { ...state, responseFilter: null };
  notify();
}

// Span clicked on a NON-focused post: that post is about to become the focus, so
// stash the requested "Responses to" span and let setPanelFocus apply it once the
// focus switches (it would otherwise be wiped by the saved-panel restore).
let pendingResponseFilter: { postId: string; span: { start: number; end: number; text: string } } | null = null;

export function setPendingResponseFilter(postId: string, span: { start: number; end: number; text: string }): void {
  pendingResponseFilter = { postId, span };
}

// ─── Reply-topic resolver (detail page → aside restore validation) ──────────
// The aside (RelatedStacks) owns the single `setPanelFocus` call, so it runs
// the restore validation for BOTH panes' interactions — but it only knows the
// related-card anchors, not the thread's reply relations. The detail page
// registers a resolver here so an aside-run validation of a restored
// REPLY-origin interaction can resolve its anchor against the current thread's
// reply relations (else the interaction is wrongly dropped, T4/T7 seam).
let _replyTopicResolver:
  | ((anchor: { postId: string; rangeIndex: number }) => string | null | undefined)
  | null = null;

export function registerReplyTopicResolver(
  fn: ((anchor: { postId: string; rangeIndex: number }) => string | null | undefined) | null,
): void {
  _replyTopicResolver = fn;
}

/** Resolve a reply-origin anchor's current topic key via the registered detail
 *  page resolver (null when no thread is mounted or the span is gone). */
export function resolveReplyTopicKey(anchor: { postId: string; rangeIndex: number }): string | null {
  return (_replyTopicResolver ? _replyTopicResolver(anchor) : null) ?? null;
}

// ─── Navigation callback (shared between page and aside parallel routes) ────

let _navigateCallback: ((postId: string) => void) | null = null;

export function registerNavigateCallback(cb: ((postId: string) => void) | null): void {
  _navigateCallback = cb;
}

export function triggerNavigate(postId: string): void {
  if (_navigateCallback) _navigateCallback(postId);
}

// ─── Shareable Back-button filter history ───────────────────────────────────
// Detail-route only. Every genuine filter transition gets a real URL entry and
// a matching in-memory snapshot (for exact base-order restoration). The stack
// is capped at 24. Once full, further transitions replace the newest browser
// entry, preventing an unbounded trail; after Back frees a slot, Push resumes.

export interface PanelScope {
  pathname: string;
  focusId: string;
}

interface UndoEntry {
  pathname: string;
  focusId: string;
  snapshot: PanelSnapshot;
}

let panelUndoRing: UndoEntry[] = [];
let pendingHistoryWriteMode: "push" | "replace" | null = null;

/** The current {pathname, focusId} scope, from the live URL + the focus the
 *  panel is showing. Undo entries are pushed and matched against this. */
export function currentPanelScope(): PanelScope | null {
  if (typeof window === "undefined") return null;
  const pathname = window.location.pathname;
  return {
    pathname,
    focusId: detailFocusIdFromPath(pathname) ?? currentPanelFocusId ?? "",
  };
}

/**
 * The current history.state with the App-Router bypass keys (`__NA`/`_N`)
 * stripped. Next 14.2.5 monkeypatches `window.history.push/replaceState`: when
 * `data.__NA` or `data._N` is present it takes a bypass path that updates ONLY
 * the address bar and leaves `useSearchParams`/`usePathname` stale (critique
 * W6-1). Passing a state WITHOUT those keys makes the patch re-copy the Next
 * internals from the current entry AND dispatch the router restore, so the hooks
 * stay in sync. Any other custom fields are preserved.
 */
export function filteredHistoryState(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const s = window.history.state as Record<string, unknown> | null;
  if (!s || typeof s !== "object") return {};
  const { __NA, _N, ...rest } = s;
  void __NA;
  void _N;
  return rest;
}

/** URL-sync debounce flush — registered by useUrlSync so a restore can cancel a
 *  pending delayed history write (a fast double-Back must not fire a stale one). */
let _urlSyncFlush: (() => void) | null = null;
export function registerUrlSyncFlush(fn: (() => void) | null): void {
  _urlSyncFlush = fn;
}

/** Apply a PanelSnapshot back onto the live state in ONE notified update — the
 *  atomic restore Back-undo needs (base order + grouping + filters together, so
 *  no intermediate render shows a half-restored view). Transient hover/tap
 *  state is cleared, matching a fresh interaction. */
function applyPanelSnapshot(snap: PanelSnapshot): void {
  state = {
    ...state,
    filterCategories: new Set(snap.filterCategories),
    reRankAnchorIds: [...snap.reRankAnchorIds],
    anchoredRangeByPost: { ...snap.anchoredRangeByPost },
    responseFilter: snap.responseFilter,
    replyAnchor: snap.replyAnchor,
    topicInteraction: snap.topicInteraction,
    baseOrderIds: [...snap.baseOrderIds],
    replyBaseOrderIds: [...(snap.replyBaseOrderIds ?? [])],
    hoveredPostId: null,
    hoveredRelations: null,
    sidebarHoverActive: false,
    hoveredHighlightRangeIndex: null,
    hoveredCategory: null,
    tappedCardPostId: null,
    tappedRangeIndex: null,
  };
  notify();
}

/**
 * Begin an UNDOABLE panel interaction (detail route). Call BEFORE mutating the
 * interaction — it captures the PRE-interaction snapshot (incl. the current
 * baseOrderIds) onto the ring and, if the ring was empty, pushes the sentinel.
 * When `currentVisibleOrderIds` is provided (grouping gestures) it also persists
 * that as the new base order, so the upcoming grouping operates on the order the
 * user currently sees (permanent-reorder) — and Back restores the OLD base with
 * it. Filter-chip / reply-span gestures pass `null` (they don't rebase the aside).
 *
 * This runs as one NON-render transaction: the snapshot push is module memory
 * and the base-order write does NOT notify — the caller's atomic action fires the
 * single notification, so the base order + the mutation land in one render.
 * Only call at genuine user gestures (filter chip, aside span, reply span) — URL
 * hydration, per-focus restore, and programmatic sets are NOT undoable.
 */
export function beginPanelInteraction(
  scope: PanelScope,
  currentVisibleOrderIds?: string[] | null,
): void {
  // The bounded browser-history budget belongs to one detail-post scope. A
  // normal TopNav/Link navigation does not pass through
  // navigateFromPanelScope, so prune abandoned snapshots here before deciding
  // whether this genuine gesture may push. Otherwise 24 interactions on an old
  // post permanently force every later post into replace-only history.
  panelUndoRing = panelUndoRing.filter(
    (entry) => entry.pathname === scope.pathname && entry.focusId === scope.focusId,
  );
  const mode = historyWriteMode(panelUndoRing.length, FILTER_HISTORY_CAP);
  pendingHistoryWriteMode = mode;
  // A replace does not create a browser Back step, so it must not create a
  // snapshot either. The current ring top already matches the URL entry Back
  // will land on.
  if (mode === "push") {
    panelUndoRing = pushUndoEntry(
      panelUndoRing,
      { pathname: scope.pathname, focusId: scope.focusId, snapshot: snapshotPanel() },
      FILTER_HISTORY_CAP,
    );
  }
  if (currentVisibleOrderIds) {
    // Non-render: no notify — the caller's atomic action coalesces it in.
    state = { ...state, baseOrderIds: [...currentVisibleOrderIds] };
  }
}

/** Consume the write decision captured at the user-gesture boundary. URL
 * hydration/programmatic normalization has no boundary and therefore replaces. */
export function consumePanelHistoryWriteMode(): "push" | "replace" {
  const mode = pendingHistoryWriteMode ?? "replace";
  pendingHistoryWriteMode = null;
  return mode;
}

/** Set the aside base order WITHOUT recording an undo entry — the feed
 *  (aside-only) permanent-reorder path, which is non-undoable by design. No
 *  notify: the caller's atomic grouping action fires it. */
export function setPanelBaseOrder(orderIds: string[]): void {
  state = { ...state, baseOrderIds: [...orderIds] };
}

/** Persist the reply pane's permanent order (write-through while a reply
 *  cluster is active, or `[]` on an explicit re-sort). Equality-guarded so the
 *  thread page's write-through effect can call it every render without
 *  looping; NOT undoable itself — the pre-interaction snapshot recorded at the
 *  gesture already holds the order Back-undo should restore. */
export function setReplyBaseOrder(orderIds: string[]): void {
  const prev = state.replyBaseOrderIds;
  if (prev.length === orderIds.length && orderIds.every((id, i) => prev[i] === id)) return;
  state = { ...state, replyBaseOrderIds: [...orderIds] };
  notify();
}

/**
 * DRY boundary for the many detail-route filter/passage/CLEAR gestures that
 * don't rebase the aside order: record a pre-interaction undo snapshot (null
 * order) IFF we're on a ChineseEVs detail route with a known focus — so a
 * category/passage/topic APPLY *and* its later REMOVE/CLEAR are both undoable
 * (Back re-applies the just-cleared filter, keeping the ring coherent). Pass
 * `focusId` to tighten the guard to a specific post (focus-post span clicks);
 * omit for controls only ever rendered for the current focus. The feed route is
 * excluded (undo is detail-only in v1). Returns whether a boundary was recorded.
 */
export function beginUndoablePanelInteractionIfDetail(focusId?: string): boolean {
  const scope = currentPanelScope();
  if (
    !scope ||
    (!scope.pathname.startsWith("/ChineseEVs/posts/")
      && !scope.pathname.startsWith("/AIWorkforce/posts/")
      && !scope.pathname.startsWith("/EnergyTech/posts/")
      && !scope.pathname.startsWith("/posts/"))
  ) return false;
  if (focusId !== undefined && scope.focusId !== focusId) return false;
  beginPanelInteraction(scope, null);
  return true;
}

/** True when a Back at the current scope would undo a panel interaction. */
export function hasPanelUndo(scope?: PanelScope | null): boolean {
  const s = scope ?? currentPanelScope();
  return ringTopMatchesScope(panelUndoRing, s);
}

/**
 * Consume one undo step after browser Back lands on the preceding filter URL.
 * The URL codec restores the shareable dimensions; this snapshot also restores
 * the exact permanent panel/reply ordering that is intentionally not put in a
 * public URL.
 */
export function consumePanelUndo(): boolean {
  const scope = currentPanelScope();
  if (!ringTopMatchesScope(panelUndoRing, scope)) return false;
  const entry = panelUndoRing[panelUndoRing.length - 1];
  panelUndoRing = panelUndoRing.slice(0, -1);
  pendingHistoryWriteMode = null;
  if (_urlSyncFlush) _urlSyncFlush();
  applyPanelSnapshot(entry.snapshot);
  return true;
}

/**
 * Commit the outgoing panel state and navigate away from the current focus
 * scope (WS3 X-click + any related-post navigation). Filter entries are real
 * URLs now, so no sentinel needs collapsing; clear the in-memory snapshots and
 * perform the caller's normal navigation push.
 */
export function navigateFromPanelScope(
  url: string,
  navigate: { push: (u: string) => void; replace: (u: string) => void },
): void {
  if (currentPanelFocusId) {
    panelStateByFocus.set(currentPanelFocusId, snapshotPanel());
  }
  panelUndoRing = panelUndoRing.filter((e) => e.focusId !== currentPanelFocusId);
  pendingHistoryWriteMode = null;
  navigate.push(url);
}

/** Test/reset seam: drop the whole undo ring (does not touch history). */
export function resetPanelUndoRing(): void {
  panelUndoRing = [];
  pendingHistoryWriteMode = null;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

// Server snapshot uses a stable object. We cannot reuse INITIAL directly since
// Set instances are mutable — create a fresh frozen copy for the server.
const SERVER_SNAPSHOT: HighlightState = { ...INITIAL, filterCategories: new Set(), responseFilter: null };
function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function useHighlightStore(): HighlightState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
