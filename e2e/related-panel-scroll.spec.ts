import { expect, test, type Locator, type Page } from '@playwright/test';

const FOCUS_ID = '152053690';
const DETAIL_URL = `/ChineseEVs/posts/${FOCUS_ID}`;
const DEEP_GROUP_ID = '149295187';
const DEEP_GROUP_TOPIC = 'Industrial Policy Response';
const DEEP_PAIRING_ID = '149299979';

type ViewportMeasure = {
  scrollTop: number;
  scrollHeight: number;
  cardCount: number;
  firstId: string | null;
  firstOffset: number | null;
};

async function measureViewport(page: Page): Promise<ViewportMeasure> {
  return page.getByTestId('col-aside').evaluate((aside) => {
    const header = aside.querySelector('[data-testid="related-sticky-header"]');
    const contentTop = header?.getBoundingClientRect().bottom ?? aside.getBoundingClientRect().top;
    const cards = Array.from(aside.querySelectorAll('[data-related-card]'));
    const first = cards.find((card) => card.getBoundingClientRect().bottom > contentTop + 1) ?? null;
    return {
      scrollTop: aside.scrollTop,
      scrollHeight: aside.scrollHeight,
      cardCount: cards.length,
      firstId: first?.querySelector('[data-post-id]')?.getAttribute('data-post-id') ?? null,
      firstOffset: first ? first.getBoundingClientRect().top - contentTop : null,
    };
  });
}

async function centerInAside(locator: Locator): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
}

