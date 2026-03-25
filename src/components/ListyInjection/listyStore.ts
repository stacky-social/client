"use client";

import { useSyncExternalStore, type RefObject } from "react";

// ─── State shape ─────────────────────────────────────────────────────────────

interface ScrollPosition {
  center: number;
  sidebar: number;
}

interface ListyState {
  /** ID of the related post currently driving focus-post highlight */
  activeRelatedPostId: string | null;
  /** Which category to filter the sidebar by (null = show all) */
  filterCategory: string | null;
  /** Which focus post is currently in the viewport (feed mode only) */
  activeFeedEntryId: string | null;
  /** Stack of focus post IDs for drill-down navigation; empty = feed mode */
  navigationStack: string[];
  /** Saved scroll positions keyed by focus post ID or "__feed__" */
  scrollPositions: Record<string, ScrollPosition>;
  /** Per-entry sidebar scroll positions keyed by focus post ID */
  sidebarScrollPositions: Record<string, number>;
}

const INITIAL: ListyState = {
  activeRelatedPostId: null,
  filterCategory: null,
  activeFeedEntryId: null,
  navigationStack: [],
  scrollPositions: {},
  sidebarScrollPositions: {},
};

// ─── Module-level store ───────────────────────────────────────────────────────

let state: ListyState = { ...INITIAL };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

// ─── Module-level sidebar scroll ref ─────────────────────────────────────────
// Shared between the aside panel and store actions so we can read/write the
// sidebar's scrollTop without threading a ref through React context.

let _sidebarRef: RefObject<HTMLDivElement | null> | null = null;

export function registerSidebarRef(ref: RefObject<HTMLDivElement | null>): void {
  _sidebarRef = ref;
}

function readSidebarScroll(): number {
  return _sidebarRef?.current?.scrollTop ?? 0;
}

function writeSidebarScroll(value: number): void {
  if (_sidebarRef?.current) {
    _sidebarRef.current.scrollTop = value;
  }
}

// ─── Subscriptions (for useSyncExternalStore) ─────────────────────────────────

export function subscribeListy(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getListySnapshot(): ListyState {
  return state;
}

export function getListyServerSnapshot(): ListyState {
  return INITIAL;
}

// ─── Derived getters ─────────────────────────────────────────────────────────

export function isInThreadMode(): boolean {
  return state.navigationStack.length > 0;
}

export function getCurrentFocusId(): string | null {
  const stack = state.navigationStack;
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

export function getAncestorIds(): string[] {
  return state.navigationStack.slice(0, -1);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export function setActiveRelatedPost(id: string | null): void {
  if (state.activeRelatedPostId === id) return;
  state = { ...state, activeRelatedPostId: id };
  notify();
}

export function setFilterCategory(category: string | null): void {
  if (state.filterCategory === category) return;
  state = { ...state, filterCategory: category };
  notify();
}

export function toggleFilterCategory(category: string): void {
  const next = state.filterCategory === category ? null : category;
  state = { ...state, filterCategory: next, activeRelatedPostId: null };
  notify();
}

export function setActiveFeedEntry(focusPostId: string): void {
  if (state.activeFeedEntryId === focusPostId) return;

  // Save current sidebar scroll for the old entry
  const oldId = state.activeFeedEntryId;
  const sidebarScrollPositions = { ...state.sidebarScrollPositions };
  if (oldId) {
    sidebarScrollPositions[oldId] = readSidebarScroll();
  }

  state = {
    ...state,
    activeFeedEntryId: focusPostId,
    activeRelatedPostId: null,
    filterCategory: null,
    sidebarScrollPositions,
  };
  notify();

  // Restore sidebar scroll for the new entry (after React re-renders)
  requestAnimationFrame(() => {
    writeSidebarScroll(state.sidebarScrollPositions[focusPostId] ?? 0);
  });
}

export function navigateToPost(focusPostId: string): void {
  // Save current scroll state
  const key = state.navigationStack.length > 0
    ? state.navigationStack[state.navigationStack.length - 1]
    : "__feed__";

  const scrollPositions = {
    ...state.scrollPositions,
    [key]: {
      center: typeof window !== "undefined" ? window.scrollY : 0,
      sidebar: readSidebarScroll(),
    },
  };

  // Also save sidebar scroll for current feed entry
  const sidebarScrollPositions = { ...state.sidebarScrollPositions };
  if (state.activeFeedEntryId) {
    sidebarScrollPositions[state.activeFeedEntryId] = readSidebarScroll();
  }

  // When navigating from feed mode, push the active feed entry as ancestor
  // so the context (the post whose related posts you were viewing) is preserved.
  let newStack = [...state.navigationStack];
  if (newStack.length === 0 && state.activeFeedEntryId && state.activeFeedEntryId !== focusPostId) {
    newStack.push(state.activeFeedEntryId);
  }
  newStack.push(focusPostId);

  state = {
    ...state,
    navigationStack: newStack,
    scrollPositions,
    sidebarScrollPositions,
    activeRelatedPostId: null,
    filterCategory: null,
  };
  notify();

  // Scroll to top for the new thread view
  if (typeof window !== "undefined") {
    window.scrollTo(0, 0);
  }
  requestAnimationFrame(() => writeSidebarScroll(0));
}

export function navigateBack(): void {
  if (state.navigationStack.length === 0) return;

  const newStack = state.navigationStack.slice(0, -1);

  // Figure out which key we're restoring
  const restoreKey = newStack.length > 0
    ? newStack[newStack.length - 1]
    : "__feed__";

  const savedScroll = state.scrollPositions[restoreKey];

  state = {
    ...state,
    navigationStack: newStack,
    activeRelatedPostId: null,
    filterCategory: null,
  };
  notify();

  // Restore scroll positions after React re-renders
  requestAnimationFrame(() => {
    if (savedScroll) {
      if (typeof window !== "undefined") {
        window.scrollTo(0, savedScroll.center);
      }
      writeSidebarScroll(savedScroll.sidebar);
    }

    // In feed mode, also restore per-entry sidebar scroll
    if (newStack.length === 0 && state.activeFeedEntryId) {
      const entrySidebarScroll = state.sidebarScrollPositions[state.activeFeedEntryId] ?? 0;
      writeSidebarScroll(entrySidebarScroll);
    }
  });
}

/** Reset to initial state — call on page unmount to avoid stale state on re-visit. */
export function resetListyStore(): void {
  state = { ...INITIAL };
  notify();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useListyStore(): ListyState {
  return useSyncExternalStore(
    subscribeListy,
    getListySnapshot,
    getListyServerSnapshot
  );
}
