"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_FLAGS, FLAGS_STORAGE_KEY, mergeFlags } from "./experimentFlagsCore.mjs";

// Experiment-flags store: same module-level useSyncExternalStore pattern as
// highlightStore. Persisted to localStorage so a chosen condition survives
// reloads; defaults render on the server and on the first client paint, then
// the persisted values (if any) apply right after hydration.

export interface ExperimentFlags {
  suppressThreadPosts: boolean;
  replyContributions: boolean;
  crossPaneFiltering: boolean;
  replyReranking: boolean;
  replySortTabs: boolean;
  summaryCard: boolean;
  stickyFocusBar: boolean;
}

/** UI metadata for the TopNav experiment panel. */
export const FLAG_META: Array<{ key: keyof ExperimentFlags; label: string; description: string }> = [
  { key: "suppressThreadPosts", label: "Hide thread posts in related panel", description: "Posts already shown as ancestors or replies are suppressed from the right pane." },
  { key: "replyContributions", label: "Reply contributions", description: "Replies show colored contribution spans and category badges." },
  { key: "crossPaneFiltering", label: "Cross-pane filtering", description: "Chips, passage, and topic filters apply to the replies list too — with a visible filter bar." },
  { key: "replyReranking", label: "Reply reranking", description: "Clicking a contribution in a reply groups matching replies around it, in place." },
  { key: "replySortTabs", label: "Reply sort tabs", description: "Top / Newest / Most liked tabs (off restores the legacy tab set)." },
  { key: "summaryCard", label: "Summary card", description: "Collapsible summary of the currently displayed replies, above the list." },
  { key: "stickyFocusBar", label: "Sticky focus post", description: "Collapsed focus-post bar with the contribution strip once you scroll into the replies." },
];

const SERVER_SNAPSHOT: ExperimentFlags = mergeFlags(null) as ExperimentFlags;

let state: ExperimentFlags = mergeFlags(null) as ExperimentFlags;
let loadedFromStorage = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function loadPersistedOnce() {
  if (loadedFromStorage || typeof window === "undefined") return;
  loadedFromStorage = true;
  try {
    const raw = window.localStorage.getItem(FLAGS_STORAGE_KEY);
    if (!raw) return;
    const next = mergeFlags(JSON.parse(raw)) as ExperimentFlags;
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      state = next;
      notify();
    }
  } catch {
    // Corrupt storage — keep defaults.
  }
}

function persist() {
  try {
    window.localStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode/quota) — flags stay session-only.
  }
}

export function setExperimentFlag(key: keyof ExperimentFlags, value: boolean): void {
  if (state[key] === value) return;
  state = { ...state, [key]: value };
  persist();
  notify();
}

export function resetExperimentFlags(): void {
  state = mergeFlags(null) as ExperimentFlags;
  try {
    window.localStorage.removeItem(FLAGS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // First client subscriber pulls the persisted condition in (post-hydration,
  // so the server HTML and first client paint agree on defaults).
  loadPersistedOnce();
  return () => listeners.delete(listener);
}

function getSnapshot(): ExperimentFlags {
  return state;
}

function getServerSnapshot(): ExperimentFlags {
  return SERVER_SNAPSHOT;
}

export function useExperimentFlags(): ExperimentFlags {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export { DEFAULT_FLAGS, FLAGS_STORAGE_KEY };
