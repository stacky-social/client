# `/listy-injection` — Interaction Requirements & Heuristic Evaluation

**Status:** Draft for review · **Date:** 2026-06-16 *(layout redesign added 2026-06-22 — see §2.2 and §5 R-RESIZE)* · **Scope:** interaction behavior only
**Purpose:** The behavioral oracle for an agentic test workflow (TestSprite → Playwright). Every normative requirement is written to be turned into an automated assertion; the risk register lists hypotheses for exploratory characterization.

This document is grounded in (a) a full read of the route, the shared `Post` component, `RelatedStacks`, the resizable shell, the highlight store, the mock resolver, and the supporting components, and (b) **live observation of the running app** (`pnpm dev`, unauthenticated, desktop viewport). Live measurements are quoted as evidence in §10.

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
- **`ListyInjectionShell.tsx`, `FocusPost.tsx`, `RankedPostCard.tsx`, `RankedPostList.tsx`, `listyStore.ts`, `CategorySidebar.tsx`, `HANDOFF.md` are DEAD CODE** — a March prototype the live route no longer imports. The handoff doc is stale (it claims 3 entries and an in-page thread machine; reality is 6 entries and route-based navigation). **Tests must target `Post.tsx` + `RelatedStacks.tsx` + the route pages, never the `ListyInjection/` components.**
- Cross-panel state lives in two places:
  - **`RelatedStacksContext`** ([`related-stacks-context.tsx`](../src/app/(shell)/related-stacks-context.tsx)) — `activePostId` + `relatedStacks` for the **aside**.
  - **`highlightStore`** ([`highlightStore.ts`](../src/utils/highlightStore.ts)) — a module-level `useSyncExternalStore` for hover/highlight/filter/anchor state, shared between the center `Post` and the aside `RelatedStacks`.
  - The feed page *also* keeps a **page-local `activePostId`** that drives the in-feed active border/highlight. **This local state and the context `activePostId` can diverge** (see R-FOCUS / §10.3).

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

**`data-testid` hooks — ADDED to the build (verified present):**
- `[data-testid="post"]` on every post Paper, with `[data-active="true|false"]`; the focus post is `[data-testid="post"][data-active="true"]` (R-FEED-2/3/5; for RG-1 assert no `[data-stack-count]` inside it).
- `[data-testid="focus-reveal"]` on the active post's `ActiveHighlightedContent` box (R-EXPAND bounded reveal / scroll).
- `[data-testid="hover-tooltip"]` on the `HoverTooltip` portal — mounts only while a tooltip is visible; assert ≤1 at any time (R-TIP).
- `[data-testid="top-nav"]` on the sticky top nav bar; `[data-testid="nav-overflow-toggle"]` on its overflow menu / avatar dropdown trigger (R-RESIZE-1).
- `[data-testid="content-group"]` on the centered feed+related wrapper (assert centered; width = min(100% available, MAX≈1280px); R-RESIZE-2/6).
- `[data-testid="feed"]` (replaces `col-center`) and `[data-testid="col-aside"]` on the two panels (assert side-by-side at all widths; feed:related ≈ saved `feedRatio`; R-RESIZE-3/5).
- *(Removed by the redesign: `col-nav`, `col-center`, `nav-collapse-toggle` — tests referencing these must migrate.)*
- `[data-testid="filter-chip"][data-category]` on each category chip (R-FILTER-4/7/8).
- `[data-testid="related-count"]` on the aside count text (R-FILTER-5).
- `[data-testid="card-category-tag"][data-category]` on each card's category tag (R-HL-4, R-ROBUST-1, R-COLOR).
- `[data-testid="span-filter-pill"]`, `[data-testid="grouped-by-pill"]`, `[data-testid="more-like-this"]` — span-filter indicator, "Grouped by" pill, and "N more" link (render conditionally) (R-FILTER, R-GROUP).

⚠️ **Note for the tester:** `[role="separator"]` also matches every Mantine `<Divider>` in posts. Always filter resize dividers by the `aria-label^="Resize"` prefix.

---

## 5. Normative requirements (the oracle)

