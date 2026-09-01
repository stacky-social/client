import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const chinese = JSON.parse(readFileSync(join(root, "src/app/FakeData/chinese-evs.json"), "utf8"));
const scaleDemo = JSON.parse(readFileSync(join(root, "src/app/FakeData/scale-demo.json"), "utf8"));
const aiWorkforce = scaleDemo.filter((entry) => entry.topicId === "ai-workforce");
const energyTech = scaleDemo.filter((entry) => entry.topicId === "energy-tech");

function everyPostId(entries) {
  return new Set(entries.flatMap((entry) => [
    entry.focusPost.id,
    ...(entry.ancestors ?? []).map((post) => post.id),
    ...(entry.replies ?? []).map((post) => post.id),
    ...(entry.relatedPosts ?? []).map((post) => post.id),
    ...(entry.focusPost.quotedPost?.id ? [entry.focusPost.quotedPost.id] : []),
  ]));
}

test("legacy Chinese EVs and corrected scale-demo topics stay distinct", () => {
  assert.equal(chinese.length, 6);
  assert.equal(chinese.filter((entry) => entry.timelineRoot !== false).length, 6);
  assert.ok(chinese.every((entry) => entry.topicId === "chinese-evs"));
  assert.equal(chinese[0].focusPost.id, "143195604");

  assert.equal(aiWorkforce.length, 95);
  assert.equal(aiWorkforce.filter((entry) => entry.timelineRoot !== false).length, 21);
  assert.ok(aiWorkforce.every((entry) => entry.topicId === "ai-workforce"));
  assert.ok(aiWorkforce.some((entry) => entry.focusPost.quotedPost));

  assert.equal(energyTech.length, 96);
  assert.equal(energyTech.filter((entry) => entry.timelineRoot !== false).length, 20);
  assert.ok(energyTech.every((entry) => entry.topicId === "energy-tech"));
  assert.ok(energyTech.some((entry) => entry.focusPost.quotedPost));
});

test("post identities never cross corpus boundaries", () => {
  const chineseIds = everyPostId(chinese);
  const scaleIds = everyPostId(scaleDemo);
  const collisions = [...chineseIds].filter((id) => scaleIds.has(id));

  assert.deepEqual(collisions, []);
});

test("each converter defaults to its own output and supports an explicit destination", () => {
  const legacyImporter = readFileSync(join(root, "scripts/convert-demo-data.mjs"), "utf8");
  const liveImporter = readFileSync(join(root, "scripts/convert-live-demo-data.mjs"), "utf8");

  assert.match(legacyImporter, /process\.env\.DEMO_OUTPUT_PATH/);
  assert.match(legacyImporter, /FakeData\/chinese-evs\.json/);
  assert.match(liveImporter, /process\.env\.DEMO_OUTPUT_PATH/);
  assert.match(liveImporter, /FakeData\/scale-demo\.json/);
  assert.match(legacyImporter, /Refusing to overwrite the AI-workforce fixture/);
  assert.match(liveImporter, /Refusing to overwrite the Chinese-EVs fixture/);
  assert.match(liveImporter, /Refusing to overwrite the legacy Stacky-injection fixture/);
});
