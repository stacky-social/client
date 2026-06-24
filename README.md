# Stacky

Stacky is a Mastodon-compatible social client built with Next.js. Users browse posts from a Mastodon instance, organize them into **stacks** (categorized discussion threads), and explore related stacks in a right-hand aside panel. It also includes a `/listy-injection` research feature backed by local mock JSON. The stack is Next.js 14 (App Router) with TypeScript, Node 22.x, pnpm, Mantine v7, and axios.

## Prerequisites

- **Node.js 22.x** (see the `engines` field in `package.json`)
- **pnpm** (`npm install -g pnpm`)

## Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Configure environment variables.** Copy the example file and fill in your OAuth credentials:

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

3. **Set the mode.** `NEXT_PUBLIC_MODE=development` makes the app use
   `http://localhost:3000` as its base URL (see `src/utils/DevMode.tsx`), which
   is what the OAuth redirect URI above expects.

## Running

```bash
pnpm dev     # Start the dev server at http://localhost:3000
pnpm build   # Production build
pnpm start   # Start the production server (after pnpm build)
pnpm lint    # Run ESLint via next lint
```

## Testing

```bash
pnpm test:e2e      # Run the Playwright smoke suite
pnpm test:e2e:ui   # Run the suite in the Playwright UI
```

The end-to-end suite consists of no-auth smoke tests covering release-critical
flows. They use the app's local mock data (`src/app/FakeData/listy-injection.json`)
and require neither real OAuth nor a live backend. The suite reuses a dev server
already running on `http://localhost:3002`; if none is running it starts one via
`pnpm dev --port 3002` (see `playwright.config.ts` and `e2e/README.md`).

## Project structure

- `src/app/` — Next.js App Router routes, including the `(shell)` three-panel
  layout and its `@aside` parallel route for the related-stacks panel.
- `src/components/` — Reusable UI components (posts, stacks, navigation, etc.).
- `src/utils/` — Helpers (Mastodon actions, dev-mode base URL, and more).
- `src/app/FakeData/` — Local mock data used in development and by the e2e tests.
- `e2e/` — Playwright smoke tests.

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
