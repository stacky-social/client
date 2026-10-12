type StackLike = {
  rel?: string | null;
  topPost: { id: string; relations?: Array<{ category?: string | null }> | null };
};

export function categoryKeyOf(value: string | null | undefined): string;
export function stackCategories(stack: StackLike): Set<string>;
export function relatedCountForCategory(
  stacks: readonly StackLike[] | null | undefined,
  category: string,
): number;
