/**
 * Reorders `stacks` so that posts matching `matchPredicate` that were above
 * `targetPostId` move immediately above it, and those below move immediately
 * below it. Non-matching posts stay in their relative positions.
 *
 * This implements the Group E "above → above, below → below" invariant:
 * users reading in order should not be re-exposed to posts they already
 * scrolled past just because those posts match the anchor's topic.
 */
export function reorderForAnchor<T extends { topPost: { id: string } }>(
  stacks: T[],
  targetPostId: string,
  matchPredicate: (postId: string) => boolean,
): T[] {
  const targetIdx = stacks.findIndex(s => s.topPost.id === targetPostId);
  if (targetIdx < 0) return stacks;

  const above = stacks.slice(0, targetIdx);
  const target = stacks[targetIdx];
  const below = stacks.slice(targetIdx + 1);

  const aboveMatched   = above.filter(s =>  matchPredicate(s.topPost.id));
  const aboveUnmatched = above.filter(s => !matchPredicate(s.topPost.id));
  const belowMatched   = below.filter(s =>  matchPredicate(s.topPost.id));
  const belowUnmatched = below.filter(s => !matchPredicate(s.topPost.id));

  return [
    ...aboveUnmatched,
    ...aboveMatched,
    target,
    ...belowMatched,
    ...belowUnmatched,
  ];
}
