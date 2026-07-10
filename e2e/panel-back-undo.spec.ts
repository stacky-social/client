import { test, expect, Page } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

// T6 — Back-button undo (single-sentinel ring) + the W6-1 replaceState switch.
// These are the AUTOMATABLE guardrails from the ticket; the browser-behaviour
// ones that resist reliable automation (hard-refresh mid-undo → one dead Back,
// the phantom-sentinel navigate case) are driven manually in a prod build per
// the report. The suite runs on the SAME committed fixture the app ships.

type Rel = { topic?: string; category?: string };
type Related = { id: string; relations?: Rel[] };
type Entry = { focusPost: { id: string }; relatedPosts?: Related[] };

// A focus post whose related panel renders MORE THAN ONE category chip (the chip
// row only shows when categories.length > 1) — so we have a real, undoable,
// URL-writing (?fc) filter interaction to drive.
const entry = (mockData as unknown as Entry[]).find((e) => {
  const cats = new Set(
    (e.relatedPosts ?? []).flatMap((rp) => (rp.relations ?? []).map((r) => r.category)).filter(Boolean),
  );
  return cats.size > 1;
})!;
const FOCUS_ID = entry.focusPost.id;
const DETAIL_URL = `/ChineseEVs/posts/${FOCUS_ID}`;

// The aside category chips (FilterChip): a button in the aside column carrying
// aria-pressed + an aria-label ending in "filter". Scoped tightly so it never
// collides with the reply filter bar's "Remove …"/"Clear all …" controls.
const chip = (page: Page) =>
  page.locator('[data-testid="col-aside"] button[aria-pressed][aria-label$="filter"]');

// A focus-post contribution mark: clicking it applies the PASSAGE ("responses
// to") filter (writes ?fs). Same selector the focus-highlighting suite uses.
const focusMark = (page: Page) => page.locator('[data-testid="focus-reveal"] mark[data-fs]').first();

