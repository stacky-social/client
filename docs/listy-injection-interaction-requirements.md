# `/listy-injection` — Interaction Requirements & Heuristic Evaluation

**Status:** Revised 2026-06-23 — statuses re-verified against branch `listy-injection-main-app` (most `SPEC > CURRENT` items now fixed; see the update note below) · **Date:** 2026-06-16, rev. 2026-06-23 · **Scope:** interaction behavior only
**Purpose:** The behavioral oracle for an agentic test workflow (TestSprite → Playwright). Every normative requirement is written to be turned into an automated assertion; the risk register lists hypotheses for exploratory characterization.

This document is grounded in (a) a full read of the route, the shared `Post` component, `RelatedStacks`, the resizable shell, the highlight store, the mock resolver, and the supporting components, and (b) **live observation of the running app** (`pnpm dev`, unauthenticated, desktop viewport). Live measurements are quoted as evidence in §10.

> **Update — 2026-06-23 (re-verified against branch `tarcode2004/enhancement/listy-injection-main-app`, HEAD `00fbc4c`).** A large batch of fixes has landed since the original draft. Statuses below were re-checked against the **current code** (not commit messages). What's now done: the **shell redesign** (top nav + centered group + ratio slider, R-RESIZE-1..7), the **focus invariant** (R-FEED-3/5), **dead-code removal** (§3.1), **honest counts & dates** (RG-C1/C2), **error-handling hardening** (heuristic #9), **scroll/render perf** (RK-3/5/7), the full **grouping/reorder** mechanics incl. header/footer/dimming (R-REORDER-*), and a **Playwright E2E suite** (so the CLAUDE.md "no test framework" note is stale). Still open: **R-EXPAND-2** (bounded reveal), **R-A11Y-1** (an avatar/name button-in-button remains), **R-ROBUST-9** (off-by-3 highlight, unverified), and several `UNVERIFIED` filter/nav/highlight families. *(R-GROUP-2 / RK-6 scroll-pin was fixed in `65a7edd`.)* **Ratified decisions (2026-06-23):** category tags + F-indicator are **always colored at rest** (supersedes RG-C3 / R-COLOR-1), and **`prefers-reduced-motion` support is intentionally dropped** (R-MOTION-1 / R-EXPAND-5). See §13 for the remaining set.

---

## 1. Scope

**In scope** — the interactions on:
- `/listy-injection` (the feed)
- `/listy-injection/posts/[id]` (the mock-backed post detail)
- The `@aside` related-responses panel on both
- The **app-wide shell redesign** — top nav bar + horizontally-centered (feed + related) group + a single ratio slider — **as it affects these two routes** (the change is global in `Shell.tsx`; documented here where it governs listy layout). See §2.2 and R-RESIZE.

**Out of scope** (per request): sign-in / OAuth, the *destinations/behavior of the nav links themselves* (Home/Search/Bookmarks/Favorites), the live API-backed `/posts/[id]`, and non-listy routes. Auth-dependent side effects are noted only where they change listy behavior. *(The top-nav **container, placement, and responsive overflow** are in scope under D-NAV / R-RESIZE — only where each link points is not.)*

---

## 2. How to read this document

Each requirement is tagged:

- **Priority** — P0 (core to the research interaction), P1 (important), P2 (polish).
- **Status** vs. the *current* build:
  - **`MATCHES`** — current code already behaves as specified; test guards against regression.
  - **`SPEC > CURRENT`** — the spec describes the intended behavior; **current code deviates and the test is expected to fail today**, driving a fix.
  - **`UNVERIFIED`** — needs the test to establish ground truth.
- **Signal** — a concrete thing a Playwright test can assert (selector, computed style, URL, store state).

### Product decisions already made (these set the oracle)
1. **Focus-post expansion (D-EXPAND):** *bounded reveal + scroll-to-span.* Expand up to a cap (~12 lines / ~40vh); if the highlighted span is still below the cap, scroll **within the post box** to it. Do **not** grow the whole post.
2. **Layout & resize — REVISED 2026-06-22 (D-NAV / D-LAYOUT / D-RESIZE / D-RESPONSIVE); supersedes the old center-anchored 3-column model:**
   - **Top nav (D-NAV):** the left nav column is removed; navigation moves to a horizontal **sticky top bar** — **logo + condensed primary items, secondary items behind an overflow menu / avatar dropdown**. The nav-collapse burger is gone. Applies **app-wide** (`Shell.tsx` wraps every `(shell)` route).
   - **Centered content group (D-LAYOUT):** the **feed + related-aside** form a single horizontally-centered group. Group width = `min(100% of available width, MAX_CONTENT_WIDTH)` with **MAX_CONTENT_WIDTH ≈ 1280px (~13in)** — sized for comfortable **eyes-only reading without head rotation** (~30° horizontal scan at a ~60cm viewing distance; HCI best practice). Wider than the max → capped and centered with equal gutters; at/below the max → fills 100% of available width. *(CSS physical `in` is unreliable across displays, so the cap ships as px approximating the inch target.)*
   - **Single ratio slider (D-RESIZE):** exactly **one** vertical slider sits between the feed and related panels and changes the **distribution** of the group's width between them. Default **65% feed / 35% related**. The old 3-divider symmetric-center model is removed.
   - **Persistence:** the split is saved as a **ratio** in `localStorage` (`stacky:feedRatio`, default `0.65`), restored across sessions (per-device); **double-click** the slider resets to 65/35. Replaces the old absolute-px `stacky:centerWidth` / `stacky:relatedWidth` keys.
   - **Responsive (D-RESPONSIVE):** the feed and related stay **side-by-side at all viewport sizes** — the 65/35 ratio scales down to fit 100% width even on small screens (no collapse, no drawer, no vertical stacking). *(HCI caveat: the related panel becomes quite narrow on phones; accepted to always show the feed↔related relationship — see §12.)*
3. **Feed focus (D-FOCUS):** *always exactly one focused post* drives the aside — no empty-aside or no-focus windows at any scroll position.
4. **Back parity (D-BACK):** the in-app Back button and the browser Back button must produce *identical* results (URL, scroll, active post, aside contents).
5. **Reordering (D-REORDER, §5B.1):** trigger = the "N more <Topic>" affordance; matched-above move down adjacent / matched-below up to the top 3; reordering is **permanent** (browser Back is the only undo); group-by **replaces** (never compound); same group-by → "(shown)" no-op; intra-block spans unrelated to the Topic are dimmed.
6. **Authoritative source:** §5B (the team/PI Slack spec + meeting notes) is authoritative and **supersedes** the inferred §3/§5/§7 where they differ.
7. **Grouping presentation (D-DESIGN-1): RESOLVED — keep the current implementation** (the hybrid pill + connector + "N more" + corner label). Diverges from the meeting-notes "Option C"; reconcile with the team. See §5B.2.
8. **Still OPEN:** **D-LABEL-1** "Topic" label format — quotes vs boldface; **D-MOBILE-1** touch equivalents for hover-driven behaviors.

---

## 3. Architecture, terminology, and traps

