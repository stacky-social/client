/**
 * Parse the date formats used by Mastodon and the curated corpora.
 *
 * Mastodon emits ISO-8601 strings. Some NYT-derived corpus records instead
 * carry Unix seconds as a string (for example, "1782404924"). JavaScript's
 * Date parser does not recognize that representation, so normalize it before
 * any display or ordering logic sees it.
 */
export function postDateTimestamp(input) {
  if (input instanceof Date) {
    const timestamp = input.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    // Contemporary Unix seconds are ~1e9; milliseconds are ~1e12.
    return Math.abs(input) < 1e12 ? input * 1000 : input;
  }

  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return null;

  if (/^-?\d{10}(?:\.\d+)?$/.test(value)) {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }
  if (/^-?\d{13}$/.test(value)) {
    const milliseconds = Number(value);
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePostDate(input) {
  const timestamp = postDateTimestamp(input);
  return timestamp == null ? null : new Date(timestamp);
}
