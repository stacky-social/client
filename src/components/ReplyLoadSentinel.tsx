"use client";

import React, { useEffect, useRef } from "react";

/** Append another batch when the end approaches the reply pane's viewport. */
export default function ReplyLoadSentinel({ visible, total, onLoad }: {
  visible: number;
  total: number;
  onLoad: React.Dispatch<React.SetStateAction<number>>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = ref.current;
    if (!target || visible >= total) return;
    if (typeof IntersectionObserver === "undefined") {
      onLoad(total);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      onLoad((count) => Math.min(count + 5, total));
    }, {
      root: target.closest('[data-testid="reply-scroll-region"]'),
      rootMargin: "0px 0px 250px 0px",
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible, total, onLoad]);
  return visible < total
    ? <div ref={ref} data-testid="reply-load-sentinel" style={{ height: 1 }} aria-hidden="true" />
    : null;
}

