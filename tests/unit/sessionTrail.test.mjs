import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSessionUrl,
  isTrackableSessionPath,
  sessionUrlProperties,
} from '../../src/utils/sessionTrail.mjs';

test('extracts opened post ids and every shareable filter from a URL', () => {
  assert.deepEqual(
    sessionUrlProperties('/ChineseEVs/posts/143195604?tab=liked&fc=agree%2Cvalues&flags=replySortTabs%3A0'),
    {
      url: '/ChineseEVs/posts/143195604?tab=liked&fc=agree%2Cvalues&flags=replySortTabs%3A0',
      pathname: '/ChineseEVs/posts/143195604',
      postId: '143195604',
      filters: { tab: 'liked', fc: 'agree,values', flags: 'replySortTabs:0' },
    },
  );
  assert.equal(sessionUrlProperties('/posts/live-42?fs=10-20').postId, 'live-42');
});

test('discards unapproved query data and excludes authentication routes', () => {
  assert.equal(
    sessionUrlProperties('/callback?code=secret&state=also-secret').url,
    '/callback',
  );
  assert.equal(
    sessionUrlProperties('/ChineseEVs/posts/42?fc=agree&code=secret').url,
    '/ChineseEVs/posts/42?fc=agree',
  );
  assert.equal(isTrackableSessionPath('/callback'), false);
  assert.equal(isTrackableSessionPath('/api/auth/mastodon/start'), false);
  assert.equal(isTrackableSessionPath('/ChineseEVs/posts/42'), true);
  assert.equal(isTrackableSessionPath('/AIWorkforce/posts/cw-42'), true);

  const migrated = appendSessionUrl({
    version: 1,
    sessions: [{
      id: 'old',
      startedAt: '2026-08-11T10:00:00.000Z',
      lastSeenAt: '2026-08-11T10:00:00.000Z',
      urls: [
        { url: '/callback?code=secret', visitedAt: '2026-08-11T10:00:00.000Z' },
        { url: '/posts/42?fc=agree&state=secret', visitedAt: '2026-08-11T10:00:01.000Z' },
      ],
    }],
  }, {
    sessionId: 'old', url: '/home', visitedAt: '2026-08-11T10:00:02.000Z',
  });
  assert.deepEqual(migrated.store.sessions[0].urls.map((entry) => entry.url), [
    '/posts/42?fc=agree', '/home',
  ]);
});

test('deduplicates consecutive URLs while retaining later revisits', () => {
  const first = appendSessionUrl(null, {
    sessionId: 's1', url: '/home', visitedAt: '2026-08-11T10:00:00.000Z',
  });
  const duplicate = appendSessionUrl(first.store, {
    sessionId: 's1', url: '/home', visitedAt: '2026-08-11T10:00:01.000Z',
  });
  const filtered = appendSessionUrl(duplicate.store, {
    sessionId: 's1', url: '/posts/42?fc=agree', visitedAt: '2026-08-11T10:00:02.000Z',
  });
  const revisited = appendSessionUrl(filtered.store, {
    sessionId: 's1', url: '/home', visitedAt: '2026-08-11T10:00:03.000Z',
  });

  assert.equal(duplicate.appended, false);
  assert.deepEqual(revisited.store.sessions[0].urls.map((entry) => entry.url), [
    '/home', '/posts/42?fc=agree', '/home',
  ]);
});

test('bounds URLs per session and the number of retained sessions', () => {
  let value = null;
  for (let session = 1; session <= 3; session += 1) {
    for (let url = 1; url <= 3; url += 1) {
      value = appendSessionUrl(value, {
        sessionId: `s${session}`,
        url: `/posts/${session}-${url}`,
        visitedAt: `2026-08-1${session}T10:00:0${url}.000Z`,
      }, { maxSessions: 2, maxUrls: 2 }).store;
    }
  }

  assert.deepEqual(value.sessions.map((session) => session.id), ['s2', 's3']);
  assert.deepEqual(value.sessions[1].urls.map((entry) => entry.url), [
    '/posts/3-2', '/posts/3-3',
  ]);
});
