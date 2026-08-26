/**
 * Demo accounts currently use the application mark as a sentinel avatar. Keep
 * that implementation detail out of the UI so it cannot be mistaken for an
 * uploaded profile picture.
 */
export function isDefaultProfileAvatar(src) {
  if (typeof src !== 'string' || src.trim() === '') return true;

  const value = src.trim();
  let pathname = value.split(/[?#]/, 1)[0];

  try {
    pathname = new URL(value, 'https://crossweave.local').pathname;
  } catch {
    // Keep the best-effort path above for malformed or legacy values.
  }

  const normalized = pathname.replace(/\/+$/, '').toLowerCase();

  return normalized === '/icon.svg'
    || normalized === 'icon.svg'
    || /\/avatars\/original\/missing\.(?:png|jpe?g|gif|webp|svg)$/.test(normalized);
}
