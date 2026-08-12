import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FILTER_HISTORY_CAP,
  historyWriteMode,
  parseFilterInteraction,
  serializeFilterSearch,
} from '../../src/utils/filterUrlState.mjs';

const base = {
  currentSearch: 'from=42&related=84&flags=replySortTabs%3A0%2CsummaryCard%3A1',
  activeTab: 'top',
  defaultTab: 'top',
};

test('serializes every related-post interaction and preserves navigation params', () => {
  const category = serializeFilterSearch({ ...base, filterCategories: new Set(['values', 'agree']) });
  assert.equal(category, 'fc=agree%2Cvalues&from=42&related=84&flags=replySortTabs%3A0%2CsummaryCard%3A1');

  const passage = serializeFilterSearch({
    ...base,
    responseFilter: { start: 12, end: 29 },
  });
  assert.equal(passage, 'fs=12-29&from=42&related=84&flags=replySortTabs%3A0%2CsummaryCard%3A1');

  const topic = serializeFilterSearch({
    ...base,
    topicInteraction: {
      origin: 'aside',
      topicKey: 'Battery supply & resilience',
      anchor: { postId: '9001', rangeIndex: 3 },
    },
  });
  assert.equal(
    topic,
    'ft=Battery+supply+%26+resilience&fo=aside&fa=9001&fi=3&from=42&related=84&flags=replySortTabs%3A0%2CsummaryCard%3A1',
  );
});

test('serializes non-default tabs as the fourth shareable dimension', () => {
  assert.equal(
    serializeFilterSearch({ ...base, activeTab: 'liked' }),
    'tab=liked&from=42&related=84&flags=replySortTabs%3A0%2CsummaryCard%3A1',
  );
});

test('parses category, deferred passage, bounded passage, and topic states', () => {
  assert.deepEqual(parseFilterInteraction('fc=values,agree'), {
    kind: 'category', categories: ['values', 'agree'],
  });
  assert.deepEqual(parseFilterInteraction('fs=2-20'), { kind: 'pending-passage' });
  assert.deepEqual(parseFilterInteraction('fs=2-20', 'abcdefghij'), {
    kind: 'passage', span: { start: 2, end: 10, text: 'cdefghij' },
  });
  assert.deepEqual(parseFilterInteraction('ft=Battery&fo=replies&fa=77&fi=2'), {
    kind: 'topic',
    interaction: { origin: 'replies', topicKey: 'Battery', anchor: { postId: '77', rangeIndex: 2 } },
  });
});

test('rejects malformed shared interaction params without constructing partial state', () => {
  assert.deepEqual(parseFilterInteraction('fs=-1-2', 'abcdef'), { kind: 'none' });
  assert.deepEqual(parseFilterInteraction('ft=Battery&fo=aside&fa=77'), { kind: 'none' });
  assert.deepEqual(parseFilterInteraction('ft=Battery&fo=unknown&fa=77&fi=0'), { kind: 'none' });
});

test('history grows through 24 transitions and the 25th replaces the top entry', () => {
  assert.equal(FILTER_HISTORY_CAP, 24);
  for (let depth = 0; depth < FILTER_HISTORY_CAP; depth += 1) {
    assert.equal(historyWriteMode(depth), 'push');
  }
  assert.equal(historyWriteMode(FILTER_HISTORY_CAP), 'replace');
  assert.equal(historyWriteMode(FILTER_HISTORY_CAP + 20), 'replace');
});
