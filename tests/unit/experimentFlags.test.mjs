import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FLAGS, FLAGS_STORAGE_KEY, mergeFlags } from '../../src/utils/experimentFlagsCore.mjs';

test('all flags default to true', () => {
  const keys = Object.keys(DEFAULT_FLAGS);
  assert.ok(keys.length >= 7, 'expected at least 7 flags');
  for (const [k, v] of Object.entries(DEFAULT_FLAGS)) {
    assert.equal(v, true, `flag ${k} should default to true`);
  }
});

test('mergeFlags applies persisted booleans, ignores junk keys and non-boolean values', () => {
  const merged = mergeFlags({ stickyFocusBar: false, unknownFlag: false, replySortTabs: 'nope' });
  assert.equal(merged.stickyFocusBar, false);
  assert.equal(merged.replySortTabs, true);
  assert.ok(!('unknownFlag' in merged));
});

test('mergeFlags tolerates null and garbage input', () => {
  assert.deepEqual(mergeFlags(null), DEFAULT_FLAGS);
  assert.deepEqual(mergeFlags(undefined), DEFAULT_FLAGS);
  assert.deepEqual(mergeFlags('garbage'), DEFAULT_FLAGS);
  assert.deepEqual(mergeFlags(42), DEFAULT_FLAGS);
});

test('mergeFlags returns a fresh object (no aliasing of defaults)', () => {
  const merged = mergeFlags(null);
  merged.suppressThreadPosts = false;
  assert.equal(DEFAULT_FLAGS.suppressThreadPosts, true);
});

test('storage key is stable', () => {
  assert.equal(FLAGS_STORAGE_KEY, 'stacky:experimentFlags:v1');
});
