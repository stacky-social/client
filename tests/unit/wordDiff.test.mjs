import test from "node:test";
import assert from "node:assert/strict";
import {
  annotateDiffHighlightRelations,
  createAlignedWordDiffWindow,
  createWordDiff,
  createWordDiffExcerpt,
  createWordDiffForRevisedRange,
  isSubstantiveWordDiff,
} from "../../src/utils/wordDiff.mjs";

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

test("a collapsed revised range reports only edits visible in that range", () => {
  const original = "Opening stays. Middle stays. The ending was old.";
  const revised = "Opening stays. Middle stays. The ending is clearer.";
  const beforeEdit = createWordDiffForRevisedRange(original, revised, 0, 26);
  const withEdit = createWordDiffForRevisedRange(original, revised, 27, revised.length);

  assert.equal(beforeEdit.hasChanges, false);
  assert.equal(beforeEdit.chunks.map((chunk) => chunk.text).join(""), revised.slice(0, 26));
  assert.equal(withEdit.hasChanges, true);
  assert.ok(withEdit.chunks.some((chunk) => chunk.kind === "delete"));
  assert.ok(withEdit.chunks.some((chunk) => chunk.kind === "insert"));
});

test("a visible deletion keeps the complete removed passage", () => {
  const removed = "many deliberately removed lines of supporting context ";
  const original = `Before. ${removed}After.`;
  const revised = "Before. After.";
  const range = createWordDiffForRevisedRange(original, revised, 8, revised.length);

  assert.equal(range.hasChanges, true);
  assert.ok(range.chunks.some((chunk) => chunk.kind === "delete" && chunk.text.includes(removed.trim())));
});

test("a partial insertion window retains its paired removal", () => {
  const original = "Before. brief wording. After.";
  const revised = "Before. a much longer and clearer contextual explanation. After.";
  const insertionStart = revised.indexOf("longer");
  const range = createWordDiffForRevisedRange(original, revised, insertionStart, insertionStart + 8);

  assert.ok(range.chunks.some((chunk) => chunk.kind === "insert" && chunk.text.includes("contextual")));
  assert.ok(range.chunks.some((chunk) => chunk.kind === "delete" && chunk.text.includes("wording")));
});

test("surface-only cleanup does not receive an AI-modified treatment", () => {
  assert.equal(isSubstantiveWordDiff("Top tier research", "Top-tier research."), false);
  assert.equal(isSubstantiveWordDiff("@RG The result", "A result"), false);
  assert.equal(isSubstantiveWordDiff("AI creates jobs", "AI does not create jobs"), true);
  assert.equal(isSubstantiveWordDiff("The center is nearby", "The data center is nearby"), true);
});

test("deleted words anchored inside a relationship retain its highlight", () => {
  const original = "The very old model failed.";
  const revised = "The model failed.";
  const chunks = annotateDiffHighlightRelations(createWordDiff(original, revised), [
    { contentStart: 0, contentEnd: 9 }, // "The model" in revised prose
  ]);
  const deletion = chunks.find((chunk) => chunk.kind === "delete");

  assert.equal(deletion.text, "very old ");
  assert.deepEqual(deletion.relationIndices, [0]);
});

test("a removed replacement beside an underlined highlight inherits that highlight", () => {
  const original = "Our top tier research continues.";
  const revised = "Our top-tier research continues.";
  const chunks = annotateDiffHighlightRelations(createWordDiff(original, revised), [
    {
      contentStart: revised.indexOf("top-tier"),
      contentEnd: revised.indexOf("top-tier") + "top-tier".length,
    },
  ]);
  const deletion = chunks.find((chunk) => chunk.kind === "delete");
  const insertion = chunks.find((chunk) => chunk.kind === "insert");

  assert.deepEqual(insertion.relationIndices, [0]);
  assert.deepEqual(deletion.relationIndices, [0]);
});

test("an unrelated removal outside the highlighted span stays unhighlighted", () => {
  const original = "Discard this preface. The highlighted claim remains.";
  const revised = "The highlighted claim remains.";
  const chunks = annotateDiffHighlightRelations(createWordDiff(original, revised), [
    { contentStart: 4, contentEnd: 21 },
  ]);
  const deletion = chunks.find((chunk) => chunk.kind === "delete");

  assert.deepEqual(deletion.relationIndices, []);
});

test("the reveal grows to include a complete deleted passage", () => {
  const original = "Before. a detailed explanation that was removed entirely. After.";
  const revised = "Before. After.";
  const range = createWordDiffForRevisedRange(original, revised, 0, revised.length);
  const revealedLength = range.chunks.reduce((total, chunk) => total + chunk.text.length, 0);

  assert.ok(revealedLength > revised.length);
  assert.ok(range.chunks.some((chunk) => (
    chunk.kind === "delete" && chunk.text.includes("removed entirely")
  )));
});
