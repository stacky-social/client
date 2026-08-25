/**
 * Inline marks are split into one client rect per wrapped line. Browsers can
 * report the line-height gap between two rects as the parent element, causing a
 * false mouseleave while the pointer is simply travelling down the same mark.
 */
export function pointBridgesInlineRects(rects, clientX, clientY, tolerance = 1) {
  const ordered = Array.from(rects)
    .filter((rect) => rect && rect.width > 0 && rect.height > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left);

  for (let index = 0; index < ordered.length - 1; index++) {
    const upper = ordered[index];
    const lower = ordered[index + 1];
    if (lower.top < upper.bottom) continue;
    const inVerticalGap = clientY >= upper.bottom - tolerance
      && clientY <= lower.top + tolerance;
    const left = Math.min(upper.left, lower.left) - tolerance;
    const right = Math.max(upper.right, lower.right) + tolerance;
    if (inVerticalGap && clientX >= left && clientX <= right) return true;
  }
  return false;
}
