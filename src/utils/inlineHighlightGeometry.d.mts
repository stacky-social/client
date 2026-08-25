export type InlineClientRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
};

export function pointBridgesInlineRects(
  rects: ArrayLike<InlineClientRect> | Iterable<InlineClientRect>,
  clientX: number,
  clientY: number,
  tolerance?: number,
): boolean;
