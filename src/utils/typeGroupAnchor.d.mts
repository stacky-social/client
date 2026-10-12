type StackLike = {
  rel?: string | null;
  topPost: { id: string; relations?: Array<{ category?: string | null }> | null };
};

export function categoryKeyOf(value: string | null | undefined): string;
export function stackCategories(stack: StackLike): Set<string>;
export function categoryAnchorIndexOf(stack: StackLike, category: string): number;
export function pickTypeGroupAnchor(
  stacks: readonly StackLike[] | null | undefined,
  category: string,
  preferredIds?: readonly string[],
): { postId: string; rangeIndex: number } | null;
export function relatedCountForCategory(
  stacks: readonly StackLike[] | null | undefined,
  category: string,
): number;
