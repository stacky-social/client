import test from "node:test";
import assert from "node:assert/strict";
import {
  pickTypeGroupAnchor,
  relatedCountForCategory,
  stackCategories,
} from "../../src/utils/typeGroupAnchor.mjs";

const stack = (id, categories, rel = "") => ({
  rel,
  topPost: { id, relations: categories.map((category) => ({ category })) },
});

const stacks = [
  stack("a", ["agree"]),
  stack("b", ["evidence_public", "Disagree"]),
  stack("c", ["disagree"]),
  stack("legacy", [], "humor"),
];

test("anchors on the first related card of the type, at its first relation of that type", () => {
  assert.deepEqual(pickTypeGroupAnchor(stacks, "disagree"), { postId: "b", rangeIndex: 1 });
});

test("prefers the reply itself, then the cards in the order the reader sees them", () => {
  assert.deepEqual(pickTypeGroupAnchor(stacks, "disagree", ["c", "b"]), { postId: "c", rangeIndex: 0 });
  // A preferred id that is not a card of this type is skipped.
  assert.deepEqual(pickTypeGroupAnchor(stacks, "disagree", ["reply-1", "a", "b"]), { postId: "b", rangeIndex: 1 });
});

test("a stack classified only at stack level anchors at index 0", () => {
  assert.deepEqual(pickTypeGroupAnchor(stacks, "Humor "), { postId: "legacy", rangeIndex: 0 });
  assert.deepEqual([...stackCategories(stacks[3])], ["humor"]);
});

test("no related card of the type means no anchor", () => {
  assert.equal(pickTypeGroupAnchor(stacks, "questions"), null);
  assert.equal(pickTypeGroupAnchor(stacks, ""), null);
  assert.equal(pickTypeGroupAnchor([], "agree"), null);
});

test("counts distinct related posts per type", () => {
  assert.equal(relatedCountForCategory(stacks, "disagree"), 2);
  assert.equal(relatedCountForCategory([...stacks, stacks[2]], "disagree"), 2);
  assert.equal(relatedCountForCategory(stacks, "questions"), 0);
});
