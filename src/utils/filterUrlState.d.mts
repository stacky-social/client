export declare const FILTER_HISTORY_CAP: number;

export interface TopicUrlInteraction {
  origin: 'aside' | 'replies';
  topicKey: string;
  anchor: { postId: string; rangeIndex: number };
}

export function serializeFilterSearch(options: {
  currentSearch?: string;
  activeTab: string;
  defaultTab: string;
  filterCategories?: Set<string> | string[];
  responseFilter?: { start: number; end: number } | null;
  topicInteraction?: TopicUrlInteraction | null;
}): string;

export type ParsedFilterInteraction =
  | { kind: 'none' }
  | { kind: 'pending-passage' }
  | { kind: 'category'; categories: string[] }
  | { kind: 'passage'; span: { start: number; end: number; text: string } }
  | { kind: 'topic'; interaction: TopicUrlInteraction };

export function parseFilterInteraction(
  search: string | URLSearchParams,
  plainPostText?: string | null,
): ParsedFilterInteraction;

export function historyWriteMode(undoDepth: number, cap?: number): 'push' | 'replace';
