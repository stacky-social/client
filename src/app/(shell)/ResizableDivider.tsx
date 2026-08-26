"use client";

import { CSSProperties, PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from "react";

type Props = {
  onResize: (deltaPx: number) => void;
  onDoubleClick?: () => void;
  style?: CSSProperties;
  ariaLabel?: string;
  quietIdleLine?: boolean;
  valueNow?: number;
  valueMin?: number;
  valueMax?: number;
};

const HIT_WIDTH = 8;
const LINE_WIDTH = 1;
const LINE_HOVER_WIDTH = 3;
const LINE_COLOR = "rgba(0, 0, 0, 0.08)";
const LINE_HOVER_COLOR = "rgba(0, 0, 0, 0.20)";

export function ResizableDivider({
  onResize,
  onDoubleClick,
  style,
  ariaLabel,
  quietIdleLine = false,
  valueNow,
  valueMin,
  valueMax,
}: Props) {
  const lastClientX = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);

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

  const lineActive = hovered || dragging || focused;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuenow={valueNow}
      aria-valuetext={valueNow == null ? undefined : `${valueNow}% feed width`}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (event.key === "Home" && onDoubleClick) {
          event.preventDefault();
          onDoubleClick();
          return;
        }
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        onResize(direction * (event.shiftKey ? 48 : 16));
      }}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: HIT_WIDTH,
        marginLeft: -HIT_WIDTH / 2,
        cursor: "col-resize",
        touchAction: "none",
        // Keep the grab target above pane content, but below the sticky top nav
        // (z-index 200). Otherwise the divider line bleeds through the nav after
        // the document scrolls beneath it.
        zIndex: 10,
        display: "flex",
        justifyContent: "center",
        ...style,
      }}
    >
      <div
        data-testid="resize-divider-guide"
        style={{
          width: lineActive ? LINE_HOVER_WIDTH : LINE_WIDTH,
          backgroundColor: lineActive
            ? LINE_HOVER_COLOR
            : quietIdleLine
            ? "transparent"
            : LINE_COLOR,
          transition: "width 120ms ease, background-color 120ms ease",
          height: "100%",
        }}
      />
    </div>
  );
}
