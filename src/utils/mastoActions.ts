import {
  getPost as getStorePost,
  toggleLike as storeToggleLike,
  toggleBookmark as storeToggleBookmark,
} from './localStore';
import axios from 'axios';
import { MASTODON_INSTANCE_URL } from './mastodonApi';

// ─── Local (no-backend) mode ──────────────────────────────────────────────────
//
// In local/demo/research mode these helpers delegate to the localStorage-backed
// store (`localStore.ts`) instead of hitting the Mastodon REST API. The store
// owns the source of truth for liked/bookmarked state plus each post's
// `favourited` flag and `favourites_count`, and persists across reloads.
//
// When an OAuth token is present these helpers persist the interaction to
// Mastodon. Without a token they preserve the JSON demo's local behavior.
// NOTE: the store's toggle functions ignore the `currentlyFavourited` /
// `currentlyBookmarked` argument (they derive the new state from persisted
// state), but we keep the parameters to preserve the exported signature used by
// callers such as RelatedStacks.tsx and Post.tsx.

const REQUEST_TIMEOUT_MS = 10000;

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('accessToken');
  return token && token !== 'null' && token !== 'undefined' ? token : null;
}

/**
 * Result of a toggle action.
 * - `ok: true`  → the request succeeded; `value` is the new (toggled) state.
 * - `ok: false` → the request failed; `value` is the unchanged (original) state
 *   so callers can fall back to it, and they should surface the failure to the user.
 */
export type ToggleResult = { ok: boolean; value: boolean };

export async function toggleFavourite(postId: string, currentlyFavourited: boolean): Promise<ToggleResult> {
  // Curated/demo posts remain JSON-backed during the migration. Their ids do
  // not exist in Mastodon yet, even when the viewer is authenticated.
  if (getStorePost(postId)) return storeToggleLike(postId);
  const token = getAccessToken();
  if (!token) return storeToggleLike(postId);
  try {
    const endpoint = currentlyFavourited
      ? `${MASTODON_INSTANCE_URL}/api/v1/statuses/${postId}/unfavourite`
      : `${MASTODON_INSTANCE_URL}/api/v1/statuses/${postId}/favourite`;
    const response = await axios.post(endpoint, {}, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
    });
    return { ok: true, value: Boolean(response.data?.favourited) };
  } catch (error) {
    console.error('toggleFavourite failed:', error);
    return { ok: false, value: currentlyFavourited };
  }
}

export async function toggleBookmark(postId: string, currentlyBookmarked: boolean): Promise<ToggleResult> {
  if (getStorePost(postId)) return storeToggleBookmark(postId);
  const token = getAccessToken();
  if (!token) return storeToggleBookmark(postId);
  try {
    const endpoint = currentlyBookmarked
      ? `${MASTODON_INSTANCE_URL}/api/v1/statuses/${postId}/unbookmark`
      : `${MASTODON_INSTANCE_URL}/api/v1/statuses/${postId}/bookmark`;
    const response = await axios.post(endpoint, {}, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
    });
    return { ok: true, value: Boolean(response.data?.bookmarked) };
  } catch (error) {
    console.error('toggleBookmark failed:', error);
    return { ok: false, value: currentlyBookmarked };
  }
}
