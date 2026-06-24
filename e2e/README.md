# E2E tests (Playwright)

No-auth, no-backend end-to-end tests that drive the app entirely from local mock
data (`src/app/FakeData/listy-injection.json`). They cover the release-critical
flows and the `/ChineseEVs` research interaction in depth.

## Running

```bash
pnpm test:e2e        # headless (chromium)
pnpm test:e2e:ui     # Playwright UI mode
```

The suite reuses a dev server on the configured port; if none is running it
starts one. The port is configurable so the suite can run in an isolated dev
server (e.g. a parallel git worktree or CI) without colliding with another
`pnpm dev`:

```bash
E2E_PORT=3017 pnpm test:e2e   # default is 3002
```

## Layout

- `helpers.ts` — shared route/viewport constants, verified selectors, and small
  utilities (active-post id, aside card order, tooltip count, page-error
  collector, …).
- `landing.spec.ts` / `callback.spec.ts` — OAuth landing + callback failure UX.
- `layout-shell.spec.ts` — **R-RESIZE**: sticky top nav, centered ≤1280px group,
  single ratio slider (drag + persist + reset), side-by-side & no overflow at
  1920/1440/1200/768/375.
- `feed-focus.spec.ts` — **R-FEED**: one focused post at every scroll position,
  bottom-of-feed pin, stable active border.
- `cross-highlight.spec.ts` — **R-HOVER**: card hover → focus-post marks + sibling
  dim, restore on leave.
- `tooltip.spec.ts` — **R-TIP**: single cursor-following "N more <Topic>" tooltip,
  no double, no strand.
- `grouping-reorder.spec.ts` — **R-GROUP / R-REORDER**: tag-click grouping, block
  header = topic total, single anchor, clear, permanence, singleton honesty,
  visual pin.
- `navigation.spec.ts` — **R-NAV**: route on activate, detail render, related
  navigation, back, unresolvable-id guard.
- `agentic-journeys.spec.ts` — end-to-end multi-step workflows (explore → group →
  switch → clear → navigate → back; scroll-focus sync; filter→group; deep nav
  chain; phone-viewport flow), each with a zero-uncaught-error guard.
- `regression-guards.spec.ts` — §5A: no stack-icon column (RG-1), tags colored at
  rest (RG-C3), honest dates (RG-C2).
- `a11y.spec.ts` — R-A11Y-2/3 (aria-pressed chips, keyboard nav, hit targets).
  Known gaps are recorded as `test.fixme` (R-A11Y-1 nested button, R-EXPAND-2
  bounded reveal) so they're tracked without reddening CI.

Requirement IDs (`R-FEED-3`, `R-REORDER-5`, …) map to
`docs/listy-injection-interaction-requirements.md`.
