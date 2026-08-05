import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMaxIdFromLink } from '../../src/utils/mastodonPagination.mjs';

test('reads the next Mastodon max_id without confusing it with the previous page', () => {
  const link = '<https://beta.stacky.social/api/v1/timelines/home?max_id=101>; rel="next", '
    + '<https://beta.stacky.social/api/v1/timelines/home?min_id=202>; rel="prev"';
  assert.equal(nextMaxIdFromLink(link), '101');
});

test('treats a missing next relation as the end of the timeline', () => {
  assert.equal(nextMaxIdFromLink('<https://example.test?min_id=202>; rel="prev"'), null);
  assert.equal(nextMaxIdFromLink(undefined), null);
  assert.equal(nextMaxIdFromLink('not a link header'), null);
});
