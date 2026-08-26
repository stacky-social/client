import assert from 'node:assert/strict';
import test from 'node:test';

import { isDefaultProfileAvatar } from '../../src/utils/profileAvatar.mjs';

test('recognizes blank, demo-logo, and Mastodon missing-avatar placeholders', () => {
  assert.equal(isDefaultProfileAvatar(undefined), true);
  assert.equal(isDefaultProfileAvatar(null), true);
  assert.equal(isDefaultProfileAvatar('  '), true);
  assert.equal(isDefaultProfileAvatar('/icon.svg'), true);
  assert.equal(isDefaultProfileAvatar('https://client.example/icon.svg?version=2'), true);
  assert.equal(
    isDefaultProfileAvatar('https://beta.stacky.social/avatars/original/missing.png'),
    true,
  );
});

test('preserves real remote, inline, and uploaded SVG avatars', () => {
  assert.equal(isDefaultProfileAvatar('https://cdn.example/avatars/fei.png'), false);
  assert.equal(isDefaultProfileAvatar('https://cdn.example/users/icon.svg'), false);
  assert.equal(isDefaultProfileAvatar('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isDefaultProfileAvatar('blob:https://client.example/1234'), false);
});
