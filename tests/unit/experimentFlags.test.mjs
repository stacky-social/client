import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FLAGS,
  FLAGS_STORAGE_KEY,
  FLAG_DEPENDENCIES,
  effectiveFlags,
  mergeFlags,
  parseFlagOverrides,
} from '../../src/utils/experimentFlagsCore.mjs';

// Demo posture: most conditions default ON, but summaryCard (summary hidden)
// and filterStacking (filters replace, not stack) default OFF.
const DEFAULT_OFF = new Set(['summaryCard', 'filterStacking']);

test('flags carry the demo-posture defaults (most on, summary + stacking off)', () => {
  const keys = Object.keys(DEFAULT_FLAGS);
  assert.ok(keys.length >= 7, 'expected at least 7 flags');
  for (const [k, v] of Object.entries(DEFAULT_FLAGS)) {
    const expected = !DEFAULT_OFF.has(k);
    assert.equal(v, expected, `flag ${k} should default to ${expected}`);
  }
});

test('summaryCard and filterStacking default to false', () => {
  assert.equal(DEFAULT_FLAGS.summaryCard, false);
  assert.equal(DEFAULT_FLAGS.filterStacking, false);
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

test('branchPreviews is a known default-on flag', () => {
  assert.equal(DEFAULT_FLAGS.branchPreviews, true);
});

test('effectiveFlags: defaults pass through unchanged (no unmet dependencies)', () => {
  assert.deepEqual(effectiveFlags(DEFAULT_FLAGS), DEFAULT_FLAGS);
});

test('effectiveFlags: replySortTabs off forces crossPaneFiltering and replyReranking off', () => {
  const eff = effectiveFlags({ ...DEFAULT_FLAGS, replySortTabs: false });
  assert.equal(eff.replySortTabs, false);
  assert.equal(eff.crossPaneFiltering, false);
  assert.equal(eff.replyReranking, false);
  // Independent flags are untouched (carry their own defaults).
  assert.equal(eff.summaryCard, false);
  assert.equal(eff.branchPreviews, true);
});

test('effectiveFlags: suppressThreadPosts off forces crossPaneFiltering off (honest counts)', () => {
  const eff = effectiveFlags({ ...DEFAULT_FLAGS, suppressThreadPosts: false });
  assert.equal(eff.crossPaneFiltering, false);
  assert.equal(eff.replyReranking, true, 'reranking does not depend on suppression');
});

test('effectiveFlags: replyContributions off forces replyReranking off', () => {
  const eff = effectiveFlags({ ...DEFAULT_FLAGS, replyContributions: false });
  assert.equal(eff.replyReranking, false);
  assert.equal(eff.crossPaneFiltering, true, 'filtering does not depend on contributions');
});

test('effectiveFlags: chosen input is not mutated', () => {
  const chosen = { ...DEFAULT_FLAGS, replySortTabs: false };
  effectiveFlags(chosen);
  assert.equal(chosen.crossPaneFiltering, true);
});

test('every declared dependency refers to a known flag', () => {
  for (const [flag, deps] of Object.entries(FLAG_DEPENDENCIES)) {
    assert.ok(flag in DEFAULT_FLAGS, `${flag} is a known flag`);
    for (const dep of deps) assert.ok(dep in DEFAULT_FLAGS, `${dep} is a known flag`);
  }
});

test('parseFlagOverrides: parses known keys, ignores junk keys and bad values', () => {
  const o = parseFlagOverrides('?foo=bar&flags=replySortTabs:0,summaryCard:on,unknown:1,stickyFocusBar:maybe');
  assert.deepEqual(o, { replySortTabs: false, summaryCard: true });
});

test('parseFlagOverrides: absent or empty flags param yields no overrides', () => {
  assert.deepEqual(parseFlagOverrides(''), {});
  assert.deepEqual(parseFlagOverrides('?flags='), {});
  assert.deepEqual(parseFlagOverrides('?tab=top'), {});
});
