import { expect, test } from '@playwright/test';

test('scrolling comments pins a compact focus and reveals its connected passage', async ({ page }) => {
  await page.goto('/ChineseEVs/posts/152053690');
  const region = page.getByTestId('reply-scroll-region');
  const wrapper = page.locator('[data-focus-compact]');
  const focus = wrapper.getByTestId('post');
  await expect(region.locator('[data-reply-range-id]').first()).toBeVisible();
  const before = (await focus.boundingBox())!;
  await region.evaluate((el) => { el.scrollTop = 180; });
  await expect(wrapper).toHaveAttribute('data-focus-compact', 'true');
  await expect.poll(async () => (await focus.boundingBox())!.height).toBeLessThan(before.height);
  await expect.poll(async () => (await focus.boundingBox())!.y).toBeLessThanOrEqual(73);
  await expect(focus).toHaveAttribute('data-active', 'true');
  const mark = region.locator('[data-reply-range-id]').first();
  await mark.hover();
  await expect(wrapper.locator('[data-aside-highlight]').first()).toBeVisible();
  const geometry = await wrapper.evaluate((el) => {
    const text = el.querySelector('[data-testid="focus-reveal"]')!;
    const visible = text.getBoundingClientRect();
    return Array.from(text.querySelectorAll('[data-aside-highlight]')).some((node) =>
      Array.from(node.getClientRects()).some((rect) => rect.top < visible.bottom && rect.bottom > visible.top));
  });
  expect(geometry).toBe(true);
  await page.screenshot({ path: '/tmp/stacky-comment-collapse.png' });
  await page.mouse.move(640, 25);
  await region.evaluate((el) => { el.scrollTop = 0; });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(wrapper).toHaveAttribute('data-focus-compact', 'false');
  await expect.poll(async () => (await focus.boundingBox())!.height).toBeCloseTo(before.height, 0);
});

test('a reused related reply keeps relations for the current focus post', async ({ page }) => {
  await page.goto('/EnergyTech/posts/cw-ZxtKNgk5tb6f2bUf');
  const reply = page.getByTestId('reply-scroll-region').locator('[data-post-id="cw-mlNEI4xR_N47qC9m"]');
  await expect(reply).toContainText("America's power grid");
  await expect(reply.locator('[data-reply-range-id]').first()).toBeAttached();
  await reply.locator('[data-reply-range-id]').first().hover();
  await expect(page.locator('[data-focus-compact] [data-aside-highlight]').first()).toBeVisible();
  await page.locator('[data-focus-compact] mark').filter({ hasText: "can't afford" }).first().hover();
  await expect(reply.locator('[data-focus-cross-highlight="true"]')).toBeVisible();
  await page.mouse.move(640, 25);
  await expect(reply.locator('[data-focus-cross-highlight="true"]')).toHaveCount(0);
});
