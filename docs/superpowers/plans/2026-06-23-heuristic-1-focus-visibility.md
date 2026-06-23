# Heuristic #1 — "Visibility of System Status" (Focus & Aside) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **No unit-test framework** is configured in this repo (CLAUDE.md). Each task's "verify" step is a concrete browser check via the `preview_*` tools (dev server on :3002) instead of a test runner. Treat the verify step as the failing/passing gate.

**Goal:** Make the related-posts aside always, unambiguously reflect *the one post currently in focus* — and show nothing when there is no focus.

**Architecture:** The aside is driven by `RelatedStacksContext` (`activePostId` + `relatedStacks`), which lives in the shell and survives route changes. The feed re-derives the active post on scroll. The problems are: (a) the context is never cleared when leaving focus-bearing routes, (b) the scroll heuristic leaves *no* post active at the feed bottom, (c) the active styling can visibly revert during scroll re-renders, and (d) two parallel "active post" notions (page-local vs context) can diverge.

**Tech Stack:** Next.js 14 App Router, parallel route `@aside`, React context, Mantine.

---

## Triage — the full Nielsen table against the *current* (post-redesign) build

The layout redesign (top nav + centered group + single ratio slider) already closed several rows. This plan implements the **H1** rows; the rest are scoped for follow-up plans.

| # Heuristic | Finding | Status now | Action |
|---|---|---|---|
| **1 Visibility (focus/aside)** | No active post at feed bottom; active style reverts; **aside leaks onto home/search** | **OPEN — this plan** | Tasks 1–4 |
| 1 Visibility ("0 more") | Singleton topics show "0 more" | OPEN | Follow-up (ties to R-TIP-4/R-GROUP-6) |
| 2 Match real world | Off-domain synthetic topic pools if `topic` missing | OPEN (latent) | Follow-up |
| 3 User control | Saved center width overridden; back-strand | **resize half RESOLVED** by redesign (single ratio slider, no center-starve math); back-strand OPEN | Follow-up (R-NAV-5) |
| 4 Consistency | Two "active post" notions; symmetric resize non-standard | symmetric resize **RESOLVED** (one slider); two-active-post **OPEN** | Task 4 (this plan) |
| 5 Error prevention | Columns overflow @1200; button-in-button | overflow **RESOLVED** (max-width + no-overflow invariant, verified); button-in-button OPEN | Follow-up (R-A11Y-1) |
| 6 Recognition | Bounded reveal / scroll-to-span needed | OPEN | Follow-up (D-EXPAND) |
| 7 Flexibility | Touch parity diverges | partially addressed (adaptive `isTouch`); verify | Follow-up |
| 8 Aesthetic | Deep-highlight full expansion | OPEN | Follow-up (D-EXPAND, same as 6) |
| 9 Recover from errors | Silent fetch failures when authed | OPEN | Follow-up |
| 10 Help/docs | Discoverability of hover affordances | Low | Follow-up |

---

## File Structure

- `src/app/(shell)/@aside/default.tsx` — aside for routes with **no** focus concept. Responsibility: render nothing and clear stale focus.
- `src/app/(shell)/related-stacks-context.tsx` — single source of truth for the aside. Add a stable `clear()`.
- `src/app/(shell)/listy-injection/page.tsx` — feed; owns the scroll→active-post heuristic. Fix the bottom edge and the divergence.
- `src/components/Posts/Post.tsx` — renders the active border/elevation. Stabilize it.

---

## Task 1: Stop the aside from leaking onto no-focus routes (home/search/etc.)

**Files:**
- Modify: `src/app/(shell)/related-stacks-context.tsx`
- Modify: `src/app/(shell)/@aside/default.tsx`

- [ ] **Step 1: Add a stable `clear()` to the context**

In `related-stacks-context.tsx`, add `clear` to the type and provider. Use `useCallback` + the updater form so it is referentially stable (prevents an effect loop in Task 1 Step 2):

```tsx
type RelatedStacksContextValue = {
  relatedStacks: RelatedStacksArray;
  activePostId: string | null;
  previousPostId: string | null;
  setFromPost: (stacks: RelatedStacksArray, postId: string, options?: { force?: boolean }) => void;
  clear: () => void;
  showUpdate: boolean;
};

// inside RelatedStacksProvider, after setFromPost:
const clear = useCallback(() => {
  setActivePostId(prev => { previousPostIdRef.current = prev; return null; });
  setRelatedStacks([]);
}, []);

// add `clear` to the useMemo value object and to its deps:
const value = useMemo(
  () => ({ relatedStacks, activePostId, previousPostId: previousPostIdRef.current, setFromPost, clear, showUpdate: activePostId !== previousPostIdRef.current }),
  [relatedStacks, activePostId, clear]
);
```

