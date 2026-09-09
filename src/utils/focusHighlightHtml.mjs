// Flat-segmentation renderer for the focus post's cross-highlight marks.
//
// The focus post's relations overlap FREELY (many related posts highlight large,
// partially-overlapping passages). The previous renderer inserted one NESTED
// <mark> per relation via regex text-search on progressively-mutated HTML. HTML
// cannot represent partially-overlapping spans as nested tags, so the browser
// re-balanced them — closing a 130-deep mark stack mid-word and reopening it
// (the visible "In|stead" seam) — and the crux-bold wrapper threw on the ragged
// nesting. This renderer instead splits the text into NON-OVERLAPPING segments at
// every relation boundary and emits one FLAT <mark> per covered segment: no
// nesting, no re-balancing, no mid-word seam. Each mark carries data-range-ids
// (space-separated) listing every relation covering it, so the hover/paint/scroll
// code can still map a segment back to its relations.
//
// Pure functions (no DOM / React), so they are unit-testable under node:test.

/**
 * Split [0, textLength) into non-overlapping segments at every relation boundary.
 * Each returned segment lists the ORIGINAL relation indices covering it. Relations
 * are dropped when isValidCategory(category) is false (default: keep all) or when
 * the span is empty.
 *
 * @param {Array<{focusStart:number, focusEnd:number, category?:string}>} relations
 * @param {number} textLength
 * @param {(category:string)=>boolean} [isValidCategory]
 * @returns {Array<{start:number, end:number, rangeIds:number[]}>}
 */
function buildSegments(relations, textLength, startKey, endKey, isValidCategory) {
  if (!(textLength > 0) || !relations || relations.length === 0) return [];
  const ok = isValidCategory || (() => true);
  const clamp = (n) => Math.max(0, Math.min(textLength, n));
  const valid = [];
  relations.forEach((r, i) => {
    const start = Number(r[startKey]);
    const end = Number(r[endKey]);
    if (Number.isFinite(start) && Number.isFinite(end) && start < end && ok(r.category)) {
      valid.push({ start, end, i });
    }
  });
  if (valid.length === 0) return [];

  const points = new Set([0, textLength]);
  for (const range of valid) {
    points.add(clamp(range.start));
    points.add(clamp(range.end));
  }
  const sorted = Array.from(points).sort((a, b) => a - b);

  const segments = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const start = sorted[k];
    const end = sorted[k + 1];
    if (end <= start) continue;
    const rangeIds = [];
    for (const range of valid) {
      if (range.start < end && start < range.end) rangeIds.push(range.i);
    }
    if (rangeIds.length > 0) segments.push({ start, end, rangeIds });
  }
  return segments;
}

export function buildFocusSegments(relations, textLength, isValidCategory) {
  return buildSegments(relations, textLength, 'focusStart', 'focusEnd', isValidCategory);
}

/**
 * Build the semantic topic hotspots shown in focus-post prose. Unlike the broad
 * focus ranges used to connect a related card to a passage, these boundaries are
 * the concise author-defined ranges that should read as bold inline phrases.
 */
export function buildFocusCommentSegments(relations, textLength, isValidCategory) {
  return buildSegments(
    relations,
    textLength,
    'focusCommentStart',
    'focusCommentEnd',
    isValidCategory,
  );
}

/**
 * Split on both broad passage and concise comment boundaries. A segment may be
 * an interactive bold topic phrase, an inert piece of a related-card passage,
 * or both. Keeping the two id sets on one flat element restores the original
 * aside-to-focus passage paint without nesting marks.
 */
export function buildFocusCompositeSegments(relations, textLength, isValidCategory) {
  const passages = buildFocusSegments(relations, textLength, isValidCategory);
  const comments = buildFocusCommentSegments(relations, textLength, isValidCategory);
  if (passages.length === 0 && comments.length === 0) return [];

  const points = new Set([0, textLength]);
  [...passages, ...comments].forEach((segment) => {
    points.add(segment.start);
    points.add(segment.end);
  });
  const sorted = Array.from(points).sort((a, b) => a - b);
  return sorted.slice(0, -1).flatMap((start, index) => {
    const end = sorted[index + 1];
    if (end <= start) return [];
    const passageRangeIds = passages.find(
      (segment) => segment.start < end && start < segment.end,
    )?.rangeIds ?? [];
    const rangeIds = comments.find(
      (segment) => segment.start < end && start < segment.end,
    )?.rangeIds ?? [];
    return passageRangeIds.length > 0 || rangeIds.length > 0
      ? [{ start, end, rangeIds, passageRangeIds }]
      : [];
  });
}

// The six entities stripHtml() (in Post.tsx) decodes to a single character. Every
// other character — including a bare '&' — is one plain char. Kept in lock-step
// with stripHtml so the walker's plain-text offset matches the relation offsets.
const ENTITY_RE = /^(?:&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;)/;

