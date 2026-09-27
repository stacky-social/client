import { expect, test, type Locator, type Page } from '@playwright/test';

// Mobile tap protocol for left-pane post text (#224). A phone has no hover, so
// the first tap on a post's text only engages it: the topic phrases turn bold
// and nothing else happens (no navigation, no topic). While engaged, a phrase
// tap acts as touch always did and a plain-text tap opens the post. A tap
// outside the text, or scrolling the post away, disengages it.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const FEED = '/EnergyTech';

async function tapAt(page: Page, point: { x: number; y: number }) {
  await page.touchscreen.tap(point.x, point.y);
}

// Centre of the phrase's first line box (a wrapped phrase's bounding-box
// centre can land on the plain text between its fragments).
function phrasePoint(mark: Locator) {
  return mark.evaluate((node) => {
    const rect = Array.from(node.getClientRects()).find((r) => r.width > 0)!;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

// A visible point on ordinary prose: not a phrase, link, or button.
function plainTextPoint(text: Locator) {
  return text.evaluate((root) => {
    const bounds = root.getBoundingClientRect();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement!;
      if (parent.closest('mark, a, button') || (node.textContent ?? '').trim().length < 4) continue;
      for (let offset = 0; offset < node.textContent!.length - 1; offset += 1) {
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width < 3 || rect.top < bounds.top || rect.bottom > bounds.bottom) continue;
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (hit && root.contains(hit) && !hit.closest('mark, a, button')) return { x, y };
      }
    }
    throw new Error('no plain text point');
  });
}

async function shadows(text: Locator) {
  return text.locator('mark[data-range-ids]').evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).textShadow));
}

test.describe('mobile tap engagement on post text', () => {
  test('first tap engages, then phrase taps act and plain-text taps open the post', async ({ page }) => {
    await page.goto(FEED);
    const text = page.locator(
      '[data-testid="post"] [data-testid="focus-reveal"]:has(mark[aria-label^="Choose among"])',
    ).first();
    await expect(text).toBeVisible();
    await text.scrollIntoViewIfNeeded();
    const mark = text.locator('mark[aria-label^="Choose among"]').first();
    const startUrl = page.url();

    expect((await shadows(text)).every((value) => value === 'none')).toBe(true);

    // First tap on a phrase: emphasis only.
    await tapAt(page, await phrasePoint(mark));
    await expect(text).toHaveAttribute('data-engaged', '');
    expect((await shadows(text)).every((value) => value.includes('0.7px'))).toBe(true);
    await page.waitForTimeout(800);
    expect(page.url()).toBe(startUrl);
    await expect(page.getByTestId('focus-topic-picker')).toHaveCount(0);
    await expect(page.getByTestId('hover-tooltip')).toHaveCount(0);
    await expect(text.locator('mark.fp-selected')).toHaveCount(0);

    // Engaged: a phrase tap takes the existing touch path (the topic list).
    await tapAt(page, await phrasePoint(mark));
    const picker = page.getByTestId('focus-topic-picker');
    await expect(picker).toBeVisible();
    await expect(text).toHaveAttribute('data-engaged', '');

    // A tap outside the text (here: another post's text) closes the list and
    // disengages the post; that other post is merely engaged in turn.
    const postId = await text.evaluate((node) =>
      node.closest('[data-testid="post"]')!.getAttribute('data-post-id'));
    const other = page.locator(
      `[data-testid="post"]:not([data-post-id="${postId}"]) [data-testid="focus-reveal"]`,
    ).first();
    await other.scrollIntoViewIfNeeded();
    await tapAt(page, await plainTextPoint(other));
    await expect(picker).toHaveCount(0);
    await expect(text).not.toHaveAttribute('data-engaged', '');
    await expect(other).toHaveAttribute('data-engaged', '');
    expect((await shadows(text)).every((value) => value === 'none')).toBe(true);
    expect(page.url()).toBe(startUrl);

    // A first tap on plain text also only engages.
    await text.scrollIntoViewIfNeeded();
    await tapAt(page, await plainTextPoint(text));
    await expect(text).toHaveAttribute('data-engaged', '');
    await page.waitForTimeout(800);
    expect(page.url()).toBe(startUrl);

    // Engaged: a plain-text tap opens the post, as it always did.
    await tapAt(page, await plainTextPoint(text));
    await expect(page).toHaveURL(/\/posts\//);
  });

  test('scrolling an engaged post out of view disengages it', async ({ page }) => {
    await page.goto(FEED);
    const text = page.locator('[data-testid="post"] [data-testid="focus-reveal"]').first();
    await expect(text).toBeVisible();
    await text.scrollIntoViewIfNeeded();
    await tapAt(page, await plainTextPoint(text));
    await expect(text).toHaveAttribute('data-engaged', '');

    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
    await expect(text).not.toHaveAttribute('data-engaged', '');
  });
});
