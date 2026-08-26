import type { ListyInjectionEntry } from "../types/PostType";
import type { DemoTopicId } from "../data/demoCorpora";

export type TimelineStats = {
  posts: number;
  participants: number;
  responses: number;
};

export type TimelinePage = {
  items: ListyInjectionEntry[];
  nextCursor: string | null;
  hasMore: boolean;
  stats: TimelineStats;
  meta: { simulated: boolean; topicId: DemoTopicId; delayMs: number; generatedAt: string };
};

type CacheEntry = { value: TimelinePage; expiresAt: number };

const PAGE_SIZE = 2;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 20;
const pageCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<TimelinePage>>();

function apiBaseUrl(): string {
  // A live backend can expose the same typed contract and be selected without
  // changing page components. The bundled demo defaults to the local route.
  return (process.env.NEXT_PUBLIC_STACKY_DATA_API_URL || "/api/demo").replace(/\/$/, "");
}

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of Array.from(pageCache.entries())) {
    if (entry.expiresAt <= now) pageCache.delete(key);
  }
  while (pageCache.size > MAX_CACHE_ENTRIES) {
    const oldest = pageCache.keys().next().value;
    if (oldest === undefined) break;
    pageCache.delete(oldest);
  }
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Request aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Request aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/**
 * Typed, cached frontend boundary for the simulated backend. Requests for the
 * same page share one fetch; callers can still cancel their own subscription.
 */
export function getDemoTimelinePage(
  topicId: DemoTopicId,
  cursor: string | null,
  options: { signal?: AbortSignal } = {},
): Promise<TimelinePage> {
  pruneCache();
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  const url = `${apiBaseUrl()}/timelines/${encodeURIComponent(topicId)}?${params}`;

  const cached = pageCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    pageCache.delete(url);
    pageCache.set(url, cached); // LRU touch
    return abortable(Promise.resolve(cached.value), options.signal);
  }

  let request = inFlight.get(url);
  if (!request) {
    request = fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `Timeline request failed (${response.status})`);
        }
        return response.json() as Promise<TimelinePage>;
      })
      .then((page) => {
        pageCache.set(url, { value: page, expiresAt: Date.now() + CACHE_TTL_MS });
        pruneCache();
        return page;
      })
      .finally(() => inFlight.delete(url));
    inFlight.set(url, request);
  }

  return abortable(request, options.signal);
}

/** Backward-compatible name for the legacy route component. */
export function getChineseEvTimelinePage(
  cursor: string | null,
  options: { signal?: AbortSignal } = {},
): Promise<TimelinePage> {
  return getDemoTimelinePage("chinese-evs", cursor, options);
}

export const DEMO_TIMELINE_PAGE_SIZE = PAGE_SIZE;