/**
 * Render focus highlights into displayHtml by walking it and opening/closing a
 * FLAT <mark> per covered segment. Marks never nest and never cross a tag
 * boundary (a highlight spanning a paragraph break becomes two adjacent marks).
 * Offsets index the STRIPPED plain text (see stripHtml); tags pass through
 * verbatim and decoded entities count as one plain char so the walk stays aligned.
 *
 * @param {string} displayHtml       post body HTML (marks are inserted into this)
 * @param {string} focusPlainText    stripHtml(rawText) — the offset base
 * @param {Array} relations
 * @param {(category:string)=>boolean} [isValidCategory]
 * @param {{plainOffset:number, html:string, closeOffset?:number, closeHtml?:string}|null} [insertion]
 *        zero-width inline HTML inserted before one plain-text character without
 *        changing offsets; optional close HTML can wrap a following source slice
 * @returns {string} HTML with flat <mark data-fs data-fe data-range-ids> runs
 */
function renderHighlightHtml(displayHtml, focusPlainText, segments, insertion = null) {
  if (segments.length === 0 && !insertion) return displayHtml;

  let out = '';
  let plain = 0; // offset into focusPlainText
  let i = 0;     // offset into displayHtml
  let segIdx = 0;
  let open = null; // the segment whose <mark> is currently open, or null
  let inserted = false;
  let insertionClosed = false;

  const close = () => {
    if (!open) return;
    out += Array.isArray(open.passageRangeIds) && open.rangeIds.length === 0
      ? '</span>'
      : '</mark>';
    open = null;
  };
  const segAt = (pos) => {
    while (segIdx < segments.length && segments[segIdx].end <= pos) segIdx++;
    const s = segments[segIdx];
    return s && s.start <= pos && pos < s.end ? s : null;
  };

  while (i < displayHtml.length) {
    if (
      inserted
      && !insertionClosed
      && insertion?.closeOffset != null
      && plain === insertion.closeOffset
    ) {
      close();
      out += insertion.closeHtml ?? '';
      insertionClosed = true;
    }
    if (displayHtml[i] === '<') {
      close(); // marks never cross a tag boundary
      const gt = displayHtml.indexOf('>', i);
      const end = gt === -1 ? displayHtml.length : gt + 1;
      out += displayHtml.slice(i, end);
      i = end;
      continue;
    }
    // one plain char (an entity stripHtml decodes counts as one char)
    if (!inserted && insertion && plain === insertion.plainOffset) {
      // The continuation control is real inline content at the visible text
      // boundary, but it consumes zero source characters and must not inherit a
      // relation mark. Close/reopen the flat mark around it so range offsets and
      // highlight paint stay unchanged.
      close();
      out += insertion.html;
      inserted = true;
    }
    let chunk = displayHtml[i];
    let adv = 1;
    if (chunk === '&') {
      const m = ENTITY_RE.exec(displayHtml.slice(i, i + 8));
      if (m) { chunk = m[0]; adv = m[0].length; }
    }
    const seg = segAt(plain);
    if (seg !== open) {
      close();
      if (seg) {
        const passageAttr = Array.isArray(seg.passageRangeIds)
          ? ` data-focus-passage-ids="${seg.passageRangeIds.join(' ')}"`
          : '';
        out += Array.isArray(seg.passageRangeIds) && seg.rangeIds.length === 0
          ? `<span data-fs="${seg.start}" data-fe="${seg.end}"${passageAttr}>`
          : `<mark data-fs="${seg.start}" data-fe="${seg.end}" data-range-ids="${seg.rangeIds.join(' ')}"${passageAttr} data-continuous-inline-highlight>`;
        open = seg;
      }
    }
    out += chunk;
    plain += 1;
    i += adv;
  }
  close();
  if (inserted && !insertionClosed) out += insertion?.closeHtml ?? '';
  return out;
}

export function renderMultiHighlightHtml(displayHtml, focusPlainText, relations, isValidCategory, insertion = null) {
  const segments = buildFocusSegments(relations, focusPlainText.length, isValidCategory);
  return renderHighlightHtml(displayHtml, focusPlainText, segments, insertion);
}

/** Render persistent semantic focus phrases, unioning identical/overlapping ranges. */
export function renderFocusCommentHtml(displayHtml, focusPlainText, relations, isValidCategory, insertion = null) {
  const segments = buildFocusCommentSegments(relations, focusPlainText.length, isValidCategory);
  return renderHighlightHtml(displayHtml, focusPlainText, segments, insertion);
}

/** Render bold topic phrases plus transparent broad passage hooks in one flat tree. */
export function renderFocusCompositeHtml(displayHtml, focusPlainText, relations, isValidCategory, insertion = null) {
  const segments = buildFocusCompositeSegments(relations, focusPlainText.length, isValidCategory);
  return renderHighlightHtml(displayHtml, focusPlainText, segments, insertion);
}
