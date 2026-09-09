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

function trimUrlPunctuation(value) {
  let url = value;
  let trailing = '';
  while (/[.,;:!?]$/.test(url)) {
    trailing = `${url.slice(-1)}${trailing}`;
    url = url.slice(0, -1);
  }
  while (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    trailing = `)${trailing}`;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

function httpUrl(value) {
  const decoded = unescapeMarkdown(decodeHtmlEntities(value)).trim();
  const { url } = trimUrlPunctuation(decoded);
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? { href: parsed.toString(), label: url }
      : null;
  } catch {
    return null;
  }
}

/**
 * Split authored prose into ordinary text and visible HTTP(S) links. Markdown
 * destinations deliberately render as their URL rather than a generic label:
 * the destination may be a video, dataset, thread, or anything else.
 */
export function splitInlineLinks(input) {
  const source = String(input ?? '');
  const htmlAnchorPattern = /<a\b[^>]*href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?<\/a>/gi;
  const encodedAnchorPattern = /&lt;a\b[\s\S]*?href\s*=\s*(?:["']|&quot;)(https?:\/\/[\s\S]*?)(?:["']|&quot;)[\s\S]*?&gt;[\s\S]*?&lt;\/a&gt;/gi;
  const markdownPattern = /\[([^\]\r\n]*)\]\(\s*(https?:\/\/(?:\\.|[^\s)])+)\s*\)/gi;
  const barePattern = /https?:\/\/[^\s<>"']+/gi;
  const tokens = [];
  let cursor = 0;

  while (cursor < source.length) {
    htmlAnchorPattern.lastIndex = cursor;
    encodedAnchorPattern.lastIndex = cursor;
    markdownPattern.lastIndex = cursor;
    barePattern.lastIndex = cursor;
    const htmlAnchor = htmlAnchorPattern.exec(source);
    const encodedAnchor = encodedAnchorPattern.exec(source);
    const markdown = markdownPattern.exec(source);
    const bare = barePattern.exec(source);
    const next = [
      htmlAnchor && { kind: 'anchor', match: htmlAnchor },
      encodedAnchor && { kind: 'anchor', match: encodedAnchor },
      markdown && { kind: 'markdown', match: markdown },
      bare && { kind: 'bare', match: bare },
    ].filter(Boolean).sort((a, b) => a.match.index - b.match.index)[0];
    if (!next) break;

    const { kind, match } = next;
    const candidate = kind === 'anchor' ? match[1] : kind === 'markdown' ? match[2] : match[0];
    const parsed = httpUrl(candidate);
    if (!parsed) {
      const nextCursor = match.index + Math.max(1, match[0].length);
      tokens.push({ type: 'text', value: source.slice(cursor, nextCursor) });
      cursor = nextCursor;
      continue;
    }

    if (match.index > cursor) tokens.push({ type: 'text', value: source.slice(cursor, match.index) });
    let raw = match[0];
    let trailing = '';
    if (kind === 'bare') {
      const trimmed = trimUrlPunctuation(unescapeMarkdown(decodeHtmlEntities(raw)));
      trailing = trimmed.trailing;
      raw = raw.slice(0, raw.length - trailing.length);
    }
    tokens.push({ type: 'link', href: parsed.href, label: parsed.label, raw });
    if (trailing) tokens.push({ type: 'text', value: trailing });
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) tokens.push({ type: 'text', value: source.slice(cursor) });
  return tokens.length > 0 ? tokens : [{ type: 'text', value: source }];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function maskWithoutChangingLines(value) {
  return value.replace(/[^\r\n]/g, ' ');
}

function visibleUrlWithOriginalLength(match, candidate) {
  const parsed = httpUrl(candidate);
  if (!parsed || parsed.label.length > match.length) return match;
  return `${parsed.label}${maskWithoutChangingLines(match.slice(parsed.label.length))}`;
}

/**
 * Collapse HTML/Markdown link syntax to one visible URL while retaining the
 * source string's exact length. Relationship annotations use source offsets,
 * so text after a link must not move when the transport markup disappears.
 */
export function preserveInlineLinkOffsets(input) {
  return String(input ?? '')
    .replace(
      /&lt;a\b[\s\S]*?href\s*=\s*(?:["']|&quot;)(https?:\/\/[\s\S]*?)(?:["']|&quot;)[\s\S]*?&gt;[\s\S]*?&lt;\/a&gt;/gi,
      (match, destination) => visibleUrlWithOriginalLength(match, destination),
    )
    .replace(
      /<a\b[^>]*href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?<\/a>/gi,
      (match, destination) => visibleUrlWithOriginalLength(match, destination),
    )
    .replace(
      /\[[^\]\r\n]*\]\(\s*(https?:\/\/(?:\\.|[^\s)])+)\s*\)/gi,
      (match, destination) => visibleUrlWithOriginalLength(match, destination),
    );
}

/** Add inline anchors to text nodes without touching existing HTML anchors. */
export function linkifyHtmlUrls(input) {
  const source = String(input ?? '');
  const parts = source.split(/(<[^>]+>)/g);
  let anchorDepth = 0;

  return parts.map((part) => {
    if (part.startsWith('<')) {
      if (/^<a\b/i.test(part)) anchorDepth += 1;
      else if (/^<\/a\b/i.test(part)) anchorDepth = Math.max(0, anchorDepth - 1);
      return part;
    }
    if (anchorDepth > 0 || !/https?:\/\//i.test(part)) return part;

    return splitInlineLinks(part).map((token) => {
      if (token.type === 'text') return token.value;
      const sourceLength = decodeHtmlEntities(token.raw).length;
      const placeholderLength = Math.max(0, sourceLength - token.label.length);
      const placeholder = placeholderLength > 0
        ? `<span class="inline-link-offset-placeholder" aria-hidden="true">${' '.repeat(placeholderLength)}</span>`
        : '';
      return `<a class="inline-content-link" data-inline-content-link href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(token.label)}</a>${placeholder}`;
    }).join('');
  }).join('');
}
