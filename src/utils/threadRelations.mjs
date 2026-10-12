import { createWordDiff } from './wordDiff.mjs';

/** Canonical focus records win; otherwise use authored provenance when available. */
export function canonicalThreadPost(post) {
  const original = post?.rewrite?.originalContent;
  if (typeof original !== 'string' || !original.length) return post;
  const escaped = original.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return { ...post, plainText: original, content: `<p>${escaped}</p>` };
}

function boundary(chunks, offset, edge) {
  let source = 0;
  let target = 0;
  for (const chunk of chunks) {
    if (chunk.kind === 'insert') {
      if (source === offset && edge === 'end') return target;
      target += chunk.text.length;
      continue;
    }
    const next = source + chunk.text.length;
    if (offset < next) return chunk.kind === 'equal' ? target + offset - source : target;
    source = next;
    if (chunk.kind === 'equal') target += chunk.text.length;
  }
  return target;
}

/** Move only reply-side coordinates from contextual text to the authored body.
 * Focus coordinates/category/topic retain the scoped relationship's semantics.
 */
export function projectThreadRelations(source, target, relations) {
  if (source === target || relations.length === 0) return relations;
  const chunks = createWordDiff(source, target);
  const range = (start, end) => {
    const mappedStart = boundary(chunks, start, 'start');
    let mappedEnd = boundary(chunks, end, 'end');
    if (mappedEnd <= mappedStart && end > start) mappedEnd = boundary(chunks, end, 'start');
    return [mappedStart, Math.max(mappedStart, mappedEnd)];
  };
  return relations.flatMap((relation) => {
    const [contentStart, contentEnd] = range(relation.contentStart, relation.contentEnd);
    // A passage entirely introduced by contextualization has no original span.
    if (contentEnd <= contentStart) return [];
    const [start, end] = range(relation.contentCommentStart, relation.contentCommentEnd);
    const contentCommentStart = Math.min(contentEnd, Math.max(contentStart, start));
    const contentCommentEnd = Math.min(contentEnd, Math.max(contentCommentStart, end));
    return [{ ...relation, contentStart, contentEnd, contentCommentStart, contentCommentEnd }];
  });
}
