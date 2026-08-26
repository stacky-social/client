import { test, expect, Page } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

// Shareable filter history. Every filter/sort state has a URL representation,
// browser Back restores the preceding state, and growth is bounded at 24 entries.

type Rel = { topic?: string; category?: string };
type Related = { id: string; relations?: Rel[] };
type Entry = {
  focusPost: { id: string };
  relatedPosts?: Related[];
  replies?: Array<{ inReplyToId?: string | null }>;
};

// A focus post whose related panel renders MORE THAN ONE category chip (the chip
// row only shows when categories.length > 1) — so we have a real, undoable,
// URL-writing (?fc) filter interaction to drive.
const entry = (mockData as unknown as Entry[]).find((e) => {
  const cats = new Set(
    (e.relatedPosts ?? []).flatMap((rp) => (rp.relations ?? []).map((r) => r.category)).filter(Boolean),
  );
  const topLevelReplies = (e.replies ?? [])
    .filter((reply) => (reply.inReplyToId ?? e.focusPost.id) === e.focusPost.id)
    .length;
  return cats.size > 1 && topLevelReplies > 5;
})!;
const FOCUS_ID = entry.focusPost.id;
const DETAIL_URL = `/AIWorkforce/posts/${FOCUS_ID}`;
const OTHER_ENTRY = (mockData as unknown as Entry[]).find((candidate) => {
  if (candidate.focusPost.id === FOCUS_ID) return false;
  const categories = new Set(
    (candidate.relatedPosts ?? [])
      .flatMap((post) => (post.relations ?? []).map((relation) => relation.category))
      .filter(Boolean),
  );
  return categories.size > 1;
})!;
const OTHER_DETAIL_URL = `/AIWorkforce/posts/${OTHER_ENTRY.focusPost.id}`;

// The aside category chips (FilterChip): a button in the aside column carrying
// aria-pressed + an aria-label ending in "filter". Scoped tightly so it never
// collides with the reply filter bar's "Remove …"/"Clear all …" controls.
const chip = (page: Page) =>
  page.locator('[data-testid="col-aside"] button[aria-pressed][aria-label$="filter"]');

// A focus-post contribution mark: clicking it applies the PASSAGE ("responses
// to") filter (writes ?fs). Same selector the focus-highlighting suite uses.
const focusMark = (page: Page) => page.locator('[data-testid="focus-reveal"] mark[data-fs]').first();

