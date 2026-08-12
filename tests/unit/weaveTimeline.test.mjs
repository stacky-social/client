import test from "node:test";
import assert from "node:assert/strict";
import { weaveTimeline } from "../../src/utils/weaveTimeline.mjs";

const post = (postId) => ({ postId });

test("weaves one followed conversation after each primary run", () => {
  const result = weaveTimeline(
    [post("m1"), post("m2"), post("m3"), post("m4")],
    [post("c1"), post("c2")],
  );
  assert.deepEqual(result.map((item) => item.postId), ["m1", "m2", "m3", "c1", "m4", "c2"]);
});

test("keeps primary records when ids collide", () => {
  const primary = [{ postId: "same", source: "mastodon" }];
  const supplemental = [{ postId: "same", source: "local" }, { postId: "c1", source: "local" }];
  const result = weaveTimeline(primary, supplemental);
  assert.deepEqual(result, [primary[0], supplemental[1]]);
});

test("returns the available source when the other is empty", () => {
  assert.deepEqual(weaveTimeline([], [post("c1")]), [post("c1")]);
  assert.deepEqual(weaveTimeline([post("m1")], []), [post("m1")]);
});
