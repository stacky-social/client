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
  assert.deepEqual(parseFilterInteraction('ft=Battery&fo=focus&fa=77&fi=2'), {
    kind: 'topic',
    interaction: { origin: 'focus', topicKey: 'Battery', anchor: { postId: '77', rangeIndex: 2 } },
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

// A contribution-type ("more like this") group is an aside grouping keyed by a
// category instead of a topic. It shares the topic tuple and adds `fg` so a
// category key can never be read back as a same-named topic.
test('round-trips a contribution-type group with its grouping dimension', () => {
  const interaction = {
    origin: 'aside',
    topicKey: 'disagree',
    anchor: { postId: '9001', rangeIndex: 1 },
    groupBy: 'category',
  };
  const search = serializeFilterSearch({ ...base, topicInteraction: interaction });
  assert.equal(
    search,
    'ft=disagree&fo=aside&fa=9001&fi=1&fg=category&from=42&related=84&flags=replySortTabs%3A0%2CsummaryCard%3A1',
  );
  assert.deepEqual(parseFilterInteraction(search), { kind: 'topic', interaction });
});

test('topic groups never carry fg, and a malformed fg is rejected whole', () => {
  const topic = serializeFilterSearch({
    ...base,
    topicInteraction: { origin: 'aside', topicKey: 'Disagree', anchor: { postId: '1', rangeIndex: 0 } },
  });
  assert.equal(new URLSearchParams(topic).has('fg'), false);
  assert.deepEqual(parseFilterInteraction('ft=disagree&fo=aside&fa=77&fi=0&fg=bogus'), { kind: 'none' });
  // Only the aside groups by contribution type.
  assert.deepEqual(parseFilterInteraction('ft=disagree&fo=replies&fa=77&fi=0&fg=category'), { kind: 'none' });
  assert.deepEqual(parseFilterInteraction('fg=category'), { kind: 'none' });
});
