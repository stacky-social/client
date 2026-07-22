// Pure reply-list filter + cluster logic for cross-pane filtering (Task 7).
// Plain JS so the node:test suite imports it directly. Semantics mirror the
// related panel: categories AND together; the passage filter keeps replies
// whose relations overlap the focus span; the topic filter matches relation
// topics exactly. Reply relations are REAL crossweave descendant annotations
// emitted by scripts/convert-demo-data.mjs (from prepared_data_with_descendants);
// each carries an explicit topic. Replies whose annotation topic isn't on the
// related side (or plain unannotated replies) simply never match a topic filter.

/**
 * @param replies    top-level reply objects
 * @param relationsOf (reply) => Relation[]
 * @param filters    { filterCategories?: Set|Array, responseFilter?: {start,end}|null, topicFilter?: string|null }
 * @param branchRelationsOf optional (reply) => Relation[] returning the UNION of
 *   the whole branch's relations (top-level reply + every descendant). When
 *   provided, a branch survives if ANY reply in it matches — "show the
 *   responses about X" must not silently hide a matching nested reply just
 *   because its branch root doesn't match (the root stays as context).
 *   Omitted → own-relations-only matching (back-compatible).
 */
export function filterReplies(replies, relationsOf, { filterCategories, responseFilter, topicFilter } = {}, branchRelationsOf) {
  const cats = filterCategories ? Array.from(filterCategories) : [];
  const matchRels = branchRelationsOf ?? relationsOf;
  return replies.filter((reply) => {
    const rels = matchRels(reply) ?? [];
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

/**
 * Permanent-reorder base for the reply list (mirrors the aside's baseOrderIds
 * contract): when a cluster has ever rearranged the top level, the last
 * arrangement is persisted as the "base" and dismissing the cluster leaves
 * replies in place — only an explicit re-sort (tab switch clears the base)
 * re-derives order from the sort.
 *
 * @param sortedIds current ids in freshly-sorted order (source of truth for
 *                  which ids exist, and for the relative order of NEW ids)
 * @param baseIds   persisted base order (possibly stale: may contain ids that
 *                  no longer exist, and lack ids that are new)
 * @returns base order filtered to live ids, with new ids appended in their
 *          sorted relative order; `sortedIds` as-is when the base is empty
 */
export function applyBaseOrder(sortedIds, baseIds) {
  if (!baseIds || baseIds.length === 0) return [...sortedIds];
  const present = new Set(sortedIds);
  const kept = baseIds.filter((id) => present.has(id));
  const known = new Set(kept);
  const fresh = sortedIds.filter((id) => !known.has(id));
  return [...kept, ...fresh];
}
