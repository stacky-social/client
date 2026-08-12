"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import {
  activateAsideTopic,
  activateReplyTopic,
  clearAll,
  consumePanelHistoryWriteMode,
  consumePanelUndo,
  setCategoryFilter,
  setPassageFilter,
  useHighlightStore,
  filteredHistoryState,
  registerUrlSyncFlush,
} from "./highlightStore";
import { parseFilterInteraction, serializeFilterSearch } from "./filterUrlState.mjs";
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
 * Read direction (initial hydration + browser Back/Forward restoration):
 *   ?tab                 → setActiveTab()
 *   ?fc                  → setCategoryFilter() (atomic; replace-not-stack)
 *   ?fs                  → setPassageFilter() (deferred until post text loads)
 *   ?ft + ?fo + ?fa + ?fi → topic grouping/cross-pane filter + anchor
 *
 * Write direction:
 *   The complete state is pushed as a real, shareable URL until the bounded
 *   24-step filter stack is full; subsequent transitions replace its top.
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
  const pathname = usePathname();
  const router = useRouter();
  const { filterCategories, responseFilter, topicInteraction } = useHighlightStore();

  // Tracks whether we have completed the initial hydration for the current pathname.
  // Reset when the pathname changes (i.e., user navigated to a different post).
  const hydratedRef = useRef(false);
  // Tracks whether the ?tab= param has been resolved (applied or dismissed).
  const tabHydratedRef = useRef(false);
  // Tracks whether we triggered onHydratedTab for the current mount.
  const hydratedTabCalledRef = useRef(false);
  const foreignTabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Popstate changes the URL first; these refs tell the hydration effects to
  // reconcile absent params too (e.g. Back from ?fc=agree to the clean state).
  const restoringHistoryRef = useRef(false);
  // URL hydration mutates the same state observed by the write effect. Suppress
  // that effect for the hydration render so it cannot echo stale pre-hydration
  // state back over the URL that the user just opened/Backed to.
  const suppressNextWriteRef = useRef(false);

  // One shared popstate boundary serves both mock and Mastodon detail routes.
  // The in-memory snapshot restores exact base ordering while the URL effects
  // below restore every public/shareable filter dimension.
  useEffect(() => {
    registerUrlSyncFlush(() => {});
    const onPopState = () => {
      hydratedRef.current = false;
      tabHydratedRef.current = false;
      hydratedTabCalledRef.current = false;
      restoringHistoryRef.current = true;
      suppressNextWriteRef.current = true;
      consumePanelUndo();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      registerUrlSyncFlush(null);
    };
  }, []);

  // Reset hydration gate when the route changes.
  useEffect(() => {
    hydratedRef.current = false;
    tabHydratedRef.current = false;
    hydratedTabCalledRef.current = false;
    restoringHistoryRef.current = false;
    suppressNextWriteRef.current = false;
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
    if (foreignTabTimerRef.current) {
      clearTimeout(foreignTabTimerRef.current);
      foreignTabTimerRef.current = null;
    }
    if (tabHydratedRef.current) return;
    const tabParam = searchParams.get("tab");
    if (!tabParam || !isValidTab(tabParam)) {
      tabHydratedRef.current = true;
      if (restoringHistoryRef.current && activeTab !== defaultTab) {
        suppressNextWriteRef.current = true;
        setActiveTab(defaultTab);
      }
      return;
    }
    if (allowedTabs && !allowedTabs.includes(tabParam)) {
      // Persisted flags settle just after hydration. Keep a valid candidate
      // briefly so a legitimate tab can become allowed. If it remains foreign,
      // normalize through the App Router: this matters for same-document
      // Back/Forward arrivals where an address-bar-only replace can otherwise
      // leave Next rendering the previous post under the new pathname.
      suppressNextWriteRef.current = true;
      setActiveTab(defaultTab);
      foreignTabTimerRef.current = setTimeout(() => {
        foreignTabTimerRef.current = null;
        tabHydratedRef.current = true;
        const params = new URLSearchParams(window.location.search);
        params.delete("tab");
        const nextSearch = params.toString();
        router.replace(pathname + (nextSearch ? `?${nextSearch}` : ""), { scroll: false });
      }, 300);
      return () => {
        if (foreignTabTimerRef.current) {
          clearTimeout(foreignTabTimerRef.current);
          foreignTabTimerRef.current = null;
        }
      };
    }
    tabHydratedRef.current = true;
    suppressNextWriteRef.current = true;
    setActiveTab(tabParam);
    if (!hydratedTabCalledRef.current) {
      hydratedTabCalledRef.current = true;
      onHydratedTab?.(tabParam);
    }
  }, [pathname, searchParams, allowedKey, activeTab, defaultTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── HYDRATION: all related-post interaction dimensions ───────────────────
  // On first load, an explicit URL state wins over per-focus in-memory restore.
  // With no filter params, ordinary in-app navigation keeps that saved state.
  // On Back/Forward, however, an absent param intentionally means "clean" and
  // therefore clears the store.
  useEffect(() => {
    if (hydratedRef.current) return;
    const parsed = parseFilterInteraction(searchParams, plainPostText);
    if (parsed.kind === "pending-passage") return;

    hydratedRef.current = true;
    const hasManagedFilterParam = ["fc", "fs", "ft", "fo", "fa", "fi"]
      .some((key) => searchParams.has(key));

    if (parsed.kind === "category") {
      suppressNextWriteRef.current = true;
      setCategoryFilter(new Set(parsed.categories));
    } else if (parsed.kind === "passage") {
      suppressNextWriteRef.current = true;
      setPassageFilter(parsed.span);
    } else if (parsed.kind === "topic") {
      suppressNextWriteRef.current = true;
      if (parsed.interaction.origin === "aside") {
        activateAsideTopic(parsed.interaction);
      } else {
        activateReplyTopic(parsed.interaction);
      }
    } else if (restoringHistoryRef.current || hasManagedFilterParam) {
      suppressNextWriteRef.current = true;
      clearAll();
    }
    restoringHistoryRef.current = false;
  }, [plainPostText, pathname, searchParams]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── WRITE: complete, bounded, shareable state ─────────────────────────────
  useEffect(() => {
    if (!hydratedRef.current || !tabHydratedRef.current) return;
    if (suppressNextWriteRef.current) {
      suppressNextWriteRef.current = false;
      return;
    }

    const newSearch = serializeFilterSearch({
      currentSearch: searchParams.toString(),
      activeTab,
      defaultTab,
      filterCategories,
      responseFilter,
      topicInteraction,
    });
    const currentSearch = searchParams.toString();
    if (newSearch === currentSearch) {
      // Defensive: a no-op gesture must not leak its pending push decision into
      // a later programmatic normalization.
      consumePanelHistoryWriteMode();
      return;
    }

    const newUrl = pathname + (newSearch ? "?" + newSearch : "");
    const mode = consumePanelHistoryWriteMode();
    window.history[mode === "push" ? "pushState" : "replaceState"](
      filteredHistoryState(),
      "",
      newUrl,
    );
  }, [activeTab, defaultTab, filterCategories, responseFilter, topicInteraction, pathname, searchParams]);
}
