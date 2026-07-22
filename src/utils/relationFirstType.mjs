// The backend now allows a contribution to carry MORE THAN ONE contribution
// type, emitted as one relation PER TYPE that all share the same verbatim
// highlight span (coincident focus/content ranges). Rendering every type
// stacks two colour bands on every highlight and pushes the related cards
// into the overlap path (which has no crux-bold). Per Fei's direction
// (2026-07-10), the FE reads ONLY THE FIRST contribution type per highlight —
// this module is that single read-time filter, applied wherever relations
// enter the UI (mockPostResolver + the /ChineseEVs feed page).
//
// Plain JS so the node:test suite imports it directly (same pattern as
// replySort.mjs / threadFilter.mjs).

/** Keep only the first relation of each coincident-span group (the first —
 *  most salient — contribution type). Relations whose spans differ are all
 *  kept; order is preserved. Safe on undefined/empty input. */
export function firstTypeRelations(relations) {
  if (!Array.isArray(relations) || relations.length <= 1) return relations ?? [];
  const seen = new Set();
  const out = [];
  for (const r of relations) {
    const key = `${r.focusStart}:${r.focusEnd}:${r.contentStart}:${r.contentEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
