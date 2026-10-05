# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

crossweave is a Mastodon-compatible social media client built with Next.js. Users browse posts from a Mastodon instance, organize them into "stacks" (categorized discussion threads), and interact via favorites, bookmarks, and annotations.

## Commands

```bash
pnpm install     # Install dependencies
pnpm dev         # Start dev server at localhost:3000
pnpm build       # Production build
pnpm lint        # ESLint via next lint
pnpm test:e2e    # Playwright end-to-end tests (chromium on port 3002; starts/reuses the dev server, or set E2E_BASE_URL to target an already-running prod server)
pnpm test:e2e:ui # Playwright in interactive UI mode
pnpm test:unit   # Unit tests (node --test tests/unit/)
```

End-to-end tests use **Playwright** (`e2e/*.spec.ts` — 45 spec files, 191 tests) covering the landing/OAuth page, the demo feeds and post detail, focus phrases and highlighting, the related panel (grouping, pinning, scrolling), the weave bridge, and study flows. Run them against a production build (`pnpm build && pnpm start -p <port>`, then `E2E_BASE_URL=http://localhost:<port> pnpm test:e2e`); the dev server is too slow for the heavier specs. About a dozen specs (weave-bridge geometry, mastodon-backend, unified-discovery, feed-focus-stability, and others) fail or flake on the baseline too, so compare against a clean build of the base commit before calling a failure a regression. Unit tests are plain **node:test** suites in `tests/unit/` (31 suites), run via `pnpm test:unit`.

## Tech Stack

- **Framework**: Next.js 15 (App Router) with TypeScript
- **Runtime**: Node.js 22.x
- **Package manager**: pnpm
- **UI library**: Mantine v7 (AppShell, components, hooks, notifications)
- **HTTP client**: axios
- **Icons**: @tabler/icons-react, lucide-react
- **Styling**: CSS Modules + PostCSS with Mantine preset
- **Backend**: Mastodon-compatible API at `https://beta.stacky.social:3002` — used only by the legacy live-mode surfaces; most routes run offline on a localStorage-backed store (see API Integration)

## Architecture

### Routing & Layout

The app uses Next.js App Router with a **route group** `(shell)` that wraps all authenticated pages in a shared shell (`Shell.tsx`):
- **Sticky top nav**: `NavBar/TopNav` — logo, primary links, overflow menu, and the experiment-flags flask panel
- **Centered content group**: page content (the feed) and the `@aside` parallel route slot (related posts for the active post) form a single horizontally centered group (max width ~1280px)
- **Ratio slider**: one vertical divider (`ResizableDivider.tsx`) between feed and aside; the split persists as a ratio in localStorage (`stacky:feedRatio`, default 0.65)

The landing page (`/`) handles Mastodon OAuth instance selection. `/callback` completes the OAuth flow and stores tokens in localStorage. The offline research/demo feed lives at `/ChineseEVs` (renamed from `/listy-injection`; a redirect in `next.config.mjs` keeps old links working).

### Parallel Routes

`src/app/(shell)/@aside/` is a Next.js parallel route that renders the aside panel independently. Each route under `(shell)` has a corresponding `@aside` directory that controls what appears in the right panel.

### State Management

- **RelatedStacksContext** (`related-stacks-context.tsx`): Shared context in the shell layout. Manages which post's related stacks are shown in the aside panel. Provides toggle behavior — clicking the same post hides its stacks.
- **Experiment flags** (`src/utils/experimentFlags.ts`): module-level store for the research ablation switches, persisted to `stacky:experimentFlags:v1` and toggled via the flask panel in the top nav.
- **localStorage**: `accessToken`, `currentUser` (JSON), `stacky:localStore:v1` (offline post/interaction store), `stacky:experimentFlags:v1` (experiment flags), `stacky:feedRatio` (feed/aside split ratio), `stacky:hover-restore` (Shift+R choice, below)
- **sessionStorage**: `scrollY:{path}` for scroll restoration, `previousPath:{path}` for back navigation, `activeFeedPost:{routeBase}` + `activeFeedPin:{routeBase}` for restoring the focused feed post and its click pin

### Feed Focus (stableFeedFocusCore.mjs)

Scrolling picks the focused feed post: the post whose top has crossed a reading line (30% of the viewport; the centre line on Home), with a Schmitt band (`feedFocusHysteresisPx`) so neighbours don't flicker. Clicking a topic phrase focuses a post **in place** (no scroll) and pins it (`createFeedFocusPin` / `selectPinnedFeedFocus`). The pin hands control back silently once the picker would choose the same post, and releases when the post moves more than one band further from the reading line than its closest approach, or leaves the screen. It measures geometry, not scroll deltas or time. The topic feeds, Home (`PostList`), and search share it.

### Aside Scroll Freeze (Shell.tsx)

