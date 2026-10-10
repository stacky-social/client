import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backNavigationTarget } from '../../src/utils/backNavigation.mjs';

const here = '/EnergyTech/posts/energy-42';
test('deep links and stale corpus origins return to Home', () => {
  assert.equal(backNavigationTarget(null, here), '/home');
  for (const corpus of ['EnergyTech', 'AIWorkforce', 'Tariffs', 'ChineseEVs']) {
    assert.equal(backNavigationTarget(`/${corpus}/?page=3`, here), '/home');
  }
});
test('valid origins keep query parameters and nested reply navigation', () => {
  assert.equal(backNavigationTarget('/search?q=energy', here), '/search?q=energy');
  assert.equal(backNavigationTarget('/EnergyTech/posts/parent?tab=time', here), '/EnergyTech/posts/parent?tab=time');
  assert.equal(backNavigationTarget('/tag/EnergyTech', here), '/tag/EnergyTech');
});
test('same-page and non-local origins cannot trap or redirect readers', () => {
  for (const previous of [here, `${here}?tab=time`, `${here}#reply`, '//example.com', '/\\example.com', 'https://example.com']) {
    assert.equal(backNavigationTarget(previous, here), '/home');
  }
});
