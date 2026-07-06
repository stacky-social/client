// Pure reply-list filter + cluster logic for cross-pane filtering (Task 7).
// Plain JS so the node:test suite imports it directly. Semantics mirror the
// related panel: categories AND together; the passage filter keeps replies
// whose relations overlap the focus span; the topic filter matches relation
// topics exactly (reply relations always carry explicit topics in the mock).

/**
 * @param replies    top-level reply objects
 * @param relationsOf (reply) => Relation[]
 * @param filters    { filterCategories?: Set|Array, responseFilter?: {start,end}|null, topicFilter?: string|null }
 */
export function filterReplies(replies, relationsOf, { filterCategories, responseFilter, topicFilter } = {}) {
  const cats = filterCategories ? Array.from(filterCategories) : [];
  return replies.filter((reply) => {
    const rels = relationsOf(reply) ?? [];
    if (cats.length > 0) {
      const own = new Set(rels.map((r) => r.category));
      if (!cats.every((c) => own.has(c))) return false;
    }
    if (responseFilter) {
      const overlaps = rels.some((r) => r.focusStart < responseFilter.end && responseFilter.start < r.focusEnd);
      if (!overlaps) return false;
    }
    if (topicFilter) {
      if (!rels.some((r) => r.topic === topicFilter)) return false;
    }
    return true;
  });
}

/**
 * Rerank-in-place for the reply list (mirrors reorderForAnchor's contract):
 * topic-matching replies ABOVE the anchor move down to immediately above it,
 * matches BELOW move up to immediately below it — everything else keeps its
 * relative order and the anchor itself never moves. Reply lists are short, so
 * unlike the related panel there is no pagination of below-matches.
 *
 * @param orderedIds    current top-level order (post-filter, post-sort)
 * @param relationsOfId (id) => Relation[]
 * @param anchorId      the clicked reply
 * @param anchorTopic   topic driving the cluster
 * @returns { order: string[], memberIds: Set<string> } — memberIds includes the anchor
 */
export function clusterTopLevel(orderedIds, relationsOfId, anchorId, anchorTopic) {
  const memberIds = new Set([anchorId]);
  const anchorIdx = orderedIds.indexOf(anchorId);
  if (anchorIdx < 0) return { order: [...orderedIds], memberIds };

  const matches = (id) =>
    id !== anchorId && (relationsOfId(id) ?? []).some((r) => r.topic === anchorTopic);

  const aboveMatched = [];
  const aboveRest = [];
  for (const id of orderedIds.slice(0, anchorIdx)) {
    (matches(id) ? aboveMatched : aboveRest).push(id);
  }
  const belowMatched = [];
  const belowRest = [];
  for (const id of orderedIds.slice(anchorIdx + 1)) {
    (matches(id) ? belowMatched : belowRest).push(id);
  }

  [...aboveMatched, ...belowMatched].forEach((id) => memberIds.add(id));
  return {
    order: [...aboveRest, ...aboveMatched, anchorId, ...belowMatched, ...belowRest],
    memberIds,
  };
}
