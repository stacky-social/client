import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { filterReplies } from '../../src/utils/threadFilter.mjs';

// T7: the reply-list TOPIC filter path (an aside-origin topic interaction
// FILTERS the reply pane) exercised against the COMMITTED feed fixture
// (src/app/FakeData/listy-injection.json), not synthetic rows. threadFilter's
// own suite already unit-tests the topic branch in isolation; this checks the
// wiring holds over the REAL crossweave descendant reply relations (emitted by
// convert-live-demo-data.mjs), including the branch-union rule the detail page relies on
// so a matching NESTED reply keeps its branch visible. See [[demo-data-provenance]].

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '../../src/app/FakeData/listy-injection.json'), 'utf8'));

// Reconstruct the exact reply model the detail page feeds to filterReplies:
// top-level replies + relationsOf (own) + branchRelationsOf (own ∪ descendants).
// Mirrors src/app/(shell)/ChineseEVs/posts/[id]/page.tsx.
function threadModel(entry) {
  const focusId = entry.focusPost.id;
  const all = entry.replies ?? [];
  const relationsById = new Map(all.map((r) => [r.id, r.relations ?? []]));
  const childIds = new Map();
  for (const r of all) {
    if (!r.inReplyToId) continue;
    const arr = childIds.get(r.inReplyToId) ?? [];
    arr.push(r.id);
    childIds.set(r.inReplyToId, arr);
  }
  const topLevel = all.filter((r) => r.inReplyToId === focusId);
  const relationsOf = (r) => relationsById.get(r.id) ?? [];
  const branchRelationsOf = (r) => {
    const union = [];
    const stack = [r.id];
    const seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      union.push(...(relationsById.get(id) ?? []));
      for (const c of childIds.get(id) ?? []) stack.push(c);
    }
    return union;
  };
  return { focusId, topLevel, relationsOf, branchRelationsOf };
}

const hasTopic = (rels, t) => rels.some((r) => r.topic === t);

test('filterReplies topic path keeps exactly the fixture branches carrying the topic', () => {
  // Find an entry + topic where filtering actually removes at least one branch
  // AND keeps at least one — a topic present on some but not all top-level
  // branches, so the assertion proves the filter both keeps and hides.
  let exercised = 0;
  for (const entry of data) {
    const { topLevel, relationsOf, branchRelationsOf } = threadModel(entry);
    if (topLevel.length < 2) continue;
    const topics = new Set(topLevel.flatMap((r) => branchRelationsOf(r).map((rel) => rel.topic)).filter(Boolean));
    for (const t of topics) {
      const expected = topLevel.filter((r) => hasTopic(branchRelationsOf(r), t)).map((r) => r.id);
      if (expected.length === 0 || expected.length === topLevel.length) continue; // not discriminating

      const got = filterReplies(topLevel, relationsOf, { topicFilter: t }, branchRelationsOf).map((r) => r.id);
      assert.deepEqual(got, expected, `entry ${entry.focusPost.id} topic "${t}"`);
      // Every kept branch really carries the topic; every hidden one does not.
      for (const r of topLevel) {
        assert.equal(got.includes(r.id), hasTopic(branchRelationsOf(r), t), `branch ${r.id} membership for "${t}"`);
      }
      exercised++;
    }
  }
  assert.ok(exercised >= 1, `expected >=1 discriminating topic filter over the fixture, got ${exercised}`);
});

test('a topic filter surfaces a NESTED match via branch union (root shown as context)', () => {
  // The regen guarantees a nested child carries a DIFFERENT topic than its root.
  // Filtering by that child's topic must KEEP the top-level root (branch union)
  // even though the root's OWN relations don't carry it — and DROP it under
  // own-relations-only matching. This is the "don't hide a matching nested
  // reply" rule the cross-pane filter depends on.
  let found = 0;
  for (const entry of data) {
    const { topLevel, relationsOf, branchRelationsOf } = threadModel(entry);
    for (const root of topLevel) {
      const own = relationsOf(root);
      const branch = branchRelationsOf(root);
      const nestedTopics = branch.filter((rel) => rel.topic && !hasTopic(own, rel.topic)).map((rel) => rel.topic);
      for (const t of nestedTopics) {
        const withBranch = filterReplies([root], relationsOf, { topicFilter: t }, branchRelationsOf).map((r) => r.id);
        const ownOnly = filterReplies([root], relationsOf, { topicFilter: t }).map((r) => r.id);
        assert.deepEqual(withBranch, [root.id], `branch union should surface root ${root.id} for nested topic "${t}"`);
        assert.deepEqual(ownOnly, [], `own-only matching should drop root ${root.id} for nested topic "${t}"`);
        found++;
      }
    }
  }
  assert.ok(found >= 1, `expected >=1 nested-topic branch-union case in the fixture, got ${found}`);
});
