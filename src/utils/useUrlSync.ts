"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  setFilterCategories,
  setFilterFocusSpan,
  useHighlightStore,
} from "./highlightStore";

export interface UrlSyncOptions {
  /** Current active tab value */
  activeTab: string;
  setActiveTab: (tab: string) => void;
  /**
   * Plain-text content of the focus post — needed to reconstruct the `text`
   * field of filterFocusSpan from the ?fs= offset param on hydration.
   * Pass null until the post content is loaded.
   */
  plainPostText: string | null;
  /**
   * Called once on initial mount when the URL contains a ?tab= param.
   * Use this to trigger the tab's data fetch (e.g., fetchRecommended).
   */
  onHydratedTab?: (tab: string) => void;
}

const VALID_TABS = ["time", "recommended", "stacked", "summary"] as const;
type ValidTab = (typeof VALID_TABS)[number];

function isValidTab(v: string): v is ValidTab {
  return VALID_TABS.includes(v as ValidTab);
}

/**
 * Synchronizes URL search params with local/store state for the post-detail route.
 *
 * Read direction (hydration):
 *   ?tab    → setActiveTab()
 *   ?fc     → setFilterCategories()
 *   ?fs     → setFilterFocusSpan() (deferred until plainPostText is available)
 *
 * Write direction (debounced):
 *   activeTab + filterCategories + filterFocusSpan → router.replace(pathname + ?params)
 *
 * ?stackId and ?from are preserved (pass-through) and not modified here.
 */
export function useUrlSync({
  activeTab,
  setActiveTab,
  plainPostText,
  onHydratedTab,
}: UrlSyncOptions): void {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { filterCategories, filterFocusSpan } = useHighlightStore();

  // Tracks whether we have completed the initial hydration for the current pathname.
  // Reset when the pathname changes (i.e., user navigated to a different post).
  const hydratedRef = useRef(false);
  // Tracks whether we triggered onHydratedTab for the current mount.
  const hydratedTabCalledRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset hydration gate when the route changes.
  useEffect(() => {
    hydratedRef.current = false;
    hydratedTabCalledRef.current = false;
  }, [pathname]);

  // ── HYDRATION: tab + filter categories ───────────────────────────────────
  // Runs once per pathname (i.e., once per post ID). Reads URL params and
  // initializes local state + highlightStore.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    // tab
    const tabParam = searchParams.get("tab");
    if (tabParam && isValidTab(tabParam)) {
      setActiveTab(tabParam);
      if (!hydratedTabCalledRef.current) {
        hydratedTabCalledRef.current = true;
        onHydratedTab?.(tabParam);
      }
    }

    // fc (filter categories — CSV)
    const fcParam = searchParams.get("fc");
    if (fcParam) {
      const cats = new Set(fcParam.split(",").map((c) => c.trim()).filter(Boolean));
      if (cats.size > 0) {
        setFilterCategories(cats);
      }
    } else {
      // Navigating to a URL with no ?fc — clear any stale store state
      setFilterCategories(new Set());
    }

    // fs (filter focus span) — text reconstruction deferred to the effect below
  }, [pathname, searchParams]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── SPAN HYDRATION: deferred until post content loads ────────────────────
  // ?fs=start-end can only be applied once we have the post's plain text to
  // reconstruct the `text` field of filterFocusSpan.
  const fsHydratedRef = useRef(false);

  useEffect(() => {
    // Reset when pathname changes
    fsHydratedRef.current = false;
  }, [pathname]);

  useEffect(() => {
    if (fsHydratedRef.current) return;
    if (!plainPostText) return; // wait for post to load

    const fsParam = searchParams.get("fs");
    if (!fsParam) {
      fsHydratedRef.current = true;
      return;
    }

    const parts = fsParam.split("-").map(Number);
    if (parts.length !== 2 || parts.some((n) => isNaN(n))) {
      fsHydratedRef.current = true;
      return;
    }

    const [start, end] = parts;
    if (start < 0 || end <= start || start >= plainPostText.length) {
      // Offsets out of range — silently skip; post content may have changed
      fsHydratedRef.current = true;
      return;
    }

    const safeEnd = Math.min(end, plainPostText.length);
    const text = plainPostText.slice(start, safeEnd);
    setFilterFocusSpan({ start, end: safeEnd, text });
    fsHydratedRef.current = true;
  }, [plainPostText, pathname, searchParams]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── WRITE: debounced URL update when UI state changes ────────────────────
  // Uses router.replace (not push) so filter toggles don't pollute history.
  // Preserves ?stackId and ?from (set by other parts of the app).
  useEffect(() => {
    // Don't write until we've finished hydrating — would immediately overwrite the
    // URL params we just read.
    if (!hydratedRef.current) return;

    const params = new URLSearchParams();

    // Only encode non-default tab (default is "time")
    if (activeTab && activeTab !== "time") {
      params.set("tab", activeTab);
    }

    if (filterCategories.size > 0) {
      params.set("fc", Array.from(filterCategories).sort().join(","));
    }

    if (filterFocusSpan !== null) {
      params.set("fs", `${filterFocusSpan.start}-${filterFocusSpan.end}`);
    }

    // Pass through params managed by other parts of the app
    const stackId = searchParams.get("stackId");
    if (stackId) params.set("stackId", stackId);
    const from = searchParams.get("from");
    if (from) params.set("from", from);

    const newSearch = params.toString();
    const currentSearch = searchParams.toString();
    if (newSearch === currentSearch) return; // already up to date

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const newUrl = pathname + (newSearch ? "?" + newSearch : "");
      router.replace(newUrl);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeTab, filterCategories, filterFocusSpan, pathname]);  // eslint-disable-line react-hooks/exhaustive-deps
}
