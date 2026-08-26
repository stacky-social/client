// Pure, framework-free logic for the highlight/panel store. Plain JS (not TS)
// so the node:test suite in tests/unit imports it directly; the React store in
// highlightStore.ts wraps these helpers behind its module-level state + notify.
//
// The panel supports exactly ONE active "interaction" at a time across three
// mutually-exclusive dimensions — a topic interaction, a category filter, or a
// passage ("responses to") filter. reduceInteraction is where replace-not-stack
// lives: activating any dimension clears the other two in a single transition.

/** Normalized topic key for a relation: its explicit `topic`, or null when the
 *  relation carries no topic. No category/similarity fallback — a relation
 *  without an explicit topic cannot seed a topic interaction, so grouping and
 *  filtering always key off the identical value. */
export function topicKeyOf(relation) {
  return relation && relation.topic ? relation.topic : null;
}

// ─── Derived selectors ───────────────────────────────────────────────────────
// A topic interaction GROUPS the pane it originated in and FILTERS the other
// pane. Split by origin so each pane reads exactly the slice it should act on.

/** True when any of `relations` carries the explicit topic `topicKey`. Keys
 *  IDENTICALLY to topicKeyOf / the reply topic filter (explicit `r.topic`, no
 *  category/similarity fallback) so the pane that groups by a key and the pane
 *  filtered by it agree on membership. Used by the aside filter-by-topic branch
 *  (origin === 'replies') and unit-tested in isolation. */
export function relationsMatchTopic(relations, topicKey) {
  if (!topicKey) return false;
  return (relations ?? []).some((r) => r && r.topic === topicKey);
}

/** Aside pane groups (reorders) when the interaction started on the aside. */
export function asideGrouping(topicInteraction) {
  return topicInteraction && topicInteraction.origin === "aside" ? topicInteraction : null;
}
/** Aside pane is filtered when the interaction started on the replies. */
export function asideTopicFilter(topicInteraction) {
  return topicInteraction && topicInteraction.origin === "replies" ? topicInteraction : null;
}
/** Reply list clusters when the interaction started on the replies. */
export function replyGrouping(topicInteraction) {
  return topicInteraction && topicInteraction.origin === "replies" ? topicInteraction : null;
}
/** Reply list is filtered when the interaction started on the aside. */
export function replyTopicFilter(topicInteraction) {
  return topicInteraction && topicInteraction.origin === "aside" ? topicInteraction : null;
}

// ─── Interaction reducer (replace-not-stack) ─────────────────────────────────
// Operates on the three-dimension slice { topicInteraction, filterCategories,
// responseFilter }. Every ACTIVATING action returns a fully-cleared slice with
// exactly one dimension populated, so no two dimensions can ever be active at
// once. `clearTopic` clears only the topic; `clearAll` clears every dimension.

function clearedDims() {
  return { topicInteraction: null, filterCategories: new Set(), responseFilter: null };
}

export function reduceInteraction(dims, action) {
  switch (action.type) {
    case "asideTopic":
      return {
        ...clearedDims(),
        topicInteraction: { origin: "aside", topicKey: action.topicKey, anchor: action.anchor },
      };
    case "replyTopic":
      return {
        ...clearedDims(),
        topicInteraction: { origin: "replies", topicKey: action.topicKey, anchor: action.anchor },
      };
    case "category":
      return { ...clearedDims(), filterCategories: new Set(action.cats) };
    case "passage":
      return { ...clearedDims(), responseFilter: action.span };
    case "clearTopic":
      return { ...dims, topicInteraction: null };
    case "clearAll":
      return clearedDims();
    default:
      return dims;
  }
}

// ─── Per-focus restore validation ────────────────────────────────────────────

// ─── WS6: Back-button undo ring (pure logic) ─────────────────────────────────
// The undo ring is an in-memory stack of {pathname, focusId, snapshot} entries,
// capped so old states drop off (documented as non-undoable). These helpers are
// framework-free so the push/cap/scope-match invariants are unit-testable; the
// React store (highlightStore.ts) owns the live ring + the history sentinel and
// calls into them.

/** Push an entry onto the ring, dropping the OLDEST entry when over `cap`. Pure
 *  — returns a new array, never mutates the input. */
export function pushUndoEntry(ring, entry, cap) {
  const next = [...ring, entry];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** True when the ring is non-empty AND its TOP entry's scope matches `scope`
 *  ({pathname, focusId}). This is the in-memory popstate detection predicate:
 *  a Back is an undo only when the top of the ring belongs to the current
 *  route + focus. Keyed on both fields so a marker for post A is never consumed
 *  while viewing post B (critique B4). */
export function ringTopMatchesScope(ring, scope) {
  if (!ring || ring.length === 0 || !scope) return false;
  const top = ring[ring.length - 1];
  return top.pathname === scope.pathname && top.focusId === scope.focusId;
}

/** Derive the focus id from either detail-route family. The live Mastodon
 *  `/posts/[id]` page has no matching @aside route, so it cannot rely on the
 *  related-panel mount to publish `currentPanelFocusId`; URL-derived scope
 *  keeps tab/filter history undoable there too. */
export function detailFocusIdFromPath(pathname) {
  const match = /^\/(?:(?:ChineseEVs|AIWorkforce)\/)?posts\/([^/]+)\/?$/.exec(pathname ?? '');
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Validate a restored topic interaction against the CURRENT focus data.
 *  `resolveTopicKey(anchor, origin)` returns the topic key that currently lives
 *  at the interaction's anchor (or null/undefined if that span is gone). The
 *  `origin` is forwarded so the resolver can route an aside-origin anchor
 *  against the related cards and a reply-origin anchor against the thread's
 *  reply relations (the two live in different panes / data sources). The whole
 *  interaction is dropped unless the anchor still resolves to the SAME topic
 *  key — never a partial restore. */
export function validateTopicInteraction(topicInteraction, resolveTopicKey) {
  if (!topicInteraction) return null;
  const current = resolveTopicKey
    ? resolveTopicKey(topicInteraction.anchor, topicInteraction.origin)
    : null;
  return current && current === topicInteraction.topicKey ? topicInteraction : null;
}
