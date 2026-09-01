const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

export function normalizeCuratedSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distinct human-readable terms used for both matching and visual highlights. */
export function curatedSearchTerms(query) {
  const normalized = normalizeCuratedSearchText(query).replace(/^[@#]+/, '');
  const matches = normalized.match(WORD_PATTERN) ?? [];
  return Array.from(new Set(matches.filter(Boolean))).slice(0, 12);
}

/**
 * Text search is intentionally an AND search: every entered term must occur in
 * the post or author metadata. This avoids thousands of weak matches for a
 * multi-word query while still tolerating punctuation and whitespace changes.
 */
export function matchesCuratedSearch(haystack, query) {
  const normalized = normalizeCuratedSearchText(haystack);
  const terms = curatedSearchTerms(query);
  return terms.length > 0 && terms.every((term) => normalized.includes(term));
}

export function curatedSearchScore({ text, author = '', account = '', timelineRoot = false }, query) {
  const normalizedQuery = normalizeCuratedSearchText(query).replace(/^[@#]+/, '');
  const normalizedText = normalizeCuratedSearchText(text);
  const normalizedAuthor = normalizeCuratedSearchText(`${author} ${account}`);
  const terms = curatedSearchTerms(query);
  if (terms.length === 0) return Number.NEGATIVE_INFINITY;

  let score = timelineRoot ? 8 : 0;
  if (normalizedQuery && normalizedText.includes(normalizedQuery)) score += 100;
  for (const term of terms) {
    if (normalizedText.includes(term)) score += 12;
    if (normalizedAuthor.includes(term)) score += 18;
  }
  return score;
}
