const CURSOR_VERSION = 1;

export function encodeCursor(lastId) {
  if (!lastId) return null;
  return Buffer.from(JSON.stringify({ v: CURSOR_VERSION, after: String(lastId) }), "utf8").toString("base64url");
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid pagination cursor");
  }
  if (parsed?.v !== CURSOR_VERSION || typeof parsed.after !== "string" || !parsed.after) {
    throw new Error("Invalid pagination cursor");
  }
  return parsed.after;
}

/** Stable keyset pagination. A cursor points after an item id, never at an array offset. */
export function paginateByCursor(items, { cursor = null, limit, idOf }) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Pagination limit must be a positive integer");

  const afterId = decodeCursor(cursor);
  let start = 0;
  if (afterId !== null) {
    const anchorIndex = items.findIndex((item) => String(idOf(item)) === afterId);
    if (anchorIndex < 0) throw new Error("Pagination cursor is no longer available");
    start = anchorIndex + 1;
  }

  const pageItems = items.slice(start, start + limit);
  const hasMore = start + pageItems.length < items.length;
  const lastItem = pageItems[pageItems.length - 1];

  return {
    items: pageItems,
    nextCursor: hasMore && lastItem ? encodeCursor(idOf(lastItem)) : null,
    hasMore,
  };
}
