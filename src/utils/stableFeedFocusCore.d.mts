// Type surface for stableFeedFocusCore.mjs (plain JS so node:test can import it).

export type FeedFocusRect = {
  top: number;
  bottom: number;
  height: number;
};

export type FeedFocusCandidate<T> = {
  id: string;
  value: T;
  rect: FeedFocusRect;
};

export type FeedFocusMode = "center" | "top-line";

/** An explicit click's hold on focus: the post and its closest gap so far. */
export type FeedFocusPin = {
  id: string;
  best: number;
};

export type FeedFocusGeometry = {
  viewportTop?: number;
  viewportHeight: number;
  mode: FeedFocusMode;
  anchorRatio?: number;
};

export type StableFeedFocusOptions<T> = FeedFocusGeometry & {
  candidates: Array<FeedFocusCandidate<T>>;
  currentId: string | null;
  atTop?: boolean;
  atBottom?: boolean;
};

export function feedFocusHysteresisPx(viewportHeight: number): number;
export function feedFocusReadingLine(geometry: FeedFocusGeometry): number;
export function feedFocusGap(rect: FeedFocusRect, line: number): number;
export function selectStableFeedFocus<T>(
  options: StableFeedFocusOptions<T>,
): FeedFocusCandidate<T> | null;
export function createFeedFocusPin(
  options: FeedFocusGeometry & { id: string; rect: FeedFocusRect },
): FeedFocusPin;
export function selectPinnedFeedFocus<T>(
  options: StableFeedFocusOptions<T> & { pin: FeedFocusPin | null },
): { selected: FeedFocusCandidate<T> | null; pin: FeedFocusPin | null };
