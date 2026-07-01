# Group H — URL State Implementation Plan

**Date:** 2026-05-13
**Status:** Ready
**Spec:** `docs/superpowers/specs/2026-05-13-group-h-url-state-design.md`

---

## Step 1 — Add `useUrlSync` utility hook

**File:** `src/utils/useUrlSync.ts` (new file)

### 1.1 Create the hook

This hook owns all URL ↔ state sync for the post-detail route.

Responsibilities:
- **Hydrate on mount:** read `?tab`, `?fc`, `?fs` from `useSearchParams()` and push into local state + store.
- **Write on change:** debounced `router.replace` that encodes current `activeTab`, `filterCategories`, and `filterFocusSpan`.

Key implementation notes:
- Import `useSearchParams`, `useRouter`, `usePathname` from `next/navigation`.
- Import `setFilterCategories`, `setFilterFocusSpan`, `useHighlightStore` from `./highlightStore`.
- The debounce ref holds a `ReturnType<typeof setTimeout>`.
- **Hydration** runs in a `useEffect` gated on a `hydratedRef` flag — fires once per mount (i.e., once per post ID change when the page remounts). After hydrating, it calls `onHydratedTab?.(tab)` so the page can trigger tab-specific fetches.
- **Write** runs in a separate `useEffect` watching `[activeTab, filterCategories, filterFocusSpan]`. It builds the new search params string and calls `router.replace`.
- `"use client"` directive at the top.

Implementation:

```ts
"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  setFilterCategories,
  setFilterFocusSpan,
  clearFilterFocusSpan,
  useHighlightStore,
} from "./highlightStore";

export interface UrlSyncOptions {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  /** Plain-text content of the focus post — needed to reconstruct fs text on hydration */
  plainPostText: string | null;
  /** Called once on mount when URL has a tab param (so page can trigger data fetch) */
  onHydratedTab?: (tab: string) => void;
}

const VALID_TABS = ["time", "recommended", "stacked", "summary"] as const;

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

  const hydratedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── HYDRATION: runs once on mount (or when pathname changes = new post) ──
  useEffect(() => {
    hydratedRef.current = false;
  }, [pathname]);

  useEffect(() => {
    if (hydratedRef.current) return;

    // tab
    const tabParam = searchParams.get("tab");
    if (tabParam && VALID_TABS.includes(tabParam as any)) {
      setActiveTab(tabParam);
      onHydratedTab?.(tabParam);
    }

    // fc (filter categories)
    const fcParam = searchParams.get("fc");
    if (fcParam) {
      const cats = new Set(fcParam.split(",").filter(Boolean));
      if (cats.size > 0) setFilterCategories(cats);
    } else {
      // Clear any stale store state when navigating to a URL with no fc
      setFilterCategories(new Set());
    }

    // fs (filter focus span) — text reconstructed once post loads
    // Stored as a pending parse; actual setFilterFocusSpan called below when plainPostText available
    hydratedRef.current = true;
  }, [pathname, searchParams]);

  // ── SPAN HYDRATION: deferred until post content is available ──
  useEffect(() => {
    if (!hydratedRef.current) return;
    const fsParam = searchParams.get("fs");
    if (!fsParam || !plainPostText) return;
    const parts = fsParam.split("-").map(Number);
    if (parts.length !== 2 || parts.some(isNaN)) return;
    const [start, end] = parts;
    if (start < 0 || end <= start || start >= plainPostText.length) return;
    const safeEnd = Math.min(end, plainPostText.length);
    const text = plainPostText.slice(start, safeEnd);
    setFilterFocusSpan({ start, end: safeEnd, text });
  }, [plainPostText, pathname]); // re-run when post loads

  // ── WRITE: debounced URL update when state changes ──
  useEffect(() => {
    if (!hydratedRef.current) return; // don't write before hydration reads

    const params = new URLSearchParams();

    if (activeTab && activeTab !== "time") {
      params.set("tab", activeTab);
    }

    if (filterCategories.size > 0) {
      params.set("fc", Array.from(filterCategories).join(","));
    }

    if (filterFocusSpan !== null) {
      params.set("fs", `${filterFocusSpan.start}-${filterFocusSpan.end}`);
    }

    // Preserve ?stackId and ?from if present (don't clobber pre-existing params)
    const stackId = searchParams.get("stackId");
    if (stackId) params.set("stackId", stackId);
    const from = searchParams.get("from");
    if (from) params.set("from", from);

    const newSearch = params.toString();
    const currentSearch = searchParams.toString();
    if (newSearch === currentSearch) return; // no-op

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.replace(`${pathname}${newSearch ? "?" + newSearch : ""}`);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeTab, filterCategories, filterFocusSpan, pathname]);
}
```

**Verification:** `pnpm build` — no errors.

---

## Step 2 — Integrate `useUrlSync` into `/posts/[id]/page.tsx`

**File:** `src/app/(shell)/posts/[id]/page.tsx`

### 2.1 Add import

```ts
import { useUrlSync } from "../../../../utils/useUrlSync";
```

### 2.2 Add plain-text helper

After the existing `withAuth` and `mapWithStackFields` helpers, add:

```ts
/** Strip HTML tags to extract plain text for span hydration */
function stripHtmlToPlain(html: string): string {
  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.innerHTML = html;
    return el.textContent ?? el.innerText ?? "";
  }
  return html.replace(/<[^>]*>/g, "");
}
```

### 2.3 Derive `plainPostText`

