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
  /** Union of the whole branch's relations (root + descendants); when provided,
   *  a branch survives if ANY reply in it matches (root kept as context). */
  branchRelationsOf?: (reply: R) => Relation[],
): R[];

export function clusterTopLevel(
  orderedIds: string[],
  relationsOfId: (id: string) => Relation[],
  anchorId: string,
  anchorTopic: string,
): { order: string[]; memberIds: Set<string> };
