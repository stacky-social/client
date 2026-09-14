import type { Relation } from '../types/PostType';

export interface FocusTopicCandidate {
  topicKey: string;
  rangeIndex: number;
  count: number;
}

export function focusTopicCandidates(
  relations: Relation[],
  rangeIds: number[],
  relatedPosts?: Array<{ id?: string; relations?: Relation[]; topPost?: { id: string; relations?: Relation[] } }>,
): FocusTopicCandidate[];

export function nextFocusTopic(
  candidates: FocusTopicCandidate[],
  interaction: {
    origin: 'aside' | 'replies' | 'focus';
    topicKey: string;
    anchor: { postId: string; rangeIndex: number };
  } | null,
  postId: string,
  rangeIds: number[],
): FocusTopicCandidate | null;
