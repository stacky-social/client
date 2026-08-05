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
