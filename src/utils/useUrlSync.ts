"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  setFilterCategories,
  setResponseFilter,
  useHighlightStore,
} from "./highlightStore";
import { LEGACY_TABS, SORT_TABS } from "./replyTabs.mjs";

export interface UrlSyncOptions {
  /** Current active tab value */
  activeTab: string;
  setActiveTab: (tab: string) => void;
  /**
   * Plain-text content of the focus post — needed to reconstruct the `text`
   * field of responseFilter from the ?fs= offset param on hydration.
   * Pass null until the post content is loaded.
   */
  plainPostText: string | null;
  /**
   * Called once on initial mount when the URL contains a ?tab= param.
   * Use this to trigger the tab's data fetch (e.g., fetchRecommended).
   */
  onHydratedTab?: (tab: string) => void;
  /**
   * The tab treated as default (omitted from the URL). "time" for the legacy
   * tab set; the thread page passes "top" when the reply-sort-tabs flag is on.
   */
  defaultTab?: string;
  /**
   * The tabs the caller can currently render (the active tab set). A ?tab=
   * outside this list is not hydrated, so a stale cross-condition link never
   * selects a tab that has no panel (audit F-1). Because the experiment
   * condition settles one render after mount, a rejected tab is retried
   * whenever this list changes, until it is applied or the param is gone.
   * Omitted: any known tab hydrates (legacy behavior).
   */
  allowedTabs?: readonly string[];
}

// Every tab either tab set can render; ?tab= values outside this are ignored.
const VALID_TABS: readonly string[] = Array.from(new Set([...SORT_TABS, ...LEGACY_TABS]));

function isValidTab(v: string): boolean {
  return VALID_TABS.includes(v);
}

/**
 * Synchronizes URL search params with local/store state for the post-detail route.
 *
 * Read direction (hydration):
 *   ?tab    → setActiveTab()
 *   ?fc     → setFilterCategories()
 *   ?fs     → setResponseFilter() (deferred until plainPostText is available)
 *
 * Write direction (debounced):
 *   activeTab + filterCategories + responseFilter → router.replace(pathname + ?params)
 *
 * ?stackId and ?from are preserved (pass-through) and not modified here.
 */
export function useUrlSync({
  activeTab,
  setActiveTab,
  plainPostText,
  onHydratedTab,
  defaultTab = "time",
  allowedTabs,
}: UrlSyncOptions): void {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { filterCategories, responseFilter } = useHighlightStore();

  // Tracks whether we have completed the initial hydration for the current pathname.
  // Reset when the pathname changes (i.e., user navigated to a different post).
  const hydratedRef = useRef(false);
  // Tracks whether the ?tab= param has been resolved (applied or dismissed).
  const tabHydratedRef = useRef(false);
  // Tracks whether we triggered onHydratedTab for the current mount.
  const hydratedTabCalledRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset hydration gate when the route changes.
  useEffect(() => {
    hydratedRef.current = false;
    tabHydratedRef.current = false;
    hydratedTabCalledRef.current = false;
  }, [pathname]);

  // ── TAB HYDRATION: gated on the active tab set ───────────────────────────
  // Applies ?tab= only when the caller can render it. A valid-but-foreign tab
  // is left pending rather than dismissed: while the experiment condition is
  // still settling (persisted flags load one render after mount) the allowed
  // set may change, and we retry then. The pending window closes on its own —
  // the write direction below strips a foreign tab from the URL, and that
  // searchParams change re-runs this effect with no ?tab= left to apply.
  const allowedKey = allowedTabs ? allowedTabs.join(",") : "";
  useEffect(() => {
    if (tabHydratedRef.current) return;
    const tabParam = searchParams.get("tab");
    if (!tabParam || !isValidTab(tabParam)) {
      tabHydratedRef.current = true;
      return;
    }
    if (allowedTabs && !allowedTabs.includes(tabParam)) return; // foreign for now — retry on allowedTabs change
    tabHydratedRef.current = true;
    setActiveTab(tabParam);
    if (!hydratedTabCalledRef.current) {
      hydratedTabCalledRef.current = true;
      onHydratedTab?.(tabParam);
    }
  }, [pathname, searchParams, allowedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── HYDRATION: filter categories ─────────────────────────────────────────
  // Runs once per pathname (i.e., once per post ID). Reads URL params and
  // initializes highlightStore.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    // fc (filter categories — CSV). A ?fc link overrides the restored panel
    // filters; with no ?fc we leave the per-focus-post state alone — setPanelFocus
    // (in RelatedStacks) has already restored or cleared it. Wiping here would
    // undo that restore on every back-navigation.
    const fcParam = searchParams.get("fc");
    if (fcParam) {
      const cats = new Set(fcParam.split(",").map((c) => c.trim()).filter(Boolean));
      if (cats.size > 0) {
        setFilterCategories(cats);
      }
    }

    // fs (filter focus span) — text reconstruction deferred to the effect below
  }, [pathname, searchParams]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── SPAN HYDRATION: deferred until post content loads ────────────────────
  // ?fs=start-end can only be applied once we have the post's plain text to
  // reconstruct the `text` field of responseFilter.
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
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      // Reject non-integer offsets like "10.5-20.5"
      fsHydratedRef.current = true;
      return;
    }
    if (start < 0 || end <= start || start >= plainPostText.length) {
      // Offsets out of range — silently skip; post content may have changed
      fsHydratedRef.current = true;
      return;
    }

    const safeEnd = Math.min(end, plainPostText.length);
    const text = plainPostText.slice(start, safeEnd);
    setResponseFilter({ start, end: safeEnd, text });
    fsHydratedRef.current = true;
  }, [plainPostText, pathname, searchParams]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── WRITE: debounced URL update when UI state changes ────────────────────
  // Uses router.replace (not push) so filter toggles don't pollute history.
  // Preserves ?stackId, ?from and ?related (set by other parts of the app).
  useEffect(() => {
    // Clear any pending debounce up front so a stale router.replace can't fire
    // against an out-of-date path, even if this effect early-returns below.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Don't write until we've finished hydrating — would immediately overwrite the
    // URL params we just read.
    if (!hydratedRef.current) return;

    const params = new URLSearchParams();

    // Only encode a non-default tab
    if (activeTab && activeTab !== defaultTab) {
      params.set("tab", activeTab);
    }

    if (filterCategories.size > 0) {
      params.set("fc", Array.from(filterCategories).sort().join(","));
    }

    if (responseFilter !== null) {
      params.set("fs", `${responseFilter.start}-${responseFilter.end}`);
    }

    // Pass through params managed by other parts of the app
    const stackId = searchParams.get("stackId");
    if (stackId) params.set("stackId", stackId);
    const from = searchParams.get("from");
    if (from) params.set("from", from);
    // `related` (Share-pairing links): without this pass-through the first
    // debounced replace silently stripped it, so re-copying the visible URL
    // lost the pairing (audit F-46).
    const related = searchParams.get("related");
    if (related) params.set("related", related);

    const newSearch = params.toString();
    const currentSearch = searchParams.toString();
    if (newSearch === currentSearch) return; // already up to date

    debounceRef.current = setTimeout(() => {
      const newUrl = pathname + (newSearch ? "?" + newSearch : "");
      // scroll:false — this replace fires 300ms after every tab/filter change;
      // the App Router's default scroll-to-top would yank the user away from
      // the replies they are sorting/filtering.
      router.replace(newUrl, { scroll: false });
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [activeTab, defaultTab, filterCategories, responseFilter, pathname, searchParams, router]);
}
