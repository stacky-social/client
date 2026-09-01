import test from "node:test";
import assert from "node:assert/strict";
import { stableShuffle } from "../../src/utils/stableShuffle.mjs";

test("stableShuffle keeps one session seed stable without mutating its input", () => {
  const input = ["a", "b", "c", "d", "e", "f", "g", "h"];

  const first = stableShuffle(input, "session-one");
  const rerender = stableShuffle(input, "session-one");

  assert.deepEqual(rerender, first);
  assert.deepEqual(input, ["a", "b", "c", "d", "e", "f", "g", "h"]);
  assert.deepEqual([...first].sort(), [...input].sort());
});

test("stableShuffle disperses the same data differently for a new session", () => {
  const input = Array.from({ length: 20 }, (_, index) => `post-${index}`);

  assert.notDeepEqual(
    stableShuffle(input, "session-one"),
    stableShuffle(input, "session-two"),
  );
});
