import test from 'node:test';
import assert from 'node:assert/strict';
import { pushUndoEntry, ringTopMatchesScope } from '../../src/utils/highlightStoreCore.mjs';

// WS6 Back-undo ring — the pure push/cap/scope-match invariants. The React store
// (highlightStore.ts) layers the live ring + the single history sentinel on top
// of these; the history/popstate behavior itself is covered by the e2e suite.

const entry = (focusId, tag) => ({
  pathname: '/ChineseEVs/posts/' + focusId,
  focusId,
  snapshot: { tag },
});

// ─── pushUndoEntry: append + cap (drop oldest) ───────────────────────────────

test('pushUndoEntry appends to the end (top = most recent)', () => {
  let ring = [];
  ring = pushUndoEntry(ring, entry('A', 1), 5);
  ring = pushUndoEntry(ring, entry('A', 2), 5);
  assert.equal(ring.length, 2);
  assert.equal(ring[ring.length - 1].snapshot.tag, 2);
});

test('pushUndoEntry never mutates the input array', () => {
  const ring = [entry('A', 1)];
  const next = pushUndoEntry(ring, entry('A', 2), 5);
  assert.equal(ring.length, 1);
  assert.notEqual(ring, next);
});

test('pushUndoEntry caps at `cap`, dropping the OLDEST entry', () => {
  let ring = [];
  for (let i = 1; i <= 7; i++) ring = pushUndoEntry(ring, entry('A', i), 5);
  assert.equal(ring.length, 5);
  // Oldest two (tags 1,2) dropped; newest (7) is on top.
  assert.deepEqual(ring.map((e) => e.snapshot.tag), [3, 4, 5, 6, 7]);
});

test('pushUndoEntry with cap 5 stays at 5 across many pushes (no off-by-one)', () => {
  let ring = [];
  for (let i = 1; i <= 20; i++) ring = pushUndoEntry(ring, entry('A', i), 5);
  assert.equal(ring.length, 5);
  assert.deepEqual(ring.map((e) => e.snapshot.tag), [16, 17, 18, 19, 20]);
});

// ─── ringTopMatchesScope: in-memory popstate detection predicate ─────────────

test('ringTopMatchesScope is true when the top entry matches pathname + focus', () => {
  const ring = [entry('A', 1)];
  assert.equal(
    ringTopMatchesScope(ring, { pathname: '/ChineseEVs/posts/A', focusId: 'A' }),
    true,
  );
});

test('ringTopMatchesScope is false for an empty ring (Back leaves the route)', () => {
  assert.equal(ringTopMatchesScope([], { pathname: '/ChineseEVs/posts/A', focusId: 'A' }), false);
});

test('ringTopMatchesScope keys on BOTH pathname and focus (never cross-focus)', () => {
  const ring = [entry('A', 1)];
  // Same focus id, different pathname → no match.
  assert.equal(ringTopMatchesScope(ring, { pathname: '/other', focusId: 'A' }), false);
  // Same pathname, different focus id → no match.
  assert.equal(
    ringTopMatchesScope(ring, { pathname: '/ChineseEVs/posts/A', focusId: 'B' }),
    false,
  );
});

test('ringTopMatchesScope only inspects the TOP entry', () => {
  // A's entry is buried under B's — the current scope is B, so it matches; a
  // stale A scope does not (its entry is not on top).
  const ring = [entry('A', 1), entry('B', 1)];
  assert.equal(ringTopMatchesScope(ring, { pathname: '/ChineseEVs/posts/B', focusId: 'B' }), true);
  assert.equal(ringTopMatchesScope(ring, { pathname: '/ChineseEVs/posts/A', focusId: 'A' }), false);
});

test('ringTopMatchesScope is false for a null/absent scope', () => {
  assert.equal(ringTopMatchesScope([entry('A', 1)], null), false);
  assert.equal(ringTopMatchesScope([entry('A', 1)], undefined), false);
});
