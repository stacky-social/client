import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const chinese = JSON.parse(readFileSync(join(root, "src/app/FakeData/chinese-evs.json"), "utf8"));
const aiWorkforce = JSON.parse(readFileSync(join(root, "src/app/FakeData/listy-injection.json"), "utf8"));

function everyPostId(entries) {
  return new Set(entries.flatMap((entry) => [
    entry.focusPost.id,
    ...(entry.ancestors ?? []).map((post) => post.id),
    ...(entry.replies ?? []).map((post) => post.id),
    ...(entry.relatedPosts ?? []).map((post) => post.id),
    ...(entry.focusPost.quotedPost?.id ? [entry.focusPost.quotedPost.id] : []),
  ]));
}

test("Chinese EVs and AI Workforce are committed as separate topic fixtures", () => {
  assert.equal(chinese.length, 6);
  assert.equal(chinese.filter((entry) => entry.timelineRoot !== false).length, 6);
  assert.ok(chinese.every((entry) => entry.topicId === "chinese-evs"));
  assert.equal(chinese[0].focusPost.id, "143195604");

  assert.equal(aiWorkforce.length, 95);
  assert.equal(aiWorkforce.filter((entry) => entry.timelineRoot !== false).length, 21);
  assert.ok(aiWorkforce.every((entry) => entry.topicId === "ai-workforce"));
  assert.ok(aiWorkforce.some((entry) => entry.focusPost.quotedPost));
});

test("post identities never cross corpus boundaries", () => {
  const chineseIds = everyPostId(chinese);
  const aiIds = everyPostId(aiWorkforce);
  const collisions = [...chineseIds].filter((id) => aiIds.has(id));

  assert.deepEqual(collisions, []);
});

test("each converter defaults to its own output and supports an explicit destination", () => {
  const legacyImporter = readFileSync(join(root, "scripts/convert-demo-data.mjs"), "utf8");
  const liveImporter = readFileSync(join(root, "scripts/convert-live-demo-data.mjs"), "utf8");

  assert.match(legacyImporter, /process\.env\.DEMO_OUTPUT_PATH/);
  assert.match(legacyImporter, /FakeData\/chinese-evs\.json/);
  assert.match(liveImporter, /process\.env\.DEMO_OUTPUT_PATH/);
  assert.match(liveImporter, /FakeData\/listy-injection\.json/);
  assert.match(legacyImporter, /Refusing to overwrite the AI-workforce fixture/);
  assert.match(liveImporter, /Refusing to overwrite the Chinese-EVs fixture/);
});
