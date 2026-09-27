export declare const WINDOW_CHARS: number;
export declare const CLIP_SAFE_CHARS: number;

export interface WindowRelation {
  contentStart: number;
  contentEnd: number;
  contentCommentStart: number;
  contentCommentEnd: number;
}

export function focalRange(relation: WindowRelation): { start: number; end: number };

export function readingWindowBounds(
  text: string,
  relations: WindowRelation[] | undefined,
  preferredIndex: number | null | undefined,
  preferredIsAnchor?: boolean,
): { start: number; end: number };
