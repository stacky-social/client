# Group H — URL / Browser Navigation & Share/Bookmark Persistence (Design Spec)

**Date:** 2026-05-13
**Status:** Ready for implementation
**Scope:** URL state for current screen, browser back restoration, per-view canonical routes, share/bookmark filter + highlight preservation.
**Owner:** tarcode2004
**Approach:** Add a lightweight `urlState` utility module. Sync `filterCategories`, `filterFocusSpan`, and `activeTab` into URL search params on the `/posts/[id]` route. Let Next.js App Router history handle back naturally.

---

## 1. Problem

Five related navigation/persistence gaps:

1. **Refreshing `/posts/[id]` loses filter state.** Category filter chips (`?fc=`) and span filter (`?fs=`) live only in the module-level `highlightStore`; they vanish on refresh.
2. **Active tab (`time|recommended|stacked|summary`) is not in the URL.** Two users sharing the same post URL land on "time" regardless of what the sender was looking at.
3. **Browser Back partially works** (Next.js handles the route change) but the aside panel state (which post's stacks are shown) is context-only and doesn't survive re-mount after back navigation when the context is re-initialized.
4. **Share/bookmark on a filtered related panel** does not preserve list order because filter state is absent from the shareable URL.
5. **Share/bookmark on a related post** only navigates to `/posts/{relatedId}` — losing the focus+aside pairing and highlight state.

## 2. Goals

- **H1.** `?tab=`, `?fc=`, `?fs=` params on `/posts/[id]` — hydrated on mount, written on change.
- **H2.** Browser Back restores the full view (route + params) naturally via App Router history. No custom stack needed; we verify and fix the context re-hydration gap.
- **H3.** Each post has `/posts/[id]` as its canonical URL. Each main view has its own segment already. Verify nothing new needed, document the finding.
- **H4.** Share = current URL with all params. Since we encode filter state, copying the URL inherently shares a filtered, ordered view.
- **H5.** Related-post navigation preserves focus+related pair: `/posts/{relatedId}?from={focusId}`. Opening this URL renders the focus context in the aside (or a back-link) without re-engineering the entire aside.

## 3. Non-Goals

- Encoding `reRankAnchorIds` or `shownByAnchor` in the URL (ephemeral UX state, not shareable).
- Encoding `hoveredPostId`, `tappedCardPostId` (transient interaction state).
- Custom history stack or scroll restoration beyond what sessionStorage already provides.
- Changing the aside parallel-route architecture (remains context-driven; URL only seeds context).
- Any change to `HoverTooltip.tsx`, `ThreadedReplyList.tsx`, `ReplySection.tsx`, or the focus-post dwell logic in `Post.tsx`.

## 4. URL Schema

### 4.1 Parameter names and formats

| Param | Meaning | Format | Example |
|---|---|---|---|
| `tab` | Active reply tab on `/posts/[id]` | `time` \| `recommended` \| `stacked` \| `summary` | `?tab=recommended` |
| `fc` | Filter categories (filterCategories) | CSV of category keys | `?fc=evidence_public,agree` |
| `fs` | Filter focus span (filterFocusSpan) | `{start}-{end}` integers; text omitted (recomputed from post content) | `?fs=42-97` |
| `from` | Focus post ID when navigating to a related post | Post ID string | `?from=109876543` |

### 4.2 Judgment call: why CSV for `fc`

Alternatives considered:
- **Repeated params** (`?fc=evidence_public&fc=agree`): verbose, slightly harder to read/write in Next.js `searchParams`.
- **JSON-encoded** (`?fc=["evidence_public","agree"]`): URL-escaping makes it ugly.
- **CSV** (`?fc=evidence_public,agree`): concise, human-readable, no encoding needed (category keys are alphanumeric + underscore). Max realistic length: ~150 chars for all 13 categories combined. Chosen.

### 4.3 Judgment call: `fs` text omission

`filterFocusSpan` carries `{ start, end, text }`. The `text` field is a substring of the focus post's content. We do **not** serialize `text` into the URL because:
- The content is already available from the Mastodon API fetch that happens on mount.
- Including text would balloon URL length (up to 100+ chars for long spans).
- On hydration, we reconstruct `text` from the fetched post content and the `start`/`end` offsets.

This means the URL `?fs=42-97` reconstructs correctly as long as the post content doesn't change — acceptable for a social post.

### 4.4 Judgment call: aside panel `?aside=` param NOT included

The aside shows related stacks for the active post. On `/posts/[id]`, the aside always starts showing the focus post's stacks (loaded via `setFromPost` in `fetchFocusRelatedStacks`). There is no user-driven "which aside is open" state to persist on that route — the focus post's stacks are always shown by default.

On the home feed, the aside IS driven by user click (via `RelatedStacksContext`). Encoding that in the URL would require making the home feed URL state-aware, which touches `PostList.tsx` and `Shell.tsx` — too invasive for this group. The aside on home is a transient overlay, not a persistent view.

**Decision:** No `?aside=` param. The aside on `/posts/[id]` self-initializes from the post ID in the path. The aside on home is ephemeral (intentional — it clears on navigation and back).

### 4.5 Judgment call: `?from=` for H5

When a user clicks a related post card in `RelatedStacks.tsx`, they navigate to `/posts/{relatedId}`. The "focus+related pair with highlights" requirement (H5) asks that this navigation be shareable. We encode the source post as `?from={focusId}`.

On the target `/posts/{relatedId}` page, `?from=` is used to:
1. Show a "Back to post {focusId}" link (the existing BackButton already does this via `previousPath` in sessionStorage; `?from=` provides a URL-based fallback that works on refresh).
2. That's all. We do NOT recreate the full aside filter state on the related page (H5 says "save the focus + related pair, with highlights" — this refers to the URL being shareable, not to re-mounting the full filter UI in the aside of the related post). The highlights on the related post card are properties of the related post itself, not URL state.

**Simpler than it sounds:** `?from=` is effectively a back-link hint. The highlights the user saw are the `relations` data on the related post — always present in the API response.

## 5. State ↔ URL Sync Strategy

### 5.1 Architecture: single sync component per route

The `/posts/[id]/page.tsx` component is a client component that already owns `activeTab` state. We add a `useUrlSync` hook (new utility: `src/utils/useUrlSync.ts`) that:

1. **On mount (hydrate):** reads `?tab`, `?fc`, `?fs` from `useSearchParams()` and initializes local/store state.
2. **On change (write):** `router.replace(pathname + '?' + newParams)` with a **debounce of 300ms** for rapid-fire filter toggles.

### 5.2 Why `router.replace`, not `router.push`

- `router.push` adds a history entry every time a filter chip is clicked — Back would require many clicks to escape the post page.
- `router.replace` updates the current history entry in place — the URL reflects current state without polluting history.
- The post-to-post navigation (clicking a related post card) continues to use `router.push` so Back returns to the correct post.

### 5.3 Why debounce

Rapid filter toggling (click A, click B, click A) would fire 3 `router.replace` calls in quick succession. With a 300ms debounce, only the final state is written. This prevents jank and avoids React 18's concurrent mode surprises with multiple in-flight router updates.

### 5.4 filterFocusSpan text reconstruction

On hydration, if `?fs=42-97` is present, we:
1. Wait for the post content to load (`post` state non-null).
2. Strip HTML from `post.content` to get plain text.
3. Extract `plainText.slice(42, 97)` as the `text` field.
4. Call `setFilterFocusSpan({ start: 42, end: 97, text })`.

This happens in a `useEffect` that depends on `post` and the parsed `?fs` param.

### 5.5 Back button and context re-hydration

When the user navigates from `/posts/A` → `/posts/B` → Back:

- Next.js App Router restores `/posts/A` with its **previous URL** (including `?tab=`, `?fc=`, `?fs=`).
- The `useUrlSync` hydration effect runs again (because `params.id` changed from B to A).
- `highlightStore` is module-level state (not React state) — it persists across navigation in the SPA. When navigating A → B, `resetHighlightStore()` is NOT called automatically; `fetchFocusRelatedStacks` does call `setFromPost` which replaces the aside stacks, and the `useEffect` on `relatedStacks` in `RelatedStacks.tsx` calls `clearFilterFocusSpan()` + `clearReRankAnchors()`. So after back-navigation to A, the URL params re-hydrate the store correctly.
- **Potential issue:** `highlightStore` is module-level (survives SPA navigation). If the user navigated A→B→Back, when A re-mounts the URL says `?fc=evidence_public` but the store might already have a different `filterCategories` from B. The hydration effect in `useUrlSync` runs on mount and explicitly re-sets the store to match the URL, overriding whatever was in the store. This is correct behavior.

### 5.6 `?from=` hydration

On `/posts/[id]` mount, if `?from=` is present:
- Read the value.
- Prefer sessionStorage `previousPath:/posts/{id}` if it exists (set by `handleNavigate` in `RelatedStacks.tsx`).
- If sessionStorage doesn't have it (user opened a shared link), set the sessionStorage key so BackButton renders correctly.

No change to `BackButton.tsx` itself — it already reads from sessionStorage.

## 6. Files Touched

| File | Action |
|---|---|
| `src/utils/useUrlSync.ts` | NEW — encapsulates URL ↔ state sync logic for the post-detail page |
| `src/app/(shell)/posts/[id]/page.tsx` | Import and call `useUrlSync`; pass `activeTab` + setter; write `?from=` on related-post navigation |
| `src/components/RelatedStacks.tsx` | Update `handleNavigate` to append `?from={sourcePostId}` when a `sourcePostId` prop is available |
| `src/app/(shell)/posts/[id]/@aside/page.tsx` | No change needed |
| `src/app/(shell)/related-stacks-context.tsx` | No change needed |
| `src/utils/highlightStore.ts` | No change needed (already has all the actions) |

No changes to HoverTooltip.tsx, ThreadedReplyList.tsx, ReplySection.tsx, or Shell.tsx.

## 7. `useUrlSync` API

```ts
// src/utils/useUrlSync.ts
export interface UrlSyncOptions {
  /** Current active tab value */
  activeTab: string;
  setActiveTab: (tab: string) => void;
  /** Post content as plain text — needed to reconstruct filterFocusSpan text */
  plainPostText: string | null;
  /** Called after hydration completes so the page can trigger tab-specific data fetches */
  onHydratedTab?: (tab: string) => void;
}

export function useUrlSync(opts: UrlSyncOptions): void;
```

Internals:
- `useSearchParams()` — read-only, reactive.
- `useRouter()` from `next/navigation` — for `router.replace`.
- `usePathname()` — for building replacement URLs.
- Debounce ref for write batching.
- Mount effect for hydration (runs once per `id` change via `params.id` in the parent).

## 8. `handleNavigate` update in RelatedStacks.tsx

The current `handleNavigate` in `RelatedStacks.tsx`:
```ts
const url = `/posts/${postId}?stackId=${newStackId || ''}`;
```

Updated to also append `?from=` when we can determine the source post. `RelatedStacks.tsx` receives an optional `sourcePostId?: string` prop (added alongside existing props). When set, it appends `&from={sourcePostId}` to the navigation URL.

The prop is populated from `/posts/[id]/page.tsx` which knows `id` (the current focus post).

`stackId` param is already there (pre-existing); we keep it.

## 9. Verification Plan

| Scenario | Expected |
|---|---|
| Navigate to `/posts/ABC`, click filter chip "evidence_public" | URL updates to `?fc=evidence_public` within 300ms |
| Refresh at `?fc=evidence_public` | Page loads with evidence_public filter chip active |
| Click span on focus post (D2) | URL updates to `?fs=42-97` |
| Refresh at `?fs=42-97` | Span filter re-applied; span indicator shown in aside |
| Click tab "recommended" | URL updates to `?tab=recommended` |
| Refresh at `?tab=recommended` | Recommended tab is active; data loaded |
| Navigate A → B via related post card | URL at B includes `?from=A` |
| Refresh at B with `?from=A` | Back button shows "Back" (sessionStorage seeded from `?from=`) |
| Navigate A → B → Back | Lands on A with its previous `?fc=`, `?fs=`, `?tab=` intact |
| Copy URL with `?fc=agree&tab=recommended`, open in new tab | Filter + tab both restored |
| `pnpm build` | Zero TypeScript errors |

## 10. Risks and Edge Cases

| Risk | Mitigation |
|---|---|
| Very long `?fc=` with all 13 categories (~150 chars) | Acceptable; URL length well under 2048 limit |
| `?fs=` offsets out of range (post content changed) | Guard: if `start >= plainText.length`, silently skip span hydration |
| Rapid filter toggling causes router.replace storm | 300ms debounce collapses to one write |
| `useSearchParams` on server component | `useUrlSync` is client-only (`"use client"`); `/posts/[id]/page.tsx` is already a client component |
| Back navigation restores stale `?fc=` from store | Hydration effect always wins: re-applies URL state to store on mount |
| `?from=` present but `previousPath` already set in sessionStorage | We only write sessionStorage if the key is absent — avoids clobbering actual navigation history |

## 11. Judgment Calls

| # | Ambiguity | Choice | Rationale |
|---|---|---|---|
| JC1 | `router.replace` vs `router.push` for param writes | `router.replace` | Avoids polluting history with every filter toggle click |
| JC2 | Debounce duration | 300ms | Short enough to feel responsive; long enough to batch rapid toggles |
| JC3 | Encode `filterFocusSpan.text` in URL? | No — recompute from offsets + fetched content | Keeps URLs clean; text is always derivable |
| JC4 | Aside panel state in URL? | No `?aside=` param | On post-detail, aside is always the focus post's stacks. On home, aside is ephemeral |
| JC5 | Encode `reRankAnchorIds` in URL? | No | Anchor state is ephemeral per-session UX; not appropriate to persist |
| JC6 | H5 "with highlights" meaning | `?from=` back-link only | The highlight data is in the related post's `relations` field — always fetched. URL doesn't need to encode which ranges are lit |
| JC7 | Where does `useUrlSync` live? | `src/utils/useUrlSync.ts` | Keeps page.tsx clean; follows project pattern of utilities in `src/utils/` |
| JC8 | `stackId` param already on related-post navigation | Keep it | Pre-existing; no reason to remove |

## 12. Next Step

Hand off to implementation plan.
