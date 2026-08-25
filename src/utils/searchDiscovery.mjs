export const SEARCH_FILTERS = ["all", "posts", "hashtags", "people"];

export function normalizeSearchFilter(value) {
  return SEARCH_FILTERS.includes(value) ? value : "all";
}

export function searchQueryForEntity(kind, value) {
  const normalized = String(value ?? "").trim().replace(/^[@#]+/, "");
  if (!normalized) return "";
  return `${kind === "hashtag" ? "#" : "@"}${normalized}`;
}

export function shouldShowSearchSection(filter, section) {
  const normalized = normalizeSearchFilter(filter);
  return normalized === "all" || normalized === section;
}