After the `post` state declaration, add a derived value (not state — computed inline):

```ts
const plainPostText = post ? stripHtmlToPlain(post.content) : null;
```

### 2.4 Call `useUrlSync`

After `const [activeTab, setActiveTab] = useState<string>("time")`, add:

```ts
useUrlSync({
  activeTab,
  setActiveTab,
  plainPostText,
  onHydratedTab: async (tab) => {
    // Trigger data fetch for tabs that need it on initial load
    const actions: Record<string, (() => Promise<void>) | undefined> = {
      recommended: fetchRecommended,
      stacked: fetchRepliesStack,
      summary: fetchSummary,
    };
    const fn = actions[tab];
    if (fn) await fn();
  },
});
```

Note: `fetchRecommended`, `fetchRepliesStack`, and `fetchSummary` are defined later in the component with `useCallback`. The `onHydratedTab` callback captures them via closure — this is safe because `useUrlSync` calls `onHydratedTab` only after mount effects have run (after hydration).

### 2.5 Seed `?from=` into sessionStorage on mount

After the main init `useEffect`, add:

```ts
// H5: seed BackButton sessionStorage from ?from= param on shared links
useEffect(() => {
  const fromId = searchParamsRef.current?.get("from");
  if (!fromId) return;
  const key = `previousPath:${window.location.pathname}`;
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, `/posts/${fromId}`);
  }
}, []);
```

This requires `useSearchParams()` to be called in the component. Add:

```ts
const searchParamsObj = useSearchParams();
```

at the top of the component (alongside existing hooks).

### 2.6 Pass `sourcePostId` to `RelatedStacks` (for `?from=`)

The focus post's ID is `id` (from `params`). We need to thread this through to `RelatedStacks` when rendering the aside. The aside is rendered via the parallel route (`@aside/page.tsx`) which receives stacks from context — it doesn't receive a `sourcePostId` prop directly.

**Approach:** Update `handleNavigate` in `RelatedStacks.tsx` to accept `sourcePostId` via a new optional prop on `RelatedStacks`.

In `page.tsx`, find where `RelatedStacks` is called (only in the inline `showFocusRelatedStacks` section — actually RelatedStacks is only called in `@aside/page.tsx`, not directly in `page.tsx`). We need to thread `sourcePostId` through the context OR add it to `RelatedStacksProvider`.

**Simpler approach:** Pass `sourcePostId` as a prop to `RelatedStacks` in `@aside/page.tsx`. The aside page reads `id` from URL params via `useParams()`.

Update `@aside/page.tsx` to:
```ts
"use client";
import { useParams } from "next/navigation";
import RelatedStacks from "../../../../../components/RelatedStacks";
import { useRelatedStacks } from "../../../related-stacks-context";

export default function PostAside() {
  const { relatedStacks, showUpdate } = useRelatedStacks();
  const params = useParams();
  const focusPostId = typeof params.id === "string" ? params.id : undefined;
  if (!relatedStacks || relatedStacks.length === 0) return null;
  return (
    <div style={{ width: "100%" }}>
      <RelatedStacks
        relatedStacks={relatedStacks}
        cardWidth={"100%"}
        onStackClick={() => {}}
        showupdate={showUpdate}
        sourcePostId={focusPostId}
      />
    </div>
  );
}
```

**Verification:** `pnpm build` — no errors.

---

## Step 3 — Update `RelatedStacks.tsx`: add `sourcePostId` prop + `?from=` in navigation

**File:** `src/components/RelatedStacks.tsx`

### 3.1 Add `sourcePostId` to props interface

In `RelatedStacksProps`:
```ts
/** When set, appends ?from={sourcePostId} to related-post navigation URLs (H5) */
sourcePostId?: string;
```

### 3.2 Destructure in component

```ts
const RelatedStacks: React.FC<RelatedStacksProps> = ({
  relatedStacks, cardWidth = "100%", onStackClick, showupdate,
  onOpenModalWithStackId, onPostNavigate, sourcePostId
}) => {
```

### 3.3 Update `handleNavigate`

Current:
```ts
const handleNavigate = (postId: string, newStackId: string) => {
  if (onPostNavigate) { onPostNavigate(postId); return; }
  const url = `/posts/${postId}?stackId=${newStackId || ''}`;
  sessionStorage.setItem(`previousPath:/posts/${postId}`, window.location.pathname);
  sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
  router.push(url);
};
```

Updated:
```ts
const handleNavigate = (postId: string, newStackId: string) => {
  if (onPostNavigate) { onPostNavigate(postId); return; }
  const params = new URLSearchParams();
  if (newStackId) params.set("stackId", newStackId);
  if (sourcePostId) params.set("from", sourcePostId);
  const search = params.toString();
  const url = `/posts/${postId}${search ? "?" + search : ""}`;
  sessionStorage.setItem(`previousPath:/posts/${postId}`, window.location.pathname);
  sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
  router.push(url);
};
```

**Verification:** `pnpm build` — no errors.

---

## Step 4 — Final build verification

Run `pnpm build` from the worktree root. Confirm:
- Zero TypeScript errors.
- Zero Next.js build errors.
- No unexpected bundle size increases.

---

## Step 5 — Write spec and plan, commit all

Commit sequence:

1. `Add Group H URL state design spec and implementation plan`
2. `Add useUrlSync hook for URL-state sync on post-detail route`
3. `Integrate useUrlSync and from-param seeding in posts/[id]/page`
4. `Pass sourcePostId to RelatedStacks for from-param navigation`
