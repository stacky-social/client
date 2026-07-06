// Type surface for threadFilter.mjs.
import type { Relation } from "../types/PostType";

export interface ReplyFilterState {
  filterCategories?: Set<string> | string[];
  responseFilter?: { start: number; end: number } | null;
  topicFilter?: string | null;
}

export function filterReplies<R>(
  replies: R[],
  relationsOf: (reply: R) => Relation[],
  filters?: ReplyFilterState,
): R[];

export function clusterTopLevel(
  orderedIds: string[],
  relationsOfId: (id: string) => Relation[],
  anchorId: string,
  anchorTopic: string,
): { order: string[]; memberIds: Set<string> };
