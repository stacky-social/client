export type WordDiffChunk = { kind: "equal" | "insert" | "delete"; text: string };
export function createWordDiff(original: string, revised: string): WordDiffChunk[];
export function createWordDiffExcerpt(original: string, revised: string, maxTokens?: number): WordDiffChunk[];
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
export function splitDeletionForSubtleHighlight(text: string): {
  leading: string;
  middle: string;
  trailing: string;
};