### R-FEED — feed & focus invariant
| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-FEED-1 | Load `/listy-injection` → feed shows the hashtag header (`#ChineseEVs`), correct counts (6 Posts / 36 Participants / 60 Responses), and 6 posts. | P1 | MATCHES | text content; `div[data-post-id]` count = 6 |
| R-FEED-2 | On load → exactly one post is **visibly** focused (blue border `rgb(156,184,255)`, elevation shadow, `translateY(-2px)`) and the aside shows that post's related stacks. | P0 | UNVERIFIED | computed `borderColor`/`boxShadow`/`transform` on the active Paper; aside header count |
| R-FEED-3 (**D-FOCUS**) | At **every** scroll position — top, mid, bottom spacer — exactly one post is focused and the aside matches that post. No empty aside, no "all-grey" no-focus window, no stale aside (aside post ≠ post in view). | P0 | **SPEC > CURRENT** | see §10.3: at the bottom, in-view post = entry 5 but aside showed entry 0's 15 cards and no post had the active border |
| R-FEED-4 | Scrolling changes the focused post as a new post crosses the active line; the change is monotonic and flicker-free (no rapid toggling of the active border). | P1 | UNVERIFIED | sample active id while scrolling; assert no oscillation |
| R-FEED-5 | The active post's affordance is stable — once focused it stays visibly focused until another post takes over (no transient revert to the inactive style during scroll re-renders). | P1 | **SPEC > CURRENT** | §10.4: computed style reverted to inactive values in some post-scroll snapshots while inline style was active (flicker) |

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
| R-HL-4 | Hovering a category **tag** (top-left of a card) behaves like hovering all ranges of that category (bright that category, dim others). | P1 | UNVERIFIED | `hoveredCategory` store + tag opacity |

### R-TIP — hover tooltip (the "tool top")
> Two surfaces match "tool top." Primary: the global **hover tooltip** portal (R-TIP). Secondary: the right-side **stack/category-icon column** on the focus post (`StackCount`) — but that column is itself a **regression** (it was deliberately removed from the focus post; see R-NOSTACK-1 and §5A), not an intended feature. Confirm which you meant.

| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-TIP-1 | Hover a highlight/tag/"N more"/Grouped-by pill → one floating tooltip appears reading `"N more <Topic>"` (topic bolded in category color), positioned near the cursor and **following the mouse** while visible. | P1 | MATCHES | single portal node; transform tracks mouse |
| R-TIP-2 | Exactly one tooltip exists at a time; leaving the trigger hides it; it is `pointer-events:none` and never blocks clicks. | P1 | MATCHES | one portal; `pointerEvents:none` |
| R-TIP-3 | The tooltip is dismissed when the underlying element is removed (e.g., during a reorder) — it must never strand on screen. | P1 | **UNVERIFIED / RISK** | trigger a reorder mid-hover; assert no orphan tooltip (see RK-7) |
| R-TIP-4 | "0 more <Topic>" should not be shown as a useful affordance — singleton topics (common, §3.2) make "0 more" frequent and misleading. | P2 | **SPEC > CURRENT** | many topics have count 1 → "0 more" |
| R-NOSTACK-1 (**regression guard**) | The focus post must **not** display the stack/category-count icon column on **either** route — it was deliberately removed. The feed suppresses it (`stackCount={-1}`), but the **detail route does not** (`stackCount={p.stackCount}`), so it reappears there. Assert the column is absent on both. | P1 | **SPEC > CURRENT** | §10.10: `[data-stack-count]` present in the detail center column (text "14" + per-category counts); absent on feed |