Also add `useCallback` to the React import.

- [ ] **Step 2: Make `default.tsx` render nothing and clear stale focus**

Routes that need an aside (`/listy-injection`, `/listy-injection/posts/[id]`, `/posts/[id]`) have their **own** `@aside` segments. `default.tsx` is therefore only the fallback for focus-less routes (home, search, bookmarks, favorites…). Replace its body entirely:

```tsx
"use client";

import { useEffect } from "react";
import { useRelatedStacks } from "../related-stacks-context";

// Routes without a focused post (home, search, bookmarks, …) get no aside.
// Clearing also drops any stale focus carried over from a listy route.
export default function DefaultAside() {
  const { clear } = useRelatedStacks();
  useEffect(() => { clear(); }, [clear]);
  return null;
}
```

- [ ] **Step 3: Verify in the browser**

Run dev (`preview_start` "dev"), then with `preview_eval`:
```js
(() => { location.href = location.origin + '/listy-injection'; return 'go'; })()
// then, after it loads, navigate away:
(() => { location.href = location.origin + '/home'; return 'go'; })()
```
On `/home` (and repeat for `/search`), assert:
```js
(() => { const a=document.querySelector('[data-testid=col-aside]');
  return { display: getComputedStyle(a).display, children: a.childElementCount, relatedCards: a.querySelectorAll('[data-post-id]').length, sliders: document.querySelectorAll('[role=separator][aria-label^="Resize"]').length }; })()
// Expected: display "none", children 0, relatedCards 0, sliders 0 (single centered column).
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(shell)/related-stacks-context.tsx" "src/app/(shell)/@aside/default.tsx"
git commit -m "Clear related aside on focus-less routes (#H1)"
```

---

## Task 2: Always keep exactly one post active — including at the feed bottom (R-FEED-3)

**Files:**
- Modify: `src/app/(shell)/listy-injection/page.tsx` — the `onScroll` rAF body (~lines 579–608)

- [ ] **Step 1: Add bottom-of-feed detection to `onScroll`**

