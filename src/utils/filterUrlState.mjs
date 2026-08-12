// Pure URL codec for the post-detail filters. Keeping this framework-free makes
// the share-link contract independently testable (and prevents the UI and
// browser-history paths from drifting apart).

export const FILTER_HISTORY_CAP = 24;

// `flags` is study-condition provenance. It is intentionally session-only in
// experimentFlags.ts, so dropping it on the first filter write would make a
// copied/reloaded filtered URL silently open in a different condition.
const PASSTHROUGH_PARAMS = ['stackId', 'from', 'related', 'flags'];

/**
 * Serialize the complete shareable detail-view state.
 *
 * The three related-post interaction dimensions are mutually exclusive:
 * category (`fc`), focus passage (`fs`), or cross-pane topic (`ft` + anchor
 * metadata). `tab` is the fourth filter/sort dimension.
 */
export function serializeFilterSearch({
  currentSearch = '',
  activeTab,
  defaultTab,
  filterCategories = [],
  responseFilter = null,
  topicInteraction = null,
}) {
  const current = new URLSearchParams(currentSearch);
  const next = new URLSearchParams();

  if (activeTab && activeTab !== defaultTab) next.set('tab', activeTab);

  const categories = Array.from(filterCategories).filter(Boolean).sort();
  if (categories.length > 0) {
    next.set('fc', categories.join(','));
  } else if (responseFilter) {
    next.set('fs', `${responseFilter.start}-${responseFilter.end}`);
  } else if (topicInteraction) {
    next.set('ft', topicInteraction.topicKey);
    next.set('fo', topicInteraction.origin);
    next.set('fa', topicInteraction.anchor.postId);
    next.set('fi', String(topicInteraction.anchor.rangeIndex));
  }

  for (const key of PASSTHROUGH_PARAMS) {
    const value = current.get(key);
    if (value) next.set(key, value);
  }

  return next.toString();
}

/** Parse the mutually-exclusive interaction from a URL. */
export function parseFilterInteraction(search, plainPostText = null) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);

  const categoryParam = params.get('fc');
  if (categoryParam) {
    const categories = categoryParam.split(',').map((value) => value.trim()).filter(Boolean);
    return categories.length > 0
      ? { kind: 'category', categories }
      : { kind: 'none' };
  }

  const spanParam = params.get('fs');
  if (spanParam) {
    if (plainPostText == null) return { kind: 'pending-passage' };
    const match = /^(\d+)-(\d+)$/.exec(spanParam);
    if (!match) return { kind: 'none' };
    const start = Number(match[1]);
    const requestedEnd = Number(match[2]);
    if (requestedEnd <= start || start >= plainPostText.length) return { kind: 'none' };
    const end = Math.min(requestedEnd, plainPostText.length);
    return {
      kind: 'passage',
      span: { start, end, text: plainPostText.slice(start, end) },
    };
  }

  const topicKey = params.get('ft');
  const origin = params.get('fo');
  const postId = params.get('fa');
  const rangeIndexText = params.get('fi');
  if (topicKey || origin || postId || rangeIndexText) {
    const rangeIndex = rangeIndexText == null ? NaN : Number(rangeIndexText);
    if (
      !topicKey ||
      (origin !== 'aside' && origin !== 'replies') ||
      !postId ||
      !Number.isInteger(rangeIndex) ||
      rangeIndex < 0
    ) {
      return { kind: 'none' };
    }
    return {
      kind: 'topic',
      interaction: { origin, topicKey, anchor: { postId, rangeIndex } },
    };
  }

  return { kind: 'none' };
}

/** A transition gets a new Back step until the bounded stack is full. */
export function historyWriteMode(undoDepth, cap = FILTER_HISTORY_CAP) {
  return undoDepth < cap ? 'push' : 'replace';
}
