import test from "node:test";
import assert from "node:assert/strict";
import { resolveReplyCount } from "../../src/utils/replyCount.mjs";

test("shows the number of seeded replies that can be opened", () => {
  assert.equal(resolveReplyCount(4), 4);
});

test("adds each local direct reply once", () => {
  assert.equal(resolveReplyCount(4, 1), 5);
  assert.equal(resolveReplyCount(4, 2), 6);
});

test("normalizes invalid and negative counts", () => {
  assert.equal(resolveReplyCount(Number.NaN, -3), 0);
});
