"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Reply scroll (px) the reader keeps after the focus collapses: the collapse
 * point sits this far past the height the focus gives back, so the scroll-
 * anchoring compensation below always has room and the post-collapse position
 * stays clear of the expand point (top of the replies) — the hysteresis band. */
const COLLAPSE_MARGIN = 40;
/** Conservative compact-height guess for the first collapse (the real compact
 * post is ~120–150px). Under-guessing only collapses a little later. */
const COMPACT_HEIGHT_GUESS = 120;
/** A region scroll this soon after wheel/touch/key input inside it is the
 * reader's own; anything else (restoration, tests, script) is programmatic. */
const USER_INPUT_WINDOW_MS = 600;
/** How long after a scroll-driven compact change focus resizes stay anchored
 * (the compact post settles over a couple of frames). */
const ANCHOR_WINDOW_MS = 400;

/** Layout-driven scroll events must never undo a collapse. Only upward user
 * input at the start of the comments (or an explicit expansion) may do that.
 *
 * Continuity contract (#259): switching between the full and compact focus
 * never moves the replies the reader is looking at, and never moves the aside.
 *  - Until the focus post is stuck at `pinTop`, the reply region is not
 *    user-scrollable, so wheel/touch/keys scroll the PAGE natively: the replies
 *    travel exactly with the input until the focus pins. Previously the region
 *    scrolled first and the page was then pinned in one instant jump.
 *  - A scroll-driven collapse/expand is anchored: each focus height change is
 *    offset in the region's scrollTop before paint, so the replies stay put.
 *  - The focus height that sizes the reply region is applied imperatively
 *    before paint. A ResizeObserver → setState round trip left the region a
 *    frame or two short, which shortened the shell row and dragged the sticky
 *    aside up.
 */
