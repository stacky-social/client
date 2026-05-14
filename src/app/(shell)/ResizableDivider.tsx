"use client";

import { CSSProperties, PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from "react";

type Props = {
  onResize: (deltaPx: number) => void;
  onDoubleClick?: () => void;
  style?: CSSProperties;
  ariaLabel?: string;
};

const HIT_WIDTH = 8;
const LINE_WIDTH = 1;
const LINE_HOVER_WIDTH = 3;
const LINE_COLOR = "rgba(0, 0, 0, 0.08)";
const LINE_HOVER_COLOR = "rgba(0, 0, 0, 0.20)";

export function ResizableDivider({ onResize, onDoubleClick, style, ariaLabel }: Props) {
  const lastClientX = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    lastClientX.current = e.clientX;
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (lastClientX.current === null) return;
      const delta = e.clientX - lastClientX.current;
      if (delta !== 0) {
        lastClientX.current = e.clientX;
        onResize(delta);
      }
    },
    [onResize]
  );

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    lastClientX.current = null;
    setDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const lineActive = hovered || dragging;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: HIT_WIDTH,
        marginLeft: -HIT_WIDTH / 2,
        cursor: "col-resize",
        touchAction: "none",
        zIndex: 250,
        display: "flex",
        justifyContent: "center",
        ...style,
      }}
    >
      <div
        style={{
          width: lineActive ? LINE_HOVER_WIDTH : LINE_WIDTH,
          backgroundColor: lineActive ? LINE_HOVER_COLOR : LINE_COLOR,
          transition: "width 120ms ease, background-color 120ms ease",
          height: "100%",
        }}
      />
    </div>
  );
}
