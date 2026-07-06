// Single source of truth for the reply tab sets on the post-detail routes.
// Plain JS (not TS) so the node:test suite in tests/unit can import it without
// a build step — same pattern as replySort.mjs / experimentFlagsCore.mjs.

/** Tab set rendered when the reply-sort-tabs flag is ON. */
export const SORT_TABS = ['top', 'time', 'liked'];

/** Legacy tab set (flag OFF, and the API-backed /posts/[id] route). */
export const LEGACY_TABS = ['time', 'recommended', 'stacked', 'summary'];

/** The tab set the given replySortTabs flag state can actually render. */
export function allowedTabsFor(replySortTabs) {
  return replySortTabs ? SORT_TABS : LEGACY_TABS;
}

/** The default tab of the active set (the one omitted from the URL). */
export function defaultTabFor(replySortTabs) {
  return replySortTabs ? 'top' : 'time';
}

/** Keep a tab inside the active set: anything foreign degrades to the set's
 *  default, so a stale cross-condition ?tab= can never select a tab that has
 *  no panel (audit F-1). */
export function coerceTab(tab, replySortTabs) {
  return allowedTabsFor(replySortTabs).includes(tab) ? tab : defaultTabFor(replySortTabs);
}