export function useCompactFocus(
  anchor: RefObject<HTMLDivElement>,
  replies: RefObject<HTMLDivElement>,
  /** Viewport top of the focus post once it is stuck (its `position: sticky`
   *  top). The reply region is sized for that stuck layout, so the page must
   *  reach it for the last reply to be reachable. */
  pinTop = 64,
  /** The sticky focus wrapper, measured to size the reply region. */
  focus?: RefObject<HTMLElement | null>,
) {
  const [compact, updateCompact] = useState(false);
  const compactRef = useRef(false);
  const direction = useRef(0);
  const inputInReplies = useRef(false);
  const lastReplyInput = useRef(-Infinity);
  const pinFrame = useRef(0);
  // Until this time, focus height changes are scroll-anchored (set by a
  // scroll-driven compact change; the compact post settles over two passes).
  const anchorUntil = useRef(0);
  const lastHeight = useRef<number | null>(null);
  // Space between the focus post's box and the reply region (the post's own
  // bottom margin). Measured, so the reply budget stays exact.
  const replyGap = useRef(16);
  // Measured full/compact focus heights (compact learned on first collapse).
  const fullHeight = useRef<number | null>(null);
  const compactHeight = useRef<number | null>(null);
  const [repliesScrollable, setRepliesScrollable] = useState(false);

  const setCompact = useCallback((value: boolean, anchored = false) => {
    if (anchored && value !== compactRef.current) anchorUntil.current = performance.now() + ANCHOR_WINDOW_MS;
    else if (!anchored) anchorUntil.current = 0;
    compactRef.current = value;
    updateCompact(value);
    if (!value && pinFrame.current) cancelAnimationFrame(pinFrame.current);
  }, []);

  const isPinned = useCallback(() => {
    const top = anchor.current?.getBoundingClientRect().top;
    // 1.5px: the region budget is ceil()'d, so the page's maximum scroll can
    // stop a fraction short of the exact pin line.
    return top !== undefined && top <= pinTop + 1.5;
  }, [anchor, pinTop]);

  const syncScrollable = useCallback(() => {
    setRepliesScrollable(compactRef.current || (replies.current?.scrollTop ?? 0) > 0 || isPinned());
  }, [replies, isPinned]);

  /** Size the reply region for the focus post's current height, imperatively
   * (the `--cw-focus-budget` custom property its max-height reads), and, in an
   * anchored window, hold the reply content still. Called from the
   * ResizeObserver and from a layout effect — both before paint — so no frame
   * shows a stale budget (a short region shortens the shell row, which drags
   * the sticky aside up) or moved replies. */
  const measure = useCallback(() => {
    const el = focus?.current;
    const region = replies.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (compactRef.current) compactHeight.current = box.height;
    else fullHeight.current = box.height;
    const grow = lastHeight.current === null ? 0 : box.height - lastHeight.current;
    lastHeight.current = box.height;
    if (!region) return;
    const gap = region.getBoundingClientRect().top - box.bottom;
    if (gap >= 0 && gap <= 64) replyGap.current = gap;
    region.style.setProperty("--cw-focus-budget", `${Math.ceil(box.height + replyGap.current)}px`);
    if (Math.abs(grow) > 0.5 && performance.now() < anchorUntil.current) {
      // The region's top moved by `grow`: scroll its content by the same
      // amount so the replies keep their viewport position. Incremental, so
      // the reader's own scrolling in between is never undone. What the region
      // cannot absorb (too little reply scroll) goes to the page.
      const before = region.scrollTop;
      region.scrollTop = before + grow;
      const residual = grow - (region.scrollTop - before);
      if (Math.abs(residual) > 0.5) window.scrollBy({ top: residual, behavior: "instant" as ScrollBehavior });
    }
  }, [focus, replies]);

  useLayoutEffect(() => {
    const el = focus?.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [focus, measure]);

  // Same layout pass as the compact change, before paint.
  useLayoutEffect(() => {
    measure();
    syncScrollable();
  }, [compact, measure, syncScrollable]);

  const expandOnUpwardInput = useCallback(() => {
    if (compactRef.current && direction.current < 0 && (replies.current?.scrollTop ?? 0) <= 1
      && (inputInReplies.current || (anchor.current?.getBoundingClientRect().top ?? 0) >= 64)) {
      setCompact(false, true);
    }
  }, [anchor, replies, setCompact]);

  /** Collapse once the reader has moved `giveBack + COLLAPSE_MARGIN` into the
   * replies — reply scroll plus any page scroll past the pin line. Anchored,
   * so the replies stay put; the threshold guarantees that the height given
   * back is absorbed by that progress (reply scroll first, then the page's
   * overshoot, which keeps the focus stuck), and that the resulting position
   * sits inside the hysteresis band (expansion needs upward input at the top
   * of the replies). Programmatic reply positions collapse at the old 40px. */
  const maybeCollapse = useCallback((fromReplies: boolean) => {
    if (compactRef.current || direction.current < 0) return false;
    const scrollTop = replies.current?.scrollTop ?? 0;
    const anchorTop = anchor.current?.getBoundingClientRect().top;
    const overshoot = anchorTop === undefined ? 0 : Math.max(0, pinTop - anchorTop);
    const progress = scrollTop + overshoot;
    if (progress <= COLLAPSE_MARGIN) return false;
    const userDriven = performance.now() - lastReplyInput.current < USER_INPUT_WINDOW_MS;
    const full = fullHeight.current ?? focus?.current?.getBoundingClientRect().height ?? 0;
    const giveBack = Math.max(0, full - (compactHeight.current ?? COMPACT_HEIGHT_GUESS));
    const programmatic = fromReplies && !userDriven;
    if (!programmatic && progress < giveBack + COLLAPSE_MARGIN) return false;
    // A restored/scripted position is the exact place to show: anchoring it
    // would subtract the height the focus gives back from that position.
    setCompact(true, !programmatic);
    return true;
  }, [anchor, replies, focus, pinTop, setCompact]);

  useEffect(() => {
    let touchY: number | null = null;
    const noteInput = (target: EventTarget | null) => {
      inputInReplies.current = target instanceof Node && !!replies.current?.contains(target);
      if (inputInReplies.current) lastReplyInput.current = performance.now();
    };
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      noteInput(event.target);
      direction.current = Math.sign(event.deltaY);
      expandOnUpwardInput();
    };
    const touchStart = (event: TouchEvent) => {
      noteInput(event.target);
      touchY = event.touches[0]?.clientY ?? null;
    };
    const touchMove = (event: TouchEvent) => {
      noteInput(event.target);
      const next = event.touches[0]?.clientY;
      if (touchY !== null && next !== undefined && next !== touchY) {
        direction.current = Math.sign(touchY - next);
        expandOnUpwardInput();
      }
      touchY = next ?? null;
    };
    const key = (event: KeyboardEvent) => noteInput(event.target);
    const scroll = () => {
      // Scrolling the page past the pin line (wheel over the focus post, or
      // the arrival runway) reads the replies too: same collapse rule.
      maybeCollapse(false);
      expandOnUpwardInput();
      syncScrollable();
    };
    document.addEventListener("wheel", wheel, { passive: true, capture: true });
    document.addEventListener("touchstart", touchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", touchMove, { passive: true, capture: true });
    document.addEventListener("keydown", key, { passive: true, capture: true });
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", syncScrollable, { passive: true });
    return () => {
      document.removeEventListener("wheel", wheel, true);
      document.removeEventListener("touchstart", touchStart, true);
      document.removeEventListener("touchmove", touchMove, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", syncScrollable);
      cancelAnimationFrame(pinFrame.current);
    };
  }, [anchor, replies, expandOnUpwardInput, maybeCollapse, syncScrollable]);

  // Scroll the page just far enough that the focus post sticks at `pinTop`.
  // Floored so the anchor lands at or just BELOW the line: landing a fraction
  // above it would read as "scrolled past" and collapse via the window
  // scroll handler.
  const pinFocus = useCallback(() => {
    const top = anchor.current?.getBoundingClientRect().top;
    if (top === undefined || top <= pinTop + 0.5) return;
    window.scrollBy({ top: Math.floor(top - pinTop), behavior: "instant" });
  }, [anchor, pinTop]);

  const onReplyScroll = useCallback(() => {
    const region = replies.current;
    const scrollTop = region?.scrollTop ?? 0;
    syncScrollable();
    if (region && maybeCollapse(true)) {
      // A programmatic/restored reply position can arrive before the page is
      // pinned (the reader never scrolled the page): pin once, after the
      // compact layout has committed. Smooth scrolling would keep generating
      // competing scroll events during the resize.
      if (!isPinned()) pinFrame.current = requestAnimationFrame(pinFocus);
    } else if (region && scrollTop > 0
      && scrollTop + region.clientHeight >= region.scrollHeight - 1) {
      // The replies reached their end without the page being pinned — a
      // short thread that never scrolls 40px, or a restored scroll position.
      // The region is sized for the stuck focus post, and the wheel is
      // contained inside it, so without this the last replies stay below the
      // viewport with no way to scroll them into view.
      pinFocus();
    }
    expandOnUpwardInput();
  }, [replies, expandOnUpwardInput, maybeCollapse, pinFocus, isPinned, syncScrollable]);

  /** Hold a reply still after the list above it changed (a filter or group
   * from a click inside the replies): scroll the region by `delta`. The scroll
   * counts as the reader's own, so it collapses the focus only past the
   * hysteresis threshold, and then anchored. Treated as programmatic, a mere
   * 40px of compensation collapsed the focus unanchored and moved the clicked
   * reply by the height the focus gave back. */
  const holdReplies = useCallback((delta: number) => {
    const region = replies.current;
    if (!region || Math.abs(delta) <= 0.5) return;
    lastReplyInput.current = performance.now();
    direction.current = Math.sign(delta);
    region.scrollTop += delta;
  }, [replies]);

  return { compact, setCompact, onReplyScroll, pinFocus, repliesScrollable, holdReplies };
}
