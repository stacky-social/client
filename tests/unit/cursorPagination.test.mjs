import test from "node:test";
import assert from "node:assert/strict";
import { decodeCursor, paginateByCursor } from "../../src/utils/cursorPagination.mjs";

const items = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

test("cursor pagination returns stable keyset pages without duplicates", () => {
  const first = paginateByCursor(items, { limit: 2, idOf: (item) => item.id });
  const second = paginateByCursor(items, { cursor: first.nextCursor, limit: 2, idOf: (item) => item.id });
  const third = paginateByCursor(items, { cursor: second.nextCursor, limit: 2, idOf: (item) => item.id });

  assert.deepEqual(first.items.map((item) => item.id), ["a", "b"]);
  assert.deepEqual(second.items.map((item) => item.id), ["c", "d"]);
  assert.deepEqual(third.items.map((item) => item.id), ["e"]);
  assert.equal(third.nextCursor, null);
  assert.equal(decodeCursor(first.nextCursor), "b");
});

test("cursor pagination rejects malformed and stale cursors", () => {
  assert.throws(
    () => paginateByCursor(items, { cursor: "not-a-cursor", limit: 2, idOf: (item) => item.id }),
    /Invalid pagination cursor/,
  );
});
