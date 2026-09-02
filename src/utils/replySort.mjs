// Pure reply ordering + summary logic for the thread view. Plain JS so the
// node:test suite imports it directly; the page passes accessors for rank and
// relations so this module stays data-shape agnostic.

import { postDateTimestamp } from './postDate.mjs';

/** Final tiebreak: stable id order. Keeps every mode's ordering fully
 *  deterministic (reproducible study orderings) even for replies that tie on
 *  timestamp AND score/likes. */
const byId = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/** 'top' | 'time' | 'liked'. Unknown modes fall back to 'time' (newest first). */
export function sortReplies(replies, mode, { rankOf = () => undefined, relationsOf = () => [] } = {}) {
  const arr = [...replies];
  // Numeric timestamp compare — String.localeCompare on ISO dates is
  // locale-collation dependent in theory; Date.parse is not. Ties fall to id.
  const byNewest = (a, b) =>
    (postDateTimestamp(b.created_at) ?? 0) - (postDateTimestamp(a.created_at) ?? 0) || byId(a, b);

  if (mode === 'liked') {
    return arr.sort((a, b) => (b.favourites_count ?? 0) - (a.favourites_count ?? 0) || byNewest(a, b));
  }

  if (mode === 'top') {
    // Ranked replies come first, ordered by rank (1 = best). Unranked replies
    // follow, scored by contribution breadth (distinct categories), having any
    // contribution at all, and a dampened like count — a stand-in for the
    // backend's quality/diversity ranking until it exists for replies.
    const score = (r) => {
      const rels = relationsOf(r) ?? [];
      const cats = new Set(rels.map((x) => x.category));
      return 2 * cats.size + (rels.length > 0 ? 1 : 0) + Math.log10(1 + (r.favourites_count ?? 0));
    };
    return arr.sort((a, b) => {
      const ra = rankOf(a);
      const rb = rankOf(b);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return score(b) - score(a) || byNewest(a, b);
    });
  }

  return arr.sort(byNewest);
}

function firstSentenceOf(text) {
  const clean = String(text ?? '').replace(/<[^>]*>/g, '').trim();
  const m = clean.match(/[^.!?]*[.!?]/);
  return (m ? m[0] : clean).trim();
}

/**
 * Deterministic local digest of the currently displayed replies — the demo
 * stand-in for an LLM summary. Returns:
 * { total, withContributions, byCategory: [[category, count]...] desc,
 *   topTopics: [topic...] desc, sample: [{ author, firstSentence }] }
 */
export function buildReplySummary(replies, { relationsOf = () => [] } = {}) {
  const byCategory = new Map();
  const byTopic = new Map();
  let withContributions = 0;

  for (const r of replies) {
    const rels = relationsOf(r) ?? [];
    if (rels.length > 0) withContributions++;
    const cats = new Set(rels.map((x) => x.category));
    cats.forEach((c) => byCategory.set(c, (byCategory.get(c) ?? 0) + 1));
    const topics = new Set(rels.map((x) => x.topic).filter(Boolean));
    topics.forEach((t) => byTopic.set(t, (byTopic.get(t) ?? 0) + 1));
  }

  const sample = [...replies]
    .sort((a, b) => (b.favourites_count ?? 0) - (a.favourites_count ?? 0))
    .slice(0, 2)
    .map((r) => ({
      author: r.account?.username ?? r.account?.display_name ?? 'unknown',
      firstSentence: firstSentenceOf(r.plainText ?? r.content),
    }));

  return {
    total: replies.length,
    withContributions,
    byCategory: Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]),
    topTopics: Array.from(byTopic.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t),
    sample,
  };
}
