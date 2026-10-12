import { expect, test, type Page } from '@playwright/test';

// The clicked related card must not move. Grouping by a span's topic, by a
// card's contribution-type icon, and dismissing the group with the header ×
// all reorder the panel; the card the reader acted on (and, for a span click,
// the span itself) stays at exactly the same viewport position while the other
// cards gather around it. Covered on Home and a post-detail route, for a card
// near the top, a card far down the scrolled panel, and a card that only
// exists after the panel paginated past its first ten cards.
const TOLERANCE = 1;
const DETAIL_URL = '/Tariffs/posts/cw-98ap5xG92L0LqEbQ';

type Sample = { card: number; target: number };

async function openDetail(page: Page) {
  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-related-card]').first()).toBeAttached({ timeout: 90_000 });
}

async function openHome(page: Page) {
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-related-card]').first()).toBeAttached({ timeout: 90_000 });
  // Pick the first feed post whose related panel paginates (more than ten cards).
  const posts = page.locator('[data-store-feed-post]');
  const count = await posts.count();
  for (let i = 0; i < count; i++) {
    await posts.nth(i).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    const more = await page.getByTestId('col-aside').evaluate((aside) => {
      const remaining = aside.querySelector('[data-testid="related-auto-load"] .related-auto-load-count');
      return Number((remaining?.textContent ?? '0').replace(/\D/g, '')) >= 5;
    });
    if (more) return;
  }
  throw new Error('no Home post with a paginated related panel');
}

/** Ensure the panel holds at least `n` cards by scrolling it to its bottom. */
async function revealCards(page: Page, n: number) {
  const aside = page.getByTestId('col-aside');
  for (let tries = 0; tries < 10; tries++) {
    const count = await page.locator('[data-related-card]').count();
    if (count >= n) return;
    await aside.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(400);
  }
  expect(await page.locator('[data-related-card]').count()).toBeGreaterThanOrEqual(n);
}

/** Card post ids in panel order. */
const cardIds = (page: Page) => page.locator('[data-related-card]').evaluateAll((cards) =>
  cards.map((card) => card.querySelector('[data-post-id]')!.getAttribute('data-post-id')!));

/** Sample the card's and a target element's viewport tops for ~1.1s. */
async function startSampling(page: Page, postId: string, targetSelector: string | null) {
  await page.evaluate(({ postId, targetSelector }) => {
    const samples: { card: number; target: number }[] = [];
    (window as any).anchorSamples = samples;
    const until = performance.now() + 1100;
    const sample = () => {
      const card = document.querySelector(`[data-related-card]:has([data-post-id="${postId}"])`);
      const target = targetSelector ? card?.querySelector(targetSelector) ?? null : card;
      if (card && target) {
        samples.push({ card: card.getBoundingClientRect().top, target: target.getBoundingClientRect().top });
      } else {
        samples.push({ card: NaN, target: NaN });
      }
      if (performance.now() < until) requestAnimationFrame(sample);
    };
    sample();
  }, { postId, targetSelector });
}

async function drifts(page: Page) {
  await page.waitForTimeout(1150);
  const samples = await page.evaluate(() => (window as any).anchorSamples as Sample[]);
  expect(samples.length).toBeGreaterThan(5);
  const drift = (key: keyof Sample) =>
    Math.max(...samples.map((s) => Math.abs(s[key] - samples[0][key])));
  return { card: drift('card'), target: drift('target') };
}

/** Center an element in the related panel by scrolling the panel alone
 *  (scrollIntoView would also scroll the page, and on Home that refocuses the
 *  feed and swaps the whole panel). */
const centerInAside = (el: Element) => {
  const aside = el.closest('[data-testid="col-aside"]') as HTMLElement;
  const a = aside.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  aside.scrollTop += r.top + r.height / 2 - (a.top + a.height / 2);
};

/** Put the card at `index` in the middle of the panel and hover `selector` in it. */
async function settle(page: Page, postId: string, selector: string) {
  const card = page.locator(`[data-related-card]:has([data-post-id="${postId}"])`);
  const target = card.locator(selector).first();
  await target.evaluate(centerInAside);
  await page.waitForTimeout(350);
  await target.hover();
  // Hover can start a short reading-window scroll inside the card; wait it out.
  let top = (await target.boundingBox())!.y;
  await expect.poll(async () => {
    const previous = top;
    await page.waitForTimeout(150);
    top = (await target.boundingBox())!.y;
    return Math.abs(top - previous);
  }, { timeout: 5000 }).toBeLessThan(0.5);
  return target;
}

/** A span on the card whose topic other posts share (a click groups). */
async function groupableSpanSelector(page: Page, postId: string) {
  const card = page.locator(`[data-related-card]:has([data-post-id="${postId}"])`);
  const ids = await card.locator('mark[data-range-id]').evaluateAll((marks) =>
    marks.map((m) => m.getAttribute('data-range-id')!));
  return ids.map((id) => `mark[data-range-id="${id}"]`);
}

async function clickHere(page: Page) {
  await page.mouse.down();
  await page.mouse.up();
}

type Route = 'home' | 'detail';
const ROUTES: Route[] = ['detail', 'home'];
const POSITIONS = [0, 6, 13];

