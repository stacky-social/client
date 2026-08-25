import test from "node:test";
import assert from "node:assert/strict";
import { pointBridgesInlineRects } from "../../src/utils/inlineHighlightGeometry.mjs";

const wrappedLines = [
  { top: 10, bottom: 24, left: 20, right: 180, width: 160, height: 14 },
  { top: 28, bottom: 42, left: 20, right: 130, width: 110, height: 14 },
];

test("line-height space between wrapped fragments belongs to one highlight", () => {
  assert.equal(pointBridgesInlineRects(wrappedLines, 80, 26), true);
});

test("ordinary prose outside the wrapped fragments is not treated as highlighted", () => {
  assert.equal(pointBridgesInlineRects(wrappedLines, 190, 26), false);
  assert.equal(pointBridgesInlineRects(wrappedLines, 80, 45), false);
});
