"use client";

import { useCallback, useEffect, useState } from "react";

export const CENTER_MIN = 500;
export const CENTER_MAX = 1100;
export const RELATED_MIN = 320;
export const RELATED_MAX = 700;
export const DEFAULT_RELATED = 460;

const LS_CENTER = "stacky:centerWidth";
const LS_RELATED = "stacky:relatedWidth";

function readNumber(key: string): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export type ColumnWidths = {
  centerWidth: number | undefined;
  relatedWidth: number | undefined;
};

export type UseResizableColumns = {
  widths: ColumnWidths;
  setCenterWidth: (w: number | undefined, viewportMax?: number) => void;
  setRelatedWidth: (w: number | undefined) => void;
};

export function useResizableColumns(): UseResizableColumns {
  const [centerWidth, setCenterRaw] = useState<number | undefined>(undefined);
  const [relatedWidth, setRelatedRaw] = useState<number | undefined>(undefined);

  useEffect(() => {
    const c = readNumber(LS_CENTER);
    const r = readNumber(LS_RELATED);
    if (c !== undefined) setCenterRaw(clamp(c, CENTER_MIN, CENTER_MAX));
    if (r !== undefined) setRelatedRaw(clamp(r, RELATED_MIN, RELATED_MAX));
  }, []);

  const setCenterWidth = useCallback((w: number | undefined, viewportMax?: number) => {
    if (w === undefined) {
      setCenterRaw(undefined);
      if (typeof window !== "undefined") window.localStorage.removeItem(LS_CENTER);
      return;
    }
    const hardMax = viewportMax !== undefined ? Math.min(CENTER_MAX, viewportMax) : CENTER_MAX;
    const clamped = clamp(w, CENTER_MIN, hardMax);
    setCenterRaw(clamped);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_CENTER, String(clamped));
  }, []);

  const setRelatedWidth = useCallback((w: number | undefined) => {
    if (w === undefined) {
      setRelatedRaw(undefined);
      if (typeof window !== "undefined") window.localStorage.removeItem(LS_RELATED);
      return;
    }
    const clamped = clamp(w, RELATED_MIN, RELATED_MAX);
    setRelatedRaw(clamped);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_RELATED, String(clamped));
  }, []);

  return {
    widths: { centerWidth, relatedWidth },
    setCenterWidth,
    setRelatedWidth,
  };
}
