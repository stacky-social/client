/**
 * Weave followed conversation posts into a primary Mastodon collection.
 *
 * Each source keeps its own newest-first order. Supplemental posts appear at a
 * steady cadence instead of being buried by their older fixture timestamps.
 * Primary records win id collisions so this adapter disappears cleanly once a
 * curated post is imported into Mastodon.
 */
export function weaveTimeline(primary, supplemental, primaryRun = 3) {
  const safeRun = Number.isFinite(primaryRun) ? Math.max(1, Math.trunc(primaryRun)) : 3;
  const primaryIds = new Set(primary.map((post) => post.postId));
  const seenSupplemental = new Set();
  const remainingSupplemental = supplemental.filter((post) => {
    if (primaryIds.has(post.postId) || seenSupplemental.has(post.postId)) return false;
    seenSupplemental.add(post.postId);
    return true;
  });

  if (primary.length === 0) return remainingSupplemental;
  if (remainingSupplemental.length === 0) return [...primary];

  const result = [];
  let primaryIndex = 0;
  let supplementalIndex = 0;

  while (primaryIndex < primary.length) {
    result.push(...primary.slice(primaryIndex, primaryIndex + safeRun));
    primaryIndex += safeRun;
    if (supplementalIndex < remainingSupplemental.length) {
      result.push(remainingSupplemental[supplementalIndex]);
      supplementalIndex += 1;
    }
  }

  result.push(...remainingSupplemental.slice(supplementalIndex));
  return result;
}
