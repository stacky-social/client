/**
 * Shared highlight utilities for the Listy Injection feature.
 *
 * These mirror the parsing logic in RelatedStacks.tsx but are extracted here
 * so that FocusPost, RankedPostCard, and other components can import them
 * without coupling to RelatedStacks.
 *
 * Bracket conventions (same as the existing backend protocol):
 *   ⌊…⌋  or  ⌈…⌉  →  "green" / content_highlight spans
 *   ⟦…⟧              →  "blue"  / rewrite spans
 *
 * For focusHighlight we treat all bracket types as a single "category" highlight,
 * and callers supply the desired color separately.
 */

export interface HighlightRange {
  start: number;
  end: number;
  source: "green" | "blue" | "category";
}

export interface ParseResult {
  plainText: string;
  highlights: HighlightRange[];
}

/**
 * Strip bracket markers from `text` and record the character ranges they
 * enclosed.  Returns the plain text and an array of highlight ranges.
 */
export function parseHighlight(
  text: string | null | undefined,
  source: HighlightRange["source"]
): ParseResult {
  if (!text) return { plainText: "", highlights: [] };

  let plainText = "";
  const highlights: HighlightRange[] = [];
  let i = 0;
  let highlightStart = -1;

  while (i < text.length) {
    const ch = text[i];
    if (ch === "⌊" || ch === "⌈" || ch === "⟦") {
      highlightStart = plainText.length;
      i++;
    } else if (ch === "⌋" || ch === "⌉" || ch === "⟧") {
      if (highlightStart !== -1) {
        highlights.push({ start: highlightStart, end: plainText.length, source });
        highlightStart = -1;
      }
      i++;
    } else {
      plainText += ch;
      i++;
    }
  }

  return { plainText, highlights };
}

export interface Segment {
  text: string;
  highlighted: boolean;
}

/**
 * Split `plainText` into an array of segments based on the given highlight
 * ranges.  Overlapping ranges are merged.  Non-highlighted stretches get
 * `highlighted: false`.
 */
export function buildSegments(
  plainText: string,
  highlights: HighlightRange[]
): Segment[] {
  if (!highlights.length) return [{ text: plainText, highlighted: false }];

  // Merge overlapping / adjacent ranges
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of sorted) {
    if (merged.length && r.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }

  const segments: Segment[] = [];
  let lastPos = 0;

  for (const { start, end } of merged) {
    if (start > lastPos) {
      segments.push({ text: plainText.slice(lastPos, start), highlighted: false });
    }
    segments.push({ text: plainText.slice(start, end), highlighted: true });
    lastPos = end;
  }

  if (lastPos < plainText.length) {
    segments.push({ text: plainText.slice(lastPos), highlighted: false });
  }

  return segments.filter((s) => s.text.length > 0);
}
