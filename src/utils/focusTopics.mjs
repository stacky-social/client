/**
 * Topic choices for one semantic focus-post hotspot. Kept framework-free so
 * the feed post and sticky excerpt share identical ordering/cycling rules.
 */

export function focusTopicCandidates(relations, rangeIds, relatedPosts = []) {
  const ids = Array.from(new Set(rangeIds)).filter((id) => Number.isInteger(id));
  const firstRelationByTopic = new Map();
  for (const id of ids) {
    const topicKey = relations?.[id]?.topic;
    if (topicKey && !firstRelationByTopic.has(topicKey)) {
      firstRelationByTopic.set(topicKey, id);
    }
  }

  const postIdsByTopic = new Map();
  for (const post of relatedPosts ?? []) {
    const postId = String(post?.id ?? post?.postId ?? post?.topPost?.id ?? post?.topPost?.postId ?? '');
    if (!postId) continue;
    for (const relation of post?.relations ?? post?.topPost?.relations ?? []) {
      const topicKey = relation?.topic;
      if (!topicKey || !firstRelationByTopic.has(topicKey)) continue;
      if (!postIdsByTopic.has(topicKey)) postIdsByTopic.set(topicKey, new Set());
      postIdsByTopic.get(topicKey).add(postId);
    }
  }

  return Array.from(firstRelationByTopic, ([topicKey, rangeIndex]) => ({
    topicKey,
    rangeIndex,
    count: postIdsByTopic.get(topicKey)?.size ?? 0,
  })).sort((a, b) => b.count - a.count || a.topicKey.localeCompare(b.topicKey));
}

/**
 * Return the next topic for repeat-click cycling, or null for the trailing
 * "no filter" state. A selection from another hotspot always starts at item 1.
 */
export function nextFocusTopic(candidates, interaction, postId, rangeIds) {
  if (!candidates?.length) return null;
  const sameHotspot =
    interaction?.origin === 'focus' &&
    interaction.anchor?.postId === postId &&
    rangeIds.includes(interaction.anchor.rangeIndex);
  if (!sameHotspot) return candidates[0];
  const currentIndex = candidates.findIndex((item) => item.topicKey === interaction.topicKey);
  if (currentIndex < 0) return candidates[0];
  return candidates[currentIndex + 1] ?? null;
}
