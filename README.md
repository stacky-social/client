# crossweave

crossweave is a Mastodon-compatible social client built with Next.js. Users browse a feed of posts and explore **stacks** — groups of related posts — in a right-hand panel connected to the post they are reading. It also includes a `/ChineseEVs` research feed backed by local mock JSON, which doubles as a zero-setup demo. The stack is Next.js 15 (App Router) with TypeScript, Node 22.x, pnpm, Mantine v7, and axios.

## Quick demo (no credentials needed)

The fastest way to see the app is the bundled demo feed — no OAuth registration,
no backend, no `.env.local`:

```bash
pnpm install
pnpm dev
```

Then open <http://localhost:3000/ChineseEVs>. The feed calls a bundled simulated
backend (`/api/demo`) that serves cursor-paginated data from the local fixture
with realistic latency. Likes, bookmarks, and replies all work and persist
locally in your browser via localStorage — nothing leaves your machine.

## Prerequisites

- **Node.js 22.x** (see the `engines` field in `package.json`)
- **pnpm** (`npm install -g pnpm`)

## Running

```bash
pnpm dev     # Start the dev server at http://localhost:3000
pnpm build   # Production build
pnpm start   # Start the production server (after pnpm build)
pnpm lint    # Run ESLint via next lint
```

## Testing

```bash
pnpm test:e2e      # Playwright end-to-end suite (6 spec files, 18 tests)
pnpm test:e2e:ui   # Run the e2e suite in the Playwright UI
pnpm test:unit     # Unit tests (node --test tests/unit/)
```

The end-to-end suite consists of no-auth smoke and stress tests covering
release-critical flows. They use the app's local mock data
(`src/app/FakeData/listy-injection.json`) and require neither real OAuth nor a
live backend. The suite reuses a dev server already running on
`http://localhost:3002`; if none is running it starts one via
`pnpm dev --port 3002`. Set `E2E_BASE_URL` to point the suite at an
already-running server (for example a production build) instead — see
`playwright.config.ts` and `e2e/README.md`.

Unit tests are plain `node:test` suites in `tests/unit/` covering the
reply-sort, thread-filter, reply-relations, and experiment-flag helpers.

## Connecting a live Mastodon-compatible backend (optional)

Most of the app runs fully offline: the `/ChineseEVs` simulated API plus the `/home`,
`/search`, `/user`, `/bookmarks`, and `/liked` feeds are backed by a local
store in your browser's localStorage. Only the legacy live-mode surfaces
(`/posts/[id]`, `/tag`, `/oldversion`, `/explore`, `/annotation`) call the
Mastodon-compatible backend, and signing in requires OAuth credentials:

1. **Configure environment variables.** Copy the example file and fill in your
   OAuth credentials:

   ```bash
   cp .env.example .env.local
   ```

   To obtain the OAuth credentials, register an application on your Mastodon
   instance under **Preferences → Development → New application**:

   - **Redirect URI:** `http://localhost:3000/callback`
   - **Scopes:** `read write follow`

   After creating the application, copy its client key and client secret into
   `.env.local`:

   ```
   NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID=...
   NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_SECRET=...
   ```

2. **Set the mode.** `NEXT_PUBLIC_MODE=development` makes the app use
   `http://localhost:3000` as its base URL (see `src/utils/DevMode.tsx`), which
   is what the OAuth redirect URI above expects.

3. **Sign in.** The landing page (`/`) handles Mastodon instance selection and
   starts the OAuth flow; `/callback` completes it.

## Glossary

Five terms recur throughout the UI, the docs, and the code:

- **Post** — a feed item.
- **Reply** — a threaded response under a post.
- **Related post** — an item in the right-hand panel connected to the focus
  post (the post currently being read). The panel is headed "Related
  responses" in today's UI; the canonical term is **related post**.
- **Stack** — a group of related posts (size ≥ 1).
- **Topic** — the label a relation carries, used for grouping related posts.

## Project structure

- `src/app/` — Next.js App Router routes, including the `(shell)` layout
  (sticky top nav + horizontally centered feed/aside group with a single
  ratio slider) and its `@aside` parallel route for the related-posts panel.
- `src/components/` — Reusable UI components (posts, related-posts panel,
  navigation, etc.).
- `src/services/` — Typed frontend API clients. `demoApiClient.ts` is the swap
  boundary between the bundled simulated route and a future live service.
- `src/app/api/demo/` — Simulated backend handlers with delay, cursor pagination,
  and backend-shaped AI enrichment metadata.
- `src/utils/` — Helpers (Mastodon actions, the localStorage-backed store,
  experiment flags, dev-mode base URL, and more).
- `src/app/FakeData/` — Local mock data used by the demo and the e2e tests.
- `e2e/` — Playwright smoke and stress tests.
- `tests/unit/` — `node:test` unit suites.

## Contributing

The repository lives at <https://github.com/stacky-social/client>. Please open an
issue or pull request there.

Branch naming, commit message, and pull request conventions are documented in
[`CLAUDE.md`](./CLAUDE.md) and under [`.claude/rules/`](./.claude/rules/). In
short: branch as `<author>/<type>/issue-<number>-<short-description>`, write
commits in the imperative mood and reference the issue number, and keep PRs
focused with a `Closes #<number>` reference in the body.

## Known limitations

Some hardening is still planned before this is fully production-ready: more
robust handling of the OAuth client secret, sanitizing rendered post HTML, and
broader accessibility coverage.
