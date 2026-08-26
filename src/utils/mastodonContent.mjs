const ENTITY_MAP = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
});

function decodeHtmlEntities(value) {
  return String(value ?? '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return ENTITY_MAP[normalized] ?? match;
  });
}

function unescapeMarkdown(value) {
  return String(value ?? '').replace(/\\([\\`*_[\]{}()#+\-.!>])/g, '$1');
}

function cleanUrl(candidate) {
  const decoded = unescapeMarkdown(decodeHtmlEntities(candidate))
    .trim()
    .replace(/[⌊⌋⌈⌉\])},.;:!?]+$/g, '');
  try {
    const url = new URL(decoded);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function comparableUrl(candidate) {
  const cleaned = cleanUrl(candidate);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    url.hash = '';
    return url.toString();
  } catch {
    return cleaned;
  }
}

/**
 * Hide a URL that is already rendered as the card's source action without
 * changing the source string's length. Offset-annotated demo posts index into
 * this exact text, so deleting the Markdown token would shift every relation.
 */
export function maskDuplicateArticleReferences(input, articleUrl) {
  const source = String(input ?? '');
  const target = comparableUrl(articleUrl);
  if (!target) return source;

  const mask = (value) => value.replace(/[^\r\n]/g, ' ');
  const sameTarget = (candidate) => comparableUrl(candidate) === target;

  let masked = source.replace(
    /\[([^\]\r\n]*)\]\(\s*(https?:\/\/(?:\\.|[^\s)])+)\s*\)/gi,
    (match, _label, destination) => sameTarget(destination) ? mask(match) : match,
  );

  masked = masked.replace(/https?:\/\/[^\s<>"']+/gi, (match, offset, whole) => {
    // Preserve a Markdown link whose destination is different. Matching the
    // URL-shaped label alone would leave a broken "[ ](destination)" token.
    if (whole[offset - 1] === '[' || whole.slice(Math.max(0, offset - 2), offset) === '](') {
      return match;
    }
    const trailing = match.match(/[⌊⌋⌈⌉\])},.;:!?]+$/)?.[0] ?? '';
    const candidate = trailing ? match.slice(0, -trailing.length) : match;
    return sameTarget(candidate) ? `${mask(candidate)}${trailing}` : match;
  });

  return masked;
}

/** Return the unique HTTP(S) links embedded in Mastodon HTML, Markdown, or text. */
export function extractMastodonLinks(input) {
  const source = String(input ?? '');
  const links = [];
  const seen = new Set();
  const add = (candidate) => {
    const url = cleanUrl(candidate);
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push(url);
  };

  for (const match of source.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
  const residual = resolveMastodonRevision(source)
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ' ');
  for (const match of residual.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi)) add(match[1]);
  for (const match of residual.matchAll(/https?:\/\/[^\s<>"']+/gi)) add(match[0]);
  return links;
}

/** Resolve the backend's floor/ceiling track-change notation to the edited text. */
export function resolveMastodonRevision(input) {
  return String(input ?? '')
    .replace(/⌊[\s\S]*?⌋/g, '')
    .replace(/⌈([\s\S]*?)⌉/g, (_match, inserted) => {
      // Some legacy enrichment responses wrap the inserted payload twice:
      // the ceiling marks identify it as an insertion, while square brackets
      // delimit the inserted token itself (for example ⌈[,]⌉ or ⌈[an]⌉).
      // The brackets are transport notation, not authored prose. Only unwrap a
      // balanced pair spanning the whole insertion so ordinary square-bracket
      // text outside track changes remains untouched.
      const insertion = String(inserted);
      const leadingWhitespace = insertion.match(/^\s*/)?.[0] ?? '';
      const trailingWhitespace = insertion.match(/\s*$/)?.[0] ?? '';
      const trimmed = insertion.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return `${leadingWhitespace}${trimmed.slice(1, -1)}${trailingWhitespace}`;
      }
      return insertion;
    })
    .replace(/[⌊⌋⌈⌉]/g, '');
}

function anchorToLabel(_match, attributes, innerHtml) {
  // Mastodon splits displayed URLs across invisible/ellipsis spans. Keeping the
  // span text after stripping tags produces strings such as
  // "https://www. foxnews.com/us /story". The URL is exposed separately by
  // extractMastodonLinks(), so remove these transport-only anchors from prose.
  if (/class\s*=\s*["'][^"']*(?:invisible|ellipsis)/i.test(innerHtml)) return ' ';

  const label = decodeHtmlEntities(innerHtml.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  const href = attributes.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
  const hrefUrl = cleanUrl(href);
  if (!label || /^https?:\/\//i.test(label)) return ' ';
  if (hrefUrl) {
    try {
      if (label.replace(/^www\./i, '').startsWith(new URL(hrefUrl).hostname.replace(/^www\./i, ''))) return ' ';
    } catch { /* cleanUrl already validated it */ }
  }
  return ` ${label} `;
}

/**
 * Convert Mastodon HTML or imported article text into clean card prose.
 * Transport URLs and duplicated Published metadata are intentionally removed;
 * callers can render extractMastodonLinks() as real links beside the prose.
 */
export function normalizeMastodonText(input) {
  let text = resolveMastodonRevision(input);

  text = text.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, anchorToLabel);
  text = text.replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi, (_match, label) => {
    return /^\s*(?:link|read|open)(?:\s+to)?(?:\s+article)?\s*:?\s*$/i.test(label) ? ' ' : ` ${label} `;
  });
  text = text.replace(/https?:\/\/[^\s<>"'\[\]]+/gi, ' ');
  text = text.replace(/Published:\s*\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?/gi, ' ');
  text = text.replace(/Published:\s*[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}/g, ' ');

  text = text
    .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|blockquote|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  text = decodeHtmlEntities(text)
    .replace(/(^|\s)[\[\]()]+(?=\s|$|[.,;:!?])/g, '$1')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return text;
}

export function mastodonLinkHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}
