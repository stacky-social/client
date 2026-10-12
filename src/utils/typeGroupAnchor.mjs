// Anchor for a contribution-type group started outside the related panel.
//
// A reply's type tag reuses the related panel's type group ("more like this",
// an aside topic interaction with groupBy 'category'). That interaction is
// anchored on a related card, because the panel builds the group block around
// it and validates the URL tuple against it. A reply is not a related card, so
// the group anchors on the first related card of that type in the order the
// reader sees, or on the reply itself when it is also a related post. The
// rules match RelatedStacks' categoriesOfStack / categoryAnchorIndex.

export function categoryKeyOf(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** Every contribution type a related stack carries (legacy `rel` only when no
 *  relation names a type). */
export function stackCategories(stack) {
  const categories = new Set();
  for (const relation of stack?.topPost?.relations ?? []) {
    const key = categoryKeyOf(relation?.category);
    if (key) categories.add(key);
  }
  if (categories.size === 0) categories.add(categoryKeyOf(stack?.rel) || 'uncategorized');
  return categories;
}

/** The anchor tuple for `category` on `stack`: its first relation of that type,
 *  or 0 for a stack classified only at stack level. */
export function categoryAnchorIndexOf(stack, category) {
  const index = (stack?.topPost?.relations ?? [])
    .findIndex((relation) => categoryKeyOf(relation?.category) === category);
  return index >= 0 ? index : 0;
}

/**
 * Pick the related card a type group starts from. `preferredIds` lists post ids
 * in priority order (the clicked reply, then the panel's cards as drawn); the
 * first one that is a related card of this type wins, otherwise the first such
 * card in data order. Null when no related post carries the type.
 */
export function pickTypeGroupAnchor(stacks, category, preferredIds = []) {
  const key = categoryKeyOf(category);
  if (!key) return null;
  const byId = new Map();
  for (const stack of stacks ?? []) {
    const id = stack?.topPost?.id;
    if (id != null && !byId.has(String(id))) byId.set(String(id), stack);
  }
  const matches = (stack) => !!stack && stackCategories(stack).has(key);
  let chosen = null;
  for (const id of preferredIds) {
    const stack = byId.get(String(id));
    if (matches(stack)) { chosen = stack; break; }
  }
  if (!chosen) chosen = (stacks ?? []).find(matches) ?? null;
  if (!chosen) return null;
  return { postId: String(chosen.topPost.id), rangeIndex: categoryAnchorIndexOf(chosen, key) };
}

/** Distinct related posts carrying the type (the group header's "(N posts)"). */
export function relatedCountForCategory(stacks, category) {
  const key = categoryKeyOf(category);
  const seen = new Set();
  for (const stack of stacks ?? []) {
    const id = stack?.topPost?.id;
    if (id == null || seen.has(String(id))) continue;
    if (stackCategories(stack).has(key)) seen.add(String(id));
  }
  return seen.size;
}
