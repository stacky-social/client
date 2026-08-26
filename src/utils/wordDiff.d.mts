export type WordDiffChunk = { kind: "equal" | "insert" | "delete"; text: string };
export function createWordDiff(original: string, revised: string): WordDiffChunk[];
export function createWordDiffExcerpt(original: string, revised: string, maxTokens?: number): WordDiffChunk[];
export function isSubstantiveWordDiff(original: string, revised: string): boolean;
export type AlignedWordDiffWindow = {
  originalText: string;
  revisedText: string;
  chunks: WordDiffChunk[];
  originalStart: number;
  originalEnd: number;
  revisedStart: number;
  revisedEnd: number;
  hasPrefix: boolean;
  hasSuffix: boolean;
};
export function createAlignedWordDiffWindow(
  original: string,
  revised: string,
  maxOriginalChars?: number,
): AlignedWordDiffWindow;
export type RevisedRangeWordDiff = {
  chunks: WordDiffChunk[];
  hasChanges: boolean;
  revisedStart: number;
  revisedEnd: number;
  hasPrefix: boolean;
  hasSuffix: boolean;
};
export function createWordDiffForRevisedRange(
  original: string,
  revised: string,
  revisedStart?: number,
  revisedEnd?: number,
  precomputedDiff?: WordDiffChunk[],
): RevisedRangeWordDiff;
export type HighlightAnnotatedWordDiffChunk = WordDiffChunk & {
  revisedStart: number;
  revisedEnd: number;
  relationIndices: number[];
};
export function annotateDiffHighlightRelations(
  chunks: WordDiffChunk[],
  relations?: Array<{ contentStart: number; contentEnd: number }>,
): HighlightAnnotatedWordDiffChunk[];
