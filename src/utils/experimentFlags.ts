"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_FLAGS,
  FLAGS_STORAGE_KEY,
  FLAG_DEPENDENCIES,
  effectiveFlags,
  mergeFlags,
  parseFlagOverrides,
} from "./experimentFlagsCore.mjs";

// Experiment-flags store: same module-level useSyncExternalStore pattern as
// highlightStore. Persisted to localStorage so a chosen condition survives
// reloads; defaults render on the server and on the first client paint, then
// the persisted values (if any) apply right after hydration.
//
// Two views of the condition:
//  - CHOSEN flags — the switch positions (persisted; seeded once per load by a
//    `?flags=key:0,key2:1` URL override for study provenance).
//  - EFFECTIVE flags — chosen flags with the dependency lattice applied
//    (FLAG_DEPENDENCIES): a flag with an unmet dependency is forced off.
// Feature code must consume EFFECTIVE flags (useExperimentFlags); only the
// settings panel should read the chosen ones (useChosenExperimentFlags).
// Every change logs the effective condition to the console so a session's
// condition is recoverable from its logs.

export interface ExperimentFlags {
  suppressThreadPosts: boolean;
  replyContributions: boolean;
  crossPaneFiltering: boolean;
  replyReranking: boolean;
  replySortTabs: boolean;
  summaryCard: boolean;
  stickyFocusBar: boolean;
  branchPreviews: boolean;
}

/** UI metadata for the TopNav experiment panel. `dependsOn` mirrors
 *  FLAG_DEPENDENCIES so the panel can explain inactive switches. */
export const FLAG_META: Array<{
  key: keyof ExperimentFlags;
  label: string;
  description: string;
  dependsOn?: Array<keyof ExperimentFlags>;
}> = [
  { key: "suppressThreadPosts", label: "Hide thread posts in related panel", description: "Posts already shown as ancestors or replies are suppressed from the right pane." },
  { key: "replyContributions", label: "Reply contributions", description: "Replies show colored contribution spans and category badges." },
  { key: "crossPaneFiltering", label: "Cross-pane filtering", description: "Chips, passage, and topic filters apply to the replies list too — with a visible filter bar.", dependsOn: ["replySortTabs", "suppressThreadPosts"] },
  { key: "replyReranking", label: "Reply reranking", description: "Clicking a contribution in a reply groups matching replies around it, in place.", dependsOn: ["replySortTabs", "replyContributions"] },
  { key: "replySortTabs", label: "Reply sort tabs", description: "Top / Newest / Most liked tabs (off restores the legacy tab set)." },
  { key: "summaryCard", label: "Summary card", description: "Collapsible summary of the currently displayed replies, above the list." },
  { key: "stickyFocusBar", label: "Sticky focus post", description: "Collapsed focus-post bar with the contribution strip once you scroll into the replies." },
  { key: "branchPreviews", label: "Branch previews", description: "Each reply branch shows one inline preview and expands in place (off = branches render fully expanded)." },
];

const SERVER_SNAPSHOT: ExperimentFlags = effectiveFlags(mergeFlags(null)) as ExperimentFlags;

let chosen: ExperimentFlags = mergeFlags(null) as ExperimentFlags;
let effective: ExperimentFlags = effectiveFlags(chosen) as ExperimentFlags;
let loadedFromStorage = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function recompute(reason: string) {
  effective = effectiveFlags(chosen) as ExperimentFlags;
  try {
    const forcedOff = (Object.keys(chosen) as Array<keyof ExperimentFlags>).filter(
      (k) => chosen[k] && !effective[k]
    );
    // Session provenance: the active condition is always recoverable from logs.
    console.info(
      `[experiment] ${reason} — effective condition:`,
      effective,
      forcedOff.length ? { inactiveDueToDependencies: forcedOff } : ""
    );
  } catch {
    /* logging must never break the store */
  }
}

function loadPersistedOnce() {
  if (loadedFromStorage || typeof window === "undefined") return;
  loadedFromStorage = true;
  let next = chosen;
  let changed = false;
  try {
    const raw = window.localStorage.getItem(FLAGS_STORAGE_KEY);
    if (raw) {
      const merged = mergeFlags(JSON.parse(raw)) as ExperimentFlags;
      if (JSON.stringify(merged) !== JSON.stringify(next)) {
        next = merged;
        changed = true;
      }
    }
  } catch {
    // Corrupt storage — keep defaults.
  }
  // Session-only URL override (`?flags=replySortTabs:0,...`) seeds the chosen
  // flags on top of the persisted condition. It is NOT persisted here; a later
  // manual toggle persists the whole then-current state.
  const overrides = parseFlagOverrides(window.location.search) as Partial<ExperimentFlags>;
  if (Object.keys(overrides).length > 0) {
    next = { ...next, ...overrides };
    changed = true;
  }
  if (changed) {
    chosen = next;
    recompute(
      Object.keys(overrides).length > 0 ? "loaded (with ?flags= override)" : "loaded from storage"
    );
    notify();
  } else {
    recompute("loaded (defaults)");
  }
}

function persist() {
  try {
    window.localStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(chosen));
  } catch {
    // Storage unavailable (private mode/quota) — flags stay session-only.
  }
}

export function setExperimentFlag(key: keyof ExperimentFlags, value: boolean): void {
  if (chosen[key] === value) return;
  chosen = { ...chosen, [key]: value };
  persist();
  recompute(`set ${key}=${value}`);
  notify();
}

export function resetExperimentFlags(): void {
  chosen = mergeFlags(null) as ExperimentFlags;
  try {
    window.localStorage.removeItem(FLAGS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  recompute("reset to defaults");
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
  return effective;
}

function getChosenSnapshot(): ExperimentFlags {
  return chosen;
}

function getServerSnapshot(): ExperimentFlags {
  return SERVER_SNAPSHOT;
}

/** The flags actually in force (dependency lattice applied). Feature code
 *  should always use this hook. */
export function useExperimentFlags(): ExperimentFlags {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The raw switch positions, for the settings panel only. */
export function useChosenExperimentFlags(): ExperimentFlags {
  return useSyncExternalStore(subscribe, getChosenSnapshot, getServerSnapshot);
}

export { DEFAULT_FLAGS, FLAGS_STORAGE_KEY, FLAG_DEPENDENCIES };
