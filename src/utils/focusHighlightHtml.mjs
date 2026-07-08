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
export function buildFocusSegments(relations, textLength, isValidCategory) {
  if (!(textLength > 0) || !relations || relations.length === 0) return [];
  const ok = isValidCategory || (() => true);
  const clamp = (n) => Math.max(0, Math.min(textLength, n));
  const valid = [];
  relations.forEach((r, i) => {
    if (r.focusStart < r.focusEnd && ok(r.category)) valid.push({ r, i });
  });
  if (valid.length === 0) return [];

  const points = new Set([0, textLength]);
  for (const { r } of valid) {
    points.add(clamp(r.focusStart));
    points.add(clamp(r.focusEnd));
  }
  const sorted = Array.from(points).sort((a, b) => a - b);

  const segments = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const start = sorted[k];
    const end = sorted[k + 1];
    if (end <= start) continue;
    const rangeIds = [];
    for (const { r, i } of valid) {
      if (r.focusStart < end && start < r.focusEnd) rangeIds.push(i);
    }
    if (rangeIds.length > 0) segments.push({ start, end, rangeIds });
  }
  return segments;
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
 * @returns {string} HTML with flat <mark data-fs data-fe data-range-ids> runs
 */
export function renderMultiHighlightHtml(displayHtml, focusPlainText, relations, isValidCategory) {
  const segments = buildFocusSegments(relations, focusPlainText.length, isValidCategory);
  if (segments.length === 0) return displayHtml;

  let out = '';
  let plain = 0; // offset into focusPlainText
  let i = 0;     // offset into displayHtml
  let segIdx = 0;
  let open = null; // the segment whose <mark> is currently open, or null

  const close = () => {
    if (open) { out += '</mark>'; open = null; }
  };
  const segAt = (pos) => {
    while (segIdx < segments.length && segments[segIdx].end <= pos) segIdx++;
    const s = segments[segIdx];
    return s && s.start <= pos && pos < s.end ? s : null;
  };

  while (i < displayHtml.length) {
    if (displayHtml[i] === '<') {
      close(); // marks never cross a tag boundary
      const gt = displayHtml.indexOf('>', i);
      const end = gt === -1 ? displayHtml.length : gt + 1;
      out += displayHtml.slice(i, end);
      i = end;
      continue;
    }
    // one plain char (an entity stripHtml decodes counts as one char)
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
        out += `<mark data-fs="${seg.start}" data-fe="${seg.end}" data-range-ids="${seg.rangeIds.join(' ')}" style="padding:1px 0;color:inherit">`;
        open = seg;
      }
    }
    out += chunk;
    plain += 1;
    i += adv;
  }
  close();
  return out;
}
