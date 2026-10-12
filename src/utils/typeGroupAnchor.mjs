// Contribution-type helpers for the detail page's reply type tags.
//
// A reply's type tag starts a reply-origin type group (groupBy 'category'): the
// reply list gathers the replies of that type around the clicked reply and the
// related panel filters to posts carrying it. The tag's "N more <Type>" count
// adds the related posts of the type, so these helpers read related stacks with
// the same rules as RelatedStacks' categoriesOfStack.

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

/** Distinct related posts carrying the type. */
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
