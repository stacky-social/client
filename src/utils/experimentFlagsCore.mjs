// Pure helpers for the experiment-flags store. Plain JS (not TS) so the
// node:test suite in tests/unit can import it without a build step; the
// React store in experimentFlags.ts re-exports everything from here.

/** Every thread-display experiment condition, ON by default (demo posture).
 *  Toggling one OFF yields the ablation/control behavior for that feature. */
export const DEFAULT_FLAGS = {
  /** D1 — hide posts that already appear in the thread from the related panel */
  suppressThreadPosts: true,
  /** Replies render colored contribution spans + category badges */
  replyContributions: true,
  /** Category chips / passage / topic filters also filter the replies list,
   *  and reply-span clicks filter the related panel */
  crossPaneFiltering: true,
  /** Clicking a contribution span in a reply reranks the replies in place */
  replyReranking: true,
  /** Top / Newest / Most liked reply tabs (off = legacy time/recommended/stacked/summary) */
  replySortTabs: true,
  /** Collapsible summary card above the replies list */
  summaryCard: true,
  /** Collapsed sticky focus bar with the contribution strip while scrolling */
  stickyFocusBar: true,
};

export const FLAGS_STORAGE_KEY = 'stacky:experimentFlags:v1';

/** Merge a persisted (possibly stale/corrupt) blob over the defaults.
 *  Only known keys with boolean values are honored. Always returns a fresh object. */
export function mergeFlags(persisted, defaults = DEFAULT_FLAGS) {
  const out = { ...defaults };
  if (persisted && typeof persisted === 'object') {
    for (const key of Object.keys(defaults)) {
      if (typeof persisted[key] === 'boolean') out[key] = persisted[key];
    }
  }
  return out;
}
