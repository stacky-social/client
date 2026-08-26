export interface HashtagDefinition {
  name: string;
  description: string;
  local: boolean;
  /** Mastodon tag used by older server data when it differs from the public label. */
  apiTag?: string;
}

/**
 * Hashtags that anchor intentional conversations in CrossWeave.
 *
 * AIWorkforce is backed by the bundled study corpus until that corpus is
 * imported into Mastodon. StackyInjection uses Mastodon's normal tag APIs; it
 * is listed here so people can discover the older server conversation without
 * exposing implementation-oriented source labels on individual posts.
 */
export const HASHTAG_CATALOG: readonly HashtagDefinition[] = [
  {
    name: "AIWorkforce",
    description: "AI, jobs, worker transitions, automation, and economic policy",
    local: true,
  },
  {
    name: "StackyInjection",
    description: "Earlier New York Times, Fox News, and community conversations",
    local: false,
    apiTag: "StackyInjectionPost",
  },
] as const;

export function normalizeHashtag(value: string): string {
  return value.trim().replace(/^#/, "").toLowerCase();
}

export function getHashtagDefinition(value: string): HashtagDefinition | undefined {
  const normalized = normalizeHashtag(value);
  return HASHTAG_CATALOG.find((tag) => tag.name.toLowerCase() === normalized);
}

export function searchKnownHashtags(query: string): HashtagDefinition[] {
  const normalized = normalizeHashtag(query);
  if (!normalized) return [...HASHTAG_CATALOG];
  return HASHTAG_CATALOG.filter((tag) =>
    tag.name.toLowerCase().includes(normalized) ||
    tag.description.toLowerCase().includes(normalized),
  );
}
