# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stacky is a Mastodon-compatible social media client built with Next.js. Users browse posts from a Mastodon instance, organize them into "stacks" (categorized discussion threads), and interact via favorites, bookmarks, and annotations.

## Commands

```bash
pnpm install    # Install dependencies
pnpm dev        # Start dev server at localhost:3000
pnpm build      # Production build
pnpm lint       # ESLint via next lint
```

No test framework is configured.

## Tech Stack

- **Framework**: Next.js 14 (App Router) with TypeScript
- **Runtime**: Node.js 22.x
- **Package manager**: pnpm
- **UI library**: Mantine v7 (AppShell, components, hooks, notifications)
- **HTTP client**: axios
- **Icons**: @tabler/icons-react, lucide-react
- **Styling**: CSS Modules + PostCSS with Mantine preset
- **Backend**: Mastodon-compatible API at `https://beta.stacky.social:3002`

## Architecture

### Routing & Layout

The app uses Next.js App Router with a **route group** `(shell)` that wraps all authenticated pages in a three-panel layout (`Shell.tsx`):
- **Left navbar**: `NavBar/Navbar` — navigation links
- **Center main**: page content
- **Right aside**: `@aside` parallel route slot — shows related stacks for the active post

The landing page (`/`) handles Mastodon OAuth instance selection. `/callback` completes the OAuth flow and stores tokens in localStorage.

### Parallel Routes

`src/app/(shell)/@aside/` is a Next.js parallel route that renders the aside panel independently. Each route under `(shell)` has a corresponding `@aside` directory that controls what appears in the right panel.

### State Management

- **RelatedStacksContext** (`related-stacks-context.tsx`): Shared context in the shell layout. Manages which post's related stacks are shown in the aside panel. Provides toggle behavior — clicking the same post hides its stacks.
- **localStorage**: `accessToken`, `currentUser` (JSON), `authCode`
- **sessionStorage**: `scrollY:{path}` for scroll restoration, `previousPath` for back navigation

### Post List Caching (PostList.tsx)

`PostList` uses a module-level `Map` cache (not React state) that survives component remounts during SPA navigation:
- 5-minute TTL, LRU eviction at 20 entries
- Stale-While-Revalidate: serves cached posts instantly, revalidates in background
- Scroll position saved to sessionStorage on navigation, restored on return
- Stack data loaded in batches of 2 concurrent requests per post

### API Integration

All API calls go to `https://beta.stacky.social:3002`. Auth is via OAuth Bearer token from localStorage. Key patterns:
- `mastoActions.ts`: Mastodon interaction helpers (favorite, bookmark, boost)
- Stack-specific endpoints: `/stacks/{postId}/related`, `/api/stacks/{stackId}/questions`
- Standard Mastodon endpoints: `/api/v1/statuses/`, `/api/v1/timelines/`, etc.

### Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID=...
NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_SECRET=...
NEXT_PUBLIC_MODE=development
```

## Key Directories

- `src/app/(shell)/` — All authenticated routes and the shell layout
- `src/app/(shell)/@aside/` — Parallel route for right sidebar content
- `src/components/` — Reusable components (Posts/, Header/, NavBar/, SubmitPost/, etc.)
- `src/utils/` — Helpers (mastoActions.ts, useAccessToken.ts, emojiMapping.ts)
- `src/types/PostType.tsx` — Core TypeScript interfaces (PostType, ReplyType, PreviewCardType)
- `src/app/FakeData/` — Mock data for development

## Git Conventions

- **Branches**: `<author>/<type>/issue-<number>-<short-description>` (e.g., `asmith/feature/issue-5-user-auth`)
- **Commits**: Imperative mood, reference issue number: `Add login form (#5)`. No co-author signatures.
- **PRs**: Include `Closes #<number>` in body. Keep under ~400 changed lines. Merge commits only — never squash or rebase.
- Never push directly to the main branch.
