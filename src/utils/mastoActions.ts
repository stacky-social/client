import axios from 'axios';

const MastodonInstanceUrl = 'https://beta.stacky.social';

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export async function toggleFavourite(postId: string, currentlyFavourited: boolean): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return currentlyFavourited;
  try {
    const endpoint = currentlyFavourited
      ? `${MastodonInstanceUrl}/api/v1/statuses/${postId}/unfavourite`
      : `${MastodonInstanceUrl}/api/v1/statuses/${postId}/favourite`;
    await axios.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
    return !currentlyFavourited;
  } catch {
    return currentlyFavourited;
  }
}

export async function toggleBookmark(postId: string, currentlyBookmarked: boolean): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return currentlyBookmarked;
  try {
    const endpoint = currentlyBookmarked
      ? `${MastodonInstanceUrl}/api/v1/statuses/${postId}/unbookmark`
      : `${MastodonInstanceUrl}/api/v1/statuses/${postId}/bookmark`;
    await axios.post(endpoint, {}, { headers: { Authorization: `Bearer ${token}` } });
    return !currentlyBookmarked;
  } catch {
    return currentlyBookmarked;
  }
}


