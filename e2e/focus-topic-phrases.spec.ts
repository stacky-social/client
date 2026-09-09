import { expect, test } from '@playwright/test';
import mockData from '../src/app/FakeData/chinese-evs.json';

const focusId = (mockData as any)[0].focusPost.id as string;
const DETAIL_URL = `/ChineseEVs/posts/${focusId}`;
const visibleMark = '[data-testid="focus-reveal"] mark[data-range-ids]:visible';

test.describe('focus topic phrases', () => {
  test('phrases are persistently bold, mute their siblings, and open the topic picker', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const mark = page.locator(
      '[data-testid="focus-reveal"] mark[aria-label^="Choose among"]:visible',
    ).first();
    await expect(mark).toBeVisible();

    await expect(mark).toHaveCSS('font-weight', /^(700|bold)$/);
    await expect(mark).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    await mark.hover();
    await expect(mark).toHaveClass(/fp-hot/);
    await expect(mark).toHaveCSS('color', 'rgb(0, 111, 115)');
    const muted = page.locator('[data-testid="focus-reveal"] mark.fp-muted');
    expect(await muted.count()).toBeGreaterThan(0);
    await expect(muted.first()).toHaveCSS('color', 'rgb(123, 135, 153)');
    await expect(page.getByTestId('hover-tooltip')).toBeVisible({ timeout: 900 });

    const picker = page.getByTestId('focus-topic-picker');
    await expect(picker).toBeVisible({ timeout: 1200 });
    const pickerBox = await picker.boundingBox();
    expect(pickerBox).not.toBeNull();
    await page.mouse.move(
      pickerBox!.x + Math.min(24, pickerBox!.width / 2),
      pickerBox!.y + Math.min(24, pickerBox!.height / 2),
      { steps: 12 },
    );
    await page.waitForTimeout(450);
    await expect(picker).toBeVisible();

    const pageScrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 60);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(pageScrollBefore);
    await expect(picker).toBeVisible();

    await page.mouse.move(2, 2);
    await expect(picker).toBeHidden();

    await mark.hover();
    await expect(picker).toBeVisible({ timeout: 1600 });

    const nextMark = page.locator(
      '[data-testid="focus-reveal"] mark[aria-label^="Choose among"]:visible',
    ).nth(1);
    await nextMark.hover();
    await expect(picker).toBeHidden({ timeout: 700 });
    await expect(picker).toBeVisible({ timeout: 1600 });
    await expect(nextMark).toHaveClass(/fp-hot/);

    await page.keyboard.press('Escape');
    await mark.click({ modifiers: ['Shift'] });
    await expect(picker).toBeVisible();
    expect(await picker.locator('[role="menuitemradio"]').count()).toBeGreaterThan(0);

    const topic = (await picker.locator('[role="menuitemradio"]').first().locator('span').first().textContent())!;
    await picker.locator('[role="menuitemradio"]').first().click();
    const visibleTopicChip = page.locator(
      '[data-testid="aside-topic-filter"], [data-testid="reply-topic-filter"]',
    ).filter({ hasText: topic }).first();
    await expect(visibleTopicChip).toBeVisible();
    await expect(page.locator('[data-testid="focus-reveal"] mark.fp-selected').first()).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('fo')).toBe('focus');
  });

  test('single-topic phrases never expand and repeated clicks do not select text', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const mark = page.locator(
      '[data-testid="focus-reveal"] mark[aria-label^="Filter by topic:"]:visible',
    ).first();
    await expect(mark).toBeVisible();
    await expect(mark).toHaveCSS('user-select', 'none');

    await mark.hover();
    await expect(page.getByTestId('hover-tooltip')).toBeVisible({ timeout: 900 });
    await page.waitForTimeout(1300);
    await expect(page.getByTestId('focus-topic-picker')).toHaveCount(0);

    await mark.click({ clickCount: 3 });
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
    await mark.click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('focus-topic-picker')).toHaveCount(0);
  });

  test('a non-focused phrase focuses and filters its feed post without navigation', async ({ page }) => {
    const timeline = page.waitForResponse((response) =>
      response.url().includes('/api/demo/timelines/ai-workforce') && response.status() === 200,
    );
    await page.goto('/AIWorkforce');
    await timeline;
    const mark = page.locator(
      '[data-testid="post"][data-active="false"] [data-testid="focus-reveal"] mark[data-range-ids]:visible',
    ).first();
    await expect(mark).toBeVisible();
    const card = mark.locator('xpath=ancestor::*[@data-testid="post"][1]');
    const postId = await card.getAttribute('data-post-id');
    expect(postId).toBeTruthy();

    await mark.click();

    await expect(page.locator(`[data-testid="post"][data-post-id="${postId}"]`)).toHaveAttribute('data-active', 'true');
    await expect(page.locator(`[data-related-focus-post-id="${postId}"]`).first()).toBeVisible();
    await expect(page.getByTestId('aside-topic-filter')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/AIWorkforce');
  });

  test('touch opens the picker for a multi-topic phrase', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const candidates = page.locator(visibleMark);
    let multiTopicMark = candidates.first();

    for (let index = 0; index < Math.min(await candidates.count(), 12); index += 1) {
      const candidate = candidates.nth(index);
      await candidate.click({ modifiers: ['Shift'] });
      const options = page.getByTestId('focus-topic-picker').locator('[role="menuitemradio"]');
      if (await options.count() > 1) {
        multiTopicMark = candidate;
        await page.keyboard.press('Escape');
        break;
      }
      await page.keyboard.press('Escape');
    }

    await multiTopicMark.dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true });
    await multiTopicMark.dispatchEvent('click', { bubbles: true, cancelable: true });
    const picker = page.getByTestId('focus-topic-picker');
    await expect(picker).toBeVisible();
    const options = picker.locator('[role="menuitemradio"]');
    expect(await options.count()).toBeGreaterThan(1);
    const secondTopic = (await options.nth(1).locator('span').first().textContent())!;

    await options.first().click();
    await page.locator('[data-testid="focus-reveal"] mark.fp-selected').first().click();
    await expect.poll(() => new URL(page.url()).searchParams.get('ft')).toBe(secondTopic);
  });
});