for (const route of ROUTES) {
  for (const index of POSITIONS) {
    test.describe(`${route}: related card ${index + 1}`, () => {
      test.beforeEach(async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 1440, height: 1000 });
        if (route === 'home') await openHome(page);
        else await openDetail(page);
        await revealCards(page, index + 1);
      });

      test('span click and × keep the card and span still', async ({ page }) => {
        const postId = (await cardIds(page))[index];
        const selectors = await groupableSpanSelector(page, postId);
        expect(selectors.length).toBeGreaterThan(0);
        let grouped = false;
        for (const selector of selectors) {
          await settle(page, postId, selector);
          await startSampling(page, postId, selector);
          await clickHere(page);
          await page.waitForTimeout(100);
          grouped = await page.locator('[data-related-group-header]').count() > 0;
          const d = await drifts(page);
          if (!grouped) continue; // "0 more" spans are a no-op; try the next
          console.log(`[${route} #${index + 1}] span activate drift card=${d.card.toFixed(1)} span=${d.target.toFixed(1)}`);
          expect(d.target, 'span activate: clicked span must stay put').toBeLessThanOrEqual(TOLERANCE);
          expect(d.card, 'span activate: clicked card must stay put').toBeLessThanOrEqual(TOLERANCE);
          break;
        }
        expect(grouped, 'some span on the card groups').toBe(true);

        // Dismiss with the group header's ×.
        const dismiss = page.locator('[data-related-group-header] button').first();
        await dismiss.evaluate(centerInAside);
        await page.waitForTimeout(350);
        await dismiss.hover();
        await page.waitForTimeout(150);
        await startSampling(page, postId, null);
        await clickHere(page);
        await expect(page.locator('[data-related-group-header]')).toHaveCount(0);
        const d = await drifts(page);
        console.log(`[${route} #${index + 1}] × after span drift card=${d.card.toFixed(1)}`);
        expect(d.card, '×: anchor card must stay put').toBeLessThanOrEqual(TOLERANCE);
      });

      test('type icon click (on, off) and × keep the card still', async ({ page }) => {
        const postId = (await cardIds(page))[index];
        const icon = '[data-related-tag]';
        await settle(page, postId, icon);
        await startSampling(page, postId, icon);
        await clickHere(page);
        await expect(page.locator('[data-related-group-header]')).toHaveCount(1);
        let d = await drifts(page);
        console.log(`[${route} #${index + 1}] icon activate drift card=${d.card.toFixed(1)} icon=${d.target.toFixed(1)}`);
        expect(d.target, 'icon activate: clicked icon must stay put').toBeLessThanOrEqual(TOLERANCE);
        expect(d.card, 'icon activate: clicked card must stay put').toBeLessThanOrEqual(TOLERANCE);

        // Same icon again toggles the group off.
        await startSampling(page, postId, icon);
        await clickHere(page);
        await expect(page.locator('[data-related-group-header]')).toHaveCount(0);
        d = await drifts(page);
        console.log(`[${route} #${index + 1}] icon deactivate drift card=${d.card.toFixed(1)} icon=${d.target.toFixed(1)}`);
        expect(d.target, 'icon deactivate: clicked icon must stay put').toBeLessThanOrEqual(TOLERANCE);

        // Re-group, then dismiss with the header ×.
        await settle(page, postId, icon);
        await clickHere(page);
        await expect(page.locator('[data-related-group-header]')).toHaveCount(1);
        await page.waitForTimeout(500);
        const dismiss = page.locator('[data-related-group-header] button').first();
        await dismiss.evaluate(centerInAside);
        await page.waitForTimeout(350);
        await dismiss.hover();
        await page.waitForTimeout(150);
        await startSampling(page, postId, null);
        await clickHere(page);
        await expect(page.locator('[data-related-group-header]')).toHaveCount(0);
        d = await drifts(page);
        console.log(`[${route} #${index + 1}] × after icon drift card=${d.card.toFixed(1)}`);
        expect(d.card, '×: anchor card must stay put').toBeLessThanOrEqual(TOLERANCE);
      });

      test('switching groups and the frozen-header × keep the card still', async ({ page }) => {
        const first = (await cardIds(page))[index];
        await settle(page, first, '[data-related-tag]');
        await clickHere(page);
        await expect(page.locator('[data-related-group-header]')).toHaveCount(1);
        await page.waitForTimeout(500);

        // Another card's last type icon switches (or toggles) the grouping.
        const order = await cardIds(page);
        const at = order.indexOf(first);
        const other = order[at + 2 < order.length ? at + 2 : at - 2];
        const icon = '[data-related-tag]:last-of-type';
        await settle(page, other, icon);
        await startSampling(page, other, icon);
        await clickHere(page);
        let d = await drifts(page);
        console.log(`[${route} #${index + 1}] icon switch drift card=${d.card.toFixed(1)} icon=${d.target.toFixed(1)}`);
        expect(d.target, 'switch: clicked icon must stay put').toBeLessThanOrEqual(TOLERANCE);
        expect(d.card, 'switch: clicked card must stay put').toBeLessThanOrEqual(TOLERANCE);
        if (await page.locator('[data-related-group-header]').count() === 0) return;

        // Wheel down until the group's frozen header copy shows, then × it.
        const aside = page.getByTestId('col-aside');
        const bar = page.locator('[data-related-group-sticky-bar]');
        const box = (await aside.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let i = 0; i < 40 && await bar.getAttribute('data-visible') !== 'true'; i++) {
          await page.mouse.wheel(0, 60);
          await page.waitForTimeout(120);
        }
        if (await bar.getAttribute('data-visible') !== 'true') return; // group too short to freeze
        await page.waitForTimeout(400);
        const anchor = await page.getByTestId('active-group-anchor').locator('[data-post-id]').getAttribute('data-post-id');
        await page.getByTestId('related-group-sticky-dismiss').hover();
        await page.waitForTimeout(150);
        await startSampling(page, anchor!, null);
        await clickHere(page);
        await expect(page.locator('[data-related-group-header]')).toHaveCount(0);
        d = await drifts(page);
        console.log(`[${route} #${index + 1}] frozen × drift card=${d.card.toFixed(1)}`);
        expect(d.card, 'frozen ×: anchor card must stay put').toBeLessThanOrEqual(TOLERANCE);
      });
    });
  }
}
