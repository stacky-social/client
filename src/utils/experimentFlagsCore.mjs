// Pure helpers for the experiment-flags store. Plain JS (not TS) so the
// node:test suite in tests/unit can import it without a build step; the
// React store in experimentFlags.ts re-exports everything from here.

/** Thread-display experiment conditions (demo posture). Most default ON;
 *  toggling one OFF yields the ablation/control behavior for that feature. A
 *  few default OFF where the demo posture is the ablation itself (Home replies
 *  hidden; summary hidden; filters replace rather than stack). */
export const DEFAULT_FLAGS = {
  /** Include reply statuses as standalone items in Home. Default OFF while the
   *  mixed-source timeline behavior is evaluated. Replies remain available in
   *  each post's full conversation view. */
  homeReplies: false,
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
  /** Collapsible summary card above the replies list. Default OFF — the demo
   *  hides the summary (kept behind the flag, not deleted). */
  summaryCard: false,
  /** Collapsed sticky focus bar with the contribution strip while scrolling */
  stickyFocusBar: true,
  /** X-style branch previews: one inline reply per branch, expand in place.
   *  Off = the control condition: branches render fully expanded, flat. */
  branchPreviews: true,
  /** Stack filters instead of replacing them (AND-combined categories / additive
   *  passage+topic filters via the decide* helpers). Default OFF — the demo
   *  replaces on each new filter; stacking stays reachable behind this flag. */
  filterStacking: false,
};

export const FLAGS_STORAGE_KEY = 'stacky:experimentFlags:v1';

/** The dependency lattice: a flag is only *effective* when every flag it
 *  depends on is effective too. These encode real code paths, not policy:
 *  - crossPaneFiltering renders inside the sort-tabs branch, and without
 *    suppressThreadPosts a dual-role post is counted twice in cross-pane
 *    "N more <topic>" totals (dishonest counts).
 *  - replyReranking is triggered from contribution spans and only runs in
 *    the sort-tabs branch. */
export const FLAG_DEPENDENCIES = {
  crossPaneFiltering: ['replySortTabs', 'suppressThreadPosts'],
  replyReranking: ['replySortTabs', 'replyContributions'],
};

/** Derive the flags that are actually in force from the chosen switches:
 *  any flag with an unmet dependency is forced off. Iterates to a fixed
 *  point so future chained dependencies keep working. */
export function effectiveFlags(chosen, dependencies = FLAG_DEPENDENCIES) {
  const out = { ...chosen };
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 20) {
    changed = false;
    for (const [flag, deps] of Object.entries(dependencies)) {
      if (out[flag] && deps.some((d) => !out[d])) {
        out[flag] = false;
        changed = true;
      }
    }
  }
  return out;
}

/** Parse a `?flags=key:0,key2:1` URL condition override (session-only, for
 *  study provenance). Unknown keys and unparseable values are ignored.
 *  Accepted values: 1/0, true/false, on/off. */
export function parseFlagOverrides(search, defaults = DEFAULT_FLAGS) {
  const out = {};
  try {
    const raw = new URLSearchParams(search).get('flags');
    if (!raw) return out;
    for (const part of raw.split(',')) {
      const [key, value] = part.split(':').map((s) => (s ?? '').trim());
      if (!(key in defaults)) continue;
      if (value === '1' || value === 'true' || value === 'on') out[key] = true;
      else if (value === '0' || value === 'false' || value === 'off') out[key] = false;
    }
  } catch {
    // Malformed search string — no overrides.
  }
  return out;
}

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
