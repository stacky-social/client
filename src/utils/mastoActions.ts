import axios from 'axios';

const MastodonInstanceUrl = 'https://beta.stacky.social';

const REQUEST_TIMEOUT_MS = 10000;

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

/**
 * Result of a toggle action.
 * - `ok: true`  → the request succeeded; `value` is the new (toggled) state.
 * - `ok: false` → the request failed; `value` is the unchanged (original) state
 *   so callers can fall back to it, and they should surface the failure to the user.
 */
export type ToggleResult = { ok: boolean; value: boolean };

export async function toggleFavourite(postId: string, currentlyFavourited: boolean): Promise<ToggleResult> {
  const token = getAccessToken();
  if (!token) return { ok: false, value: currentlyFavourited };
  try {
    const endpoint = currentlyFavourited
      ? `${MastodonInstanceUrl}/api/v1/statuses/${postId}/unfavourite`
      : `${MastodonInstanceUrl}/api/v1/statuses/${postId}/favourite`;
    await axios.post(endpoint, {}, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
    });
    return { ok: true, value: !currentlyFavourited };
  } catch (error) {
    console.error('toggleFavourite failed:', error);
    return { ok: false, value: currentlyFavourited };
  }
}

export async function toggleBookmark(postId: string, currentlyBookmarked: boolean): Promise<ToggleResult> {
  const token = getAccessToken();
  if (!token) return { ok: false, value: currentlyBookmarked };
  try {
    const endpoint = currentlyBookmarked
      ? `${MastodonInstanceUrl}/api/v1/statuses/${postId}/unbookmark`
      : `${MastodonInstanceUrl}/api/v1/statuses/${postId}/bookmark`;
    await axios.post(endpoint, {}, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
    });
    return { ok: true, value: !currentlyBookmarked };
  } catch (error) {
    console.error('toggleBookmark failed:', error);
    return { ok: false, value: currentlyBookmarked };
  }
}
