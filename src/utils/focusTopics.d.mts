import type { Relation, RelatedPostMock } from '../types/PostType';

export interface FocusTopicCandidate {
  topicKey: string;
  rangeIndex: number;
  count: number;
}

export function focusTopicCandidates(
  relations: Relation[],
  rangeIds: number[],
  relatedPosts?: RelatedPostMock[],
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
