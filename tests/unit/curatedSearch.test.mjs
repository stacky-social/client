import assert from 'node:assert/strict';
import test from 'node:test';

import {
  curatedSearchScore,
  curatedSearchTerms,
  matchesCuratedSearch,
  normalizeCuratedSearchText,
} from '../../src/utils/curatedSearchCore.mjs';

test('normalizes and deduplicates visible search terms', () => {
  assert.deepEqual(curatedSearchTerms('  #Clean-energy CLEAN  '), ['clean-energy', 'clean']);
  assert.equal(normalizeCuratedSearchText('Grid\n  STORAGE'), 'grid storage');
});

test('curated post matching requires every entered term', () => {
  const post = 'New battery factories need additional grid capacity.';
  assert.equal(matchesCuratedSearch(post, 'battery grid'), true);
  assert.equal(matchesCuratedSearch(post, 'battery workforce'), false);
  assert.equal(matchesCuratedSearch(post, ''), false);
});

test('exact in-body phrases rank above scattered matches', () => {
  const exact = curatedSearchScore({ text: 'Clean energy creates jobs.' }, 'clean energy');
  const scattered = curatedSearchScore({ text: 'Clean grids make energy cheaper.' }, 'clean energy');
  assert.ok(exact > scattered);
});
