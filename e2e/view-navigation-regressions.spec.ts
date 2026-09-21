import { expect, test } from '@playwright/test';

const DETAIL = '/ChineseEVs/posts/152053690';

test('browser Back undoes a contribution filter, the Back button leaves the page', async ({ page }) => {
  await page.goto(DETAIL);
  const tag = page.locator('[data-related-tag]').first();
  const label = await tag.getAttribute('aria-label');
  await expect(tag).toHaveText('');
  await expect(tag.locator('svg')).toBeVisible();
  expect((await tag.boundingBox())!.width).toBeLessThanOrEqual(26);
  await tag.hover();
  await expect(page.getByTestId('hover-tooltip')).toHaveText(label!);
  await tag.click();
  await expect(page).toHaveURL(/[?&]fc=/);
  await expect(page.getByTestId('active-group-anchor')).toHaveCount(0);

  // Browser Back is the undo control: it drops the filter and stays put.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${DETAIL}$`));

  // The visible Back button is the page control. Re-apply the filter to prove
  // it leaves regardless of what is on the history stack; this is a deep link,
  // so there is no recorded origin and it falls back to the corpus feed.
  await tag.click();
  await expect(page).toHaveURL(/[?&]fc=/);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/ChineseEVs', { timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe('/ChineseEVs');
});

test('children scroll beneath a stationary focused post', async ({ page }) => {
  await page.goto(DETAIL);
  const region = page.getByTestId('reply-scroll-region');
  await expect(region.locator('[data-testid="post"]').first()).toBeVisible();
  const focus = page.locator('[data-testid="feed"] [data-post-id="152053690"]');
  await region.evaluate((el) => { el.scrollTop = 100; });
  await expect(page.locator('[data-focus-compact]')).toHaveAttribute('data-focus-compact', 'true');
  const before = await focus.boundingBox();
  const windowY = await page.evaluate(() => window.scrollY);
  await region.evaluate((el) => { el.scrollTop = 200; });
  expect(await region.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect((await focus.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(windowY);
  await expect(focus).toHaveAttribute('data-active', 'true');
});

test('a non-focused post popup stays beside the pointer and accepts a topic', async ({ page }) => {
  await page.goto('/AIWorkforce');
  const mark = page.locator('[data-testid="post"][data-active="false"] mark[aria-label^="Choose among"]:visible').first();
  await expect(mark).toBeVisible();
  await mark.hover();
  const box = await mark.boundingBox();
  const picker = page.getByTestId('focus-topic-picker');
  await expect(picker).toBeVisible({ timeout: 2500 });
  const menuBox = (await picker.boundingBox())!;
  expect(menuBox.x).toBeGreaterThan(20);
  expect(Math.abs(menuBox.y - box!.y)).toBeLessThan(350);
  await page.mouse.move(menuBox.x + 30, menuBox.y + 55, { steps: 15 });
  await page.waitForTimeout(500);
  await expect(picker).toBeVisible();
  await picker.getByRole('menuitemradio').first().click();
  await expect(page.getByTestId('aside-topic-filter')).toBeVisible();
});

test('the active focus topic can be changed in the right panel', async ({ page }) => {
  await page.goto(DETAIL);
  const mark = page.locator('[data-testid="focus-reveal"] mark[aria-label^="Choose among"]:visible').first();
  await mark.click();
  await page.getByRole('button', { name: 'Change topic filter' }).click();
  const items = page.getByRole('menuitem');
  await expect(items.nth(1)).toBeVisible();
  const label = (await items.nth(1).textContent())!.split(' · ')[0];
  await items.nth(1).click();
  await expect(page.getByTestId('aside-topic-filter')).toContainText(label);
});

test('Jason’s related span only emphasizes its authored focus phrase', async ({ page }) => {
  await page.goto('/AIWorkforce/posts/cw-az-_rP88MDYWSRgL');
  const card = page.locator('[data-related-card]').filter({ has: page.locator('[data-post-id="cw-FitirHOoOb200OtJ"]') });
  const span = card.locator('mark[data-range-id]').first();
  await span.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await span.hover();

  const focus = page.locator('[data-testid="feed"] [data-testid="focus-reveal"]').first();
  await expect(focus.locator('mark.fp-aside-muted').first()).toBeVisible();
  const emphasized = await focus.locator('mark:not(.fp-aside-muted)').allTextContents();
  expect(emphasized.join('')).toContain('Who will');
  expect(emphasized.join('')).not.toContain('paid an income');
  await expect(page.locator('[data-focus-article-link], [data-related-article-link]')).toHaveCount(0);
});

test('filtered related-span tooltips contain only the topic name', async ({ page }) => {
  await page.goto(DETAIL);
  const focusMark = page.locator('[data-testid="focus-reveal"] mark[data-range-ids]:visible').first();
  await focusMark.click();
  const span = page.locator('[data-related-card] mark[data-range-id]').first();
  await span.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await span.hover();
  const tooltip = page.getByTestId('hover-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 2500 });
  await expect(tooltip).not.toContainText(/\d+ more|\(shown\)/);
});

test('authored URLs remain inline and truncate without losing their destination', async ({ page }) => {
  await page.goto('/AIWorkforce/posts/cw-az-_rP88MDYWSRgL');
  const card = page.locator('[data-related-card]').filter({ has: page.locator('[data-post-id="cw-FitirHOoOb200OtJ"]') });
  await card.getByRole('button', { name: 'Read more', exact: true }).click();
  const link = card.locator('a.inline-content-link').first();
  await expect(link).toHaveAttribute('href', /^https:\/\/consensus.app\/search\//);
  await expect(link).toHaveCSS('text-overflow', 'ellipsis');
  await expect(link).toHaveCSS('display', 'inline-block');
  expect(await link.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await expect(page.locator('[data-focus-article-link], [data-related-article-link]')).toHaveCount(0);
});

test('Back restores the reply box after opening a child', async ({ page }) => {
  await page.goto(DETAIL);
  const region = page.getByTestId('reply-scroll-region');
  const reply = region.locator('[data-testid="post"]').nth(1);
  await reply.scrollIntoViewIfNeeded();
  const before = await region.evaluate((el) => el.scrollTop);
  const id = await reply.getAttribute('data-post-id');
  await reply.locator('div[role="button"]').first().press('Enter');
  await expect(page).toHaveURL(new RegExp(`/posts/${id}(?:\\?|$)`));
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${DETAIL}$`));
  await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeCloseTo(before, 0);
});

test('revealing an off-screen topic keeps paragraphs from overlapping', async ({ page }) => {
  await page.goto(DETAIL);
  const reveal = page.locator('[data-testid="focus-reveal"]').first();
  await reveal.locator('mark[aria-label^="Choose among"]').first().click();
  await expect(reveal).toHaveCSS('display', 'block');
  const overlaps = await reveal.evaluate((element) => {
    const paragraphs = Array.from(element.querySelectorAll('p'));
    return paragraphs.some((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      return Array.from(range.getClientRects()).some((rect) =>
        rect.bottom > paragraph.getBoundingClientRect().bottom + 1);
    });
  });
  expect(overlaps).toBe(false);
});

test('narrow related cards keep room for the author beside contribution icons', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto('/AIWorkforce/posts/cw-az-_rP88MDYWSRgL');
  const authors = page.locator('[data-related-card] [data-post-id] .avatarHoverDim + div');
  await expect(authors.first()).toBeVisible();
  const widths = await authors.evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().width));
  expect(widths.every((width) => width >= 150)).toBe(true);
});
