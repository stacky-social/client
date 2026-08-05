import test from "node:test";
import assert from "node:assert/strict";
import { createAlignedWordDiffWindow, createWordDiff, createWordDiffExcerpt } from "../../src/utils/wordDiff.mjs";

test("complete diff reconstructs both original and edited text", () => {
  const original = "The old wording stays concise.";
  const revised = "The clearer AI wording stays concise.";
  const diff = createWordDiff(original, revised);
  assert.equal(diff.filter((chunk) => chunk.kind !== "insert").map((chunk) => chunk.text).join(""), original);
  assert.equal(diff.filter((chunk) => chunk.kind !== "delete").map((chunk) => chunk.text).join(""), revised);
});

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

test("aligned diff keeps the same semantic text window and enough context", () => {
  const original = "I am glad to see a long form article on this topic. "
    + "I feel that the collective strategic decision by American automakers will shape the market. "
    + "Battery technology will keep improving over the next decade.";
  const revised = "On U.S. automakers falling behind China's EV industry, "
    + original.replace("long form", "long-form");
  const window = createAlignedWordDiffWindow(original, revised, 120);
  const trackedOriginal = window.chunks
    .filter((chunk) => chunk.kind !== "insert")
    .map((chunk) => chunk.text)
    .join("");
  const trackedRevised = window.chunks
    .filter((chunk) => chunk.kind !== "delete")
    .map((chunk) => chunk.text)
    .join("");

  assert.equal(window.originalText, original.slice(window.originalStart, window.originalEnd));
  assert.equal(trackedOriginal, window.originalText);
  assert.ok(trackedRevised.startsWith("On U.S. automakers"));
  assert.ok(window.chunks.some((chunk) => chunk.kind === "delete"));
  assert.ok(window.chunks.some((chunk) => chunk.kind === "insert"));
  assert.ok(trackedOriginal.length >= 120);
});
