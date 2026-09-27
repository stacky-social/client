// Pure reading-window geometry for collapsed related cards. Plain JS so the
// node:test suite imports it directly; RelatedStacks.tsx slices the text and
// re-bases the relation offsets around the bounds computed here.

/** Characters shown on each side of the window centre. */
export const WINDOW_CHARS = 140;

/** A collapsed card clips at ~8 lines. At the narrowest usable aside (~25
 * characters per line) only the first ~200 characters are guaranteed visible,
 * so a preferred passage kept in place must fall inside that prefix. */
export const CLIP_SAFE_CHARS = 200;

/** How far a window edge may travel to reach a word boundary. Beyond this the
 * edge moves outward instead, so a very long token never empties the window. */
const MAX_SNAP_CHARS = 24;

const isSpace = (ch) => ch !== undefined && /\s/.test(ch);

/** The emphasized comment when it is a valid sub-range, else the whole
 *  relation range — the part of a relation the reader must be able to see. */
export function focalRange(relation) {
  const hasComment = relation.contentCommentEnd > relation.contentCommentStart
    && relation.contentCommentStart >= relation.contentStart
    && relation.contentCommentEnd <= relation.contentEnd;
  return hasComment
    ? { start: relation.contentCommentStart, end: relation.contentCommentEnd }
    : { start: relation.contentStart, end: relation.contentEnd };
}

function centeredOn(length, relation) {
  const focal = focalRange(relation);
  const center = Math.floor((focal.start + focal.end) / 2);
  return {
    start: Math.max(0, center - WINDOW_CHARS),
    end: Math.min(length, center + WINDOW_CHARS),
  };
}

/** Move a window start off a mid-word position: forward to the next word when
 *  that stays before `limit`, else back to the start of the cut word. */
function snapStart(text, start, limit) {
  if (start <= 0) return 0;
  let s = start;
  if (!isSpace(text[s - 1])) {
    while (s < text.length && !isSpace(text[s])) s += 1;
  }
  while (s < text.length && isSpace(text[s])) s += 1;
  if (s <= limit && s - start <= MAX_SNAP_CHARS) return s;
  let back = start;
  while (back > 0 && !isSpace(text[back - 1])) back -= 1;
  return back;
}

/** Move a window end off a mid-word position: back to the previous word end
 *  when that stays after `limit`, else forward to the end of the cut word. */
function snapEnd(text, end, limit) {
  if (end >= text.length) return text.length;
  let e = end;
  if (!isSpace(text[e])) {
    while (e > 0 && !isSpace(text[e - 1])) e -= 1;
  }
  while (e > 0 && isSpace(text[e - 1])) e -= 1;
  if (e >= limit && end - e <= MAX_SNAP_CHARS) return e;
  let forward = end;
  while (forward < text.length && !isSpace(text[forward])) forward += 1;
  return forward;
}

/**
 * Bounds of the collapsed reading window.
 *
 * The default window centres on relations[0] (the relation that brought the
 * card here). A `preferred` relation — the card's clicked span, or the one that
 * matches the active filter/group — re-centres the window only when the
 * default would not already show it. Keeping the default whenever it suffices
 * is what holds a clicked span still (the span-pinning invariant): for the
 * clicked span itself (`preferredIsAnchor`) any visible part suffices, since
 * the reader just clicked it there; for a matching relation the whole focal
 * range must fall in the clip-safe prefix of the window.
 *
 * Both edges then snap to word boundaries (never into the relation the window
 * is centred on) so the window never opens or closes on a word fragment.
 *
 * @param {string} text
 * @param {Array<object>|undefined} relations
 * @param {number|null|undefined} preferredIndex index into `relations`
 * @param {boolean} [preferredIsAnchor]
 * @returns {{ start: number, end: number }}
 */
export function readingWindowBounds(text, relations, preferredIndex, preferredIsAnchor = false) {
  const length = text.length;
  if (length <= WINDOW_CHARS * 2) return { start: 0, end: length };
  const first = relations?.[0];
  let bounds = first ? centeredOn(length, first) : { start: 0, end: WINDOW_CHARS * 2 };

  const preferred = preferredIndex != null ? relations?.[preferredIndex] : undefined;
  let centre = first;
  if (preferred && preferred.contentEnd > preferred.contentStart) {
    const focal = focalRange(preferred);
    const shown = preferredIsAnchor
      ? preferred.contentStart < bounds.end && bounds.start < preferred.contentEnd
      : focal.start >= bounds.start
        && focal.end <= Math.min(bounds.end, bounds.start + CLIP_SAFE_CHARS);
    if (!shown) {
      bounds = centeredOn(length, preferred);
      centre = preferred;
    }
  }

  // Snapping never trims into the relation the window is centred on. (A kept
  // default snaps exactly as it would with no preference, so it cannot shift.)
  const limitStart = centre ? Math.max(bounds.start, centre.contentStart) : length;
  const limitEnd = centre ? Math.min(bounds.end, centre.contentEnd) : 0;

  return {
    start: snapStart(text, bounds.start, limitStart),
    end: snapEnd(text, bounds.end, limitEnd),
  };
}
