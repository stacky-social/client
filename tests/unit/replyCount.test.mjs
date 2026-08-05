import test from "node:test";
import assert from "node:assert/strict";
import { resolveReplyCount } from "../../src/utils/replyCount.mjs";

test("keeps the authoritative source count when the curated thread is partial", () => {
  assert.equal(resolveReplyCount(20, 4), 20);
});

test("repairs a synthetic source count when more direct replies are known", () => {
  assert.equal(resolveReplyCount(0, 2), 2);
});

test("adds each local direct reply once", () => {
  assert.equal(resolveReplyCount(20, 4, 1), 21);
  assert.equal(resolveReplyCount(20, 4, 2), 22);
});

test("normalizes invalid and negative counts", () => {
  assert.equal(resolveReplyCount(Number.NaN, -3, 1), 1);
});