### 3.1 What actually renders (and what is dead code)
- The feed route [`page.tsx`](../src/app/(shell)/listy-injection/page.tsx) renders the **production `Post` component** ([`Post.tsx`](../src/components/Posts/Post.tsx)) for each feed entry, plus a thread-mode branch that is **legacy fallback** (driven by the `?focus=` query param + an in-page `historyStack`). Primary navigation is real routing: `router.push('/listy-injection/posts/[id]')`.
- ✅ **DELETED (commit `3b98786`, this branch):** the March prototype `ListyInjection/*` (`ListyInjectionShell.tsx`, `FocusPost.tsx`, `RankedPostCard.tsx`, `RankedPostList.tsx`, `listyStore.ts`, `CategorySidebar.tsx`, `constants.tsx`, `highlightUtils.ts`, `HANDOFF.md`) is gone, as are other dead components (`StackCount.tsx`, `Sidebar.tsx`, `asideView.tsx`, `LinkPreviewCard.tsx`, `NavBar/Navbar.tsx`), `utils/emojiMapping.ts`, `useResizableColumns.ts`, the empty root `test`/`test.p` files, unused FakeData, and the `mastodon-api` / `@faker-js/faker` deps. **Tests target `Post.tsx` + `RelatedStacks.tsx` + the route pages.** *(`ResizableDivider.tsx` is retained — it's now the single ratio slider.)*
- Cross-panel state lives in two places:
  - **`RelatedStacksContext`** ([`related-stacks-context.tsx`](../src/app/(shell)/related-stacks-context.tsx)) — `activePostId` + `relatedStacks` for the **aside**.
  - **`highlightStore`** ([`highlightStore.ts`](../src/utils/highlightStore.ts)) — a module-level `useSyncExternalStore` for hover/highlight/filter/anchor state, shared between the center `Post` and the aside `RelatedStacks`.
  - The feed page *also* keeps a **page-local `activePostId`** that drives the in-feed active border/highlight. This local state and the context `activePostId` could previously diverge (stale aside, §10.3); ✅ `bdbd7bf` reworked `related-stacks-context` to read **committed state** (real `state` + ref mirrors instead of a `previousPostId` ref), fixing the `showUpdate` desync and rapid-toggle races (R-FEED-3 / RK-1).

### 3.2 Data (mock fixture)
[`FakeData/listy-injection.json`](../src/app/FakeData/listy-injection.json): **6 entries.** Per entry: `focusPost`, `relatedPosts`, `ancestors` (1 each), `replies` (entry 0 has 15; others 0). Related counts: 15, 13, 12, 10, 5, 5.

- **102 relations, all with a real `topic`.** 45 distinct topics; the distribution is long-tailed — `Manufacturing` (13), `Tariffs` (11), `Affordability` (10), `US auto industry` (10), `Industrial policy` (6) … but **most topics are singletons.** Implication: many highlight tooltips read **"0 more <Topic>"** and the "more like this" grouping finds nothing to cluster on those (see §7, R-GROUP).
- A `Relation` carries two coordinate pairs: **focus**-side (`focusStart/End`, `focusCommentStart/End`) into the focus post's plaintext, and **content**-side (`contentStart/End`, `contentCommentStart/End`) into the related post's text, plus `category` and `topic`.

### 3.3 Terminology
- **Focus post** — the post in the center column the aside is about.
- **Related card / stack** — an item in the aside; a "stack" of size > 1 renders the layered-card visual.
- **Cross-highlight** — hovering a related card paints category-colored `<mark>`s onto the focus post's matching focus-spans.
- **Level 1 / 2** — L1 = card hovered, all its marks bright; L2 = a specific highlight (range) or category hovered within the card, that one bright, siblings dimmed.
- **Span filter (D2)** — clicking a focus-post mark filters the aside to stacks overlapping that span.
- **Anchor / cluster ("more like this")** — clicking a highlight/tag/indicator on a card pins it and clusters same-topic cards around it.

---

## 4. Selector / testability map

**Stable hooks that exist today** (use these in Playwright):

| Hook | Where | Meaning |
|---|---|---|
| `div[data-post-id="<id>"]` | feed wrapper (center) **and** aside card inner Paper | a post; disambiguate center vs aside by x-position or ancestor |
| `[data-related-card]` | aside | one related card container |
| `mark[data-range-id="<i>"]` | focus post + cards | a single-range highlight |
| `mark[data-overlap-bands][data-overlap-range-ids]` | cards | an overlapping multi-range highlight |
| `[data-stack-count]` | `Post` | the stack-count toggle button |
| `[role="separator"][aria-label^="Resize"]` | shell | the **single** feed/related ratio slider (label e.g. "Resize feed and related panels"). *(Post-redesign there is exactly one; pre-redesign there were three.)* |
| `button[aria-label="Go back"]` / Back text | thread/detail | back control |
| `aria-pressed`, `aria-label` on filter chips & indicators | aside | filter / anchor state |

**`data-testid` hooks that EXIST today (verified present in code, this branch):**
- `[data-testid="post"]` on every post Paper, with `[data-active="true|false"]`; the focus post is `[data-testid="post"][data-active="true"]` (R-FEED-2/3/5; for RG-1 assert no `[data-stack-count]` inside it).
- `[data-testid="focus-reveal"]` on the active post's reveal box (R-EXPAND).
- `[data-testid="hover-tooltip"]` on the single shared `HoverTooltip` portal (`HoverTooltip.tsx`) — mounts only while a tooltip is visible; assert ≤1 at any time (R-TIP).
- `[data-testid="top-nav"]` on the sticky top nav bar (`TopNav.tsx`); `[data-testid="nav-overflow-toggle"]` on its overflow menu / avatar dropdown trigger (R-RESIZE-1).
- `[data-testid="content-group"]` on the centered feed+related wrapper (`Shell.tsx`; `MAX_CONTENT_WIDTH = 1280`); R-RESIZE-2/6.
- `[data-testid="feed"]` and `[data-testid="col-aside"]` on the two panels (`Shell.tsx`); R-RESIZE-3/5.

⚠️ **`data-testid` hooks that DO NOT yet exist (must be added before R-FILTER/R-GROUP/R-HL tests can use them):** `RelatedStacks.tsx` currently contains **zero** `data-testid` attributes. `filter-chip`, `related-count`, `card-category-tag`, `span-filter-pill`, `grouped-by-pill`, `more-like-this` are all **absent** — earlier drafts listed these as "verified present," which was wrong. Until they're added, tests must target these via ARIA/role/text (e.g. filter chips by `aria-pressed`; the "Grouped by" pill by text).

> Resize separator: there is exactly **one** `[role="separator"][aria-label="Resize feed and related panels"]` (`ResizableDivider.tsx`), rendered only when an aside is present (`Shell.tsx`). The pre-redesign `col-nav` / `col-center` / `nav-collapse-toggle` hooks no longer exist.

⚠️ **Note for the tester:** `[role="separator"]` also matches every Mantine `<Divider>` in posts. Always filter the resize slider by the `aria-label^="Resize"` prefix.

---

## 5. Normative requirements (the oracle)

### R-FEED — feed & focus invariant
| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-FEED-1 | Load `/listy-injection` → feed shows the hashtag header (`#ChineseEVs`), correct counts (6 Posts / 36 Participants / 60 Responses), and 6 posts. | P1 | MATCHES | text content; `div[data-post-id]` count = 6 |
| R-FEED-2 | On load → exactly one post is **visibly** focused (blue border `rgb(156,184,255)`, elevation shadow, `translateY(-2px)`) and the aside shows that post's related stacks. | P0 | ✅ MATCHES *(was UNVERIFIED)* | first post auto-focused on mount (`listy-injection/page.tsx`, `PostList.tsx`); single `activePostId` ⇒ one active border |
| R-FEED-3 (**D-FOCUS**) | At **every** scroll position — top, mid, bottom spacer — exactly one post is focused and the aside matches that post. No empty aside, no "all-grey" no-focus window, no stale aside. | P0 | ✅ MATCHES *(was SPEC>CURRENT)* | bottom-of-feed pins the last post (`listy-injection/page.tsx` `atBottom`); focus is never cleared on scroll; `@aside/default.tsx` renders null + `clear()` on focus-less routes |
| R-FEED-4 | Scrolling changes the focused post as a new post crosses the active line; the change is monotonic and flicker-free (no rapid toggling of the active border). | P1 | ✅ MATCHES *(was UNVERIFIED)* | active = center-most visible post; `f02e871` removed the per-scroll all-node scan. *(home feed uses an `IntersectionObserver`; the 6-post listy feed still uses a rAF-throttled `getBoundingClientRect` scan over its nodes — correct at that scale.)* |
| R-FEED-5 | The active post's affordance is stable — once focused it stays visibly focused until another post takes over (no transient revert during scroll re-renders). | P1 | ✅ MATCHES *(was SPEC>CURRENT)* | active `border` applied instantly (only box-shadow/transform transition, `Post.tsx`); `React.memo` re-renders only the two posts whose active state flips |

### R-HOVER — cross-highlight & sibling dim
| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-HOVER-1 | Hover a related card → the focus post paints category-colored `<mark>`(s) over the matching focus-span(s); colors match the card's category. | P0 | MATCHES | §10.2: 2 marks lit, framing bg `rgb(224,247,250)` |
| R-HOVER-2 | Hover a related card → **all other** cards dim (opacity ~0.45, grayscale) while the hovered card stays full. | P0 | MATCHES | §10.2: 14/15 cards dimmed, 1 bright |
| R-HOVER-3 | Mouse-leave the card → focus-post marks fade out (200ms) and sibling cards return to full opacity; default state restores. | P0 | MATCHES | opacity returns to 1; marks transparent |
| R-HOVER-4 | The focus post's own marks are present in the DOM in the default state but visually transparent until a cross-highlight/dwell/filter activates them (so cursor events still fire on them). | P1 | MATCHES | `mark` present, computed bg transparent at rest |
| R-HOVER-5 | Hover state survives brushing the inter-card gap / stacked-card shadow layers of the **same** card (no flicker of the highlight when the cursor crosses internal zones). | P1 | UNVERIFIED | the A6 guard in `RelatedStacks` onMouseLeave |

### R-HL — Level-2 (per-highlight) interaction
| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-HL-1 | With a card hovered, hover a specific highlight → after a ~200ms debounce that range stays bright, sibling ranges in the focus post and card dim (~0.2 alpha). | P0 | UNVERIFIED | per-mark computed bg alpha |
| R-HL-2 | While a specific range is hovered, its "comment" substring is bolded (text-shadow) in both the card and the focus post. | P1 | UNVERIFIED | the `focusComment`/`contentComment` span |
| R-HL-3 | Overlapping ranges render as stacked vertical gradient bands; moving the cursor vertically within the mark selects the band under the cursor (and updates the tooltip). | P1 | UNVERIFIED | `mark[data-overlap-bands]`, cursor-Y math |
| R-HL-4 | Hovering a category **tag** (top-left of a card) behaves like hovering all ranges of that category (bright that category, dim others). | P1 | ✅ MATCHES *(was UNVERIFIED)* | tag `onMouseEnter` sets `hoveredCategory`; `buildMultiHighlightNodes` brightens that category to alpha 1, dims others to ~0.2 (`RelatedStacks.tsx`) |

### R-TIP — hover tooltip (the "tool top")
> "Tool top" = the global **hover tooltip** portal (R-TIP). *(The other candidate — the focus post's right-side stack/category-icon column, `StackCount` — has now been **removed entirely**: the component is deleted. See R-NOSTACK-1 / RG-1.)*

| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-TIP-1 | Hover a highlight/tag/"N more"/Grouped-by pill → one floating tooltip appears reading `"N more <Topic>"` (topic bolded in category color), positioned near the cursor and **following the mouse** while visible. | P1 | MATCHES | single portal node; transform tracks mouse |
| R-TIP-2 | Exactly one tooltip exists at a time; leaving the trigger hides it; it is `pointer-events:none` and never blocks clicks. | P1 | MATCHES | one portal; `pointerEvents:none` |
| R-TIP-3 | The tooltip is dismissed when the underlying element is removed (e.g., during a reorder) — it must never strand on screen. | P1 | ✅ MATCHES *(was RISK)* | single shared portal; `hideTooltip` on mark-leave and a `useEffect` on `[relatedStacks]` hides it on dataset change (`RelatedStacks.tsx`); RK-7 mitigated |
| R-TIP-4 | "0 more <Topic>" should not be shown as a useful affordance — singleton topics (common, §3.2) make "0 more" frequent and misleading. | P2 | ✅ MATCHES *(was SPEC>CURRENT)* | clicking a singleton forms **no** block (no header/footer); synthetic count boost is a no-op. Hover on a singleton span shows an honest "0 more Topic"; the greyed "0 more Topic" footer appears only as a block-end sentinel inside an existing block |
| R-NOSTACK-1 (**RG-1**) | The focus post must **not** display the stack/category-count icon column on **either** route. | P1 | ✅ MATCHES *(was SPEC>CURRENT)* | `StackCount.tsx` deleted; **no** `[data-stack-count]` rendered anywhere; routes pass `stackCount={-1}`. *(Feed `PostList` still passes the real count but `Post` renders no icon for any value — harmless.)* |

### R-EXPAND — focus-post reveal (**D-EXPAND**)
| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-EXPAND-1 | The focus post is clamped to 5 lines by default; a "Read more" control appears when it overflows. | P0 | MATCHES | clamp; "Read more" present |
| R-EXPAND-2 (**D-EXPAND**) | Hover a card whose highlight is below the clamp → the focus box grows **at most to the cap (~12 lines / ~40vh)**. If the span is still beyond the cap, the box **scrolls internally to the span**. The post must **not** grow to full height, and the feed/aside below must not be shoved down. | P0 | **SPEC > CURRENT** *(not in the verified fix set)* | a configurable line-clamp landed (`80b19c2`, 10 lines on the full-post view) but the hover **bounded-reveal + scroll-to-span** was not confirmed — re-verify. §10.5 evidence is pre-fix |
| R-EXPAND-3 | When the highlight clears, the box collapses back to the 5-line clamp with a matching animation (no layout jump). | P1 | MATCHES (current grow/collapse) | reveal→collapse transition |
| R-EXPAND-4 | "Read more" (manual) fully un-clamps; "Read less" re-clamps. This is independent of the hover reveal. | P1 | MATCHES | toggle |
| R-EXPAND-5 | ~~Reduced-motion: marks/reveal appear without transitions when `prefers-reduced-motion: reduce`.~~ | P2 | 🚫 **DROPPED — by decision (2026-06-23)** | reduced-motion support is intentionally not implemented; folded into R-MOTION-1 |

### R-FILTER — span filter & category chips
| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-FILTER-1 | Click a focus-post mark → aside filters to stacks whose relations overlap that span; a "Span: …" pill appears; the aside count updates; clicking the same mark again clears it. | P0 | UNVERIFIED | `filterFocusSpan`; pill; count text |
| R-FILTER-2 | Dwell on a focus-post mark ~1500ms (no cross-highlight active) → the mark turns neutral grey and an affordance tooltip "Click to filter related stacks" (or "clear filter") appears at the cursor. | P1 | MATCHES (recent change) | dwell timer; tooltip text |
| R-FILTER-3 | Clicking a mark must **not** also navigate the post (capture-phase handler wins over card click). | P0 | MATCHES | URL unchanged on mark click |
| R-FILTER-4 | Filter chips: first selection sets that category; a second chip ADDs (AND) only if some stack has both categories, otherwise SWITCHes; clicking an active chip removes it. Hover preview dims/lights chips to telegraph add vs switch. | P1 | UNVERIFIED | `filterCategories`; `aria-pressed`; preview styles |
| R-FILTER-5 | The aside count text reflects the active filters precisely ("N posts matching category + span", etc.). | P2 | UNVERIFIED | count string |
| R-FILTER-6 | Span + category filter together compute the "shortest common related text" label shown on each surviving card (D3). | P2 | UNVERIFIED | `shortestCommonText` label |

### R-GROUP — "more like this" anchor / clustering
| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-GROUP-1 | Click a highlight (or category tag, or the top-right F-indicator) → that card becomes the anchor; same-topic cards cluster adjacent to it with a colored connector line + a topic chip; a "Grouped by: <topic>" pill appears. | P1 | ✅ MATCHES *(was UNVERIFIED)* | `handleToggleAnchor` fires from span/tag/F-indicator; `reorderForAnchor` clusters; connector rail + "Topic (N)" header + "Grouped by:" pill all render (`RelatedStacks.tsx`) |
| R-GROUP-2 | The clicked card stays **visually pinned** (no scroll jump) while other cards animate around it. | P1 | ✅ MATCHES *(fixed in `65a7edd`)* | the scroll-pin compensation now targets `[data-testid="col-aside"]` (the `overflowY:auto` aside container, `Shell.tsx`); `useLayoutEffect` adds `scrollTop += delta` before paint so the card holds (RK-6 resolved) |
| R-GROUP-3 | Single-anchor invariant: selecting a new anchor replaces the old; clicking the active anchor (or its × pill) clears it. `reRankAnchorIds.length ∈ {0,1}`. | P1 | ✅ MATCHES | `toggleReRankAnchor` (`highlightStore.ts`): same id → `[]`, different id → `[postId]` |
| R-GROUP-4 | Above/below ordering invariant: matched cards above the anchor stay above; matched below stay below. | P1 | ✅ MATCHES *(was UNVERIFIED)* | `reorderForAnchor` returns `[…aboveUnmatched, …aboveMatched, target, …belowMatched, …belowUnmatched]` |
| R-GROUP-5 | Pagination: only the first 3 (below) matches show; a "N more <Topic>" link adds 3 more per click. | P2 | ✅ MATCHES *(was UNVERIFIED)* | below-set capped at `shownByAnchor ?? 3`; footer "K more Topic" adds `SHOWN_INCREMENT` (3) per click |
| R-GROUP-6 | When a topic has no other matches (singletons, common here) clicking it must give honest feedback — not silently "group" one item or show "0 more". | P1 | ✅ MATCHES *(was SPEC>CURRENT)* | `groupTotalForThis === 0` ⇒ `showBlockDecorations === false` (no block, no header/footer); counts honest |

### R-NAV — navigation, restoration, back parity
| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-NAV-1 | Click a feed post (not on a mark) → save `scrollY:/listy-injection`, `activeFeedPost:/listy-injection`, `previousPath:/listy-injection/posts/<id>`, then route to the detail page. | P0 | MATCHES | §10.6: all three keys set; URL changed |
| R-NAV-2 | Detail page renders: Back control, ancestors w/ thread lines, focus post (clamped, with focus relations), reply box, Time/Recommended/Stacked/Summary tabs, threaded replies, aside with related stacks. | P0 | MATCHES | §10.6 screenshot |
| R-NAV-3 | Click a related card on the feed → route to that post's detail; on the **detail** aside, related navigation appends `?from=<focusId>` and seeds `previousPath`. | P0 | MATCHES | §10.7: URL `…?from=…` |
| R-NAV-4 (**D-BACK**) | In-app Back and browser Back are **identical**: both return to `/listy-injection`, restore scroll, restore the same active post, and repopulate the same aside. | P0 | UNVERIFIED (UI-back ✓ in §10.6; browser-back not yet compared) | URL + scrollY + active id + aside count after each |
| R-NAV-5 | Deep-link entry (`/listy-injection/posts/<id>?from=<y>` with no prior history) → Back still lands somewhere sensible and does not strand the user / leave the SPA unexpectedly. | P1 | **RISK** | `router.back()` with no history depth (RK-2) |
| R-NAV-6 | Navigating into a **related** post (synthetic entry) resolves a coherent focus post + aside; replies/ancestors may be empty but the page is never blank/"Post unavailable" for an id that exists in the fixture. | P1 | UNVERIFIED | §10.7: aside count shifted 15→29→28 — verify intended |
| R-NAV-7 | Rapidly clicking into many posts in succession never crashes, never shows the Next error overlay, and always lands on a coherent page. | P1 | MATCHES (3-hop live, no crash) | §10.7; no error overlay |
| R-NAV-8 | URL state on detail round-trips: `?tab`, `?fc`, `?fs`, `?from`, `?stackId` hydrate on load (with `?fs` deferred until post text loads) and write back debounced via `router.replace`. | P1 | ✅ MATCHES *(hardened; round-trip parity still worth a test)* | `bdbd7bf`: write-effect deps include `searchParams`/`router`; debounce cleared unconditionally; non-integer `?fs` rejected (`useUrlSync`) |

### R-RESIZE — app-wide layout: top nav + centered feed/related group + ratio slider (**D-NAV / D-LAYOUT / D-RESIZE / D-RESPONSIVE**, revised 2026-06-22)
> Supersedes the old center-anchored 3-column shell. ✅ **The redesign has LANDED on this branch** (`80b19c2`): a sticky top nav (`TopNav.tsx`), a centered `content-group` (`MAX_CONTENT_WIDTH = 1280`, `Shell.tsx`), and a single ratio slider (`stacky:feedRatio`, default 0.65). All rows below now **MATCH** — they are regression guards.

| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-RESIZE-1 (**D-NAV**) | App chrome shows a **horizontal sticky top nav bar** (logo + condensed primary items; secondary items behind an overflow menu / avatar dropdown). There is **no left nav column** and **no nav-collapse burger** on any route. | P0 | ✅ MATCHES *(was SPEC>CURRENT)* | `data-testid="top-nav"` sticky bar + `nav-overflow-toggle` (`TopNav.tsx`); no left nav, no burger |
| R-RESIZE-2 (**D-LAYOUT**) | The **feed + related** render as one **horizontally-centered group**. Group width = `min(100% of available width, MAX≈1280px)`. Wider than the max → capped and centered with **equal gutters**; at/below the max → fills **100%**. | P0 | ✅ MATCHES *(was SPEC>CURRENT)* | `content-group`: `maxWidth: MAX_CONTENT_WIDTH (1280)`, `width:100%`, `margin:0 auto` (`Shell.tsx`) |
| R-RESIZE-3 (**D-RESIZE**) | Exactly **one** vertical slider sits between feed and related; dragging it changes the **ratio** of group width between them. Default split = **65% feed / 35% related**. | P0 | ✅ MATCHES *(was SPEC>CURRENT)* | one `[role="separator"][aria-label="Resize feed and related panels"]`; `feed`/`col-aside` `flexGrow: ratio / 1-ratio`; default 0.65 |
| R-RESIZE-4 (**persistence**) | The split persists as a **ratio** in `localStorage` `stacky:feedRatio` (default `0.65`), restored across sessions; **double-click** the slider resets to 65/35. The old `stacky:centerWidth` / `stacky:relatedWidth` keys are gone. | P1 | ✅ MATCHES *(was SPEC>CURRENT)* | `useFeedRatio` LS key `stacky:feedRatio`; `onDoubleClick` → reset to 0.65; old keys unused |
| R-RESIZE-5 (**D-RESPONSIVE**) | Feed and related stay **side-by-side at every viewport size** — the 65/35 ratio scales down to fit 100% width even on phones. **No** collapse, drawer, or vertical stacking. | P1 | ✅ MATCHES *(was SPEC>CURRENT)* | flex row, `flexBasis:0`, `minWidth:0`, no `@media`/column-stack; container-query collapse keeps tags compact (`globals.css`). *(Aside is `display:none` only when no post is focused — deliberate, not a viewport stack.)* |
| R-RESIZE-6 (**max-width rationale**) | The group never exceeds **MAX≈1280px (~13in)** on wide screens — sized for comfortable eyes-only reading without head rotation (~30° horizontal scan @ ~60cm; HCI). | P1 | ✅ MATCHES *(was SPEC>CURRENT)* | `maxWidth: 1280` caps the group at 1920px+ |
| R-RESIZE-7 (**no overflow**) | At **any** viewport and **any** saved ratio, nothing overflows horizontally: the group and both panels fit; no horizontal scrollbar; the slider is always reachable on-screen. | P0 | ✅ MATCHES *(was SPEC>CURRENT)* | `body { overflow-x:hidden }`, both children `minWidth:0`, group `box-sizing:border-box` (`Shell.tsx`/`globals.css`) |

### R-A11Y / R-MOTION — accessibility & secondary controls
| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-A11Y-1 | No invalid interactive nesting: a card must not place a `<button>`/`Anchor component="button"` inside another button. | P1 | **SPEC > CURRENT** *(partially fixed)* | the outer card is now a `motion.div` (not a button), but an **avatar/display-name `UnstyledButton` nested inside another `UnstyledButton`** remains in `RelatedStacks.tsx` — still invalid `<button>`-in-`<button>` |
| R-A11Y-2 | Interactive controls expose roles/labels: filter chips `aria-pressed`; back `aria-label`; highlight close buttons ≥24px hit target. | P1 | PARTIAL *(improved)* | ✅ filter chips now have `aria-label`+`aria-pressed`; ✅ close/dismiss targets ≥24px. Remaining: `RelatedStackCount` + reply `TextInput` lack `aria-label`; `BackButton` has no explicit `aria-label` (relies on visible text) |
| R-A11Y-3 | Keyboard: feed post is reachable (`role=button`, `tabIndex=0`, Enter/Space navigate); `InteractionControl` supports Enter/Space; visible focus outline exists. | P1 | PARTIAL *(improved)* | ✅ feed post + `InteractionControl` are both `role=button`/`tabIndex=0` with Enter+Space. Remaining: `InteractionControl` still has **no `:focus-visible` outline** |
| R-A11Y-4 | Threaded replies convey nesting to assistive tech (currently only a visual `threadLine`, `aria-hidden`). | P2 | **SPEC > CURRENT** | still no `role=tree`/`list`/`region`; only the visual `aria-hidden` connector |
| R-MOTION-1 | ~~All highlight/reveal/reorder animations respect `prefers-reduced-motion`.~~ | P2 | 🚫 **DROPPED — by decision (2026-06-23)** | reduced-motion support intentionally not implemented (no `prefers-reduced-motion` in `src`). *(Known WCAG 2.3.3 / vestibular gap — revisit if the audience needs it.)* |

---

## 5A. Regression guards — intentional decisions that must NOT revert

Each row below is a deliberate UI/UX decision that has silently reverted, or could. An automated tester won't check that something stayed *absent* or *repositioned* unless told to — so each one needs an explicit "assert it stayed gone/moved" test. The usual revert vector is a merge into this area (e.g. `Merge listy-injection-main-app …`, or the `resizable-shell` layout rewrite `28fd612`).

**Confirmed regressions (observed live, this build):**

| ID | The intended state | What's wrong now | Refs |
|---|---|---|---|
| RG-1 = R-NOSTACK-1 | ✅ **FIXED.** The focus post shows no stack/category-icon column on any route. | `StackCount.tsx` deleted; all routes pass `stackCount={-1}`; no `[data-stack-count]` rendered anywhere. **Keep the guard test.** | §10.10 (pre-fix) |
| RG-2 *(obsolete after redesign)* | ~~burger at the right edge of the left panel, clear of the logo~~ | **Superseded by D-NAV:** the redesign removes the left nav and the burger entirely, so this guard no longer applies. Drop the test once the top nav ships. | §10.9 |

**Candidate guards inferred from recent branches/commits — please CONFIRM or correct (these are the most likely "did our deliberate change survive?" items):**

| ID | Suspected intended decision | Where it lives / how to assert | Source signal |
|---|---|---|---|
| RG-C1 ✅ **landed** | **Honest counts** — no synthetic inflation of "N more"; displayed counts equal real counts. | `getSyntheticTopicCount`/`getSyntheticCategoryCount` are now **no-ops returning the real count** (`RelatedStacks.tsx`). Keep the guard. | ties to R-TIP-4, R-GROUP-6 |
| RG-C2 ✅ **landed** | **Honest dates** — date formatting reflects real timestamps (no "in ~3 hours ago"). | `formatPostDate` clamps future/clock-skew → "just now" and uses `addSuffix` (`bdbd7bf`). Keep the guard. | — |
| RG-C3 🔄 **REVERSED — ratified 2026-06-23** | ~~Neutral card tags until panel hover~~ → decision changed: multi-category cards show their **category color at rest**. | `panelHovered` was **removed** (`bbbfd95`) so the icon↔highlight color legend is always visible. **New guard:** assert tags + F-indicator are **always colored at rest** (see R-COLOR-1). | merge `…/neutral-card-border` (superseded) |
| RG-C4 ✅ **landed** | **F-indicator topic matches the "Grouped by" pill** (no stale/mismatched label). | both resolve from `activeAnchorTopic` (`RelatedStacks.tsx`). Keep the guard. | merge `…/fix-f-indicator-topic` |
| RG-C5 *(holds; not re-verified)* | **Route-based navigation supersedes the old `?focus=` in-page thread mode.** | `router.push` is primary; the `?focus=` path remains a legacy fallback (§3.1). | merge `…supersede ?focus=` |
| RG-C6 *(holds; not re-verified)* | **A1 guard** — an unresolvable post id never yields a blank/crashed page. | `mockPostResolver` → "Post unavailable" fallback. | merge `…/bug/group-a-robustness` |

> **Action for author:** confirm whether RG-C1…C6 belong here, correct their "intended state," and **add any other deliberate removals, repositionings, or suppressions you've made.** Those are exactly the changes an automated suite would otherwise let silently revert — this table is the safety net against merge-clobbering.

---

## 5B. Canonical team specification (Slack thread — JSALT, June 2026)

> **Authority:** This section captures the team/PI (Jason) requirements and the meeting notes faithfully and is **authoritative**. Where it refines or contradicts the inferred §3/§5/§7, **this section wins**; cross-refs note supersessions. Context is time-pressured — prioritize the P0/P1 robustness + reordering items. Each item is tagged `[Pri · Status]`.

### 5B.1 Reordering / grouping — agreed mechanics (authoritative; supersedes §7 inference & R-GROUP)
The trigger and mechanics are the same for **both** candidate presentations (5B.2):

- **R-REORDER-1** `[P0 · ✅ MATCHES]` — Grouping is triggered by clicking the **"N more <Topic>"** affordance (tooltip / block footer / span / category tag / F-indicator) — **not** a generic "see more".
- **R-REORDER-2** `[P0 · ✅ MATCHES]` — **Posts above the target:** *all* matching posts above the target move down to sit **immediately above** it, preserving relative order (no cap on the above-set). *(Confirmed: `reorderForAnchor` emits `…aboveMatched, target`.)*
- **R-REORDER-3** `[P0 · ✅ MATCHES]` — **Posts below the target:** matching posts below move up to sit **immediately below** it — only the **top 3** (paginated).
- **R-REORDER-4** `[P1 · ✅ MATCHES]` — The target and its matches form a single **contiguous block** in reading order.
- **R-REORDER-5** `[P0 · ✅ MATCHES]` — **Permanence:** reordering is **permanent** — clearing the group does **not** restore the pre-group order; the browser Back button is the only undo. *(Confirmed: `baseOrderRef` re-captured at every transition; no order-history stack.)*
- **R-REORDER-6** `[P1 · ✅ MATCHES]` — **Prevalence count (ratified 2026-06-23):** the "Topic (N)" header shows the **topic total** — anchor + *all* matching posts in the panel (`blockTotalCount = 1 + groupTotal`), including paginated-out below-matches. N stays fixed; the footer "K more Topic" counts the not-yet-shown remainder down to "0 more". *(Not the on-screen block size.)*
- **R-REORDER-7** `[P1 · ✅ MATCHES]` — **Pagination:** each click of the footer "K more Topic" reveals **3 more** posts at the bottom of the block.
- **R-REORDER-8** `[P1 · ✅ MATCHES]` — **Switching group-by:** picking a **different** Topic abandons the prior grouping (never compounds); the current visible order becomes the new baseline. *(D-ALG-6.)*
- **R-REORDER-9** `[P2 · ✅ MATCHES]` — **Re-picking the same group-by:** the affordance reads **"N more Topic (shown)"** and clicking is a **no-op**; the guard fires at every entry point (span / tag / F-indicator), while toggling-off the active anchor still works.
- **R-REORDER-10** `[P1 · ✅ MATCHES]` — **Intra-block span dimming:** within the block, spans whose topic ≠ the active one drop to ~0.2 opacity; hovering a span un-dims it.
- *Assumption / goal:* users read top-to-bottom, so the design minimizes re-exposing posts they've already scrolled past.

### 5B.2 Grouping presentation — RESOLVED (D-DESIGN-1): keep the current implementation
**Decision (Tarik):** the grouping presentation as currently built is accepted — no redesign. The current implementation is a **hybrid** of:
- a "Grouped by: \<topic\>" pill,
- a colored connector line nesting matches under the anchor,
- a "N more \<topic\>" link, and
- an F-indicator corner label, "Topic (N)".

Tests should assert **this** behavior — it's a regression-guard oracle, not a `SPEC>CURRENT` rebuild. The two designs originally discussed are recorded below for reference.

**Option B — header/footer block (nested / middle column):**
- Header **"Topic (N)"** at the top of the block (only if it holds more than one post).
- Footer **"M more Topic"** at the bottom; clicking it adds 3 more at the block's bottom. If M=0, show an **unclickable "0 more Topic"** to mark the end of the block.
- An **"x" next to the header** removes the block decoration (header, footer, Topic-dimming) **without reordering** — permanence (R-REORDER-5) still holds.
- A vertical line extends down from the anchor post's left edge; matches nest under it.

**Option C — stateless corner-label (simplest / right column; Jason currently leans here):**
- **No outline or nesting, no header/footer.**
- Clicking a highlight reorders (5B.1): 2–3 matches **fly up from the bottom** to land just below the clicked post, and already-passed matches may **fly down** to just above it (details TBD).
- The clicked post and its new neighbors get a **corner label "Topic (N)"** (upper-right) as a prevalence indicator; the label **disappears on the next click**.
- Clicking a corner label pulls in **2–3 more** posts to join the block.

> **Resolved to "current."** Note that this **diverges from the meeting notes** ("switch to the 3rd option" = Option C) and from Jason's lean toward C — reconcile with the team before final sign-off. ✅ **The decorations once listed as "not yet built" have now landed** (`bc9bcc5`): the "Topic (N)" header (with an × that dismisses the block), the greyed "0 more Topic" footer sentinel, the same-topic "(shown)" no-op, and intra-block span dimming (R-REORDER-6/9/10). *(One nuance: the header × clears the anchor entirely rather than only the decorations — the order still persists, since reordering is permanent.)*

### 5B.3 Tooltips
- **R-TIP-5** `[P1 · ✅ MATCHES]` — **Double-tooltip fixed:** one shared `HoverTooltip` portal (mounted once; `mountCount>1` warns); tag-hover and text-hover both call the same `showTooltip` (last-writer-wins) → a single cursor-following instance.
- **R-TIP-6** = **D-LABEL-1** (OPEN) — "Topic" label format is undecided: **quotes** — `N more "Topic"` (meeting notes) — vs **boldface** — `N more `**`Topic`** (Jason leans this way, since it matches the block header). Apply whichever form is chosen consistently across the tooltip, header, footer, and corner label.

### 5B.4 Related-panel robustness (bug list — mostly SPEC>CURRENT)
- **R-ROBUST-1** `[P1 · ✅ MATCHES]` — Clicking a per-card category/contribution-type tag now **reorders** (anchors the card) — `tag onClick → handleToggleAnchor` (`RelatedStacks.tsx`).
- **R-ROBUST-2** `[P0 · ✅ MATCHES]` — **No crash** when interacting with a related card: the `onMouseLeave` guard tolerates a non-`Node` `relatedTarget` (`RelatedStacks.tsx`); feed virtualization also prevents the heavy-session crash.
- **R-ROBUST-3** `[P1 · ✅ MATCHES]` — The block's **"x"/close control works** and meets a ≥24px hit target (`minWidth/minHeight: 24` on the clear/dismiss controls).
- **R-ROBUST-4** `[P1 · UNVERIFIED]` — **Hover-dim persists** for the whole interaction. *(The crash/`relatedTarget` guard is in place; persistence-across-zones not separately verified — = R-HOVER-5.)*
- **R-ROBUST-5** `[P0 · ✅ MATCHES]` — **Back / focus-less routes** never show "related-for-nothing": `@aside/default.tsx` renders null + `clear()`; `home/@aside` returns null when no active post. *(= D-FOCUS.)*
- **R-ROBUST-6** `[P0 · ✅ MATCHES — re-test the comment repro]` — A post with no related stacks now renders a "No related posts found" panel (view never breaks); `fetchContext` coerces ancestors/descendants to arrays so a bad shape can't throw. *(Re-test the original "click a comment" repro to confirm closed.)*
- **R-ROBUST-7** `[P0 · ✅ MATCHES]` — **"No post focused" never renders the panel** — the aside is gated on `activePostId` (`@aside/default.tsx`, `home/@aside`). *(= D-FOCUS / R-FEED-3.)*
- **R-ROBUST-8** `[P0 · ✅ MATCHES — root cause fixed]` — `isTouch` was derived from touch *capability* (nonzero on touch-capable-but-mouse Linux/Windows laptops), which made every hover handler early-return. `f34ee42` makes it **adaptive** (init from `any-hover`/`any-pointer`, follow the most recent real pointer); `f02e871` moved touch detection to `pointerdown`. *(Can't run Linux Chrome in CI, but the root cause is addressed.)*
- **R-ROBUST-9** `[P1 · SPEC>CURRENT — not re-verified]` — **Highlight alignment off by ~3 chars.** Offsets computed against plaintext but applied to `<p>`-wrapped HTML (resolver wraps content as `` `<p>${content}</p>` ``). The `<p>`-wrap normalization was **not** part of the verified fix set — treat as still-open and re-verify against `renderMultiHighlightHtml` / `mockPostResolver`. *(Makes RK-4 concrete.)*

### 5B.5 Filtering — default behavior (refines R-FILTER-4)
- **R-FILTER-7** `[P1 · UNVERIFIED]` — Clicking a related-type at the **top of the side pane**: if combining it with the current selection still leaves a **non-empty** list, **ADD** it as a filter; otherwise **SWITCH** to it.
- **R-FILTER-8** `[P1 · UNVERIFIED]` — **Hover preview (before click)** telegraphs ADD vs SWITCH by previewing the resulting button state — light up the hovered button and turn others off as appropriate. *(Mobile / no-hover: see 5B.11.)*
- **R-FILTER-9** `[P1 · UNVERIFIED]` — **Highlight → filter:** hovering a focus-post span shows a **neutral** highlight; **clicking** it **filters** the related panel to posts related to that span. The side panel then shows the **shortest common related text**, truncated with "…" if there is only one related span or it is too long. *(D2 / D3.)*

### 5B.6 Related-type indicator color (= confirmed RG-C3 / R-HL-4)
- **R-COLOR-1** `[P1 · ✅ MATCHES — spec ratified 2026-06-23]` — Category tags and the F-indicator are **always shown in their category color at rest** (single *and* multiple types). The earlier "neutral until panel hover" rule (`panelHovered`) was **removed** (`bbbfd95`) so the icon↔highlight color legend is always visible — **confirmed as the intended behavior.** *(Supersedes RG-C3.)*

### 5B.7 Reply threading
- **R-THREAD-1** `[P2 · PARTIAL]` — A stable Twitter-style connector line now renders on **ancestor chains** (behind the cards, centered on the avatar column; `posts/[id]` + `listy-injection/posts/[id]`). *Gaps:* the **reply tree** gets no connector, and there's no assistive-tech nesting (see R-A11Y-4).*

### 5B.8 Share / bookmark persistence
- **R-SHARE-1** `[P1 · UNVERIFIED]` — Sharing or bookmarking a **filtered** related panel **preserves the list order**.
- **R-SHARE-2** `[P1 · UNVERIFIED]` — Sharing or bookmarking a **related post** saves the **focus + related pair, with highlights**.
- **R-SHARE-3** `[P2 · PROPOSED]` — *(Jason)* Revisiting a focused post via **ordinary click navigation** restores the **most recent view** (list order + scroll), as if returning to a bookmark. *(Confirm scope; relates to R-SHARE-2 and the §10.6 scroll/active restoration.)*

### 5B.9 URL / browser navigation (refines R-NAV-4/8 + `URL_SCHEMA.md`)
- **R-URL-1** `[P0 · UNVERIFIED]` — **Browser Back restores the entire view.** *(= D-BACK / R-NAV-4.)*
- **R-URL-2** `[P1 · PARTIAL]` — **The URL reflects the current screen** — focused post, view, filters (`fc`), span (`fs`), and group-by. *(The `anchor`/`show` params reserved in `URL_SCHEMA.md` are still unwired.)*
- **R-URL-3** `[P1 · MATCHES]` — **Each post and view has its own URL route.** *(Route-based nav is already in place.)*

### 5B.10 Contribution types (Agree / Predictions …) as a group dimension — NOT tonight's priority
- **R-CONTRIB-1** `[P2 · future]` — *(meeting notes)* Evidence/Agree-style buttons on related posts behave like hovering a highlight (preview/filter); **clicking groups by that dimension**.
- **R-CONTRIB-2** `[P2 · future]` — *(Jason refinement)* Treat contribution types **exactly like topics**: hover → "N more Predictions"; click → **rerank** (pull the next 3 into a Predictions block), depth-first — **not** restrict.
- **D-CONTRIB-1** — Two **restrict** paths remain: (a) clicking a highlighted span in the **main feed**, and (b) clicking a contribution type at the **top of the side pane**. Clicking a **specific post** in the side pane always **reranks** (forms a block). *(Jason flagged this whole subsection as not a priority for tonight.)*

### 5B.11 Mobile / no-hover — OPEN QUESTION (D-MOBILE-1)
Hover drives previews (R-FILTER-8), tooltips (R-TIP), the neutral highlight (R-FILTER-9), and the color reveal (R-COLOR-1). **What is the touch / no-hover equivalent?** (Jason asked; still unresolved.) The code has an `isTouch` tap-to-activate path, but how it should map to these hover-driven behaviors needs a decision.

### 5B.12 Decisions added/affirmed (consolidated into §2)
- **D-REORDER** (5B.1): trigger = "N more"; above-matches move down / below-matches take the highest 3; **permanent (Back = the only undo)**; prevalence count; +3 pagination; **replace, don't compound**; same-topic → "(shown)" no-op; intra-block dimming.
- **D-DESIGN-1** (5B.2): grouping presentation — **RESOLVED: keep the current hybrid** (block + corner-label). Diverges from the meeting notes' Option C; reconcile with the team.
- **D-LABEL-1** (5B.3): label format — **OPEN**: quotes vs boldface (Jason leans boldface).
- **D-FOCUS**: reaffirmed (R-ROBUST-5/7).
- **D-CONTRIB-1** (5B.10): restrict-vs-rerank split — **future**.
- **D-MOBILE-1** (5B.11): touch equivalents for hover-driven behaviors — **OPEN**.

---

## 6. Heuristic evaluation (Nielsen) — observed issues mapped

| # Heuristic | Finding | Severity | Refs |
|---|---|---|---|
| **1. Visibility of system status** | ✅ **RESOLVED.** Bottom-of-feed now pins the last post; the active border is instant and stable; the aside always matches the focused post. | ~~High~~ → fixed | R-FEED-3/5 |
| **1. Visibility** | ✅ **RESOLVED.** Singletons no longer form a fake block and counts are honest, so "0 more" is no longer surfaced as a useful affordance. | ~~Med~~ → fixed | R-TIP-4, R-GROUP-6 |
| **2. Match to real world** | ⚠️ **Partly addressed (latent).** Synthetic *counts* are neutralized (RG-C1), but `SYNTHETIC_TOPIC_POOLS` still fabricates off-domain ("4-day work week") topic *labels* when a relation lacks `topic`. Latent on this corpus (every relation has a topic) — **consider removing the pool before release.** | Low (latent) | §7, `RelatedStacks.tsx` |
| **3. User control & freedom** | ✅ **Resize resolved** by the redesign (one intuitive ratio slider; saved-width-override + overflow gone). ⚠️ Back-from-deep-link strand still open. | ~~High~~/Med → mostly fixed | R-RESIZE, RK-2 |
| **4. Consistency & standards** | ✅ **RESOLVED.** The two-active-post desync is fixed (context reads committed state); the non-standard symmetric resize is gone (single one-edge slider). | ~~High~~/Low → fixed | R-FEED-3, R-RESIZE |
| **5. Error prevention** | ✅ Viewport overflow fixed (no-overflow invariant). ⚠️ Button-in-button only **partly** fixed — outer card no longer a button, but an avatar/name nested button remains. | ~~High~~ → mostly fixed | R-RESIZE-7, R-A11Y-1 |
| **6. Recognition over recall** | ⏳ **Still needed.** Bounded-reveal / scroll-to-span (D-EXPAND) not confirmed; without it the post can still balloon. | Med | R-EXPAND-2 |
| **7. Flexibility & efficiency** | ✅ Touch detection reworked to be adaptive (hover-capable-but-touch machines hover correctly; RK-8 mitigated). Still a separate path — watch parity. | Med → improved | RK-8, R-ROBUST-8 |
| **8. Aesthetic & minimalist** | ⏳ **Still open.** Deep-highlight full-expansion persists until R-EXPAND-2 lands. | Med | R-EXPAND-2, §10.5 |
| **9. Help users recover from errors** | ✅ **Largely resolved.** mastoActions time out (10s) and surface failures; like/save/bookmark revert + notify; the callback page shows a failure state + Back-to-login link instead of an infinite spinner. ⚠️ Residual: `ReplySection` feedback POST and one share-copy path still fail silently on the mock. | ~~Med~~ → mostly fixed | §8 |
| **10. Help & documentation** | Unchanged — the aside hint + eye-cursor are nice; verify discoverability. | Low | — |

> **Status (2026-06-23):** the High-severity findings (rows 1, 4, 5) are resolved or mostly resolved on the `listy-injection-main-app` branch; the layout-redesign (D-LAYOUT/D-RESIZE) shipped. The remaining real items are **R-EXPAND-2** (bounded reveal, rows 6 & 8), the residual **button-in-button** (row 5 / R-A11Y-1), the latent **synthetic topic labels** (row 2), and back-strand (row 3 / RK-2).

---

## 7. Reordering / grouping algorithm — design decisions & implications

> **§5B.1 is the authoritative reorder spec** (team/PI). This section is the implementation-level analysis that supports it — read them together; where they differ, §5B wins.

The "more like this" feature (`RelatedStacks` §E + [`reorderForAnchor.ts`](../src/utils/reorderForAnchor.ts)) is the most decision-laden interaction. Decisions, and the implications worth testing:

**D-ALG-1 — Single anchor only.** `reRankAnchorIds.length ∈ {0,1}`; a new anchor replaces the old. *Implication:* you cannot build nested/compound clusters; the `anchorParent`/indent machinery is effectively dormant. Test: selecting anchor B while A is active clears A entirely.

**D-ALG-2 — Match key is topic, with a content-similarity fallback.** If the anchor was created from a specific highlight range, matching uses that range's `topic` (via `topicOf`, which falls back to a synthetic topic when absent). Otherwise it falls back to Jaccard-ish word overlap (`similarityScore`, threshold 0.15, stop-words removed). *Implications:*
- On this corpus every relation has a topic, so the similarity fallback is rarely exercised — but it *is* the path for anchors created by card-body taps without a range. Test both paths.
- Topic match is **exact string equality** on topic names. Near-duplicate topics ("Affordable EVs" vs "Affordable EV access" vs "Affordable models" vs "Affordable EVs abroad") do **not** cluster together though a human would group them. This is a real recall limitation worth documenting.

**D-ALG-3 — "Above stays above, below stays below"** (`reorderForAnchor`). Matched cards above the anchor are moved to *just above* it; matched below to *just below*; non-matched keep relative order. *Stated intent:* don't re-expose already-scrolled-past items by yanking them below the anchor. *Implication / tension:* matched-above cards are pulled **down toward the anchor**, so if the anchor is near the top of the viewport, previously-passed cards can re-enter view right above it. The invariant preserves *order*, not *off-screen-ness*. Test: with the anchor mid-list, assert relative above/below partition; with the anchor near top, characterize whether above-matched cards visibly jump into view.

**D-ALG-4 — Visual pinning of the clicked card.** On anchor toggle, the clicked card's `layout` animation is disabled and `scrollTop` is compensated in `useLayoutEffect` (via `absoluteOffsetTop`) so it doesn't move; others animate. ✅ **FIXED (RK-6, `65a7edd`).** The compensation now targets `[data-testid="col-aside"]` — the redesigned shell's `overflowY:auto` aside container (`Shell.tsx`, `ref={asideRef}`) — so `scrollTop += delta` runs before paint and the clicked card stays pinned across a rerank.

**D-ALG-5 — Pagination (3 + "N more").** Only 3 below-matches show initially. ✅ **Now honest (R-GROUP-6 MATCHES):** a singleton anchor (0 other matches) yields `showBlockDecorations === false` — no block, no header/footer, no "0 more" affordance — so a topic that groups nothing no longer shows a misleading "Grouped by" cluster.

**D-ALG-6 — Base-order capture.** When a new anchor activates, the *currently visible* order is captured as the new base (`baseOrderRef`) so re-ranking layers on what the user sees, and filters apply *after* re-ranking so filtering never breaks group connectivity. Test: anchor → filter → clear filter returns to the anchored order, not the server order.

---

## 8. Supporting components (behavior the tester must account for)

- **`fetchPostData` (every `Post`)** ✅ no longer refetches each post's full status on mount — `Post` reads `mediaAttachments`/counts/flags from **props** (`ac45c0b`), so the authenticated "404 flood / latency" problem (RK-5) is gone. `fetchPostData` now runs **only after an interaction** (like/save) and is guarded against post-unmount `setState`.
- **`mastoActions`** ✅ favourite/bookmark now take a 10s timeout and return a `ToggleResult`; callers (`RepliesStack`, `RelatedStacks`, `Post`) revert optimistic UI and notify on failure. *(There is no `toggleBoost` helper — only favourite + bookmark.)*
- **`getCurrentUser()`** ✅ new SSR-safe helper replacing unguarded `JSON.parse(localStorage.currentUser)` in annotation / `AnnotationModal` / `SubmitPost` / listy detail. *(One raw parse remains in `listy-injection/page.tsx`, but inside a try/catch.)*
- **`ReplySection`** ✅ uses a stable key for simulated replies. ⚠️ Still debounce-POSTs `…/posts/feedback`; on the mock route this **fails silently** (console-only, no user notification) — the main remaining silent-failure path.
- **`StackPostsModal`** ✅ now keeps a master substack list with a derived filtered view (in-place search resets correctly) and uses a Mantine `<Modal>` (focus trap by default). ⚠️ Still renders `dangerouslySetInnerHTML`; still 404s on the mock backend.
- **`AnnotationModal`** ✅ the shadowed module-level `questions` const was removed. ⚠️ The question-fetch is **still commented out** → always "No questions available"; submit needs auth.
- **`useUrlSync`** ✅ hardened (`bdbd7bf`): write-effect deps include `searchParams`/`router`; the debounce timer is cleared unconditionally; non-integer `?fs` offsets are rejected (`Number.isInteger`). Still hydrates once per pathname; `?fs` deferred until post text loads and clamped against it.
- **`BackButton`** renders only if `previousPath:<pathname>` exists in sessionStorage and calls `router.back()` (history pop → feed remount → restoration reads `scrollY`/`activeFeedPost`). UI-back and browser-back share the restoration path, so parity is *plausible* — **R-NAV-4 still needs the explicit comparison**, incl. the deep-link-no-history edge (RK-2).
- **`mockPostResolver`** ✅ now also wires each entry's `ancestors` array (not just `inReplyToId`), so mock ancestors render on the focused view. Resolves any fixture id → focus post; reply → inherits parent stacks; related post → synthetic siblings; absent id → "Post unavailable".

---

## 9. Risk register (hypotheses to characterize — not pass/fail)

| ID | Hypothesis to probe | Seed evidence |
|---|---|---|
| RK-1 | ✅ **Mitigated.** Focus/aside desync fixed — context reads committed state; active = center-most visible post; bottom-of-feed pinned. | R-FEED-3; §10.3 (pre-fix) |
| RK-2 | ⏳ **Open.** Back from a deep link (`?from=` seeded, no real history) may strand — `router.back()` with no depth. | §8 BackButton |
| RK-3 | ✅ **Fixed.** Active-affordance flicker gone — instant border + `React.memo` + IntersectionObserver replaced the per-scroll re-render churn. | §10.4 (pre-fix) |
| RK-4 | ⏳ **Open / unverified.** Highlight injection matches by substring on HTML; the off-by-3 `<p>`-wrap case (R-ROBUST-9) was **not** in the verified fix set. | `renderMultiHighlightHtml` |
| RK-5 | ✅ **Fixed.** `Post` no longer refetches per-mount status (reads media from props) → no authenticated 404 flood / latency. | §8 |
| RK-6 | ✅ **Resolved (`65a7edd`).** Anchor scroll-pin retargeted to `[data-testid="col-aside"]` (the redesigned shell's `overflowY:auto` scroll container) → the clicked card is pinned again (R-GROUP-2 MATCHES). | §7 D-ALG-4 |
| RK-7 | ✅ **Mitigated.** Single shared tooltip portal hidden on mark-leave and on `relatedStacks` change → no orphan (R-TIP-3). | R-TIP-3 |
| RK-8 | ✅ **Improved.** `isTouch` now adaptive (hover-capable-but-mouse devices hover correctly); still a separate path — watch parity. | `RelatedStacks` pointer handlers |
| RK-9 *(obsolete after redesign)* | ~~Symmetric center-resize perceived as broken~~ — moot under the single one-edge ratio slider. | §10.1 |
| RK-10 | ⏳ **Open / unverified.** Synthetic-entry drill-down changes related-set size (15→29→28) — confirm intentional, not duplication. | §10.7 |
| RK-11 | ⏳ **Open / unverified.** StrictMode double-mount vs the reworked focus/scroll effects — re-baseline. | §10.3-4 |
| RK-12 | **Still relevant.** Merge-revert of deliberate UI decisions — RG-1 now fixed (keep its guard); RG-2 obsolete; RG-C1/C2/C4 landed; RG-C3 reversed. Re-run §5A guards on every merge. | §5A |

---

## 10. Live-observation appendix (evidence)

> ⚠️ **These measurements are from the PRE-FIX build (≈2026-06-16).** They are the baseline that motivated the fixes now landed on `listy-injection-main-app` (§0 update). Treat them as historical evidence, not current behavior — re-capture against the current build before citing. Items confirmed fixed: §10.1 (resize overflow → R-RESIZE), §10.3-4 (focus invariant → R-FEED-3/5), §10.10 (stack icons → RG-1). Still relevant: §10.5 (R-EXPAND-2), §10.8 (button-in-button, partially → R-A11Y-1).

Environment: `pnpm dev` (port 3002), unauthenticated, Chromium via preview tools.

**10.1 Resize fit failure.** Default widths center=520/related=460/nav=300.
- At **1200px** viewport (the documented desktop breakpoint), default config: nav `[40,304]`, aside `[860,1320]` → **aside overflows right by 120px**.
- Saved `centerWidth=1100, relatedWidth=700` at **1440px**: effective center resolved to **500px** (the minimum — the saved 1100 ignored, because `viewportCenterMax = 1440 − 2·max(300,700) = 40`), aside `[970,1670]` → **overflows right by 230px**, including its own resize handle.

**10.2 Cross-highlight + dim.** Hovering the first related card: focus post rendered **2 visible marks** (bg `rgb(224,247,250)` = framing); aside cards: **14 dimmed, 1 bright**.

**10.3 Focus invariant break (bottom).** Scrolled to `scrollY=1901` (max=1900): post 5 top at `+2px` (well past the 270px active line) yet **0 feed posts had the active border**; aside still read **"15 posts across all categories"** (entry 0) although entry 5 (5 related) was in view.

**10.4 Active-style revert.** Active Paper inline style = `border:2px solid rgb(156,184,255)`, elevation shadow, `translateY(-2px)`; **computed** at the same instant = `borderColor rgb(231,231,231)`, `box-shadow none`, `transform none`. No `!important` override exists in app CSS → consistent with a re-render/transition flicker rather than a static CSS bug. (After fresh load and after Back-restore, the active border *did* render correctly — §10.6.)

**10.5 Deep-highlight full expansion.** Hovering a card whose relation focus-span starts ≈1072 chars in grew the focus post to **near full height** (screenshot), pushing the rest of the feed down — motivates D-EXPAND.

**10.6 Click-in + Back.** Feed post click set `previousPath:/listy-injection/posts/<id>=/listy-injection`, `scrollY:/listy-injection=0`, `activeFeedPost:/listy-injection=<id>`, routed to detail (rendered Back, focus post **clamped + "Read more"**, right-side aggregated-category column, reply box, tabs, replies, aside). In-app **Back** restored URL `/listy-injection`, `scrollY=0`, **active border on entry 0**, aside 15.

**10.7 Deep chained nav (crash test).** Feed → related post `112880123275614116` (synthetic entry; aside **29** cards) → deeper related `112880110627141264` with URL `…?from=112880123275614116` (aside **28**). Page alive, **no Next.js error overlay** through 3 hops.

**10.8 Console.** Only one error/warning signature across the session: **`Warning: In HTML, <button> cannot be a descendant of <button>… hydration error` ×10**, originating in `RelatedStacks` card markup. **No runtime exceptions, no API 404s** (unauthenticated).

**10.9 Burger-on-logo regression (RG-2).** `.mantine-Burger-root` at `{l:176,t:16,r:204}`; STACKY logo at `{l:192,t:32,r:222}` → bounding boxes **overlap** (`burgerOverlapsLogo: true`). Burger is `nav-left + 16px` (left edge), **256px from the nav's right edge** where it was meant to be.

**10.10 Focus-post stack icons regression (RG-1).** On `/listy-injection/posts/<id>` the center focus post contains a `[data-stack-count]` element at `{l:494,t:86}` with text `"14" + per-category "1"`s — the icon column is present. On the feed, no `[data-stack-count]` renders (suppressed via `stackCount={-1}`). Confirmed inconsistency: removed on feed, still shown on detail.

---

## 11. Test fixtures & deep-link recipes

- Entries (focus ids): `112880124583497150` (15 related, 15 replies, the richest), `112880110824825811` (13), `112880110229817577` (12), `112854373877034288` (10), `112880113210102378` (5), `112854371857713231` (5).
- High-overlap topics for grouping tests: `Manufacturing`, `Tariffs`, `Affordability`, `US auto industry`. Singleton topics (for "0 more" / no-cluster tests): most others (see §3.2).
- Deep-link shape (from `URL_SCHEMA.md`): `/listy-injection/posts/<id>?fc=connections,framing&fs=<start>-<end>&tab=recommended&from=<otherId>`.
- Viewports to test (post-redesign): 1920 (max-width cap engaged), 1440×900 (roomy), 1200, 768, 375 — all **always side-by-side**, no mobile AppShell branch. *(Pre-redesign overflow repro lived at 1200×900 / <1200; retire those once the redesign lands.)*

---

## 12. Open questions / assumptions

1. **"Tool top"** is interpreted as the hover tooltip (R-TIP). The other candidate — the focus post's right-side stack-icon column — is now classed as a **regression** (R-NOSTACK-1 / RG-1), not a feature. Confirm which you meant.
6. **§5A regression guards:** RG-1/RG-2 are confirmed; RG-C1…C6 are inferred from branch names and need your confirmation. Add any other deliberate removals/repositionings so they're guarded.
2. The test harness will run **unauthenticated** (clean console, mock data) unless a logged-in pass is explicitly wanted — assumed yes.
3. D-EXPAND cap values (~12 lines / ~40vh) are a starting proposal; confirm exact cap and whether scroll-to-span should center or top-align the span.
4. R-NAV-6: the related-set size shifting on drill-down (15→29→28) is assumed intentional (synthetic siblings + resolver), not a bug — confirm.
5. StrictMode is on in dev; if studies run a production build, re-baseline R-FEED-3/5 and RK-11 there.
7. **Layout redesign (2026-06-22):** "always side-by-side" (D-RESPONSIVE) leaves the related panel quite narrow on phones (~35% of a ~375px screen). Confirm this is acceptable vs. introducing a min-related-width floor (rationale for keeping it: always show the feed↔related relationship). Also confirm the exact **MAX_CONTENT_WIDTH** (currently ~1280px / ~13in) and that the **top nav bar spans the full viewport** (chosen: logo + condensed, overflow-to-menu) rather than being capped to the group width.

---

## 13. Next phase

Most of the original `SPEC > CURRENT` set has **landed** on `listy-injection-main-app`, and a **Playwright E2E suite already exists** (`e2e/landing.spec.ts`, `e2e/listy-injection.spec.ts`, `e2e/callback.spec.ts`; `pnpm test:e2e`, chromium on `:3002`) — so the CLAUDE.md "No test framework is configured" note is now stale. Remaining work:

1. **Add the missing `data-testid` hooks in `RelatedStacks.tsx`** (it currently has none): `filter-chip`, `related-count`, `card-category-tag`, `span-filter-pill`, `grouped-by-pill`, `more-like-this` — needed before the R-FILTER/R-GROUP/R-HL tests can be selector-based (§4).
2. **Expand Playwright to lock in the now-`MATCHES` behavior as regression guards:** R-RESIZE-1..7, R-FEED-2/3/5, R-NOSTACK-1 (RG-1), the R-REORDER family, R-TIP-3/4/5, R-GROUP-1/3/4/5/6, error-handling/heuristic #9, and the §5A guards (RG-1, RG-C1/C2/C4; **drop RG-C3**).
3. **Remaining `SPEC > CURRENT` / open — the expected-fail list that drives fixes:**
   - **R-EXPAND-2** — bounded reveal + scroll-to-span (not confirmed).
   - **R-A11Y-1** — avatar/display-name `<button>`-in-`<button>` still in `RelatedStacks`.
   - **R-A11Y-3** — `InteractionControl` `:focus-visible` outline.
   - **R-A11Y-4** — assistive-tech thread/reply semantics.
   - **R-ROBUST-9** — off-by-3 `<p>`-wrap highlight (not re-verified).
   - **Pre-release polish** — remove `SYNTHETIC_TOPIC_POOLS` (off-domain topic labels); close the residual silent failures (`ReplySection` feedback, one share-copy `.catch`).
4. **Accepted deviations (won't fix — ratified 2026-06-23):** `prefers-reduced-motion` support is intentionally not implemented (R-MOTION-1 / R-EXPAND-5); category tags + F-indicator are always colored at rest (R-COLOR-1, supersedes RG-C3).
5. **Still genuinely `UNVERIFIED`** (need tests to set ground truth — no fix claimed): the R-FILTER family (1, 4–9), R-NAV-4/5/6, R-HL-1/2/3, R-URL-1/2, and the open decision R-TIP-6 / D-LABEL-1 (quotes vs boldface label).
6. **Wire the §5A guards into CI** to fire on every merge into this area (RK-12).
