import { expect, test, type Locator, type Page } from '@playwright/test';
import mockData from '../src/app/FakeData/chinese-evs.json';

// Researcher decisions for issue #224, left-pane focus text:
// - a phrase click rotates its topics (A -> B -> ... -> off -> A) whether or
//   not the hover-opened topic list is showing;
// - a clicked phrase stays quiet: pointer jitter does not re-open popups;
// - multi-topic phrases open the full list after one short delay, with no
//   small tooltip first; single-topic phrases get a compact "Filter by" hint;
// - phrase emphasis appears only while the reader engages the text.

const focusId = (mockData as any)[0].focusPost.id as string;
const DETAIL_URL = `/ChineseEVs/posts/${focusId}`;
const MULTI = '[data-testid="focus-reveal"] mark[aria-label^="Choose among"]:visible';
const SINGLE = '[data-testid="focus-reveal"] mark[aria-label^="Filter by topic:"]:visible';

const topicParam = (page: Page) => new URL(page.url()).searchParams.get('ft');

// Centre of the phrase's first line box: a phrase that wraps has a bounding
// box whose centre can fall on plain text between its two fragments.
async function center(locator: Locator) {
  return locator.evaluate((node) => {
    const rect = Array.from(node.getClientRects()).find((r) => r.width > 0)!;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

// Pins the phrase by its range ids so re-renders cannot swap the target.
async function pinned(page: Page, selector: string) {
  const first = page.locator(selector).first();
  await expect(first).toBeVisible();
  const ids = await first.getAttribute('data-range-ids');
  return page.locator(`[data-testid="focus-reveal"] mark[data-range-ids="${ids}"]`).first();
}

test.describe('focus phrase clicks and hover popups', () => {
  test('a click while the topic list is open still fires and rotates the phrase', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const mark = await pinned(page, MULTI);
    await mark.scrollIntoViewIfNeeded();

    // Capture-phase trace of the press: the bug was a pointerdown that closed
    // the list, re-rendered the phrase, and left the browser with no click.
    await page.evaluate(() => {
      const w = window as any;
      w.__trace = [];
      for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
        document.addEventListener(type, (event) => {
          const target = event.target as Element;
          w.__trace.push(`${type}:${target.closest?.('[data-testid="focus-reveal"] mark') ? 'mark' : target.tagName}`);
        }, true);
      }
    });

    const point = await center(mark);
    await page.mouse.move(point.x, point.y);
    const picker = page.getByTestId('focus-topic-picker');
    await expect(picker).toBeVisible({ timeout: 2000 });
    expect(topicParam(page)).toBeNull();

    await page.mouse.down();
    await page.mouse.up();

    await expect.poll(() => topicParam(page)).not.toBeNull();
    await expect(picker).toHaveCount(0);
    await expect(mark).toHaveClass(/fp-selected/);
    expect(await page.evaluate(() => (window as any).__trace))
      .toEqual(['pointerdown:mark', 'mousedown:mark', 'mouseup:mark', 'click:mark']);
  });

  test('repeated clicks rotate A -> B -> ... -> off -> A', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const mark = await pinned(page, MULTI);
    await mark.scrollIntoViewIfNeeded();
    const count = Number((await mark.getAttribute('aria-label'))!.match(/\d+/)![0]);
    expect(count).toBeGreaterThan(1);
    const point = await center(mark);
    await page.mouse.move(point.x, point.y);

    const seen: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const before = topicParam(page);
      await page.mouse.down();
      await page.mouse.up();
      await expect.poll(() => topicParam(page)).not.toBe(before);
      const topic = topicParam(page);
      expect(topic).not.toBeNull();
      seen.push(topic!);
    }
    expect(new Set(seen).size).toBe(count);

    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => topicParam(page)).toBeNull();
    await expect(mark).not.toHaveClass(/fp-selected/);

    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => topicParam(page)).toBe(seen[0]);
  });

  test('pointer jitter after a click re-opens neither the tooltip nor the list', async ({ page }) => {
    await page.goto(DETAIL_URL);
    for (const selector of [MULTI, SINGLE]) {
      const mark = await pinned(page, selector);
      await mark.scrollIntoViewIfNeeded();
      const point = await center(mark);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.up();
      for (let step = 0; step < 6; step += 1) {
        await page.mouse.move(point.x + (step % 2 ? 2 : -2), point.y + (step % 2 ? 1 : -1));
        await page.waitForTimeout(250);
      }
      await expect(page.getByTestId('hover-tooltip')).toHaveCount(0);
      await expect(page.getByTestId('focus-topic-picker')).toHaveCount(0);
      // Leaving the phrase re-arms it for the next genuine hover.
      await page.mouse.move(2, 2);
    }
  });

  test('multi-topic hover opens the list without a tooltip; single-topic says "Filter by"', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const multi = await pinned(page, MULTI);
    await multi.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const w = window as any;
      w.__tooltipSeen = false;
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="hover-tooltip"]')) w.__tooltipSeen = true;
      }).observe(document.body, { childList: true, subtree: true });
    });
    const point = await center(multi);
    await page.mouse.move(point.x, point.y);
    await expect(page.getByTestId('focus-topic-picker')).toBeVisible({ timeout: 1500 });
    expect(await page.evaluate(() => (window as any).__tooltipSeen)).toBe(false);

    await page.mouse.move(2, 2);
    await expect(page.getByTestId('focus-topic-picker')).toHaveCount(0);

    const single = await pinned(page, SINGLE);
    await single.scrollIntoViewIfNeeded();
    const topic = (await single.getAttribute('aria-label'))!.replace('Filter by topic: ', '');
    await single.hover();
    const tooltip = page.getByTestId('hover-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 1500 });
    await expect(tooltip).toHaveText(`Filter by: ${topic}`);
  });

  test('phrases are plain at rest and bold while the text is hovered', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const focus = page.locator('[data-testid="focus-reveal"]').first();
    const marks = focus.locator('mark[data-range-ids]');
    await expect(marks.first()).toBeVisible();
    const shadows = () => marks.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).textShadow));

    expect((await shadows()).every((value) => value === 'none')).toBe(true);

    const box = (await focus.boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await expect.poll(async () => (await shadows()).every((value) => value.includes('0.7px'))).toBe(true);

    await page.mouse.move(2, 2);
    await expect.poll(async () => (await shadows()).every((value) => value === 'none')).toBe(true);

    // A mouse click must not leave the phrase focus-visible: that would keep
    // the emphasis (and a focus ring) on after the pointer leaves.
    const mark = await pinned(page, SINGLE);
    const point = await center(mark);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => topicParam(page)).not.toBeNull();
    await page.mouse.move(2, 2);
    await expect.poll(async () => (await shadows()).every((value) => value === 'none')).toBe(true);
    await expect(mark).toHaveCSS('outline-style', 'none');
  });
});
