# E2E smoke tests

Run with `pnpm test:e2e` (or `pnpm test:e2e:ui` for the Playwright UI).

The suite reuses a dev server already running on http://localhost:3002; if none is
running it starts one via `pnpm dev --port 3002`.

These are no-auth smoke tests covering release-critical flows. They use the app's
local mock data (`src/app/FakeData/chinese-evs.json` and
`src/app/FakeData/listy-injection.json`) and require neither real
OAuth nor a live backend.
