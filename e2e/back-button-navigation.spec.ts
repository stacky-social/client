import { expect, test } from '@playwright/test';

// The visible Back button is a PAGE control: it returns you to wherever you came
// from. Filter interactions push history entries, so `router.back()` spent this
// button on undoing one filter step instead of leaving the post — which is not
// what a labelled "Back" affordance promises.
//
// Browser Back and the keyboard shortcut keep undoing filters; that separation
// is the point, and the last test here pins it.
//
// previousPath is seeded by the feed, the aside, search, bookmarks, home and by
// ?from= on shared links. Those paths are untouched by this change, so these
// tests seed the key directly and exercise the button's own contract.

const POST = '/EnergyTech/posts/cw-S1VeKWSitwk9wRrq';
const FEED = '/EnergyTech';
const backButton = 'button:has-text("Back")';

test('the visible Back button returns to the page you came from', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(([post, feed]) => {
    sessionStorage.setItem(`previousPath:${post}`, feed);
  }, [POST, FEED]);
  await page.goto(POST, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="focus-reveal"]').first()
    .waitFor({ state: 'visible', timeout: 90_000 });

  // Put real filter state on the history stack — a related-card span is what
  // writes ft/fo/fa/fi into the URL. This is the state that used to swallow the
  // click: `router.back()` spent it undoing one filter step.
  const span = page.locator('[data-related-card] mark[data-range-id]').first();
  await expect(span).toBeAttached({ timeout: 60_000 });
  await span.scrollIntoViewIfNeeded();
  await span.click();
  await expect
    .poll(() => new URL(page.url()).search, { timeout: 15_000 })
    .not.toBe('');

  await page.locator(backButton).first().click();
  await page.waitForURL((url) => url.pathname === FEED, { timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe(FEED);
});

test('with no recorded origin it falls back to the corpus feed', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  // A deep link with no ?from= and nothing in sessionStorage.
  await page.goto(POST, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="focus-reveal"]').first()
    .waitFor({ state: 'visible', timeout: 90_000 });
  // The focus post paints before the rest of the route hydrates; clicking
  // before the handler attaches silently does nothing.
  await page.locator('[data-related-card]').first()
    .waitFor({ state: 'attached', timeout: 60_000 });

  await page.locator(backButton).first().click();
  await page.waitForURL((url) => url.pathname === FEED, { timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe(FEED);
});

test('browser Back still undoes a filter rather than leaving the post', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(POST, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="focus-reveal"]').first()
    .waitFor({ state: 'visible', timeout: 90_000 });

  const span = page.locator('[data-related-card] mark[data-range-id]').first();
  await expect(span).toBeAttached({ timeout: 60_000 });
  await span.scrollIntoViewIfNeeded();
  await span.click();
  await expect
    .poll(() => new URL(page.url()).search, { timeout: 15_000 })
    .not.toBe('');

  await page.goBack();

  // Still reading the same post — the filter came off, the page did not.
  await expect.poll(() => new URL(page.url()).search, { timeout: 15_000 }).toBe('');
  expect(new URL(page.url()).pathname).toBe(POST);
});
