// Type surface for replySort.mjs (plain JS so node:test can import it).

export interface ReplySortOptions<R> {
  /** Quality rank (1 = best); undefined = unranked. */
  rankOf?: (reply: R) => number | undefined;
  /** Relations carried by the reply (category/topic are all that's read). */
  relationsOf?: (reply: R) => Array<{ category: string; topic?: string }>;
}

export function sortReplies<R extends { created_at: string; favourites_count?: number }>(
  replies: R[],
  mode: string,
  options?: ReplySortOptions<R>,
): R[];

export interface ReplySummaryDigest {
  total: number;
  withContributions: number;
  byCategory: Array<[string, number]>;
  topTopics: string[];
  sample: Array<{ author: string; firstSentence: string }>;
}

export function buildReplySummary<R>(
  replies: R[],
  options?: ReplySortOptions<R>,
): ReplySummaryDigest;
