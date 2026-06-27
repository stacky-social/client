"use client";

import { useSyncExternalStore } from "react";
import type { Relation } from "../types/PostType";

// ─── State ──────────────────────────────────────────────────────────────────

interface HighlightState {
  /** ID of the sidebar post currently being hovered (drives focus-post cross-highlighting) */
  hoveredPostId: string | null;
  /** Relations for the hovered post (offset-based substring pairs) */
  hoveredRelations: Relation[] | null;
  /**
   * Set of categories to filter the sidebar by (empty = show all).
   * Multiple categories use OR semantics (show posts matching ANY active category).
   */
  filterCategories: Set<string>;
  /** Level 2: which specific substring within the hovered card is being hovered (index into bracket pairs) */
  hoveredHighlightRangeIndex: number | null;
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
}

const INITIAL: HighlightState = {
  hoveredPostId: null,
  hoveredRelations: null,
  filterCategories: new Set(),
  hoveredHighlightRangeIndex: null,
  hoveredCategory: null,
  tappedCardPostId: null,
  tappedRangeIndex: null,
  reRankAnchorIds: [],
  anchoredRangeByPost: {},
  responseFilter: null,
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
  if (state.hoveredPostId === postId) return;
  state = {
    ...state,
    hoveredPostId: postId,
    hoveredRelations: postId ? (relations ?? null) : null,
    hoveredHighlightRangeIndex: null,
  };
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

export function clearReRankAnchors(): void {
  if (state.reRankAnchorIds.length === 0) return;
  state = { ...state, reRankAnchorIds: [], anchoredRangeByPost: {} };
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
}

const panelStateByFocus = new Map<string, PanelSnapshot>();
let currentPanelFocusId: string | null = null;

// Related-panel SCROLL position, scoped per focus post (kept separate from the
// snapshot so it can be updated live on every scroll, not only on focus switch).
// Restored when returning to a focus post (scrolling between focus posts, or
// entering/leaving a post's full view). In-memory, like the filter persistence.
const panelScrollByFocus = new Map<string, number>();

/** Record the related-panel scroll offset for a focus post (called on scroll). */
export function savePanelScroll(focusId: string | null, scrollTop: number): void {
  if (focusId) panelScrollByFocus.set(focusId, scrollTop);
}

/** Read the saved related-panel scroll offset for a focus post (0 if none). */
export function getPanelScroll(focusId: string | null): number {
  return (focusId != null ? panelScrollByFocus.get(focusId) : undefined) ?? 0;
}

function snapshotPanel(): PanelSnapshot {
  return {
    filterCategories: Array.from(state.filterCategories),
    reRankAnchorIds: [...state.reRankAnchorIds],
    anchoredRangeByPost: { ...state.anchoredRangeByPost },
    responseFilter: state.responseFilter,
  };
}

/**
 * Tell the store which focus post the related panel is showing. Saves the
 * outgoing post's grouping/filters and restores the incoming post's (or resets
 * to a clean panel if it has none). No-op when the focus id is unchanged, so it
 * is safe to call on every render/effect. Transient hover/tap state always
 * resets on a real switch.
 */
export function setPanelFocus(focusId: string | null): void {
  if (focusId === currentPanelFocusId) return;
  if (currentPanelFocusId) {
    panelStateByFocus.set(currentPanelFocusId, snapshotPanel());
  }
  currentPanelFocusId = focusId;
  const saved = focusId ? panelStateByFocus.get(focusId) : undefined;
  state = {
    ...state,
    filterCategories: saved ? new Set(saved.filterCategories) : new Set(),
    reRankAnchorIds: saved ? [...saved.reRankAnchorIds] : [],
    anchoredRangeByPost: saved ? { ...saved.anchoredRangeByPost } : {},
    responseFilter: saved ? saved.responseFilter : null,
    // transient view state never persists across a focus switch
    hoveredPostId: null,
    hoveredRelations: null,
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

// ─── Navigation callback (shared between page and aside parallel routes) ────

let _navigateCallback: ((postId: string) => void) | null = null;

export function registerNavigateCallback(cb: ((postId: string) => void) | null): void {
  _navigateCallback = cb;
}

export function triggerNavigate(postId: string): void {
  if (_navigateCallback) _navigateCallback(postId);
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
