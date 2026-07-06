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

End-to-end tests use **Playwright** (`e2e/*.spec.ts` — 6 spec files, 18 tests): the landing/OAuth page, the `/ChineseEVs` mock feed + post detail, focus highlighting, related-card navigation, a stress user journey, and the `/callback` failure path. Unit tests are plain **node:test** suites in `tests/unit/` (4 suites covering the reply-sort, thread-filter, reply-relations, and experiment-flag helpers), run via `pnpm test:unit`.

## Tech Stack

- **Framework**: Next.js 14 (App Router) with TypeScript
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
- **localStorage**: `accessToken`, `currentUser` (JSON), `stacky:localStore:v1` (offline post/interaction store), `stacky:experimentFlags:v1` (experiment flags), `stacky:feedRatio` (feed/aside split ratio)
- **sessionStorage**: `scrollY:{path}` for scroll restoration, `previousPath:{path}` for back navigation, `activeFeedPost:/ChineseEVs` for restoring the focused feed post

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
