import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SORT_TABS,
  LEGACY_TABS,
  allowedTabsFor,
  defaultTabFor,
  coerceTab,
} from '../../src/utils/replyTabs.mjs';

// F-1 (hci-ux-audit-2026-07-06): a ?tab= from the other flag condition must
// degrade to the active set's default — never select a tab with no panel.

test('allowedTabsFor picks the tab set for the replySortTabs flag', () => {
  assert.deepEqual(allowedTabsFor(true), SORT_TABS);
  assert.deepEqual(allowedTabsFor(false), LEGACY_TABS);
  assert.deepEqual([...SORT_TABS], ['top', 'time', 'liked']);
  assert.deepEqual([...LEGACY_TABS], ['time', 'recommended', 'stacked', 'summary']);
});

test('defaultTabFor is the set default: top (flag on), time (legacy)', () => {
  assert.equal(defaultTabFor(true), 'top');
  assert.equal(defaultTabFor(false), 'time');
});

test('coerceTab degrades sort-set tabs to time under the legacy set', () => {
  assert.equal(coerceTab('top', false), 'time');
  assert.equal(coerceTab('liked', false), 'time');
});

test('coerceTab degrades legacy-only tabs to top under the sort set', () => {
  assert.equal(coerceTab('recommended', true), 'top');
  assert.equal(coerceTab('stacked', true), 'top');
  assert.equal(coerceTab('summary', true), 'top');
});

test('coerceTab passes through tabs already in the active set', () => {
  assert.equal(coerceTab('top', true), 'top');
  assert.equal(coerceTab('liked', true), 'liked');
  assert.equal(coerceTab('recommended', false), 'recommended');
  assert.equal(coerceTab('summary', false), 'summary');
  // "time" belongs to both sets.
  assert.equal(coerceTab('time', true), 'time');
  assert.equal(coerceTab('time', false), 'time');
});

test('coerceTab maps unknown values to the active default', () => {
  assert.equal(coerceTab('bogus', true), 'top');
  assert.equal(coerceTab('bogus', false), 'time');
  assert.equal(coerceTab('', true), 'top');
  assert.equal(coerceTab('', false), 'time');
});
