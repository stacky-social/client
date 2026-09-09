export type InlineLinkToken =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; label: string; raw: string };

export function splitInlineLinks(input: unknown): InlineLinkToken[];
export function preserveInlineLinkOffsets(input: unknown): string;
export function linkifyHtmlUrls(input: unknown): string;