test.describe('T6 · Back-button undo ring', () => {
  test('W6-1: filter → wait past the URL-sync debounce → browser Back UNDOES (sentinel survived replaceState)', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const firstChip = chip(page).first();
    await expect(firstChip).toBeVisible();
    await expect(firstChip).toHaveAttribute('aria-pressed', 'false');

    // Apply the filter, then WAIT past the 300ms debounce so useUrlSync's
    // history.replaceState fires. If that write stranded/clobbered the sentinel,
    // the Back below would LEAVE the route instead of undoing.
    await firstChip.click();
    await expect(firstChip).toHaveAttribute('aria-pressed', 'true');
    await page.waitForURL(/[?&]fc=/, { timeout: 2000 }); // address bar reflects ?fc

    await page.goBack();

    // Undone: chip inactive again, ?fc gone from the URL, and we are STILL on the
    // detail route (the Back was consumed by the ring, not a navigation).
    await expect(chip(page).first()).toHaveAttribute('aria-pressed', 'false');
    await expect(page).toHaveURL(new RegExp(`${FOCUS_ID}(?:\\?|$)`));
    await expect(page).not.toHaveURL(/[?&]fc=/);
  });

  test('replaceState keeps the address bar AND useSearchParams in sync across successive writes', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const firstChip = chip(page).first();
    await expect(firstChip).toBeVisible();

    // First write: ?fc appears.
    await firstChip.click();
    await page.waitForURL(/[?&]fc=/, { timeout: 2000 });
    const afterFirst = new URL(page.url()).searchParams.get('fc');
    expect(afterFirst, 'first filter encodes ?fc').not.toBeNull();

    // Deselect: the SECOND debounced write must correctly DROP ?fc. This only
    // works if useSearchParams stayed live (the W6-1 bypass would leave the hook
    // reading the stale value, so the "already up to date?" compare misfires and
    // the param lingers / thrashes).
    await firstChip.click();
    await expect(chip(page).first()).toHaveAttribute('aria-pressed', 'false');
    await page.waitForURL((u) => !u.search.includes('fc='), { timeout: 2000 });
    expect(new URL(page.url()).searchParams.get('fc'), 'deselect drops ?fc').toBeNull();
  });

  test('cap-5: 6 interactions → 5 Backs each stay on the route, the 6th LEAVES it (no orphan dead-Back)', async ({ page }) => {
    // Give the detail route a prior entry to leave TO.
    await page.goto('/ChineseEVs');
    await page.goto(DETAIL_URL);
    const firstChip = chip(page).first();
    await expect(firstChip).toBeVisible();

    // Six real, undoable filter mutations (toggle the same chip on/off ×6). Only
    // the last five snapshots survive the cap-5 ring; the single sentinel is
    // shared across all six, so there is exactly one extra history entry.
    for (let i = 0; i < 6; i++) {
      await firstChip.click();
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(400); // let the last debounced write settle

    // Five Backs each undo one step WITHOUT leaving the detail route.
    for (let i = 0; i < 5; i++) {
      await page.goBack();
      await page.waitForTimeout(120);
      await expect(page, `Back #${i + 1} stays on the detail route`).toHaveURL(
        new RegExp(`/ChineseEVs/posts/${FOCUS_ID}`),
      );
    }

    // The ring is now empty → the next Back leaves the route (back to the feed),
    // not a no-op dead-Back on a stranded sentinel.
    await page.goBack();
    await expect(page).toHaveURL(/\/ChineseEVs(?:\?.*)?$/);
    await expect(page).not.toHaveURL(/\/posts\//);
  });

  test('passage filter (focus-post span) is undoable: apply → wait → Back undoes it', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const mark = focusMark(page);
    await expect(mark).toBeVisible();

    // Click a focus-post contribution span → passage filter → ?fs in the URL.
    await mark.click();
    await page.waitForURL(/[?&]fs=/, { timeout: 2000 });

    // Back undoes the passage filter and stays on the detail route (the Post.tsx
    // boundary recorded a pre-interaction snapshot for this gesture).
    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]fs=/);
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${FOCUS_ID}`));
  });

  test('clears are undoable: apply a filter → CLEAR it → Back re-applies it → Back returns to empty', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const firstChip = chip(page).first();
    await expect(firstChip).toBeVisible();

    // Apply a category filter → the reply filter bar appears with a Clear-all.
    await firstChip.click();
    await expect(firstChip).toHaveAttribute('aria-pressed', 'true');
    await page.waitForURL(/[?&]fc=/, { timeout: 2000 });

    const clearAll = page.getByRole('button', { name: 'Clear all reply filters' });
    await expect(clearAll).toBeVisible();

    // Clear via the reply filter bar (the newly-wired boundary). Filter drops.
    await clearAll.click();
    await expect(chip(page).first()).toHaveAttribute('aria-pressed', 'false');
    await page.waitForURL((u) => !u.search.includes('fc='), { timeout: 2000 });

    // Back RE-APPLIES the just-cleared filter (the clear was undoable) …
    await page.goBack();
    await expect(chip(page).first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/[?&]fc=/);

    // … and a second Back returns to the empty (pre-apply) state.
    await page.goBack();
    await expect(chip(page).first()).toHaveAttribute('aria-pressed', 'false');
    await expect(page).not.toHaveURL(/[?&]fc=/);
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${FOCUS_ID}`));
  });

  test('W6-4: the visible Back button consumes a panel undo before navigating', async ({ page }) => {
    // ?from seeds BackButton's previousPath so the visible control renders.
    await page.goto(`${DETAIL_URL}?from=999999999`);
    const backBtn = page.getByRole('button', { name: /Back/ });
    await expect(backBtn).toBeVisible();

    const firstChip = chip(page).first();
    await expect(firstChip).toBeVisible();
    await firstChip.click();
    await expect(firstChip).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(350); // past the debounce

    // Clicking the visible Back consumes the undo (chip clears) and DOES NOT
    // navigate to the previousPath — browser Back and UI Back agree.
    await backBtn.click();
    await expect(chip(page).first()).toHaveAttribute('aria-pressed', 'false');
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${FOCUS_ID}`));
  });
});
