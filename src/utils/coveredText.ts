// Characters hidden under a truncation ellipsis. Ellipses are drawn over the
// text (never inserted), so a line break can never change; the whole
// characters they overlap turn transparent through a CSS custom highlight,
// which changes no metrics. See ellipsisCover.mjs for the choice of glyphs.
import { trailingEllipsisCover } from './ellipsisCover.mjs';

/** The named highlight, created and registered on first use. Priority 1 so a
 *  lower-priority highlight that sets `color` (search matches) cannot repaint
 *  a covered glyph. Null where the CSS Custom Highlight API is missing. */
export function coverHighlight(name: string): Highlight | null {
  if (typeof Highlight === 'undefined' || typeof CSS === 'undefined' || !CSS.highlights) return null;
  let highlight = CSS.highlights.get(name);
  if (!highlight) {
    highlight = new Highlight();
    highlight.priority = 1;
    CSS.highlights.set(name, highlight);
  }
  return highlight;
}

/** Swap one range in a highlight for another (either may be null). */
export function replaceCoveredRange(name: string, previous: Range | null, next: Range | null): void {
  const highlight = coverHighlight(name);
  if (!highlight) return;
  if (previous) highlight.delete(previous);
  if (next) highlight.add(next);
}

const ellipsisWidthCache = new Map<string, number>();
let measureContext: CanvasRenderingContext2D | null = null;

/** Advance width of "…" in a font, measured once per font. */
function ellipsisGlyphWidth(font: string, fallback: number): number {
  const cached = ellipsisWidthCache.get(font);
  if (cached !== undefined) return cached;
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return fallback;
  measureContext.font = font;
  const width = measureContext.measureText('…').width || fallback;
  ellipsisWidthCache.set(font, width);
  return width;
}

function glyphBox(range: Range, node: Text, offset: number): DOMRect | null {
  range.setStart(node, offset);
  range.setEnd(node, offset + 1);
  const rects = range.getClientRects();
  for (let i = 0; i < rects.length; i += 1) {
    if (rects[i].width > 0 && rects[i].height > 0) return rects[i];
  }
  return null;
}

const middle = (rect: DOMRect) => (rect.top + rect.bottom) / 2;

/** Vertical middle of the last painted glyph at or before `offset`
 *  (collapsed whitespace has no box), or -Infinity if there is none. */
function middleAtOrBefore(range: Range, node: Text, offset: number): number {
  for (let i = offset; i >= 0; i -= 1) {
    const box = glyphBox(range, node, i);
    if (box) return middle(box);
  }
  return -Infinity;
}

export type TrailingEllipsis = {
  /** Box position relative to `container`. */
  left: number;
  top: number;
  lineHeight: number;
  /** Whole characters under the ellipsis box, or null when it fits after the line. */
  covered: Range | null;
};

export type TrailingEllipsisInput = {
  /** The clamped (or internally scrolled) text box. */
  element: HTMLElement;
  /** The positioned ancestor the ellipsis box is placed in. */
  container: HTMLElement;
  /** Bottom edge of the last visible line (defaults to the box bottom). */
  bottom: number;
  lineHeight: number;
  /** Ellipsis font and padding: the box must fit them without overlapping text. */
  ellipsisFontWeight: string | number;
  ellipsisPaddingEm: number;
  /** Font size of the ellipsis box when it differs from the text's. */
  ellipsisFontSize?: number;
};

/**
 * Place a trailing ellipsis on the final visible line of a clamped text box.
 * It goes right after the last glyph when it fits; otherwise the glyphs it
 * would overlap are covered WHOLE and the box starts right after the last
 * glyph that stays visible, so no character is ever half drawn. Only the
 * final line is measured per glyph (a binary search finds its end inside a
 * long text node), so this stays cheap enough to run on every resize.
 */
