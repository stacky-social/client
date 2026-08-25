import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSearchFilter,
  searchQueryForEntity,
  shouldShowSearchSection,
} from "../../src/utils/searchDiscovery.mjs";

test("normalizes unknown search filters to the compact all-results view", () => {
  assert.equal(normalizeSearchFilter("people"), "people");
  assert.equal(normalizeSearchFilter("unknown"), "all");
  assert.equal(normalizeSearchFilter(null), "all");
});

test("turns discovery items into Mastodon entity queries", () => {
  assert.equal(searchQueryForEntity("hashtag", "#BatteryFuture"), "#BatteryFuture");
  assert.equal(searchQueryForEntity("person", "@@river"), "@river");
  assert.equal(searchQueryForEntity("person", "  "), "");
});

test("the all filter shows every section while specific filters narrow it", () => {
  assert.equal(shouldShowSearchSection("all", "posts"), true);
  assert.equal(shouldShowSearchSection("all", "people"), true);
  assert.equal(shouldShowSearchSection("hashtags", "hashtags"), true);
  assert.equal(shouldShowSearchSection("hashtags", "posts"), false);
});
