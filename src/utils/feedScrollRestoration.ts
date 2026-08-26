const SNAPSHOT_PREFIX = 'crossweave:feed-scroll:v1:';
const LEGACY_PREFIX = 'scrollY:';

const FEED_ANCHOR_ATTRIBUTES = [
  'data-demo-feed-post',
  'data-store-feed-post',
  'data-search-feed-post',
  'data-api-feed-post',
] as const;

type FeedAnchorAttribute = (typeof FEED_ANCHOR_ATTRIBUTES)[number] | 'data-post-id';

interface FeedScrollSnapshot {
  y: number;
  anchorId?: string;
  anchorAttribute?: FeedAnchorAttribute;
  anchorOffset?: number;
}

function currentRoute(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function pathnameOf(route: string): string {
  return route.split('?')[0] || '/';
}

function snapshotKey(route: string): string {
  return `${SNAPSHOT_PREFIX}${route}`;
}

function visibleFeedAnchor(): {
  id: string;
  attribute: FeedAnchorAttribute;
  offset: number;
} | null {
  for (const attribute of FEED_ANCHOR_ATTRIBUTES) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`));
    const visible = elements.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    const id = visible?.getAttribute(attribute);
    if (visible && id) {
      return { id, attribute, offset: visible.getBoundingClientRect().top };
    }
  }

  // Detail threads and profile feeds render the shared Post directly instead
  // of one of the feed wrappers above. Scope the fallback to the main column so
  // a duplicate post in the related-panel does not become the saved anchor.
  const mainPosts = Array.from(document.querySelectorAll<HTMLElement>(
    '[data-testid="feed"] [data-testid="post"][data-post-id]',
  ));
  const visible = mainPosts.find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  });
  const id = visible?.getAttribute('data-post-id');
  if (visible && id) {
    return { id, attribute: 'data-post-id', offset: visible.getBoundingClientRect().top };
  }
  return null;
}

/** Save both an exact semantic feed anchor and the legacy pixel fallback. */
export function saveFeedScrollSnapshot(route?: string): void {
  if (typeof window === 'undefined') return;
  const resolvedRoute = route ?? currentRoute();
  const anchor = visibleFeedAnchor();
  const snapshot: FeedScrollSnapshot = {
    y: window.scrollY,
    ...(anchor ? {
      anchorId: anchor.id,
      anchorAttribute: anchor.attribute,
      anchorOffset: anchor.offset,
    } : {}),
  };
  sessionStorage.setItem(snapshotKey(resolvedRoute), JSON.stringify(snapshot));
  sessionStorage.setItem(`${LEGACY_PREFIX}${pathnameOf(resolvedRoute)}`, String(window.scrollY));
}

function readSnapshot(route: string): { snapshot: FeedScrollSnapshot; key?: string } | null {
  const exactKey = snapshotKey(route);
  const pathnameKey = snapshotKey(pathnameOf(route));
  for (const key of exactKey === pathnameKey ? [exactKey] : [exactKey, pathnameKey]) {
    const raw = sessionStorage.getItem(key);
    if (!raw) continue;
    try {
      const value = JSON.parse(raw) as Partial<FeedScrollSnapshot>;
      if (Number.isFinite(value.y) && Number(value.y) >= 0) {
        return { snapshot: { ...value, y: Number(value.y) }, key };
      }
    } catch {
      sessionStorage.removeItem(key);
    }
  }

  const legacy = sessionStorage.getItem(`${LEGACY_PREFIX}${pathnameOf(route)}`);
  const y = legacy === null ? NaN : Number.parseInt(legacy, 10);
  return Number.isFinite(y) && y >= 0 ? { snapshot: { y } } : null;
}

function anchorElement(snapshot: FeedScrollSnapshot): HTMLElement | null {
  if (!snapshot.anchorId || !snapshot.anchorAttribute) return null;
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(snapshot.anchorId)
    : snapshot.anchorId.replace(/["\\]/g, '\\$&');
  const selector = `[${snapshot.anchorAttribute}="${escaped}"]`;
  return snapshot.anchorAttribute === 'data-post-id'
    ? document.querySelector<HTMLElement>(`[data-testid="feed"] [data-testid="post"]${selector}`)
    : document.querySelector<HTMLElement>(selector);
}

/**
 * Restore after feed data is ready. Pixel position gets virtualized lists close;
 * the semantic anchor then corrects layout drift caused by changed card heights.
 */
export function restoreFeedScrollSnapshot(
  route?: string,
  {
    maxFrames = 90,
    onSettled,
  }: { maxFrames?: number; onSettled?: () => void } = {},
): () => void {
  if (typeof window === 'undefined') return () => {};
  const resolvedRoute = route ?? currentRoute();
  const stored = readSnapshot(resolvedRoute);
  if (!stored) return () => {};

  const { snapshot, key } = stored;
  const legacyKey = `${LEGACY_PREFIX}${pathnameOf(resolvedRoute)}`;
  let cancelled = false;
  let frame = 0;
  let stableFrames = 0;
  let raf = 0;

  const finish = () => {
    if (key) sessionStorage.removeItem(key);
    sessionStorage.removeItem(legacyKey);
    onSettled?.();
  };

  window.scrollTo({ top: snapshot.y, behavior: 'instant' });

  const settle = () => {
    if (cancelled) return;
    frame += 1;
    const anchor = anchorElement(snapshot);
    if (anchor && Number.isFinite(snapshot.anchorOffset)) {
      const drift = anchor.getBoundingClientRect().top - Number(snapshot.anchorOffset);
      if (Math.abs(drift) > 1) {
        stableFrames = 0;
        window.scrollBy({ top: drift, behavior: 'instant' });
      } else {
        stableFrames += 1;
      }
      if (stableFrames >= 2) {
        finish();
        return;
      }
    } else if (!snapshot.anchorId) {
      stableFrames += 1;
      if (stableFrames >= 2) {
        finish();
        return;
      }
    } else if (frame % 12 === 0) {
      // Prompt a virtualized feed to mount the saved neighborhood again while
      // waiting for its semantic anchor to appear.
      window.scrollTo({ top: snapshot.y, behavior: 'instant' });
    }

    if (frame >= maxFrames) {
      window.scrollTo({ top: snapshot.y, behavior: 'instant' });
      finish();
      return;
    }
    raf = requestAnimationFrame(settle);
  };

  raf = requestAnimationFrame(settle);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}
