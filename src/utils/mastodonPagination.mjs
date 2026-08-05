/**
 * Extract Mastodon's opaque next-page max_id from an RFC 8288 Link header.
 * Returns null when the timeline has no next relation.
 */
export function nextMaxIdFromLink(linkHeader) {
  if (!linkHeader || typeof linkHeader !== 'string') return null;
  for (const part of linkHeader.split(',')) {
    if (!/;\s*rel=(?:"next"|next)(?:;|\s|$)/i.test(part)) continue;
    const match = part.match(/<([^>]+)>/);
    if (!match) continue;
    try {
      return new URL(match[1]).searchParams.get('max_id');
    } catch {
      return null;
    }
  }
  return null;
}
