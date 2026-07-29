import test from "node:test";
import assert from "node:assert/strict";
import { createWordDiffExcerpt } from "../../src/utils/wordDiff.mjs";

test("word diff exposes inserted and removed language", () => {
  const diff = createWordDiffExcerpt(
    "This supports new science.",
    "In the EV context, this supports engineering progress.",
  );

  assert.ok(diff.some((chunk) => chunk.kind === "delete" && chunk.text.includes("new")));
  assert.ok(diff.some((chunk) => chunk.kind === "insert" && chunk.text.includes("engineering")));
});

test("word diff preserves unchanged text", () => {
  assert.deepEqual(createWordDiffExcerpt("No changes", "No changes"), [
    { kind: "equal", text: "No changes" },
  ]);
});
