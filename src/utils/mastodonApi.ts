export const MASTODON_INSTANCE_URL = (
  process.env.NEXT_PUBLIC_MASTODON_INSTANCE_URL || 'https://beta.stacky.social'
).replace(/\/$/, '');

export const RELATED_POSTS_API_URL = (
  process.env.NEXT_PUBLIC_RELATED_POSTS_API_URL || 'https://beta.stacky.social:3002'
).replace(/\/$/, '');

export const MASTODON_STATUS_CREATED_EVENT = 'crossweave:mastodon-status-created';
export const MASTODON_STATUS_DELETED_EVENT = 'crossweave:mastodon-status-deleted';
export const MASTODON_STATUS_MAX_LENGTH = 500;

export interface MastodonAccount {
  id: string;
  username: string;
  acct: string;
  display_name: string;
  avatar: string;
  [key: string]: unknown;
}

export interface MastodonStatus {
  id: string;
  content: string;
  created_at: string;
  account: MastodonAccount;
  replies_count: number;
  favourites_count: number;
  favourited: boolean;
  bookmarked: boolean;
  media_attachments: Array<{ url: string }>;
  card?: {
    title: string;
    description: string;
    image?: string | null;
    url: string;
  } | null;
  [key: string]: unknown;
}

export interface MastodonHashtag {
  name: string;
  url: string;
  history?: Array<{ day: string; uses: string; accounts: string }>;
}

export interface MastodonSearchResults {
  accounts: MastodonAccount[];
  statuses: MastodonStatus[];
  hashtags: MastodonHashtag[];
}

export async function searchMastodon(
  accessToken: string,
  query: string,
  signal?: AbortSignal,
): Promise<MastodonSearchResults> {
  const params = new URLSearchParams({
    q: query,
    resolve: "true",
    limit: "10",
  });
  const response = await fetch(`${MASTODON_INSTANCE_URL}/api/v2/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!response.ok) throw new Error(`Mastodon search failed with ${response.status}`);
  const data = await response.json();
  return {
    accounts: Array.isArray(data?.accounts) ? data.accounts : [],
    statuses: Array.isArray(data?.statuses) ? data.statuses : [],
    hashtags: Array.isArray(data?.hashtags) ? data.hashtags : [],
  };
}

async function fetchMastodonStatuses(
  path: string,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<MastodonStatus[]> {
  const response = await fetch(`${MASTODON_INSTANCE_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    signal,
  });
  if (!response.ok) throw new Error(`Mastodon timeline request failed with ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/** Fetch the actual posts authored by a selected search account. */
export function fetchMastodonAccountStatuses(
  accountId: string,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<MastodonStatus[]> {
  const params = new URLSearchParams({ limit: "40", exclude_replies: "false" });
  return fetchMastodonStatuses(
    `/api/v1/accounts/${encodeURIComponent(accountId)}/statuses?${params}`,
    accessToken,
    signal,
  );
}

/** Fetch the actual timeline behind a selected search hashtag. */
export function fetchMastodonHashtagTimeline(
  tag: string,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<MastodonStatus[]> {
  const params = new URLSearchParams({ limit: "40" });
  return fetchMastodonStatuses(
    `/api/v1/timelines/tag/${encodeURIComponent(tag.replace(/^#/, ""))}?${params}`,
    accessToken,
    signal,
  );
}

export async function createMastodonStatus(
  accessToken: string,
  status: string,
): Promise<MastodonStatus> {
  const response = await fetch(`${MASTODON_INSTANCE_URL}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data.error === 'string'
      ? data.error
      : 'Mastodon could not publish this post.';
    throw new Error(message);
  }
  return data as MastodonStatus;
}

export function publishCreatedMastodonStatus(status: MastodonStatus): void {
  window.dispatchEvent(new CustomEvent(MASTODON_STATUS_CREATED_EVENT, { detail: status }));
}

/** Notify every mounted timeline that a successfully deleted status is gone. */
export function publishDeletedMastodonStatus(postId: string): void {
  window.dispatchEvent(new CustomEvent(MASTODON_STATUS_DELETED_EVENT, {
    detail: { postId },
  }));
}