After the existing `bestIdx` computation and the `bestIdx === -1` first-visible fallback, force the last post active when scrolled to the bottom (the last post's top may never cross the 30% line on a tall viewport):

```js
// Bottom-of-feed guard (R-FEED-3): on a tall viewport the last post's top can
// sit below the 30% active line even at max scroll, leaving nothing active.
// When scrolled to the bottom, the last rendered post is what's in view.
const atBottom =
  window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
if (atBottom) {
  for (let i = postRefs.current.length - 1; i >= 0; i--) {
    if (postRefs.current[i]) { bestIdx = i; break; }
  }
}
```

Place this immediately before `if (bestIdx >= 0) { ... }`.

- [ ] **Step 2: Verify at the bottom**

`preview_eval` on `/listy-injection`:
```js
(() => { window.scrollTo(0, document.documentElement.scrollHeight); return 'scrolled'; })()
```
then (after a frame):
```js
(() => {
  const active = document.querySelector('[data-testid=post][data-active="true"]');
  const lastInView = [...document.querySelectorAll('[data-testid=post]')].filter(p => { const r=p.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).pop();
  return { hasActive: !!active, activeId: active?.getAttribute('data-post-id'), lastInViewId: lastInView?.getAttribute('data-post-id'), match: active?.getAttribute('data-post-id') === lastInView?.getAttribute('data-post-id') };
})()
// Expected: hasActive true, and activeId === lastInViewId (the post in view at the bottom).
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(shell)/listy-injection/page.tsx"
git commit -m "Keep last post focused at feed bottom (#H1, R-FEED-3)"
```

---

## Task 3: Diagnose + stop the active-style revert (R-FEED-5)

**Files:**
- Investigate: `src/app/(shell)/listy-injection/page.tsx` (active-post state), `src/components/Posts/Post.tsx:804-814` (the `Paper` active style + 150ms transitions)

> Use **superpowers:systematic-debugging**. §10.4 reports the *inline* style was active (`border 2px rgb(156,184,255)`, elevation, `translateY(-2px)`) while the *computed* style read inactive — i.e. a re-render/transition race, not a static CSS bug. Find the trigger before changing code.

- [ ] **Step 1: Reproduce + instrument**

`preview_eval` while slow-scrolling: poll the active post's inline vs computed border every 100ms for ~2s and record any frame where they disagree:
```js
(() => { const p = document.querySelector('[data-testid=post][data-active="true"]');
  if(!p) return {none:true};
  return { inlineBorder: p.style.border, computedBorder: getComputedStyle(p).borderColor, computedShadow: getComputedStyle(p).boxShadow!=='none', transform: getComputedStyle(p).transform }; })()
```
Confirm whether the revert coincides with (a) React StrictMode double-render, (b) `activePostId` briefly becoming `null`, or (c) the `border-color 150ms` transition mid-flight.

- [ ] **Step 2: Apply the fix indicated by Step 1**

Most likely fix (if the cause is divergence/flicker, not StrictMode): make the active border derive from a single source and avoid transitioning it on identity-stable renders. If the cause is the transition animating on every keyed re-render, scope the transition to elevation only:

```tsx
// Post.tsx Paper style — keep the border instant, animate only elevation/lift:
transition: 'box-shadow 150ms ease, transform 150ms ease',
```

(If Step 1 shows `activePostId` flicking to `null`, fix that in `page.tsx` instead — see Task 4, which removes the divergence at the root.)

- [ ] **Step 3: Verify stability**

Re-run the Step 1 poll across a full scroll; assert `computedBorder` stays `rgb(156, 184, 255)` for the active post on every sample (no inactive `rgb(231, 231, 231)` frames).

- [ ] **Step 4: Commit**

```bash
git add "src/components/Posts/Post.tsx"
git commit -m "Stabilize active-post styling during scroll (#H1, R-FEED-5)"
```

---

## Task 4 (root-cause, also closes Heuristic #4): one source of truth for "active post"

**Files:**
- Modify: `src/app/(shell)/listy-injection/page.tsx`

> The feed keeps a page-local `activePostId` (drives the in-feed border via `Post`'s `activePostId` prop) **and** the context `activePostId` (drives the aside). They are set together in `onScroll`/restoration, but can diverge (StrictMode, restoration timing) → stale aside / border mismatch. Collapsing to one value removes a whole class of H1/H4 bugs.

- [ ] **Step 1: Drive the border from the context value**

Replace reads of the page-local `activePostId` used for *rendering* with the context value, keeping the page-local only as the scroll-heuristic's change-guard (`activePostIdRef`). Concretely, in `renderPost` pass `activePostId={ctxActivePostId}` (the context's `activePostId`, already destructured at line 197) instead of the page-local state, and remove the now-redundant `setActivePostId` render-state where it only mirrored the context.

- [ ] **Step 2: Verify no divergence**

`preview_eval`: after scrolling, assert the post carrying `data-active="true"` is the same id the aside is built from:
```js
(() => {
  const active = document.querySelector('[data-testid=post][data-active="true"]')?.getAttribute('data-post-id');
  const asideFirst = document.querySelector('[data-testid=col-aside] [data-post-id]')?.getAttribute('data-post-id');
  return { active, asideHasContent: !!asideFirst }; // active non-null at every scroll position
})()
```
Scroll top → mid → bottom; `active` must be non-null and stable at each.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(shell)/listy-injection/page.tsx"
git commit -m "Single source of truth for active post (#H1/#H4)"
```

---

## After H1

Update the requirements doc: mark §6 Heuristic-1 rows and R-FEED-3/5 / R-ROBUST-5/7 as addressed, and record the home/search-aside fix as a new regression guard in §5A (so it can't silently revert). Then pick the next plan: **D-EXPAND bounded reveal** (Heuristics 6 & 8) is the next-highest-value cluster.

---

## Self-Review

- **Spec coverage:** H1 rows (focus/aside) → Tasks 1–4. Heuristic #4 (two active-post notions) → Task 4. Redesign-resolved rows (H3 resize, H5 overflow) noted in triage. Remaining rows explicitly deferred with refs. ✓
- **Placeholders:** none — every code step shows the change; Task 3's fix is conditioned on its own diagnostic step (intentional, not a placeholder). ✓
- **Type consistency:** `clear: () => void` defined in Task 1 and used in `default.tsx`; `ctxActivePostId` is the existing destructured name at page.tsx:197. ✓
