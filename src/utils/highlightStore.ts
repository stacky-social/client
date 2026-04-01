"use client";

import { useSyncExternalStore } from "react";
import type { Relation } from "../types/PostType";

// ─── State ──────────────────────────────────────────────────────────────────

interface HighlightState {
  /** ID of the sidebar post currently being hovered (drives focus-post cross-highlighting) */
  hoveredPostId: string | null;
  /** Relations for the hovered post (offset-based substring pairs) */
  hoveredRelations: Relation[] | null;
  /** Which category to filter the sidebar by (null = show all) */
  filterCategory: string | null;
  /** Level 2: which specific substring within the hovered card is being hovered (index into bracket pairs) */
  hoveredHighlightRangeIndex: number | null;
  /** "More like this" anchor post IDs for nested re-ranking (ordered by when added) */
  reRankAnchorIds: string[];
}

const INITIAL: HighlightState = {
  hoveredPostId: null,
  hoveredRelations: null,
  filterCategory: null,
  hoveredHighlightRangeIndex: null,
  reRankAnchorIds: [],
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

/** Toggle a post as an anchor. Removes only this anchor — remaining anchors recompute naturally. */
export function toggleReRankAnchor(postId: string): void {
  const idx = state.reRankAnchorIds.indexOf(postId);
  if (idx >= 0) {
    state = { ...state, reRankAnchorIds: state.reRankAnchorIds.filter(id => id !== postId) };
  } else {
    state = { ...state, reRankAnchorIds: [...state.reRankAnchorIds, postId] };
  }
  notify();
}

export function clearReRankAnchors(): void {
  if (state.reRankAnchorIds.length === 0) return;
  state = { ...state, reRankAnchorIds: [] };
  notify();
}

export function setFilterCategory(category: string | null): void {
  if (state.filterCategory === category) return;
  state = { ...state, filterCategory: category };
  notify();
}

export function toggleFilterCategory(category: string): void {
  const next = state.filterCategory === category ? null : category;
  state = { ...state, filterCategory: next };
  notify();
}

export function resetHighlightStore(): void {
  state = { ...INITIAL };
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

function getServerSnapshot() {
  return INITIAL;
}

export function useHighlightStore(): HighlightState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