test.describe('Shareable related-post filter history', () => {
  test('category filter gets a shareable URL and browser Back restores the clean state', async ({ page }) => {
    await page.goto(`${DETAIL_URL}?flags=summaryCard:0`);
    const firstChip = chip(page).first();
    await expect(firstChip).toBeVisible();
    await expect(firstChip).toHaveAttribute('aria-pressed', 'false');

    await firstChip.click();
    await expect(firstChip).toHaveAttribute('aria-pressed', 'true');
    await page.waitForURL(/[?&]fc=/, { timeout: 2000 }); // address bar reflects ?fc
    expect(new URL(page.url()).searchParams.get('flags')).toBe('summaryCard:0');

    await page.goBack();

    // Undone: chip inactive, ?fc gone, and still on the detail route.
    await expect(chip(page).first()).toHaveAttribute('aria-pressed', 'false');
    await expect(page).toHaveURL(new RegExp(`${FOCUS_ID}(?:\\?|$)`));
    await expect(page).not.toHaveURL(/[?&]fc=/);
    expect(new URL(page.url()).searchParams.get('flags')).toBe('summaryCard:0');
  });

  test('successive writes keep the address bar and useSearchParams synchronized', async ({ page }) => {
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

  test('24 transitions push; the 25th replaces instead of growing browser history', async ({ page }) => {
    // Give the detail route a prior entry to leave TO.
    await page.goto('/AIWorkforce');
    await page.goto(DETAIL_URL);
    const firstChip = chip(page).first();
    await expect(firstChip).toBeVisible();

    const initialHistoryLength = await page.evaluate(() => history.length);
    for (let i = 0; i < 25; i++) {
      await firstChip.click();
      await page.waitForTimeout(20);
    }
    const cappedHistoryLength = await page.evaluate(() => history.length);
    expect(cappedHistoryLength - initialHistoryLength).toBe(24);

    // All 24 retained transitions are real Back steps on the detail route.
    for (let i = 0; i < 24; i++) {
      await page.goBack();
      await page.waitForTimeout(25);
      await expect(page, `Back #${i + 1} stays on the detail route`).toHaveURL(
        new RegExp(`/AIWorkforce/posts/${FOCUS_ID}`),
      );
    }

    // The next Back is ordinary route navigation—there is no orphan/dead entry.
    await page.goBack();
    await expect(page).toHaveURL(/\/AIWorkforce(?:\?.*)?$/);
    await expect(page).not.toHaveURL(/\/posts\//);
  });

  test('a different post receives a fresh 24-step budget after ordinary SPA navigation', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const firstChip = chip(page).first();
    await expect(firstChip).toBeVisible();

    // Fill this post's complete filter-history budget.
    for (let i = 0; i < 24; i++) {
      await firstChip.click();
      await page.waitForTimeout(20);
    }

    // Reproduce ordinary navigation that does not call
    // navigateFromPanelScope (TopNav/Link routes take this path). Next patches
    // pushState and performs the same same-document App Router transition.
    await page.evaluate((url) => history.pushState(null, '', url), OTHER_DETAIL_URL);
    await expect(page).toHaveURL(new RegExp(`${OTHER_ENTRY.focusPost.id}(?:\\?|$)`));
    const otherChip = chip(page).first();
    await expect(otherChip).toBeVisible();

    const beforeNewPostFilter = await page.evaluate(() => history.length);
    await otherChip.click();
    await page.waitForURL(/[?&]fc=/);
    expect(await page.evaluate(() => history.length)).toBe(beforeNewPostFilter + 1);

    // The first filter on the new post is a genuine Back step, not a replace
    // forced by abandoned snapshots from the previous post.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${OTHER_ENTRY.focusPost.id}(?:\\?|$)`));
    await expect(page).not.toHaveURL(/[?&]fc=/);
    await expect(chip(page).first()).toHaveAttribute('aria-pressed', 'false');
  });

  test('tab, category, passage, and topic states serialize and Back restores each prior state', async ({ page }) => {
    await page.goto(DETAIL_URL);

    const likedTab = page.getByRole('tab', { name: 'Most liked' });
    await expect(likedTab).toBeVisible();
    await likedTab.click();
    await page.waitForURL(/[?&]tab=liked(?:&|$)/);

    const firstChip = chip(page).first();
    await firstChip.click();
    await page.waitForURL(/[?&]fc=/);
    const categoryValue = new URL(page.url()).searchParams.get('fc');
    expect(categoryValue).toBeTruthy();

    const mark = focusMark(page);
    await mark.click();
    await page.waitForURL(/[?&]fs=/);
    await expect(page).not.toHaveURL(/[?&]fc=/);

    const relationTag = page.locator('[data-related-card] [data-related-tag]').first();
    await expect(relationTag).toBeVisible();
    await relationTag.click();
    await page.waitForURL(/[?&]ft=/);
    const topicUrl = new URL(page.url());
    expect(topicUrl.searchParams.get('fo')).toBe('aside');
    expect(topicUrl.searchParams.get('fa')).toBeTruthy();
    expect(Number(topicUrl.searchParams.get('fi'))).toBeGreaterThanOrEqual(0);
    await expect(page.getByTestId('active-group-anchor').first()).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/[?&]fs=/);
    await expect(page).not.toHaveURL(/[?&]ft=/);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`[?&]fc=${encodeURIComponent(categoryValue!)}`));
    await expect(page.locator('[data-testid="col-aside"] button[aria-pressed="true"][aria-label$="filter"]').first()).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/[?&]tab=liked(?:&|$)/);
    await expect(page).not.toHaveURL(/[?&](?:fc|fs|ft)=/);
    await expect(likedTab).toHaveAttribute('aria-selected', 'true');

    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]tab=/);
    await expect(page.getByRole('tab', { name: 'Top' })).toHaveAttribute('aria-selected', 'true');
  });

  test('a copied topic-filter URL hydrates the grouping after a cold reload', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const relationTag = page.locator('[data-related-card] [data-related-tag]').first();
    await relationTag.click();
    await page.waitForURL(/[?&]ft=/);
    const sharedUrl = page.url();

    await page.goto('/AIWorkforce');
    await page.goto(sharedUrl);

    const hydrated = new URL(page.url());
    expect(hydrated.searchParams.get('ft')).toBeTruthy();
    expect(hydrated.searchParams.get('fo')).toBe('aside');
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    await expect(page.getByTestId('active-group-anchor').first()).toBeVisible();
  });

  test('a syntactically valid but stale topic tuple is removed once related data resolves', async ({ page }) => {
    await page.goto(`${DETAIL_URL}?ft=No+longer+present&fo=aside&fa=missing-card&fi=0`);

    // The panel has loaded real related data, so the URL anchor can now be
    // checked semantically rather than merely parsed for valid syntax.
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    await page.waitForURL((url) => !url.searchParams.has('ft'));
    const healed = new URL(page.url());
    for (const key of ['ft', 'fo', 'fa', 'fi']) expect(healed.searchParams.has(key)).toBe(false);
    await expect(page.getByTestId('active-group-anchor')).toHaveCount(0);

    // Reply-origin tuples resolve against the thread's relation map rather than
    // the aside's cards, but obey the same atomic healing contract.
    await page.goto(`${DETAIL_URL}?ft=No+longer+present&fo=replies&fa=missing-reply&fi=0`);
    await expect(page.getByRole('tab', { name: 'Top' })).toBeVisible();
    await page.waitForURL((url) => !url.searchParams.has('ft'));
    const healedReply = new URL(page.url());
    for (const key of ['ft', 'fo', 'fa', 'fi']) expect(healedReply.searchParams.has(key)).toBe(false);
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
    await expect(page).toHaveURL(new RegExp(`/AIWorkforce/posts/${FOCUS_ID}`));
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
    await expect(page).toHaveURL(new RegExp(`/AIWorkforce/posts/${FOCUS_ID}`));
  });

  test('the in-app Back control remains route navigation; browser Back owns filter history', async ({ page }) => {
    // ?from seeds BackButton's previousPath so the visible control renders.
    await page.goto(`${DETAIL_URL}?from=999999999`);
    const backBtn = page.getByRole('button', { name: /Back/ });
    await expect(backBtn).toBeVisible();

    const firstChip = chip(page).first();
    await expect(firstChip).toBeVisible();
    await firstChip.click();
    await expect(firstChip).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(50);

    // The visible control means "Back to the prior post" and intentionally
    // follows its recorded route. Filter-by-filter undo belongs to the browser
    // Back stack, whose URLs are shareable.
    await backBtn.click();
    await expect(page).toHaveURL(/\/AIWorkforce\/posts\/999999999/);
  });
});
