/** Resolve recorded page origins without resurrecting retired corpus feeds. */
export function backNavigationTarget(previous, here, fallback = '/home') {
  function resolve(candidate) {
    if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//')) return null;
    try {
      const url = new URL(candidate, 'https://local.invalid');
      if (url.origin !== 'https://local.invalid') return null;
      if (/^\/(ChineseEVs|AIWorkforce|EnergyTech|Tariffs)\/?$/i.test(url.pathname)) return '/home';
      if (url.pathname === here) return null;
      return url.pathname + url.search + url.hash;
    } catch {
      return null;
    }
  }
  return resolve(previous) ?? resolve(fallback) ?? '/home';
}
