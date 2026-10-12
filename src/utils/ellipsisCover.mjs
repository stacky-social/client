// Truncation ellipses are drawn OVER text, never inserted into it, so they can
// never change a line break. The characters they overlap must be hidden whole:
// an ellipsis box that starts in the middle of a glyph leaves half a letter
// showing ("happen" plus a sliver of "s"). These helpers pick the whole
// characters an ellipsis covers from measured glyph boxes.

/**
 * Choose where a trailing ellipsis goes on the final visible line.
 *
 * `glyphs` are that line's non-space glyph boxes in reading order (left to
 * right); `spaceBefore` marks a glyph that follows whitespace (a word start).
 * `lineRight` is the right edge of the text box, and `ellipsisWidth` is the
 * full width of the ellipsis box (padding included). The ellipsis needs
 * `ellipsisWidth` before `lineRight`; every glyph reaching past that point is
 * covered whole, and so is the rest of the word it cuts ("Many …", not
 * "Many utiliti …"), unless that word is all the line holds. The box starts
 * right after the last glyph that stays visible, so no visible glyph and the
 * box ever share a pixel column.
 *
 * Returns `{ coverFrom, left }`: glyphs from `coverFrom` on are hidden, and
 * the ellipsis box starts at `left`. `coverFrom === glyphs.length` means the
 * ellipsis fits after the line and covers nothing. Null for an empty line.
 *
 * @param {ReadonlyArray<{ left: number, right: number, spaceBefore?: boolean }>} glyphs
 * @param {number} lineRight
 * @param {number} ellipsisWidth
 * @returns {{ coverFrom: number, left: number } | null}
 */
export function trailingEllipsisCover(glyphs, lineRight, ellipsisWidth) {
  if (!glyphs.length) return null;
  const limit = lineRight - ellipsisWidth;
  let coverFrom = glyphs.length;
  // Sub-pixel tolerance: a glyph ending exactly at the limit still fits.
  while (coverFrom > 0 && glyphs[coverFrom - 1].right > limit + 0.01) coverFrom -= 1;
  if (coverFrom > 0 && coverFrom < glyphs.length) {
    // The cut lands inside a word: hide the whole word, if another word
    // precedes it on the line.
    let wordStart = coverFrom;
    while (wordStart > 0 && !glyphs[wordStart].spaceBefore) wordStart -= 1;
    if (wordStart > 0) coverFrom = wordStart;
  }
  const left = coverFrom === 0 ? glyphs[0].left : glyphs[coverFrom - 1].right;
  return { coverFrom, left };
}
