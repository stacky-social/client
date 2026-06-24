import { test, expect } from '@playwright/test';
import { gotoFeed, sel, FEED_ROUTE, firstFocusId, relatedCards } from './helpers';

const feedWrappers = (page: import('@playwright/test').Page) =>
  page.locator('div[data-post-id]:has([data-testid="post"])');

// R-NAV — navigation, restoration, back.
test.describe('Navigation (R-NAV)', () => {
  test('R-NAV-1: activating a feed post routes to its detail and seeds back state', async ({ page }) => {
    await gotoFeed(page);
    const wrapper = feedWrappers(page).nth(1);
    const id = await wrapper.getAttribute('data-post-id');
    expect(id).toBeTruthy();
    // Keyboard-activate the post header (role=button) — exercises R-A11Y-3 too.
    await wrapper.locator('[role="button"]').first().press('Enter');
    await page.waitForURL(new RegExp(`/ChineseEVs/posts/${id}`));
    await expect(page.getByText(/Application error|not found in mock data/i)).toHaveCount(0);
    const prev = await page.evaluate(
      (pid) => sessionStorage.getItem(`previousPath:/ChineseEVs/posts/${pid}`),
      id,
    );
    expect(prev).toBe('/ChineseEVs');
  });

  test('R-NAV-2: the detail route (reached from the feed) renders Back, the focus post, and a reply box', async ({ page }) => {
    await gotoFeed(page);
    const wrapper = feedWrappers(page).first();
    const id = await wrapper.getAttribute('data-post-id');
    await wrapper.locator('[role="button"]').first().press('Enter');
    await page.waitForURL(new RegExp(`/ChineseEVs/posts/${id}`));
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Application error|not found in mock data/i)).toHaveCount(0);
    // Back renders because navigating from the feed seeds previousPath.
    await expect(page.getByRole('button', { name: /back/i }).first()).toBeVisible();
    await expect(page.getByPlaceholder(/reply/i).first()).toBeVisible();
    const body = (await page.locator('body').innerText()).trim();
    expect(body.length).toBeGreaterThan(200);
  });

  test('R-NAV-3/7: navigating into a related post from the detail aside never crashes', async ({ page }) => {
    await page.goto(`${FEED_ROUTE}/posts/${firstFocusId}`);
    await page.waitForLoadState('networkidle');
    // The aside shows related cards on the detail route too.
    const card = relatedCards(page).first();
    await card.waitFor({ state: 'visible' });
    await card.click();
    await page.waitForURL(/\/ChineseEVs\/posts\/.+/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Application error|not found in mock data/i)).toHaveCount(0);
    // Hop once more (rapid multi-hop) — still coherent, no error overlay.
    const card2 = relatedCards(page).first();
    if (await card2.count()) {
      await card2.click();
      await page.waitForTimeout(400);
      await expect(page.getByText(/Application error|not found in mock data/i)).toHaveCount(0);
    }
  });

  test('R-NAV (back): the Back control returns to the feed with a focused post', async ({ page }) => {
    await gotoFeed(page);
    const wrapper = feedWrappers(page).nth(1);
    const id = await wrapper.getAttribute('data-post-id');
    await wrapper.locator('[role="button"]').first().press('Enter');
    await page.waitForURL(new RegExp(`/ChineseEVs/posts/${id}`));
    await page.getByRole('button', { name: /back/i }).first().click();
    await page.waitForURL(/\/ChineseEVs$/);
    await expect(page.locator(sel.activePost)).toHaveCount(1);
  });

  test('R-NAV-6: an unresolvable post id is refused (no blank/crashed page)', async ({ page }) => {
    await page.goto(`${FEED_ROUTE}/posts/does-not-exist-999`);
    await page.waitForLoadState('networkidle');
    // Never a raw crash; shows an explicit unavailable/empty state or redirects.
    await expect(page.getByText(/Application error/i)).toHaveCount(0);
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).toMatch(/unavailable|not found|back|no related/i);
  });
});
