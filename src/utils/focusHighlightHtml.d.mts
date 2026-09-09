import type { Relation } from '../types/PostType';

export interface FocusHighlightSegment {
  start: number;
  end: number;
  rangeIds: number[];
}

export interface FocusCompositeSegment extends FocusHighlightSegment {
  passageRangeIds: number[];
}

export interface FocusHighlightInsertion {
  plainOffset: number;
  html: string;
  closeOffset?: number;
  closeHtml?: string;
}

export function buildFocusSegments(
  relations: Relation[],
  textLength: number,
  isValidCategory?: (category: string) => boolean,
): FocusHighlightSegment[];

export function buildFocusCommentSegments(
  relations: Relation[],
  textLength: number,
  isValidCategory?: (category: string) => boolean,
): FocusHighlightSegment[];

export function buildFocusCompositeSegments(
  relations: Relation[],
  textLength: number,
  isValidCategory?: (category: string) => boolean,
): FocusCompositeSegment[];

export function renderMultiHighlightHtml(
  displayHtml: string,
  focusPlainText: string,
  relations: Relation[],
  isValidCategory?: (category: string) => boolean,
  insertion?: FocusHighlightInsertion | null,
): string;

export function renderFocusCommentHtml(
  displayHtml: string,
  focusPlainText: string,
  relations: Relation[],
  isValidCategory?: (category: string) => boolean,
  insertion?: FocusHighlightInsertion | null,
): string;

export function renderFocusCompositeHtml(
  displayHtml: string,
  focusPlainText: string,
  relations: Relation[],
  isValidCategory?: (category: string) => boolean,
  insertion?: FocusHighlightInsertion | null,
): string;
