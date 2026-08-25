/**
 * Resolve the number shown beside the reply action.
 *
 * Curated/demo cards promise replies that can actually be opened in the thread,
 * so the seeded count is derived from explicit direct-child edges rather than
 * imported source-site metadata. Locally-created direct replies are then added
 * exactly once. Related-post membership is deliberately not an input.
 */
export function resolveReplyCount(visibleSeededReplies, localReplies = 0) {
  const safeInteger = (value) =>
    Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

  return safeInteger(visibleSeededReplies) + safeInteger(localReplies);
}
