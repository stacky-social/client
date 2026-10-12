import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryKeyOf,
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

test("normalizes category keys", () => {
  assert.equal(categoryKeyOf(" Humor "), "humor");
  assert.equal(categoryKeyOf(null), "");
});

test("a stack classified only at stack level carries its legacy type", () => {
  assert.deepEqual([...stackCategories(stacks[3])], ["humor"]);
  assert.deepEqual([...stackCategories(stacks[1])], ["evidence_public", "disagree"]);
});

test("counts distinct related posts per type", () => {
  assert.equal(relatedCountForCategory(stacks, "disagree"), 2);
  assert.equal(relatedCountForCategory([...stacks, stacks[2]], "disagree"), 2);
  assert.equal(relatedCountForCategory(stacks, "Humor "), 1);
  assert.equal(relatedCountForCategory(stacks, "questions"), 0);
});
