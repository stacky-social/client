"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** A reply position set by script or restoration (the region is not user-
 * scrollable while the focus is full) shows the compact focus past this. */
const PROGRAMMATIC_COMPACT_AT = 40;
/** Scroll events this soon after wheel/touch/key input are the reader's own;
 * anything later (restoration, script, layout) never changes the state. */
const USER_INPUT_WINDOW_MS = 600;
/** Duration of the focus wrapper's height change between full and compact. */
const RESIZE_MS = 200;
/** Clips the expanding post at the wrapper's animated bottom edge (so it never
 * paints over the replies) while leaving room for its shadow on the sides. */
const RESIZE_CLIP = "inset(-48px -48px 0 -48px)";
const LINE_PX = 40;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement
  && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** True if an element between `target` and `stop` would itself scroll by `px`
 * (a scrollable menu or panel keeps its own wheel). */
function innerScrollerTakes(target: EventTarget | null, stop: Element | null, px: number) {
  let el = target instanceof Element ? target : null;
  while (el && el !== stop && el !== document.body && el !== document.documentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
      if (px > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** The focus post on a post page has exactly two states (#259):
 *
 *  - FULL: the post is full size and flows with the page up to its sticky pin
 *    line. The reply region is not user-scrollable (`overflow-y: hidden`), so
 *    input scrolls the page and the replies move exactly with it.
 *  - COMPACT: the post is compact AND stuck at its pin line; the reply region
 *    scrolls. Compact ⇔ pinned.
 *
 * Down: downward input that would carry the page past the pin line collapses
 * the post and pins it in one transition (the input is consumed by it). Up:
 * upward input with the replies at their top expands the post in one
 * transition; the page then scrolls up natively, detaching it. Only input
 * direction changes the state — never a scroll event on its own — so layout
 * cannot flip it. In COMPACT, wheel/keys outside the replies scroll the
 * replies, so the page never moves the compact post off its pin line.
 *
 * The size change animates the wrapper's height (FLIP, ~200ms; instant under
 * prefers-reduced-motion), and the reply region's budget (`--cw-focus-budget`,
 * read by its max-height) follows the animated height every frame before
 * paint. The region's bottom therefore never moves: the replies slide with the
 * post's edge, and the document height, the page scroll and the sticky aside
 * stay put. This replaces the anchored collapse (scroll compensation plus a
 * residual page scroll), whose residual could scroll the page back to 0 and
 * leave the compact post unpinned.
 */
export function useCompactFocus(
  anchor: RefObject<HTMLDivElement>,
  replies: RefObject<HTMLDivElement>,
  /** Viewport top of the focus post once it is stuck (its `position: sticky`
   *  top). The reply region is sized for that stuck layout. */
  pinTop = 64,
  /** The sticky focus wrapper: measured to size the reply region, and the
   *  element whose height animates. */
  focus?: RefObject<HTMLElement | null>,
) {
  const [compact, updateCompact] = useState(false);
  const compactRef = useRef(false);
  const lastInput = useRef({ at: -Infinity, dir: 0 });
  // The running size change. From just before a compact change commits until
  // the change ends, the wrapper is locked to an inline height (and the gap
  // below it to an inline margin, since a fixed height stops the post's bottom
  // margin collapsing through), and each frame sets that height and the reply
  // budget together — one consistent layout, so the document never shortens
  // and the browser never clamps the page scroll.
  const resize = useRef<{ from: number; start: number; duration: number; frame: number; committed: boolean } | null>(null);
  // Reply scroll set by holdReplies() while the post is full (not a restored
  // position, so it must not collapse the post).
  const held = useRef(0);
  // Space between the focus post's box and the reply region (the post's own
  // bottom margin). Measured, so the reply budget stays exact.
  const replyGap = useRef(16);

  const setBudget = useCallback((height: number) => {
    replies.current?.style.setProperty("--cw-focus-budget", `${Math.ceil(height + replyGap.current)}px`);
  }, [replies]);

  const lockHeight = useCallback((el: HTMLElement, height: number) => {
    el.style.height = `${height}px`;
    el.style.marginBottom = `${replyGap.current}px`;
    el.style.clipPath = RESIZE_CLIP;
    setBudget(height);
  }, [setBudget]);

  /** Size the reply region for the focus post's height. Runs from a
   * ResizeObserver and a layout effect — both before paint — so no frame
   * shows a stale budget (a short region shortens the shell row, which drags
   * the sticky aside up). A running size change sets the budget itself. */
  const measure = useCallback(() => {
    const el = focus?.current;
    const region = replies.current;
    if (!el || !region || resize.current) return;
    const box = el.getBoundingClientRect();
    const gap = region.getBoundingClientRect().top - box.bottom;
    if (gap >= 0 && gap <= 64) replyGap.current = gap;
    setBudget(box.height);
  }, [focus, replies, setBudget]);

  const release = useCallback((el: HTMLElement) => {
    resize.current = null;
    el.style.height = "";
    el.style.marginBottom = "";
    el.style.clipPath = "";
    measure();
  }, [measure]);

  const setCompact = useCallback((value: boolean, animate = false) => {
    if (value === compactRef.current) return;
    const el = focus?.current;
    if (el) {
      measure();
      const running = resize.current;
      if (running) cancelAnimationFrame(running.frame);
      const from = el.getBoundingClientRect().height;
      const run = {
        from, start: 0, frame: 0, committed: false,
        duration: animate && !prefersReducedMotion() ? RESIZE_MS : 0,
      };
      resize.current = run;
      lockHeight(el, from);
      // A change undone before it commits never runs the effect below.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (resize.current === run && !run.committed) release(el);
      }));
    }
    held.current = 0;
    compactRef.current = value;
    updateCompact(value);
  }, [focus, measure, lockHeight, release]);

  const anchorTop = useCallback(() => anchor.current?.getBoundingClientRect().top, [anchor]);

  // Scroll the page just far enough that the focus post sticks at `pinTop`.
  // Floored so the anchor lands at or just below the line.
  const pinFocus = useCallback(() => {
    const top = anchorTop();
    if (top === undefined || top <= pinTop + 0.5) return;
    window.scrollBy({ top: Math.floor(top - pinTop), behavior: "instant" as ScrollBehavior });
  }, [anchorTop, pinTop]);

  useLayoutEffect(() => {
    const el = focus?.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (resize.current) cancelAnimationFrame(resize.current.frame);
    };
  }, [focus, measure]);

  // The compact change has committed (before paint): run the size change
  // from the locked height toward the post's natural height, re-measured
  // every frame (the compact post settles over a couple of passes).
  useLayoutEffect(() => {
    const el = focus?.current;
    const run = resize.current;
    if (!el || !run || run.committed) { measure(); return; }
    run.committed = true;
    run.start = performance.now();
    // The wrapper's natural height: its children's extent (their outer
    // margins collapse through it when its height is auto).
    const natural = () => {
      const first = el.firstElementChild;
      const last = el.lastElementChild;
      if (!first || !last) return run.from;
      return last.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
    };
    const step = () => {
      if (resize.current !== run) return;
      const to = natural();
      const t = run.duration ? Math.min(1, (performance.now() - run.start) / run.duration) : 1;
      if (t >= 1 || Math.abs(to - run.from) <= 1) {
        release(el);
        return;
      }
      // Whole pixels: with the ceil()ed budget, a fractional height would
      // change the shell row by a fraction and nudge the sticky aside.
      lockHeight(el, Math.round(run.from + (to - run.from) * (1 - (1 - t) ** 3)));
      run.frame = requestAnimationFrame(step);
    };
    step();
  }, [compact, focus, measure, lockHeight, release]);

  /** Collapsing needs replies hidden below the full layout and a page that
   * can reach the pin line (or the compact post could not be pinned). */
  const canCollapse = useCallback(() => {
    const region = replies.current;
    const top = anchorTop();
    if (!region || top === undefined) return false;
    if (region.scrollHeight <= region.clientHeight + 1) return false;
    const root = document.scrollingElement ?? document.documentElement;
    const maxScroll = root.scrollHeight - window.innerHeight;
    return window.scrollY + Math.floor(top - pinTop) <= maxScroll + 1.5;
  }, [replies, anchorTop, pinTop]);

  /** Downward input of `px` in FULL: collapse + pin once it would carry the
   * page past the pin line. Returns true when the input was consumed. */
  const downInput = useCallback((px: number) => {
    if (compactRef.current) return false;
    const top = anchorTop();
    if (top === undefined || top - px > pinTop + 0.5 || !canCollapse()) return false;
    setCompact(true, true);
    pinFocus();
    return true;
  }, [anchorTop, pinTop, canCollapse, setCompact, pinFocus]);

  /** Upward input in COMPACT with the replies at their top: expand. */
  const upInput = useCallback(() => {
    const region = replies.current;
    if (!compactRef.current || !region || region.scrollTop > 1) return false;
    region.scrollTop = 0;
    setCompact(false, true);
    return true;
  }, [replies, setCompact]);

  /** Upward input in FULL while holdReplies() left the replies scrolled:
   * scroll them back to their top first. */
  const unhold = useCallback((px: number) => {
    const region = replies.current;
    if (compactRef.current || !region || region.scrollTop <= 0) return false;
    region.scrollTop = Math.max(0, region.scrollTop + px);
    held.current = region.scrollTop;
    return true;
  }, [replies]);

  useEffect(() => {
    let touchY: number | null = null;
    const note = (dir: number) => { lastInput.current = { at: performance.now(), dir }; };
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY || event.ctrlKey) return;
      const px = event.deltaY * (event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? window.innerHeight : 1);
      note(Math.sign(px));
      const region = replies.current;
      if (!region) return;
      if (!compactRef.current) {
        if (px < 0 && unhold(px)) event.preventDefault();
        else if (px > 0 && downInput(px)) event.preventDefault();
        return;
      }
      if (px < 0 && upInput()) { event.preventDefault(); return; }
      // Inside the replies the region scrolls natively (overscroll contained).
      if (event.target instanceof Node && region.contains(event.target)) return;
      if (innerScrollerTakes(event.target, region, px)) return;
      // Over the compact post, the margins or the aside: scroll the replies,
      // so the page never moves the compact post off its pin line.
      event.preventDefault();
      region.scrollTop += px;
    };
    const touchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? null; };
    const touchMove = (event: TouchEvent) => {
      const next = event.touches[0]?.clientY;
      if (touchY !== null && next !== undefined && next !== touchY) {
        const px = touchY - next;
        note(Math.sign(px));
        if (px > 0) downInput(px);
        else upInput();
      }
      touchY = next ?? null;
    };
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditable(event.target)) return;
      const region = replies.current;
      if (!region) return;
      const pageStep = Math.max(LINE_PX, region.clientHeight * 0.875);
      let px = 0;
      switch (event.key) {
        case "ArrowDown": px = LINE_PX; break;
        case "ArrowUp": px = -LINE_PX; break;
        case "PageDown": px = pageStep; break;
        case "PageUp": px = -pageStep; break;
        case "End": px = Infinity; break;
        case "Home": px = -Infinity; break;
        case " ":
          // Space activates a focused control instead of scrolling.
          if (event.target instanceof Element && event.target.closest("button, a, summary, [role='button']")) return;
          px = event.shiftKey ? -pageStep : pageStep;
          break;
        default: return;
      }
      note(Math.sign(px));
      if (!compactRef.current) {
        if (px < 0 && unhold(Number.isFinite(px) ? px : -region.scrollTop)) event.preventDefault();
        else if (px > 0 && downInput(Number.isFinite(px) ? px : window.innerHeight)) event.preventDefault();
        return;
      }
      if (px < 0 && upInput()) { event.preventDefault(); return; }
      if (!region.contains(event.target as Node) && innerScrollerTakes(event.target, region, px)) return;
      event.preventDefault();
      const target = px === Infinity ? region.scrollHeight : px === -Infinity ? 0 : region.scrollTop + px;
      region.scrollTo({ top: target, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    };
    const scroll = () => {
      if (performance.now() - lastInput.current.at > USER_INPUT_WINDOW_MS) return;
      const top = anchorTop();
      const region = replies.current;
      if (top === undefined || !region) return;
      const { dir } = lastInput.current;
      if (!compactRef.current) {
        // Page carried past the pin line (e.g. a scrollbar-free overscroll).
        if (dir > 0 && top < pinTop - 1.5 && canCollapse()) setCompact(true, true);
        return;
      }
      // Touch or the page scrollbar moved a compact post off its pin line:
      // hand that scroll to the replies, and expand once they are at the top.
      const gap = top - pinTop;
      if (dir >= 0 || gap <= 1.5) return;
      const move = Math.min(gap, region.scrollTop);
      if (move > 0.5) {
        region.scrollTop -= move;
        window.scrollBy({ top: move, behavior: "instant" as ScrollBehavior });
      }
      if (gap - move > 1.5) setCompact(false, true);
    };
    document.addEventListener("wheel", wheel, { passive: false, capture: true });
    document.addEventListener("touchstart", touchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", touchMove, { passive: true, capture: true });
    document.addEventListener("keydown", key, { capture: true });
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      document.removeEventListener("wheel", wheel, true);
      document.removeEventListener("touchstart", touchStart, true);
      document.removeEventListener("touchmove", touchMove, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scroll);
    };
  }, [replies, anchorTop, pinTop, canCollapse, downInput, upInput, unhold, setCompact]);

  /** The region is not user-scrollable while the post is full, so a reply
   * scroll then is a restored or scripted position: show it compact, pinned. */
  const onReplyScroll = useCallback(() => {
    const region = replies.current;
    if (!region || compactRef.current || region.scrollTop <= Math.max(PROGRAMMATIC_COMPACT_AT, held.current + 0.5)) return;
    setCompact(true);
    pinFocus();
  }, [replies, setCompact, pinFocus]);

  /** Hold a reply still after the list above it changed by `delta` (a filter
   * or group from a click inside the replies). Compact: the region scrolls.
   * Full: the page scrolls, up to the pin line, and the region holds the rest
   * with the post still full — collapsing would move the clicked reply by the
   * height the post gives back. That one state (full, pinned, replies held a
   * little scrolled) resolves on the next input: down collapses, up first
   * scrolls the held replies back. */
  const holdReplies = useCallback((delta: number) => {
    const region = replies.current;
    if (!region || Math.abs(delta) <= 0.5) return;
    if (compactRef.current) {
      region.scrollTop += delta;
      return;
    }
    let rest = delta;
    if (rest < 0 && region.scrollTop > 0) {
      const before = region.scrollTop;
      region.scrollTop = Math.max(0, before + rest);
      rest -= region.scrollTop - before;
    }
    const top = anchorTop() ?? pinTop;
    const page = rest > 0 ? Math.min(rest, Math.max(0, Math.floor(top - pinTop))) : rest;
    if (Math.abs(page) > 0.5) window.scrollBy({ top: page, behavior: "instant" as ScrollBehavior });
    rest -= page;
    if (rest > 0.5) region.scrollTop += rest;
    held.current = region.scrollTop;
  }, [replies, anchorTop, pinTop]);

  return { compact, setCompact, onReplyScroll, pinFocus, repliesScrollable: compact, holdReplies };
}