export function measureTrailingEllipsis({
  element,
  container,
  bottom,
  lineHeight,
  ellipsisFontWeight,
  ellipsisPaddingEm,
  ellipsisFontSize,
}: TrailingEllipsisInput): TrailingEllipsis | null {
  const computed = getComputedStyle(element);
  const fontSize = Number.parseFloat(computed.fontSize) || 16;
  const boxFontSize = ellipsisFontSize ?? fontSize;
  const boxRect = element.getBoundingClientRect();
  const lineRight = boxRect.left + element.clientLeft + element.clientWidth
    - (Number.parseFloat(computed.paddingRight) || 0);
  const bandTop = bottom - lineHeight;
  const onBand = (rect: DOMRect) => middle(rect) > bandTop && middle(rect) < bottom;

  // Text nodes in order, and the last one with a glyph on the final line.
  const range = document.createRange();
  const nodes: Text[] = [];
  let lastIndex = -1;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    nodes.push(node);
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i += 1) {
      if (rects[i].width > 0 && onBand(rects[i])) { lastIndex = nodes.length - 1; break; }
    }
  }
  if (lastIndex < 0) return null;

  // The last offset of that node still on (or above) the final line. Glyph
  // positions only move down through a node, so binary search for it.
  const lastNode = nodes[lastIndex];
  let low = 0;
  let high = lastNode.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (middleAtOrBefore(range, lastNode, mid) < bottom) low = mid;
    else high = mid - 1;
  }

  // Walk back along the final line until past the start of the word the
  // ellipsis would cut, keeping the last glyph of the word before it (or
  // until the line starts). That is all trailingEllipsisCover needs.
  const fontFamily = computed.fontFamily;
  const glyphWidth = ellipsisGlyphWidth(
    `${ellipsisFontWeight} ${boxFontSize}px ${fontFamily}`,
    boxFontSize * 0.8,
  );
  const ellipsisWidth = glyphWidth + boxFontSize * ellipsisPaddingEm + 1;
  const limit = lineRight - ellipsisWidth;
  type Glyph = {
    node: Text; offset: number; left: number; right: number; rect: DOMRect; spaceBefore: boolean;
  };
  const glyphs: Glyph[] = [];
  collect: for (let index = lastIndex, start = low; index >= 0; index -= 1) {
    const node = nodes[index];
    for (let offset = index === lastIndex ? start : node.length - 1; offset >= 0; offset -= 1) {
      if (/\s/.test(node.data[offset])) {
        // Whitespace before the glyph collected last: that glyph starts a word.
        if (glyphs.length) glyphs[glyphs.length - 1].spaceBefore = true;
        continue;
      }
      const rect = glyphBox(range, node, offset);
      if (!rect) continue;
      if (!onBand(rect)) {
        if (middle(rect) <= bandTop) break collect; // previous line
        continue;
      }
      const next = glyphs[glyphs.length - 1];
      glyphs.push({ node, offset, left: rect.left, right: rect.right, rect, spaceBefore: false });
      // This glyph fits and ends a word: nothing before it can be covered.
      if (rect.right <= limit && (!next || next.spaceBefore)) break collect;
    }
  }
  glyphs.reverse();
  const cover = trailingEllipsisCover(glyphs, lineRight, ellipsisWidth);
  if (!cover) return null;

  let covered: Range | null = null;
  if (cover.coverFrom < glyphs.length) {
    covered = document.createRange();
    const first = cover.coverFrom > 0 ? glyphs[cover.coverFrom - 1] : glyphs[0];
    if (cover.coverFrom > 0) covered.setStart(first.node, first.offset + 1);
    else covered.setStart(first.node, first.offset);
    const last = glyphs[glyphs.length - 1];
    covered.setEnd(last.node, last.offset + 1);
  }

  const containerRect = container.getBoundingClientRect();
  const lastRect = glyphs[glyphs.length - 1].rect;
  // Align the box with the line box, not the glyph's (shorter) content box.
  const lineTop = lastRect.top - (lineHeight - lastRect.height) / 2;
  return {
    // Rounded up so the box never reaches back into the last visible glyph.
    left: Math.ceil((cover.left - containerRect.left) * 100) / 100,
    top: Math.round((lineTop - containerRect.top) * 100) / 100,
    lineHeight,
    covered,
  };
}
