export type WordDiffChunk = { kind: "equal" | "insert" | "delete"; text: string };
export function createWordDiffExcerpt(original: string, revised: string, maxTokens?: number): WordDiffChunk[];
