"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Feed/related split as a single ratio (feed's share of the content group's
 * width), persisted across sessions. Replaces the old absolute-px
 * centerWidth/relatedWidth model (`stacky:centerWidth` / `stacky:relatedWidth`).
 *
 * Stored under `stacky:feedRatio`. Default 0.65 (65% feed / 35% related).
 * Clamped to [MIN, MAX] so neither panel can vanish.
 */
export const FEED_RATIO_DEFAULT = 0.65;
export const FEED_RATIO_MIN = 0.15;
export const FEED_RATIO_MAX = 0.85;
const LS_KEY = "stacky:feedRatio";

function clamp(n: number): number {
  return Math.min(FEED_RATIO_MAX, Math.max(FEED_RATIO_MIN, n));
}

export type UseFeedRatio = {
  ratio: number;
  /** Set the ratio (absolute value or updater fn); clamps and persists. */
  setRatio: (next: number | ((prev: number) => number)) => void;
  /** Reset to the 65/35 default and persist. */
  reset: () => void;
};

export function useFeedRatio(): UseFeedRatio {
  // SSR and the first client render both start at the default, so hydration
  // matches; the stored value is applied in an effect after mount.
  const [ratio, setRatioState] = useState<number>(FEED_RATIO_DEFAULT);
  const ratioRef = useRef(ratio);
  ratioRef.current = ratio;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw === null) return;
    const n = Number(raw);
    if (Number.isFinite(n)) setRatioState(clamp(n));
  }, []);

  const setRatio = useCallback((next: number | ((prev: number) => number)) => {
    const resolved = typeof next === "function" ? next(ratioRef.current) : next;
    const v = clamp(resolved);
    ratioRef.current = v;
    setRatioState(v);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, String(v));
  }, []);

  const reset = useCallback(() => {
    ratioRef.current = FEED_RATIO_DEFAULT;
    setRatioState(FEED_RATIO_DEFAULT);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, String(FEED_RATIO_DEFAULT));
  }, []);

  return { ratio, setRatio, reset };
}
