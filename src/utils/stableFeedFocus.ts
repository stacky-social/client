// The pure selectors live in the .mjs core so node:test can exercise the
// clicked-focus protocol directly; this module adds the scroll listeners.
export {
  createFeedFocusPin,
  feedFocusGap,
  feedFocusHysteresisPx,
  feedFocusReadingLine,
  selectPinnedFeedFocus,
  selectStableFeedFocus,
} from "./stableFeedFocusCore.mjs";
export type {
  FeedFocusCandidate,
  FeedFocusMode,
  FeedFocusPin,
  FeedFocusRect,
} from "./stableFeedFocusCore.mjs";

const NATIVE_SCROLL_END_GRACE_MS = 100;
const SCROLL_SETTLE_FALLBACK_MS = 220;

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

/**
 * Keep feed focus synchronized with the viewport before each scroll frame is
 * painted, then run one final settled calculation for layout changes that land
 * at the end of momentum scrolling. The selector's retention band—not a long
 * debounce—prevents adjacent cards from oscillating.
 */
export function onFeedFocusScroll(callback: () => void): () => void {
  let animationFrame = 0;

  const onScrollFrame = () => {
    if (animationFrame) return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = 0;
      callback();
    });
  };

  const stopStableListener = onStableWindowScroll(callback);
  window.addEventListener("scroll", onScrollFrame, { passive: true });

  return () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    window.removeEventListener("scroll", onScrollFrame);
    stopStableListener();
  };
}