### R-EXPAND — focus-post reveal (**D-EXPAND**)
| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-EXPAND-1 | The focus post is clamped to 5 lines by default; a "Read more" control appears when it overflows. | P0 | MATCHES | clamp; "Read more" present |
| R-EXPAND-2 (**D-EXPAND**) | Hover a card whose highlight is below the clamp → the focus box grows **at most to the cap (~12 lines / ~40vh)**. If the span is still beyond the cap, the box **scrolls internally to the span**. The post must **not** grow to full height, and the feed/aside below must not be shoved down. | P0 | **SPEC > CURRENT** | §10.5: a deep highlight (focusStart≈1072) currently expands the post to ~full height |
| R-EXPAND-3 | When the highlight clears, the box collapses back to the 5-line clamp with a matching animation (no layout jump). | P1 | MATCHES (current grow/collapse) | reveal→collapse transition |
| R-EXPAND-4 | "Read more" (manual) fully un-clamps; "Read less" re-clamps. This is independent of the hover reveal. | P1 | MATCHES | toggle |
| R-EXPAND-5 | Reduced-motion: marks/reveal appear without transitions when `prefers-reduced-motion: reduce`. | P2 | MATCHES | media-query branch |

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
| R-GROUP-1 | Click a highlight (or category tag, or the top-right F-indicator) → that card becomes the anchor; same-topic cards cluster adjacent to it with a colored connector line + a topic chip; a "Grouped by: <topic>" pill appears. | P1 | UNVERIFIED | `reRankAnchorIds`; connector; pill |
| R-GROUP-2 | The clicked card stays **visually pinned** (no scroll jump) while other cards animate around it. | P1 | UNVERIFIED | §7; `absoluteOffsetTop` scroll comp |
| R-GROUP-3 | Single-anchor invariant: selecting a new anchor replaces the old; clicking the active anchor (or its × pill) clears it. `reRankAnchorIds.length ∈ {0,1}`. | P1 | MATCHES (by setter design) | store length |
| R-GROUP-4 | Above/below ordering invariant: matched cards above the anchor stay above; matched below stay below (don't re-expose already-passed cards across the anchor). | P1 | UNVERIFIED | `reorderForAnchor` (§7) |
| R-GROUP-5 | Pagination: only the first 3 matches show; a "N more <Topic>" link adds 3 more per click; the link caps the connector line. | P2 | UNVERIFIED | `shownByAnchor`; group line |
| R-GROUP-6 | When a topic has no other matches (singletons, common here) clicking it must give honest feedback — it should **not** silently appear to "group" one item or show "0 more". | P1 | **SPEC > CURRENT** | §3.2, §7 |

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
| R-NAV-8 | URL state on detail round-trips: `?tab`, `?fc`, `?fs`, `?from`, `?stackId` hydrate on load (with `?fs` deferred until post text loads) and write back debounced via `router.replace`. | P1 | UNVERIFIED | see `useUrlSync` (§8) |

### R-RESIZE — app-wide layout: top nav + centered feed/related group + ratio slider (**D-NAV / D-LAYOUT / D-RESIZE / D-RESPONSIVE**, revised 2026-06-22)
> Supersedes the old center-anchored 3-column shell. All rows are **intended** behavior; the current build still ships the old model, so they are `SPEC > CURRENT` until the redesign lands.

| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-RESIZE-1 (**D-NAV**) | App chrome shows a **horizontal sticky top nav bar** (logo + condensed primary items; secondary items behind an overflow menu / avatar dropdown). There is **no left nav column** and **no nav-collapse burger** on any route. | P0 | **SPEC > CURRENT** | `[data-testid="top-nav"]` present and at top; `col-nav` / `nav-collapse-toggle` absent |
| R-RESIZE-2 (**D-LAYOUT**) | The **feed + related** render as one **horizontally-centered group**. Group width = `min(100% of available width, MAX≈1280px)`. Wider than the max → capped and centered with **equal left/right gutters**; at/below the max → fills **100%** of available width. | P0 | **SPEC > CURRENT** | `content-group` computed width ≤ 1280px and ≤ 100%; equal gutters when capped |
| R-RESIZE-3 (**D-RESIZE**) | Exactly **one** vertical slider sits between feed and related; dragging it changes the **ratio** of group width between them. Default split = **65% feed / 35% related**. | P0 | **SPEC > CURRENT** | one `[role="separator"][aria-label^="Resize"]`; feed:related ≈ 65:35 by default |
| R-RESIZE-4 (**persistence**) | The split persists as a **ratio** in `localStorage` `stacky:feedRatio` (default `0.65`), restored across sessions; **double-click** the slider resets to 65/35. The old `stacky:centerWidth` / `stacky:relatedWidth` keys are gone. | P1 | **SPEC > CURRENT** | `stacky:feedRatio` set; reload preserves ratio; dbl-click → 0.65 |
| R-RESIZE-5 (**D-RESPONSIVE**) | Feed and related stay **side-by-side at every viewport size** — the 65/35 ratio scales down to fit 100% width even on phones. **No** collapse, drawer, or vertical stacking. | P1 | **SPEC > CURRENT** | both panels visible & side-by-side at 1440 / 1200 / 768 / 375px; ratio preserved |
| R-RESIZE-6 (**max-width rationale**) | The group never exceeds **MAX≈1280px (~13in)** on wide screens — sized for comfortable eyes-only reading without head rotation (~30° horizontal scan @ ~60cm; HCI). | P1 | **SPEC > CURRENT** | at 1920px viewport, `content-group` width ≈ 1280px, centered |
| R-RESIZE-7 (**no overflow**) | At **any** viewport and **any** saved ratio, nothing overflows horizontally: the group and both panels fit; no horizontal scrollbar; the slider is always reachable on-screen. | P0 | **SPEC > CURRENT** | `scrollingElement.scrollWidth ≤ clientWidth`; slider within viewport |

### R-A11Y / R-MOTION — accessibility & secondary controls
| ID | Precondition → Action → Expected | Pri | Status | Signal |
|---|---|---|---|---|
| R-A11Y-1 | No invalid interactive nesting: a card must not place a `<button>`/`Anchor component="button"` inside another button. | P1 | **SPEC > CURRENT** | §10.8: button-in-button **hydration error ×10** from `RelatedStacks` |
| R-A11Y-2 | Interactive controls expose roles/labels: filter chips `aria-pressed`; back `aria-label`; highlight close buttons ≥24px hit target. | P1 | PARTIAL | `RelatedStackCount` lacks `aria-label`; reply input lacks one |
| R-A11Y-3 | Keyboard: feed post is reachable (`role=button`, `tabIndex=0`, Enter/Space navigate); `InteractionControl` supports Enter/Space; visible focus outline exists. | P1 | PARTIAL | `InteractionControl` has no `:focus-visible` outline |
| R-A11Y-4 | Threaded replies convey nesting to assistive tech (currently only a visual `threadLine`, `aria-hidden`). | P2 | **SPEC > CURRENT** | no `role=tree`/region |
| R-MOTION-1 | All highlight/reveal/reorder animations respect `prefers-reduced-motion`. | P2 | PARTIAL | focus-post reveal honors it; card reorder (framer-motion) may not |

---

## 5A. Regression guards — intentional decisions that must NOT revert

Each row below is a deliberate UI/UX decision that has silently reverted, or could. An automated tester won't check that something stayed *absent* or *repositioned* unless told to — so each one needs an explicit "assert it stayed gone/moved" test. The usual revert vector is a merge into this area (e.g. `Merge listy-injection-main-app …`, or the `resizable-shell` layout rewrite `28fd612`).

**Confirmed regressions (observed live, this build):**

| ID | The intended state | What's wrong now | Refs |
|---|---|---|---|
| RG-1 = R-NOSTACK-1 | The **focus post shows no stack/category-icon column** (removed). | Feed hides it (`stackCount={-1}`), but the **detail route** still passes `stackCount={p.stackCount}` → the icon column is back on detail. | §10.10 |
| RG-2 *(obsolete after redesign)* | ~~burger at the right edge of the left panel, clear of the logo~~ | **Superseded by D-NAV:** the redesign removes the left nav and the burger entirely, so this guard no longer applies. Drop the test once the top nav ships. | §10.9 |

**Candidate guards inferred from recent branches/commits — please CONFIRM or correct (these are the most likely "did our deliberate change survive?" items):**

| ID | Suspected intended decision | Where it lives / how to assert | Source signal |
|---|---|---|---|
| RG-C1 | **Honest counts** — no synthetic inflation of "N more"; displayed counts equal real counts. | `getSyntheticTopicCount`/`getSyntheticCategoryCount` are no-ops returning the real count; tooltips/links must not overstate. | current branch `…/dates-and-count-honesty`; ties to R-TIP-4, R-GROUP-6 |
| RG-C2 | **Honest dates** — relative/absolute date formatting reflects real timestamps (no "just now"-style inflation). | `formatPostDate` output on cards/posts. | same branch name |
| RG-C3 | **Neutral card tags until panel hover** — multi-category cards show grey tags/indicator until the aside is hovered, then reveal category color. | `panelHovered` gate in `RelatedStacks` (C3). | merge `…/neutral-card-border` |
| RG-C4 | **F-indicator topic matches the "Grouped by" pill** (no stale/mismatched topic label). | `activeAnchorTopic` drives both. | merge `…/fix-f-indicator-topic` |
| RG-C5 | **Route-based navigation supersedes the old `?focus=` in-page thread mode** — clicking a post creates a real `/posts/[id]` route; no `?focus=` state machine. | `router.push` in `navigateToPost`; `?focus=` path is legacy fallback only. | merge `…keep router.push for nav, supersede ?focus=` |
| RG-C6 | **A1 guard** — navigating to an unresolvable post id is refused with a console warning, never a blank/crashed page. | `navigateToPost` guard + "Post unavailable" fallback. | merge `…/bug/group-a-robustness` |

> **Action for author:** confirm whether RG-C1…C6 belong here, correct their "intended state," and **add any other deliberate removals, repositionings, or suppressions you've made.** Those are exactly the changes an automated suite would otherwise let silently revert — this table is the safety net against merge-clobbering.

---

## 5B. Canonical team specification (Slack thread — JSALT, June 2026)

> **Authority:** This section captures the team/PI (Jason) requirements and the meeting notes faithfully and is **authoritative**. Where it refines or contradicts the inferred §3/§5/§7, **this section wins**; cross-refs note supersessions. Context is time-pressured — prioritize the P0/P1 robustness + reordering items. Each item is tagged `[Pri · Status]`.

### 5B.1 Reordering / grouping — agreed mechanics (authoritative; supersedes §7 inference & R-GROUP)
The trigger and mechanics are the same for **both** candidate presentations (5B.2):

- **R-REORDER-1** `[P0 · UNVERIFIED]` — Grouping is triggered by clicking the **"N more <Topic>"** affordance (in the tooltip or block footer) — **not** a generic "see more".
- **R-REORDER-2** `[P0 · UNVERIFIED]` — **Posts above the target:** every matching post above the clicked target moves down to sit **immediately above** it, keeping their relative order. *(Supersedes the vague "above the current set." `reorderForAnchor` currently leaves matched-above posts where they are — verify it actually pulls them adjacent.)*
- **R-REORDER-3** `[P0 · UNVERIFIED]` — **Posts below the target:** matching posts below the target move up to sit **immediately below** it — but only the **highest 3**.
- **R-REORDER-4** `[P1 · UNVERIFIED]` — The target and its matches form a single **contiguous block** in reading order.
- **R-REORDER-5** `[P0 · SPEC>CURRENT?]` — **Permanence:** reordering is **permanent** — it does **not** revert when the group is unselected or cleared. The browser Back button is the only undo. *(Supersedes any "revert on unselect" wording; verify that clearing the block keeps the new order.)*
- **R-REORDER-6** `[P1 · UNVERIFIED]` — **Prevalence count:** the block shows the **total** number of posts on that Topic (e.g. "Topic (10)"), even when not all of them are displayed.
- **R-REORDER-7** `[P1 · UNVERIFIED]` — **Pagination:** each click of the footer affordance reveals **3 more** posts at the **bottom of the block**, growing toward the prevalence count.
- **R-REORDER-8** `[P1 · UNVERIFIED]` — **Switching group-by:** picking a **different** Topic while already grouped **abandons** the prior grouping (groupings never compound). The current visible order becomes the new baseline, and the next reorder layers on top of it. *(Matches the current base-order capture, D-ALG-6.)*
- **R-REORDER-9** `[P2 · SPEC>CURRENT]` — **Re-picking the same group-by:** picking the **same** Topic while grouped makes the affordance read **"N more Topic (shown)"**, and clicking it is a **no-op** (for now).
- **R-REORDER-10** `[P1 · SPEC>CURRENT]` — **Intra-block span dimming:** within the block, spans unrelated to the Topic are **dimmed** (unless hovered) so the Topic-related spans are easy to find.
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

> **Resolved to "current."** Note that this **diverges from the meeting notes** ("switch to the 3rd option" = Option C) and from Jason's lean toward C — reconcile with the team before final sign-off. The Jason-spec decorations not yet in the build — the "Topic (N)" header, an unclickable "0 more" footer sentinel, the same-topic "(shown)" affordance, and intra-block span dimming (R-REORDER-6/9/10) — become **optional enhancements** rather than blockers, since the current presentation is accepted.

### 5B.3 Tooltips
- **R-TIP-5** `[P1 · SPEC>CURRENT]` — **Double-tooltip bug:** hovering a tag shows the "N more Topic" tooltip **twice** — once near the tag, once on the highlighted text. It must be a **single, cursor-following instance** for both text-hover and tag-hover.
- **R-TIP-6** = **D-LABEL-1** (OPEN) — "Topic" label format is undecided: **quotes** — `N more "Topic"` (meeting notes) — vs **boldface** — `N more `**`Topic`** (Jason leans this way, since it matches the block header). Apply whichever form is chosen consistently across the tooltip, header, footer, and corner label.

### 5B.4 Related-panel robustness (bug list — mostly SPEC>CURRENT)
- **R-ROBUST-1** `[P1 · SPEC>CURRENT]` — Clicking a contribution-type tag (e.g. "7 more evidence") **must reorder** — it's currently a no-op.
- **R-ROBUST-2** `[P0 · UNVERIFIED]` — **No crash** when clicking a related post. *(A crash was reported but not reproduced in the 3-hop test, §10.7 — needs a concrete repro, likely a specific id or synthetic entry.)*
- **R-ROBUST-3** `[P1 · SPEC>CURRENT]` — The block's **"x"/close control always works** and has a hit target of ≥24px. *(Reported as sometimes unresponsive or too small.)*
- **R-ROBUST-4** `[P1 · SPEC>CURRENT]` — **Hover-dim persists** for the entire interaction; it must not switch off partway through. *(= R-HOVER-5; the A6 guard targets this.)*
- **R-ROBUST-5** `[P0 · SPEC>CURRENT]` — **Back** must never land in a "no post focused, but the panel is still showing related-for-nothing" state. *(Confirmed live, §10.3; = D-FOCUS.)*
- **R-ROBUST-6** `[P0 · SPEC>CURRENT]` — A "no related posts" / "post not found" result must still **focus the post and render an *empty* related panel** — it must never break the view. *(Repro today: clicking a comment on a post triggers this error.)*
- **R-ROBUST-7** `[P0 · SPEC>CURRENT]` — **"No post focused" must never occur** — the related panel must not render in that state. *(= D-FOCUS / R-FEED-3.)*
- **R-ROBUST-8** `[P0 · UNVERIFIED]` — **Cross-browser (Linux Chrome):** highlighting and hover are broken on Linux Chrome, even with extensions disabled. The pointer + mouse dual handlers in `RelatedStacks` were an attempt to fix this — verify and fix specifically on Linux Chrome.
- **R-ROBUST-9** `[P1 · SPEC>CURRENT]` — **Highlight alignment must be exact.** Fei reports side-pane highlights are intermittently **off by ~3 chars**. Cause: offsets are computed against plaintext but applied to content that is **sometimes `<p>`-wrapped HTML** (the resolver wraps related content as `` `<p>${content}</p>` ``) and sometimes plaintext, producing a 3-char ("`<p>`") shift. Fix: normalize so offsets and rendered text always use the same representation. *(Makes RK-4 concrete.)*

### 5B.5 Filtering — default behavior (refines R-FILTER-4)
- **R-FILTER-7** `[P1 · UNVERIFIED]` — Clicking a related-type at the **top of the side pane**: if combining it with the current selection still leaves a **non-empty** list, **ADD** it as a filter; otherwise **SWITCH** to it.
- **R-FILTER-8** `[P1 · UNVERIFIED]` — **Hover preview (before click)** telegraphs ADD vs SWITCH by previewing the resulting button state — light up the hovered button and turn others off as appropriate. *(Mobile / no-hover: see 5B.11.)*
- **R-FILTER-9** `[P1 · UNVERIFIED]` — **Highlight → filter:** hovering a focus-post span shows a **neutral** highlight; **clicking** it **filters** the related panel to posts related to that span. The side panel then shows the **shortest common related text**, truncated with "…" if there is only one related span or it is too long. *(D2 / D3.)*

### 5B.6 Related-type indicator color (= confirmed RG-C3 / R-HL-4)
- **R-COLOR-1** `[P1 · MATCHES?]` — A single related type shows **its own color**; multiple types stay **neutral until the user hovers into the related panel**, then reveal their colors. *(Verify against the `panelHovered` C3 gate.)*

### 5B.7 Reply threading
- **R-THREAD-1** `[P2 · PARTIAL]` — Replies are **indented with a connecting line, Twitter-style**, on the detail/thread view. *(The thread line exists; ensure consistent nesting, and see R-A11Y-4 for screen-reader semantics.)*

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
| **1. Visibility of system status** | The focused post is the anchor for the whole aside, yet (a) at the feed bottom *no* post showed the active border while the aside stayed on entry 0, and (b) the active border/elevation reverted to the inactive look in post-scroll snapshots. The user often can't tell which post the aside is about. | **High** | R-FEED-3/5, §10.3-4 |
| **1. Visibility** | "N more <Topic>" frequently shows **"0 more"** because most topics are singletons — status that promises depth the data lacks. | Med | R-TIP-4, R-GROUP-6, §3.2 |
| **2. Match to real world** | Latent: `SYNTHETIC_TOPIC_POOLS` is themed for *4-day work week* while the corpus is *Chinese EVs*. If backend data ever omits `topic`, the fallback prints off-domain topics. | Low (latent) | §7, code `RelatedStacks.tsx` |
| **3. User control & freedom** | Resize: a saved center width is silently overridden when the related column is wide (R-RESIZE-3); the user's choice doesn't stick. Back from a deep link may strand (R-NAV-5). | High / Med | §10.1, RK-2 |
| **4. Consistency & standards** | Two parallel "active post" notions (page-local vs context) can disagree (stale aside). Symmetric center-resize is non-standard vs. typical pane resizers (one edge moves). | High / Low | R-FEED-3, RK-9 |
| **5. Error prevention** | Aside/columns overflow the viewport out-of-the-box at the documented 1200px breakpoint — the layout can clip its own resize handle off-screen. Button-in-button is an HTML validity error. | High | R-RESIZE-2, R-A11Y-1, §10.1/10.8 |
| **6. Recognition over recall** | Hovering reveals the relevant focus-span — good. But the bounded-reveal/scroll behavior (D-EXPAND) is needed so the user sees the span *in context* rather than the post ballooning. | Med | R-EXPAND-2 |
| **7. Flexibility & efficiency** | Touch parity exists (tap-to-activate, tap-again-to-rerank) but is a separate code path — verify it doesn't diverge from mouse semantics. | Med | RK-8 |
| **8. Aesthetic & minimalist** | The deep-highlight full-expansion (current) dumps a wall of text and pushes the feed down — the opposite of minimalist focus. | Med | R-EXPAND-2, §10.5 |
| **9. Help users recover from errors** | Empty/uncertain states are mostly handled (aside "No related posts…", detail "Post unavailable", A1 navigate guard) — good. But silent failures elsewhere (StackPostsModal/ReplySection fetches) give no feedback when authenticated. | Med | §8, RK-5 |
| **10. Help & documentation** | The aside header ("Hover a post to highlight the relevant parts") is a nice inline hint. The eye-cursor on highlights signals "see more like this" — verify discoverability. | Low | — |

> **Layout-redesign note (2026-06-22):** the resize-related findings above (row 3 "saved width silently overridden", row 4 "symmetric resize is non-standard", row 5 "columns overflow the viewport") are **addressed by D-LAYOUT / D-RESIZE** — a single intuitive ratio slider, a centered max-width group, and a no-overflow invariant (R-RESIZE-2/3/7) replace the symmetric 3-divider model. Re-evaluate these heuristics against the new layout once it ships.

---

## 7. Reordering / grouping algorithm — design decisions & implications

> **§5B.1 is the authoritative reorder spec** (team/PI). This section is the implementation-level analysis that supports it — read them together; where they differ, §5B wins.

The "more like this" feature (`RelatedStacks` §E + [`reorderForAnchor.ts`](../src/utils/reorderForAnchor.ts)) is the most decision-laden interaction. Decisions, and the implications worth testing:

**D-ALG-1 — Single anchor only.** `reRankAnchorIds.length ∈ {0,1}`; a new anchor replaces the old. *Implication:* you cannot build nested/compound clusters; the `anchorParent`/indent machinery is effectively dormant. Test: selecting anchor B while A is active clears A entirely.

**D-ALG-2 — Match key is topic, with a content-similarity fallback.** If the anchor was created from a specific highlight range, matching uses that range's `topic` (via `topicOf`, which falls back to a synthetic topic when absent). Otherwise it falls back to Jaccard-ish word overlap (`similarityScore`, threshold 0.15, stop-words removed). *Implications:*
- On this corpus every relation has a topic, so the similarity fallback is rarely exercised — but it *is* the path for anchors created by card-body taps without a range. Test both paths.
- Topic match is **exact string equality** on topic names. Near-duplicate topics ("Affordable EVs" vs "Affordable EV access" vs "Affordable models" vs "Affordable EVs abroad") do **not** cluster together though a human would group them. This is a real recall limitation worth documenting.

**D-ALG-3 — "Above stays above, below stays below"** (`reorderForAnchor`). Matched cards above the anchor are moved to *just above* it; matched below to *just below*; non-matched keep relative order. *Stated intent:* don't re-expose already-scrolled-past items by yanking them below the anchor. *Implication / tension:* matched-above cards are pulled **down toward the anchor**, so if the anchor is near the top of the viewport, previously-passed cards can re-enter view right above it. The invariant preserves *order*, not *off-screen-ness*. Test: with the anchor mid-list, assert relative above/below partition; with the anchor near top, characterize whether above-matched cards visibly jump into view.

**D-ALG-4 — Visual pinning of the clicked card.** On anchor toggle, the clicked card's `layout` animation is disabled and `scrollTop` is compensated in `useLayoutEffect` (via `absoluteOffsetTop`, transform-immune) so it doesn't move; others animate. *Implication:* correctness depends on `absoluteOffsetTop` and the aside scroll container (`.mantine-AppShell-aside` on mobile vs the fixed desktop column — **two different scroll parents**; the compensation targets `.mantine-AppShell-aside` which only exists on the mobile branch). **Verify pinning works on the desktop custom shell**, where the scroll container is the fixed aside `div`, not `.mantine-AppShell-aside`. (Likely RK candidate.)

**D-ALG-5 — Pagination (3 + "N more").** Only 3 matches show initially. *Implication with singletons (§3.2):* most anchors yield 0 matches → no cluster, no "N more", and a "Grouped by: <topic>" pill that grouped nothing. R-GROUP-6 requires honest behavior here.

**D-ALG-6 — Base-order capture.** When a new anchor activates, the *currently visible* order is captured as the new base (`baseOrderRef`) so re-ranking layers on what the user sees, and filters apply *after* re-ranking so filtering never breaks group connectivity. Test: anchor → filter → clear filter returns to the anchored order, not the server order.

---

## 8. Supporting components (behavior the tester must account for)

- **`fetchPostData` (every `Post`)** early-returns without an `accessToken`, so **unauthenticated mock sessions make no API calls** (confirmed: zero 404s in §10.8). When **authenticated**, every mounted `Post` hits `GET beta.stacky.social/api/v1/statuses/<mockId>` → 404s. **The test harness should run unauthenticated, or stub these**, and assert no functional dependence on them.
- **`ReplySection`** (rendered under the focus post on both routes) debounce-POSTs `…:3002/posts/feedback` and POSTs `…/api/v1/statuses` on submit — both fail silently on the mock route; the feedback panel simply never appears. Submit has weak double-submit protection (countdown only when advice exists).
- **`StackPostsModal`** (opened from a stack of size>1) fetches `…/stacks/<id>/substacks` and `/summary` — 404 on mock; no focus trap; in-place search can't reset; renders `dangerouslySetInnerHTML`.
- **`AnnotationModal`** (note icon) has its question-fetch commented out → always "No questions available"; submit needs auth.
- **`useUrlSync`** hydrates `?tab/fc/fs` once per pathname (guarded by refs), writes back debounced 300ms via `router.replace`; `?fs` (span) is **deferred until `plainPostText` loads** and validated/clamped against it; `?from`/`?stackId` pass through. Hand-edited `?fs` offsets that don't match the post are silently skipped.
- **`BackButton`** renders only if `previousPath:<pathname>` exists in sessionStorage and calls `router.back()` (a true history pop → feed remount → restoration effect reads `scrollY`/`activeFeedPost`). Because both UI-back and browser-back remount the feed and run the same restoration, parity is *plausible* — R-NAV-4 must confirm it, including the deep-link-no-history edge (RK-2).
- **`mockPostResolver`** resolves any id to a focus post: real entry → its data; reply → inherits parent's stacks; related post → synthetic siblings of its parent entry. Ids absent from the fixture → "Post unavailable".

---

## 9. Risk register (hypotheses to characterize — not pass/fail)

| ID | Hypothesis to probe | Seed evidence |
|---|---|---|
| RK-1 | Focus/aside desync: scroll heuristic leaves a stale or empty focus at extremes or under fast scroll/jumps. | §10.3 (confirmed at bottom) |
| RK-2 | Back from a deep link (`?from=` seeded, no real history) strands the user — `router.back()` with no depth. | §8 BackButton |
| RK-3 | Active-affordance flicker: the blue border/shadow visibly toggles during scroll due to redundant `setActivePostId`. | §10.4 |
| RK-4 | Highlight injection on the focus post matches by **substring regex on HTML** — repeated phrases or tag-spanning ranges can mis-highlight or miss. Fei's intermittent **off-by-3** is the `<p>`-wrap instance of this — now a concrete requirement, **R-ROBUST-9**. | `renderMultiHighlightHtml` |
| RK-5 | Authenticated mock session floods the console with 404s and adds latency from per-post `fetchPostData`. | §8 |
| RK-6 | Anchor scroll-pinning compensates `.mantine-AppShell-aside` scrollTop, which doesn't exist on the desktop custom shell → pin may not hold on desktop. | §7 D-ALG-4 |
| RK-7 | Tooltip stranding: a tooltip-triggering element removed mid-hover (reorder/filter) leaves the portal visible. | R-TIP-3 |
| RK-8 | Touch path (tap-activate / tap-rerank / tap-outside-clear) diverges from mouse semantics or double-fires navigation. | `handleCardTap` |
| RK-9 *(obsolete after redesign)* | ~~Symmetric center-resize perceived as broken (users expect one edge to move)~~ — moot under D-RESIZE: a single one-edge ratio slider replaces the symmetric model. | §10.1 |
| RK-10 | Synthetic-entry drill-down changes the related set size unexpectedly (15→29→28 observed) — verify it's intentional, not duplication. | §10.7 |
| RK-11 | React StrictMode double-mount (dev) interacts with the mount-restoration + scroll effects to drop the page-local active post. | §10.3-4 |
| RK-12 | **Merge-revert of deliberate UI decisions** — `Merge listy-injection-main-app` / the resizable-shell rewrite silently undo intentional removals/repositionings (RG-1, RG-2 confirmed; RG-C* at risk). Every merge into this area should re-run the §5A guards. | §5A, §10.9-10 |

---

## 10. Live-observation appendix (evidence)

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

## 13. Next phase (not in this doc)
With this approved, the agentic workflow is: (1) add the recommended `data-testid` hooks (§4); (2) have TestSprite generate cases from §5/§5A/§9; (3) implement them in Playwright across the §11 viewports; (4) the `SPEC > CURRENT` rows are the expected-fail set that drives the fixes (**the layout redesign R-RESIZE-1..7**, bounded reveal, focus invariant, nested-button, back parity, **plus the confirmed focus-post stack-icons regression (RG-1)** — RG-2/burger is now obsolete under D-NAV). The §5A guards should also be wired into CI to fire on every merge into this area (RK-12).