While the reader scrolls the feed (wheel, touch, scroll keys, or a scrollbar drag), the aside goes static and blurred (`RelatedStacksFreeze` serves it a context snapshot; `data-feed-scrolling` on the content group drives the CSS) and the drawn bridge lets go (`data-weave-suspended="scroll"`). About 180ms after the last scroll it swaps to the settled post, unblurs, and the bridge reopens. Programmatic scrolls (restoration, `scrollIntoView`) never freeze it. The open bridge is neumorphic: tab-like fillet curves (the mouth extends ~1.3× the gap past the card, `OPEN_FILLET_*` in WeaveBridge.tsx), soft seams (`--cw-weave-edge`) and a shared diffuse shadow (`--cw-weave-shadow`), no teal.

### Focus-Post Phrases (FocusTopicHighlightedContent.tsx)

- Left-pane phrase emphasis (a text-shadow, metric-neutral) is off at rest. It turns on for hover over the text, keyboard focus, an aside cross-highlight, or a mobile tap (`data-engaged`). On touch, the first tap only engages; later taps act. The related cards' bold in the aside is always on.
- A click rotates the phrase's topics A → B → … → off. Multi-topic phrases open the topic list on hover after ~500ms; single-topic phrases show a "Filter by: X" tooltip.
- Hovering a related post (or a reply) scrolls the focus post's reading window only as far as the whole highlighted passage needs, keeping the text before it; a passage taller than the window keeps its bold key phrase in view. Leaving restores the original view after 250ms (so moving between cards doesn't flash). **Shift+R** toggles restoring off/on (`src/utils/hoverRestore.ts`). A scrolled window opens with an ellipsis drawn *over* its first characters (never inserted, so line breaks can't change; the covered characters turn transparent via the `focus-window-covered` CSS highlight); the trailing ellipsis in `Post.tsx` follows the last painted line and hides at the post's end.
- The `dangerouslySetInnerHTML` object is memoized. A new object makes React replace every `<mark>`, and a replacement between mousedown and mouseup swallows the click.

### Related Panel Grouping (RelatedStacks.tsx)

Clicking a highlighted span, or a card's contribution-type icon, **groups** ("more like this") rather than filters. Matches above the clicked card gather just above it and matches below gather just below (`reorderForAnchor`), in a bordered block with a "Label (N) ×" header and a "K more Label" footer. Type groups are topic interactions with `groupBy: 'category'` (`fg=category` in the URL). They filter the reply pane by relation category and clear any top filter. Filtering happens only from the top chip bar and the focus post. A span whose topic no other post in either pane carries (tooltip "0 more X") does nothing when clicked, in the aside and the reply list alike. While a group is scrolled past, a zero-height sticky copy of its header sits under the panel's sticky header. Grouping no longer adds a per-card topic row, so cards keep their height; `active-group-anchor` marks the anchor card itself.

### Post List Caching (PostList.tsx)

`PostList` uses a module-level `Map` cache (not React state) that survives component remounts during SPA navigation:
- 5-minute TTL, LRU eviction at 20 entries
- Stale-While-Revalidate: serves cached posts instantly, revalidates in background
- Scroll position saved to sessionStorage on navigation, restored on return
- Stack data loaded in batches of 2 concurrent requests per post

### API Integration

Most surfaces run fully offline on the localStorage-backed store (`src/utils/localStore.ts`, key `stacky:localStore:v1`): the `/ChineseEVs` demo plus `/home`, `/search`, `/user`, `/bookmarks`, and `/liked` need no OAuth and no backend. Only the legacy live-mode surfaces (`/posts/[id]`, `/tag`, `/oldversion`, `/explore`, `/annotation`) call `https://beta.stacky.social:3002`, with auth via OAuth Bearer token from localStorage. Key patterns:
- `mastoActions.ts`: interaction helpers — `toggleFavourite` and `toggleBookmark` only (there is no boost); in local mode they delegate to `localStore.ts` instead of the REST API
- Stack-specific endpoints: `/stacks/{postId}/related`, `/api/stacks/{stackId}/questions`
- Standard Mastodon endpoints: `/api/v1/statuses/`, `/api/v1/timelines/`, etc.

### Environment Variables

Required in `.env.local` only for the live-backend surfaces (the offline demo and store-backed feeds need no env at all):
```
NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID=...
NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_SECRET=...
NEXT_PUBLIC_MODE=development
```

## Key Directories

- `src/app/(shell)/` — All authenticated routes and the shell layout
- `src/app/(shell)/@aside/` — Parallel route for right sidebar content
- `src/components/` — Reusable components (Posts/, Header/, NavBar/, SubmitPost/, etc.)
- `src/utils/` — Helpers (mastoActions.ts, localStore.ts, experimentFlags.ts, useAccessToken.ts)
- `src/types/PostType.tsx` — Core TypeScript interfaces (PostType, ReplyType, PreviewCardType)
- `src/app/FakeData/` — Mock data for development

## Git Conventions

- **Branches**: `<author>/<type>/issue-<number>-<short-description>` (e.g., `asmith/enhancement/issue-5-user-auth`)
- **Commits**: Imperative mood, reference issue number: `Add login form (#5)`. No co-author signatures.
- **PRs**: Include `Closes #<number>` in body. Keep under ~400 changed lines. Merge commits only — never squash or rebase.
- Never push directly to the main branch.
