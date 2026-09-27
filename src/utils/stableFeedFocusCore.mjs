// Pure feed-focus selection (plain JS so node:test can import it). The React
// scroll listeners and typed re-exports live in stableFeedFocus.ts.

/**
 * A small Schmitt-trigger band around the selection boundary. It is large
 * enough to absorb trackpad/touchpad reversals without making the panel feel
 * detached from the feed on either compact or very tall viewports.
 */
export function feedFocusHysteresisPx(viewportHeight) {
  return Math.min(112, Math.max(56, viewportHeight * 0.08));
}

const isVisible = (rect, viewportTop, viewportHeight) =>
  rect.bottom > viewportTop && rect.top < viewportHeight;

/**
 * The feed's "reading line": the viewport line the picker measures cards
 * against — the anchor line in top-line mode, the content centre otherwise.
 */
export function feedFocusReadingLine({ viewportTop = 0, viewportHeight, mode, anchorRatio = 0.3 }) {
  const usableViewportHeight = Math.max(1, viewportHeight - viewportTop);
  return mode === "center"
    ? viewportTop + usableViewportHeight / 2
    : viewportTop + usableViewportHeight * anchorRatio;
}

/**
 * Distance from the reading line to a card: 0 while the card spans the line,
 * otherwise the distance to the card's nearest edge.
 */
export function feedFocusGap(rect, line) {
  if (rect.top > line) return rect.top - line;
  if (rect.bottom < line) return line - rect.bottom;
  return 0;
}

/**
 * Pick a feed focus while preferring the current selection inside a retention
 * band. This prevents two adjacent cards from alternately winning when a user
 * makes tiny corrections around their shared boundary.
 */
export function selectStableFeedFocus({
  candidates,
  currentId,
  viewportTop = 0,
  viewportHeight,
  mode,
  anchorRatio = 0.3,
  atTop = false,
  atBottom = false,
}) {
  if (candidates.length === 0) return null;

  const ordered = [...candidates].sort((a, b) => a.rect.top - b.rect.top);
  const visible = ordered.filter(({ rect }) => isVisible(rect, viewportTop, viewportHeight));
  if (visible.length === 0) return null;

  if (atTop) return visible[0];
  if (atBottom) return visible[visible.length - 1];

  const current = ordered.find(({ id }) => id === currentId) ?? null;
  const currentVisible = current ? isVisible(current.rect, viewportTop, viewportHeight) : false;
  const usableViewportHeight = Math.max(1, viewportHeight - viewportTop);
  const hysteresis = feedFocusHysteresisPx(usableViewportHeight);

  if (mode === "center") {
    const viewportCenter = viewportTop + usableViewportHeight / 2;
    const distance = (candidate) =>
      Math.abs(candidate.rect.top + candidate.rect.height / 2 - viewportCenter);
    const proposed = visible.reduce((best, candidate) =>
      distance(candidate) < distance(best) ? candidate : best,
    );

    if (!current || !currentVisible || proposed.id === current.id) return proposed;

    // The challenger must be meaningfully closer than the retained selection.
    // At the exact boundary (or during a small direction reversal), keep the
    // current focus and therefore keep the right panel visually stable.
    return distance(current) - distance(proposed) >= hysteresis ? proposed : current;
  }

  const anchor = viewportTop + usableViewportHeight * anchorRatio;
  let proposed = null;
  for (const candidate of visible) {
    if (candidate.rect.top <= anchor) proposed = candidate;
  }
  proposed ??= visible[0];

  if (!current || !currentVisible || !proposed || proposed.id === current.id) {
    return proposed;
  }

  const currentIndex = ordered.indexOf(current);
  const proposedIndex = ordered.indexOf(proposed);
  if (proposedIndex > currentIndex) {
    return proposed.rect.top <= anchor - hysteresis ? proposed : current;
  }
  if (proposedIndex < currentIndex) {
    return current.rect.top >= anchor + hysteresis ? proposed : current;
  }
  return current;
}

/**
 * Start a clicked-focus pin: an explicit click focuses a post where it is,
 * without scrolling it onto the reading line. `best` is the post's gap to the
 * line at the moment of the click.
 */
export function createFeedFocusPin({ id, rect, viewportTop = 0, viewportHeight, mode, anchorRatio = 0.3 }) {
  const line = feedFocusReadingLine({ viewportTop, viewportHeight, mode, anchorRatio });
  return { id, best: feedFocusGap(rect, line) };
}

/**
 * The clicked-focus protocol layered over selectStableFeedFocus.
 *
 * AUTO (pin = null) is the ordinary scroll-driven picker. An explicit click
 * enters PINNED(p). While pinned, each evaluation:
 *   1. hands off silently to AUTO when the unpinned picker (current = p) would
 *      keep p anyway;
 *   2. tracks the closest the post has come to the reading line (`best`);
 *   3. releases to AUTO once the post has moved more than one hysteresis band
 *      further away than `best`, or is no longer visible;
 *   4. otherwise keeps p.
 * Only card geometry is measured — never scroll deltas — so scroll anchoring,
 * load-more and layout shifts that leave p in place cannot switch focus. There
 * is no time decay, and the atTop/atBottom shortcuts never override a pin.
 */
export function selectPinnedFeedFocus({ pin, ...options }) {
  const { candidates, currentId, viewportTop = 0, viewportHeight } = options;
  // A pin only describes the current focus; any other focus change (Back,
  // popstate, a toggle-off) implicitly ends it.
  if (!pin || pin.id !== currentId) {
    return { selected: selectStableFeedFocus(options), pin: null };
  }

  const pinned = candidates.find(({ id }) => id === pin.id) ?? null;
  const auto = selectStableFeedFocus({ ...options, currentId: pin.id });
  if (!pinned || !isVisible(pinned.rect, viewportTop, viewportHeight)) {
    return { selected: auto, pin: null };
  }
  if (auto?.id === pin.id) return { selected: pinned, pin: null };

  const gap = feedFocusGap(pinned.rect, feedFocusReadingLine(options));
  const best = Math.min(pin.best, gap);
  const band = feedFocusHysteresisPx(Math.max(1, viewportHeight - viewportTop));
  if (gap > best + band) return { selected: auto, pin: null };
  return { selected: pinned, pin: best === pin.best ? pin : { id: pin.id, best } };
}
