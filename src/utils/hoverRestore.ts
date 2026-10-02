"use client";

import { useSyncExternalStore } from "react";

// Whether the focus post returns to its original view once the pointer leaves
// a related post (the default), or keeps showing the last passage a hover
// revealed. Shift+R toggles it (see Shell.tsx); the choice persists. Same
// module-level useSyncExternalStore pattern as experimentFlags.

export const HOVER_RESTORE_STORAGE_KEY = "stacky:hover-restore";

let restoreOnLeave = true;
let loadedFromStorage = false;
const listeners = new Set<() => void>();

function loadPersistedOnce() {
  if (loadedFromStorage || typeof window === "undefined") return;
  loadedFromStorage = true;
  try {
    if (window.localStorage.getItem(HOVER_RESTORE_STORAGE_KEY) === "keep") {
      restoreOnLeave = false;
      listeners.forEach((listener) => listener());
    }
  } catch {
    // Storage unavailable — keep the default.
  }
}

/** Flip between restoring and keeping; returns the new setting. */
export function toggleHoverRestore(): boolean {
  loadPersistedOnce();
  restoreOnLeave = !restoreOnLeave;
  try {
    window.localStorage.setItem(HOVER_RESTORE_STORAGE_KEY, restoreOnLeave ? "restore" : "keep");
  } catch {
    // Storage unavailable — the choice lasts for this page load only.
  }
  listeners.forEach((listener) => listener());
  return restoreOnLeave;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // First client subscriber pulls the persisted choice in (post-hydration, so
  // the server HTML and first client paint agree on the default).
  loadPersistedOnce();
  return () => listeners.delete(listener);
}

export function useHoverRestore(): boolean {
  return useSyncExternalStore(subscribe, () => restoreOnLeave, () => true);
}