test.describe('Related-panel viewport continuity', () => {
  test('pagination and card expansion keep the reader at the same position', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const aside = page.getByTestId('col-aside');
    await expect(page.locator('[data-related-card]')).toHaveCount(10);

    await aside.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
    const beforeLoad = await measureViewport(page);
    await page.getByTestId('related-load-more').click();
    await expect(page.locator('[data-related-card]')).toHaveCount(20);
    const afterLoad = await measureViewport(page);
    expect(afterLoad.scrollTop).toBeCloseTo(beforeLoad.scrollTop, 0);

    const expandable = page.locator('[data-related-card]').filter({
      has: page.getByRole('button', { name: 'Read more' }),
    }).nth(5);
    await centerInAside(expandable);
    const expandableId = await expandable.locator('[data-post-id]').getAttribute('data-post-id');
    expect(expandableId).toBeTruthy();
    const stableExpandable = page.locator(`[data-related-card] [data-post-id="${expandableId}"]`).locator('..');
    const beforeExpand = await measureViewport(page);
    await stableExpandable.getByRole('button', { name: 'Read more' }).click();
    await expect(stableExpandable.getByRole('button', { name: 'See less' })).toBeVisible();
    const afterExpand = await measureViewport(page);
    expect(afterExpand.firstId).toBe(beforeExpand.firstId);
    expect(afterExpand.firstOffset).toBeCloseTo(beforeExpand.firstOffset!, 0);

    await centerInAside(stableExpandable.getByRole('button', { name: 'See less' }));
    await stableExpandable.getByRole('button', { name: 'See less' }).click();
    await expect(stableExpandable.getByRole('button', { name: 'Read more' })).toBeVisible();
    const collapsedPosition = await stableExpandable.evaluate((card) => {
      const aside = card.closest('[data-testid="col-aside"]')!;
      const headerBottom = aside.querySelector('[data-testid="related-sticky-header"]')
        ?.getBoundingClientRect().bottom ?? aside.getBoundingClientRect().top;
      return { cardTop: card.getBoundingClientRect().top, headerBottom };
    });
    expect(collapsedPosition.cardTop).toBeCloseTo(collapsedPosition.headerBottom + 8, 0);
  });

  test('revealing more members of a group does not reset its panel scroll', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const firstTag = page.locator('[data-related-card] [data-related-tag]').first();
    await firstTag.click();
    await expect(page.getByTestId('active-group-anchor').first()).toBeVisible();

    const more = page.locator('button.show-more-link').first();
    await expect(more).toBeVisible();
    await centerInAside(more);
    // Establish the same settled pre-click state a pointer user sees. Playwright
    // otherwise performs its implicit hover/actionability scroll after this
    // measurement, so the assertion compares two different starting viewports.
    await more.hover();
    const before = await measureViewport(page);
    await more.click();
    await expect.poll(async () => (await measureViewport(page)).scrollTop).toBeGreaterThan(0);
    await expect.poll(async () => (await measureViewport(page)).firstId).toBe(before.firstId);
    await expect.poll(async () => (await measureViewport(page)).firstOffset).toBeCloseTo(before.firstOffset!, 0);
  });

  test('opening a related post and going Back restores pagination and semantic position', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const aside = page.getByTestId('col-aside');
    await aside.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
    await page.getByTestId('related-load-more').click();
    await expect(page.locator('[data-related-card]')).toHaveCount(20);

    const target = page.locator('[data-related-card]').nth(14);
    await centerInAside(target);
    const targetId = await target.locator('[data-post-id]').getAttribute('data-post-id');
    expect(targetId).toBeTruthy();
    const before = await measureViewport(page);

    const paper = target.locator('[data-post-id]');
    const box = await paper.boundingBox();
    expect(box).not.toBeNull();
    await paper.click({ position: { x: box!.width - 24, y: 8 } });
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${targetId}(?:\\?|$)`));

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${DETAIL_URL}(?:\\?|$)`));
    await expect(page.locator(`[data-related-card] [data-post-id="${targetId}"]`)).toBeVisible();
    const after = await measureViewport(page);
    expect(after.cardCount).toBeGreaterThanOrEqual(20);
    expect(after.firstId).toBe(before.firstId);
    expect(after.firstOffset).toBeCloseTo(before.firstOffset!, 0);
  });

  test('a shared group link reveals the beginning of its off-page group', async ({ page }) => {
    // A browser-created tab may clone its opener's sessionStorage. The explicit
    // shared group must still win over an unrelated inherited viewport.
    await page.addInitScript(({ focusId }) => {
      sessionStorage.setItem(`crossweave:related-viewport:${focusId}`, JSON.stringify({
        scrollTop: 2080,
        anchorPostId: '152057063',
        anchorOffset: -182,
        visibleCardCount: 20,
      }));
    }, { focusId: FOCUS_ID });
    const params = new URLSearchParams({
      ft: DEEP_GROUP_TOPIC,
      fo: 'aside',
      fa: DEEP_GROUP_ID,
      fi: '0',
    });
    await page.goto(`${DETAIL_URL}?${params}`);
    await expect(page.getByTestId('active-group-anchor').first()).toBeVisible();
    await expect.poll(async () => page.getByTestId('col-aside').evaluate((aside) => aside.scrollTop))
      .toBeGreaterThan(0);
    const readGroupMeasurement = () => page.getByTestId('col-aside').evaluate((aside) => {
      const headerBottom = aside.querySelector('[data-testid="related-sticky-header"]')
        ?.getBoundingClientRect().bottom ?? aside.getBoundingClientRect().top;
      const groupStart = aside.querySelector('[data-related-group-start="true"]');
      return {
        scrollTop: aside.scrollTop,
        groupTop: groupStart?.getBoundingClientRect().top ?? null,
        headerBottom,
        asideBottom: aside.getBoundingClientRect().bottom,
      };
    });
    await expect.poll(async () => {
      const current = await readGroupMeasurement();
      return current.groupTop !== null
        && current.groupTop >= current.headerBottom - 2
        && current.groupTop < current.asideBottom;
    }).toBe(true);
    const measurement = await readGroupMeasurement();
    expect(measurement.scrollTop).toBeGreaterThan(0);
    expect(measurement.groupTop).not.toBeNull();
    expect(measurement.groupTop!).toBeGreaterThanOrEqual(measurement.headerBottom - 2);
    expect(measurement.groupTop!).toBeLessThan(measurement.asideBottom);
  });

  test('a shared pairing reveals its card, then removes emphasis after scrolling away', async ({ page }) => {
    await page.goto(`${DETAIL_URL}?related=${DEEP_PAIRING_ID}`);
    const target = page.locator(`[data-related-card] [data-post-id="${DEEP_PAIRING_ID}"]`);
    await expect(target).toBeVisible();
    await expect(target).toHaveCSS('border-top-color', 'rgb(28, 43, 74)');
    await expect.poll(async () => page.getByTestId('col-aside').evaluate((aside) => {
      const paper = aside.querySelector('[data-related-card] [data-post-id="149299979"]');
      if (!paper) return false;
      const rect = paper.getBoundingClientRect();
      const asideRect = aside.getBoundingClientRect();
      const headerBottom = aside.querySelector('[data-testid="related-sticky-header"]')
        ?.getBoundingClientRect().bottom ?? asideRect.top;
      return rect.bottom > headerBottom && rect.top < asideRect.bottom;
    })).toBe(true);
    await expect(target).toHaveCSS('border-top-color', 'rgb(28, 43, 74)');
    await page.waitForTimeout(300);

    await page.getByTestId('col-aside').evaluate((aside) =>
      aside.scrollTo({ top: 0, behavior: 'instant' }),
    );
    await expect(target).toHaveCSS('border-top-color', 'rgb(226, 232, 240)');
  });
});
