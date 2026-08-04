export type WordDiffChunk = { kind: "equal" | "insert" | "delete"; text: string };
export function createWordDiffExcerpt(original: string, revised: string, maxTokens?: number): WordDiffChunk[];
export type AlignedWordDiffWindow = {
  originalText: string;
  chunks: WordDiffChunk[];
  originalStart: number;
  originalEnd: number;
  hasPrefix: boolean;
  hasSuffix: boolean;
};
export function createAlignedWordDiffWindow(
  original: string,
  revised: string,
  maxOriginalChars?: number,
): AlignedWordDiffWindow;
