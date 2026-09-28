"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Layout-driven scroll events must never undo a collapse. Only upward user
 * input at the start of the comments (or an explicit expansion) may do that. */
export function useCompactFocus(
  anchor: RefObject<HTMLDivElement>,
  replies: RefObject<HTMLDivElement>,
  /** Viewport top of the focus post once it is stuck (its `position: sticky`
   *  top). The reply region is sized for that stuck layout, so the page must
   *  reach it for the last reply to be reachable. */
  pinTop = 64,
) {
  const [compact, updateCompact] = useState(false);
  const compactRef = useRef(false);
  const direction = useRef(0);
  const inputInReplies = useRef(false);
  const pinFrame = useRef(0);
  const setCompact = useCallback((value: boolean) => {
    compactRef.current = value;
    updateCompact(value);
    if (!value && pinFrame.current) cancelAnimationFrame(pinFrame.current);
  }, []);

  const expandOnUpwardInput = useCallback(() => {
    if (direction.current < 0 && (replies.current?.scrollTop ?? 0) <= 1
      && (inputInReplies.current || (anchor.current?.getBoundingClientRect().top ?? 0) >= 64)) {
      setCompact(false);
    }
  }, [anchor, replies, setCompact]);

  useEffect(() => {
    let touchY: number | null = null;
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      inputInReplies.current = event.target instanceof Node && !!replies.current?.contains(event.target);
      direction.current = Math.sign(event.deltaY);
      expandOnUpwardInput();
    };
    const touchStart = (event: TouchEvent) => {
      inputInReplies.current = event.target instanceof Node && !!replies.current?.contains(event.target);
      touchY = event.touches[0]?.clientY ?? null;
    };
    const touchMove = (event: TouchEvent) => {
      const next = event.touches[0]?.clientY;
      if (touchY !== null && next !== undefined && next !== touchY) {
        direction.current = Math.sign(touchY - next);
        expandOnUpwardInput();
      }
      touchY = next ?? null;
    };
    const scroll = () => {
      if (direction.current >= 0 && (anchor.current?.getBoundingClientRect().top ?? 100) < 64) setCompact(true);
      expandOnUpwardInput();
    };
    document.addEventListener("wheel", wheel, { passive: true, capture: true });
    document.addEventListener("touchstart", touchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", touchMove, { passive: true, capture: true });
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      document.removeEventListener("wheel", wheel, true);
      document.removeEventListener("touchstart", touchStart, true);
      document.removeEventListener("touchmove", touchMove, true);
      window.removeEventListener("scroll", scroll);
      cancelAnimationFrame(pinFrame.current);
    };
  }, [anchor, replies, expandOnUpwardInput, setCompact]);

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
    if ((region?.scrollTop ?? 0) > 40 && !compactRef.current) {
      setCompact(true);
      // Pin once, after the compact layout has committed. Smooth scrolling
      // would keep generating competing scroll events during the resize.
      pinFrame.current = requestAnimationFrame(pinFocus);
    } else if (region && region.scrollTop > 0
      && region.scrollTop + region.clientHeight >= region.scrollHeight - 1) {
      // The replies reached their end without the page being pinned — a
      // short thread that never scrolls 40px, or a restored scroll position.
      // The region is sized for the stuck focus post, and the wheel is
      // contained inside it, so without this the last replies stay below the
      // viewport with no way to scroll them into view.
      pinFocus();
    }
    expandOnUpwardInput();
  }, [replies, expandOnUpwardInput, setCompact, pinFocus]);

  return { compact, setCompact, onReplyScroll, pinFocus };
}
