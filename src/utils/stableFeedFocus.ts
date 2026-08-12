export type FeedFocusRect = {
  top: number;
  bottom: number;
  height: number;
};

export type FeedFocusCandidate<T> = {
  id: string;
  value: T;
  rect: FeedFocusRect;
};

export type FeedFocusMode = "center" | "top-line";

const NATIVE_SCROLL_END_GRACE_MS = 100;
const SCROLL_SETTLE_FALLBACK_MS = 220;

/**
 * A small Schmitt-trigger band around the selection boundary. It is large
 * enough to absorb trackpad/touchpad reversals without making the panel feel
 * detached from the feed on either compact or very tall viewports.
 */
export function feedFocusHysteresisPx(viewportHeight: number): number {
  return Math.min(112, Math.max(56, viewportHeight * 0.08));
}

/**
 * Pick a feed focus while preferring the current selection inside a retention
 * band. This prevents two adjacent cards from alternately winning when a user
 * makes tiny corrections around their shared boundary.
 */
export function selectStableFeedFocus<T>({
  candidates,
  currentId,
  viewportHeight,
  mode,
  anchorRatio = 0.3,
  atBottom = false,
}: {
  candidates: Array<FeedFocusCandidate<T>>;
  currentId: string | null;
  viewportHeight: number;
  mode: FeedFocusMode;
  anchorRatio?: number;
  atBottom?: boolean;
}): FeedFocusCandidate<T> | null {
  if (candidates.length === 0) return null;

  const visible = candidates.filter(
    ({ rect }) => rect.bottom > 0 && rect.top < viewportHeight,
  );
  if (visible.length === 0) return null;

  if (atBottom) return candidates[candidates.length - 1] ?? visible[visible.length - 1];

  const current = candidates.find(({ id }) => id === currentId) ?? null;
  const currentVisible = current
    ? current.rect.bottom > 0 && current.rect.top < viewportHeight
    : false;
  const hysteresis = feedFocusHysteresisPx(viewportHeight);

  if (mode === "center") {
    const viewportCenter = viewportHeight / 2;
    const distance = (candidate: FeedFocusCandidate<T>) =>
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

  const anchor = viewportHeight * anchorRatio;
  let proposed: FeedFocusCandidate<T> | null = null;
  for (const candidate of candidates) {
    if (candidate.rect.top <= anchor) proposed = candidate;
  }
  proposed ??= visible[0];

  if (!current || !currentVisible || !proposed || proposed.id === current.id) {
    return proposed;
  }

  const currentIndex = candidates.indexOf(current);
  const proposedIndex = candidates.indexOf(proposed);
  if (proposedIndex > currentIndex) {
    return proposed.rect.top <= anchor - hysteresis ? proposed : current;
  }
  if (proposedIndex < currentIndex) {
    return current.rect.top >= anchor + hysteresis ? proposed : current;
  }
  return current;
}

/**
 * Run a focus calculation once scrolling has genuinely settled. Browsers with
 * `scrollend` get the native intent-completion signal; older browsers use a
 * conservative debounced fallback. A short native grace period also coalesces
 * stepped programmatic scrolling and high-resolution trackpad bursts.
 */
export function onStableWindowScroll(callback: () => void): () => void {
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let nativeTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    if (nativeTimer) clearTimeout(nativeTimer);
    fallbackTimer = null;
    nativeTimer = null;
  };

  const onScroll = () => {
    clearTimers();
    fallbackTimer = setTimeout(callback, SCROLL_SETTLE_FALLBACK_MS);
  };

  const onScrollEnd = () => {
    clearTimers();
    nativeTimer = setTimeout(callback, NATIVE_SCROLL_END_GRACE_MS);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scrollend", onScrollEnd, { passive: true });
  return () => {
    clearTimers();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("scrollend", onScrollEnd);
  };
}
