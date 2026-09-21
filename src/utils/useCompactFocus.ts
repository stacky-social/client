"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Layout-driven scroll events must never undo a collapse. Only upward user
 * input at the start of the comments (or an explicit expansion) may do that. */
export function useCompactFocus(
  anchor: RefObject<HTMLDivElement>,
  replies: RefObject<HTMLDivElement>,
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

  const onReplyScroll = useCallback(() => {
    if ((replies.current?.scrollTop ?? 0) > 40 && !compactRef.current) {
      setCompact(true);
      // Pin once, after the compact layout has committed. Smooth scrolling
      // would keep generating competing scroll events during the resize.
      pinFrame.current = requestAnimationFrame(() => {
        const top = anchor.current?.getBoundingClientRect().top ?? 72;
        if (top > 72) window.scrollBy({ top: top - 72, behavior: "instant" });
      });
    }
    expandOnUpwardInput();
  }, [anchor, replies, expandOnUpwardInput, setCompact]);

  return { compact, setCompact, onReplyScroll };
}
