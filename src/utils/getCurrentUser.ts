/**
 * SSR-safe read of the persisted `currentUser` from localStorage.
 *
 * Returns the parsed user object, or `null` when running on the server,
 * when no user is stored, or when the stored value is malformed JSON.
 */
export function getCurrentUser(): any | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('currentUser');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
