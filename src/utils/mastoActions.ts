import { toggleLike as storeToggleLike, toggleBookmark as storeToggleBookmark } from './localStore';

// ─── Local (no-backend) mode ──────────────────────────────────────────────────
//
// In local/demo/research mode these helpers delegate to the localStorage-backed
// store (`localStore.ts`) instead of hitting the Mastodon REST API. The store
// owns the source of truth for liked/bookmarked state plus each post's
// `favourited` flag and `favourites_count`, and persists across reloads.
//
// The original axios/REST bodies are preserved in comments below; swapping back
// to a live backend is a mechanical edit of THIS FILE — restore the commented
// implementations and remove the store delegation.
//
// NOTE: the store's toggle functions ignore the `currentlyFavourited` /
// `currentlyBookmarked` argument (they derive the new state from persisted
// state), but we keep the parameters to preserve the exported signature used by
// callers such as RelatedStacks.tsx and Post.tsx.

// import axios from 'axios';
//
// const MastodonInstanceUrl = 'https://beta.stacky.social';
//
// const REQUEST_TIMEOUT_MS = 10000;
//
// function getAccessToken(): string | null {
//   if (typeof window === 'undefined') return null;
//   return localStorage.getItem('accessToken');
// }

/**
 * Result of a toggle action.
 * - `ok: true`  → the request succeeded; `value` is the new (toggled) state.
 * - `ok: false` → the request failed; `value` is the unchanged (original) state
 *   so callers can fall back to it, and they should surface the failure to the user.
 */
export type ToggleResult = { ok: boolean; value: boolean };

export async function toggleFavourite(postId: string, currentlyFavourited: boolean): Promise<ToggleResult> {
  // Local mode: delegate to the store, which flips liked[] and the post's
  // favourited + favourites_count, and returns { ok: true, value: <new state> }.
  return storeToggleLike(postId);

  // ── REST implementation (restore when swapping to a live backend) ──
  // const token = getAccessToken();
  // if (!token) return { ok: false, value: currentlyFavourited };
  // try {
  //   const endpoint = currentlyFavourited
  //     ? `${MastodonInstanceUrl}/api/v1/statuses/${postId}/unfavourite`
  //     : `${MastodonInstanceUrl}/api/v1/statuses/${postId}/favourite`;
  //   await axios.post(endpoint, {}, {
  //     headers: { Authorization: `Bearer ${token}` },
  //     timeout: REQUEST_TIMEOUT_MS,
  //   });
  //   return { ok: true, value: !currentlyFavourited };
  // } catch (error) {
  //   console.error('toggleFavourite failed:', error);
  //   return { ok: false, value: currentlyFavourited };
  // }
}

export async function toggleBookmark(postId: string, currentlyBookmarked: boolean): Promise<ToggleResult> {
  // Local mode: delegate to the store, which flips bookmarked[] and the post's
  // bookmarked flag, and returns { ok: true, value: <new state> }.
  return storeToggleBookmark(postId);

  // ── REST implementation (restore when swapping to a live backend) ──
  // const token = getAccessToken();
  // if (!token) return { ok: false, value: currentlyBookmarked };
  // try {
  //   const endpoint = currentlyBookmarked
  //     ? `${MastodonInstanceUrl}/api/v1/statuses/${postId}/unbookmark`
  //     : `${MastodonInstanceUrl}/api/v1/statuses/${postId}/bookmark`;
  //   await axios.post(endpoint, {}, {
  //     headers: { Authorization: `Bearer ${token}` },
  //     timeout: REQUEST_TIMEOUT_MS,
  //   });
  //   return { ok: true, value: !currentlyBookmarked };
  // } catch (error) {
  //   console.error('toggleBookmark failed:', error);
  //   return { ok: false, value: currentlyBookmarked };
  // }
}
