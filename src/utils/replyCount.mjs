/**
 * Resolve the number shown beside the reply action.
 *
 * The backend/source count is authoritative because the demo only carries a
 * curated subset of each conversation. Known direct thread children may repair
 * an obviously low synthetic count, and locally-created direct replies are then
 * added exactly once. Related-post membership is deliberately not an input.
 */
export function resolveReplyCount(sourceCount, knownDirectReplies = 0, localReplies = 0) {
  const safeInteger = (value) =>
    Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

  return Math.max(safeInteger(sourceCount), safeInteger(knownDirectReplies))
    + safeInteger(localReplies);
}
