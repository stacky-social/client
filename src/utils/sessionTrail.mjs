// Framework-free session URL trail primitives. The browser adapter owns
// localStorage and PostHog; these functions keep the data contract testable.

export const SESSION_TRAIL_VERSION = 1;
export const SESSION_TRAIL_MAX_SESSIONS = 50;
export const SESSION_TRAIL_MAX_URLS = 500;

// Explicit allow-list: preserve the experiment condition alongside the public
// filter state, while continuing to discard OAuth codes and arbitrary params.
const FILTER_KEYS = ['tab', 'fc', 'fs', 'ft', 'fo', 'fa', 'fi', 'flags'];

export function isTrackableSessionPath(pathname) {
  return pathname !== '/callback'
    && !pathname.startsWith('/api/')
    && !pathname.startsWith('/auth/');
}

export function sessionUrlProperties(relativeUrl) {
  const parsed = new URL(relativeUrl, 'https://crossweave.local');
  const postMatch = /^\/(?:ChineseEVs\/)?posts\/([^/]+)$/.exec(parsed.pathname);
  const filters = {};
  const safeSearch = new URLSearchParams();

  for (const key of FILTER_KEYS) {
    const value = parsed.searchParams.get(key);
    if (value !== null) {
      filters[key] = value;
      safeSearch.set(key, value);
    }
  }

  const normalizedSearch = safeSearch.toString();

  return {
    url: `${parsed.pathname}${normalizedSearch ? `?${normalizedSearch}` : ''}`,
    pathname: parsed.pathname,
    postId: postMatch?.[1] ?? null,
    filters,
  };
}

function normalizedStore(value) {
  if (!value || value.version !== SESSION_TRAIL_VERSION || !Array.isArray(value.sessions)) {
    return { version: SESSION_TRAIL_VERSION, sessions: [] };
  }
  return {
    version: SESSION_TRAIL_VERSION,
    sessions: value.sessions.filter((session) => (
      session && typeof session.id === 'string' && Array.isArray(session.urls)
    )).map((session) => ({
      ...session,
      // Re-sanitize retained entries as the schema evolves. This also removes
      // any callback codes written by an earlier development build before the
      // route/query allowlist existed.
      urls: session.urls.flatMap((entry) => {
        if (!entry || typeof entry.url !== 'string' || typeof entry.visitedAt !== 'string') return [];
        try {
          const details = sessionUrlProperties(entry.url);
          return isTrackableSessionPath(details.pathname) ? [{ ...entry, url: details.url }] : [];
        } catch {
          return [];
        }
      }),
    })),
  };
}

/**
 * Append one navigation to a bounded session collection. Consecutive duplicate
 * URLs are ignored so React Strict Mode and redundant history updates do not
 * inflate the study trail.
 */
export function appendSessionUrl(
  value,
  { sessionId, url, visitedAt },
  {
    maxSessions = SESSION_TRAIL_MAX_SESSIONS,
    maxUrls = SESSION_TRAIL_MAX_URLS,
  } = {},
) {
  const source = normalizedStore(value);
  const sessions = source.sessions.map((session) => ({
    ...session,
    urls: [...session.urls],
  }));
  let session = sessions.find((candidate) => candidate.id === sessionId);

  if (!session) {
    session = { id: sessionId, startedAt: visitedAt, lastSeenAt: visitedAt, urls: [] };
    sessions.push(session);
  }

  const normalized = sessionUrlProperties(url).url;
  const last = session.urls[session.urls.length - 1];
  const appended = last?.url !== normalized;
  if (appended) session.urls.push({ url: normalized, visitedAt });
  session.urls = session.urls.slice(-maxUrls);
  session.lastSeenAt = visitedAt;

  sessions.sort((left, right) => String(left.lastSeenAt).localeCompare(String(right.lastSeenAt)));
  return {
    appended,
    store: {
      version: SESSION_TRAIL_VERSION,
      sessions: sessions.slice(-maxSessions),
    },
  };
}
