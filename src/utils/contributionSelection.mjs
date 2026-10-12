/** Select one color without discarding alternate contribution metadata.
 * Explicit interaction wins; probabilities break remaining competition. Equal
 * or absent scores retain source order for stable legacy-data rendering.
 */
export function selectWinningRelation(items, preferredCategory, filterCategories) {
  if (!items?.length) return null;
  const preferred = preferredCategory ? items.filter((item) => item.category === preferredCategory) : [];
  const filtered = filterCategories?.size ? items.filter((item) => filterCategories.has(item.category)) : [];
  const candidates = preferred.length ? preferred : filtered.length ? filtered : items;
  const score = (item) => Number.isFinite(item.probability) ? item.probability : -Infinity;
  return candidates.reduce((winner, item) => score(item) > score(winner) ? item : winner);
}

export function chooseContribution(items, options = {}) {
  return selectWinningRelation(items, options.hoveredCategory, options.filterCategories);
}

/** Partition overlap into exact non-overlapping intervals, retaining identities. */
export function contributionSegments(relations, textLength) {
  const entries = relations.map((relation, index) => ({ ...relation, index }))
    .filter((r) => r.contentStart >= 0 && r.contentEnd <= textLength && r.contentEnd > r.contentStart);
  const points = [...new Set(entries.flatMap((r) => [r.contentStart, r.contentEnd]))].sort((a, b) => a - b);
  return points.slice(0, -1).flatMap((start, index) => {
    const end = points[index + 1];
    const contributors = entries.filter((r) => r.contentStart <= start && r.contentEnd >= end);
    return contributors.length ? [{ start, end, contributors }] : [];
  });
}
