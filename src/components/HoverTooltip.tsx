"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface TooltipColors {
  text: string;
  border: string;
}

interface TooltipState {
  visible: boolean;
  content: React.ReactNode;
  colors: TooltipColors;
  initialX: number;
  initialY: number;
}

const DEFAULT_COLORS: TooltipColors = { text: "#334155", border: "#cbd5e1" };

const initialState: TooltipState = {
  visible: false,
  content: null,
  colors: DEFAULT_COLORS,
  initialX: -9999,
  initialY: -9999,
};

type Listener = (state: TooltipState) => void;

const listeners = new Set<Listener>();
let currentState: TooltipState = initialState;
let mountCount = 0;

function setState(partial: Partial<TooltipState>) {
  currentState = { ...currentState, ...partial };
  listeners.forEach((l) => l(currentState));
}

export function showTooltip(opts: {
  content: React.ReactNode;
  colors: TooltipColors;
  x: number;
  y: number;
}): void {
  setState({
    visible: true,
    content: opts.content,
    colors: opts.colors,
    initialX: opts.x,
    initialY: opts.y,
  });
}

export function hideTooltip(): void {
  setState({ visible: false, content: null });
}

export function HoverTooltip(): JSX.Element | null {
  const [state, setLocalState] = useState<TooltipState>(currentState);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Sync local state with current module state before subscribing
    // to prevent stale state if showTooltip was called during render.
    setLocalState(currentState);

    const listener: Listener = (s) => setLocalState(s);
    listeners.add(listener);

    // Guard against multi-mount in development.
    mountCount += 1;
    if (mountCount > 1 && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[HoverTooltip] More than one instance is mounted; only one is supported.",
      );
    }

    return () => {
      listeners.delete(listener);
      mountCount -= 1;
    };
  }, []);

  // Position on initial show + continuous follow while visible.
  useEffect(() => {
    if (!state.visible) return;

    const position = (clientX: number, clientY: number) => {
      const el = nodeRef.current;
      if (!el) return;
      const tw = el.offsetWidth;
      const th = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const offsetX = 14;
      const offsetY = 18;
      let x = clientX + offsetX;
      let y = clientY + offsetY;
      if (x + tw > vw - 8) x = vw - tw - 8;
      if (x < 8) x = 8;
      if (y + th > vh - 8) y = clientY - offsetY - th;
      if (y < 8) y = 8;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    // Position once with the cursor location captured at show time.
    position(state.initialX, state.initialY);

    const onMove = (e: MouseEvent) => position(e.clientX, e.clientY);
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [state.visible, state.initialX, state.initialY]);

  if (typeof document === "undefined") return null;
  if (!state.visible) return null;

  return createPortal(
    <div
      ref={nodeRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        transform: "translate3d(-9999px, -9999px, 0)",
        pointerEvents: "none",
        zIndex: 10000,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRadius: 8,
        padding: "4px 10px",
        boxShadow:
          "0 4px 14px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.05)",
        border: `1px solid ${state.colors.border}55`,
        fontSize: 11,
        fontWeight: 600,
        color: state.colors.text,
        whiteSpace: "nowrap",
      }}
    >
      {state.content}
    </div>,
    document.body,
  );
}
