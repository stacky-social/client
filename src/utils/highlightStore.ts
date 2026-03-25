"use client";

import { useSyncExternalStore } from "react";

// ─── State ──────────────────────────────────────────────────────────────────

interface HighlightState {
  /** ID of the sidebar post currently being hovered (drives focus-post cross-highlighting) */
  hoveredPostId: string | null;
  /** The `content_highlight` value of the hovered post (with ⌊bracket⌋ markers) */
  hoveredContentHighlight: string | null;
  /** Category of the hovered post (e.g. "agree", "disagree") */
  hoveredCategory: string | null;
  /** The focus post's text with ⌊bracket⌋ markers showing which part this sidebar post responds to */
  hoveredFocusHighlight: string | null;
  /** Which category to filter the sidebar by (null = show all) */
  filterCategory: string | null;
}

const INITIAL: HighlightState = {
  hoveredPostId: null,
  hoveredContentHighlight: null,
  hoveredCategory: null,
  hoveredFocusHighlight: null,
  filterCategory: null,
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
  contentHighlight?: string | null,
  category?: string | null,
  focusHighlight?: string | null,
): void {
  if (state.hoveredPostId === postId) return;
  state = {
    ...state,
    hoveredPostId: postId,
    hoveredContentHighlight: postId ? (contentHighlight ?? null) : null,
    hoveredCategory: postId ? (category ?? null) : null,
    hoveredFocusHighlight: postId ? (focusHighlight ?? null) : null,
  };
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
