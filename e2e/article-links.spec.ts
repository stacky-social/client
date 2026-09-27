import { expect, test } from '@playwright/test';

// Article links: only the outlet's own post (the post that IS its link card's
// article) gets a small "host ↗" source row, and a quoted article card gets
// the same link as a sibling of its card button. Ordinary replies — which all
// carry their thread root's card — never do, and the aside never does.

const FOX_ROOT = '/EnergyTech/posts/cw-lKbxc5cl2soN0n8e';
const FOX_QUOTER = '/EnergyTech/posts/cw-ZxtKNgk5tb6f2bUf';
const FOX_URL = 'https://www.foxnews.com/opinion/four-ways-harden-americas-power-grid-global-enemies-strike';

test.beforeEach(async ({ context }) => {
  // Never leave the sandbox: answer the outlet locally.
  await context.route('https://www.foxnews.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>article</title>' }));
});

test('the outlet post shows a source row that opens the article in a new tab', async ({ page, context }) => {
  await page.goto(FOX_ROOT);
  const focus = page.locator('[data-focus-compact]');
  const link = focus.locator('[data-focus-article-link="source"]');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('foxnews.com ↗');
  await expect(link).toHaveAttribute('href', FOX_URL);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(link).toHaveAttribute('rel', /noreferrer/);
  // Outside the highlight container: the post text (and its offsets) is unchanged.
  await expect(focus.getByTestId('focus-reveal')).not.toContainText('foxnews.com');
  await expect(focus.locator('[data-testid="focus-reveal"] [data-focus-article-link]')).toHaveCount(0);

  // Ordinary replies carry the same card but never get a source row; the
  // related aside gets no article links at all.
  await expect(page.getByTestId('reply-scroll-region').locator('[data-focus-article-link="source"]')).toHaveCount(0);
  await expect(page.getByTestId('col-aside').locator('[data-focus-article-link], [data-related-article-link]'))
    .toHaveCount(0);

  const popup = context.waitForEvent('page');
  await link.click();
  await (await popup).close();
  expect(new URL(page.url()).pathname).toBe(FOX_ROOT);

  // Compact focus hides the row.
  await page.getByTestId('reply-scroll-region').evaluate((el) => { el.scrollTop = 180; });
  await expect(focus).toHaveAttribute('data-focus-compact', 'true');
  await expect(link).toHaveCount(0);
});

test('a quoted article card keeps its design and gets a sibling external link', async ({ page, context }) => {
  await page.goto(FOX_QUOTER);
  const focus = page.locator('[data-focus-compact]');
  const card = focus.getByTestId('quoted-post');
  await expect(card).toBeVisible();
  await expect(card).toContainText("Four ways to harden America's power grid");
  // Never an <a> inside the card <button>.
  await expect(card.locator('a, [data-focus-article-link]')).toHaveCount(0);
  const link = focus.locator('[data-focus-article-link="quoted"]');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('foxnews.com ↗');
  await expect(link).toHaveAttribute('href', FOX_URL);
  await expect(link).toHaveAttribute('target', '_blank');
  // Right below the card, right-aligned.
  const [cardBox, linkBox] = await Promise.all([card.boundingBox(), link.boundingBox()]);
  expect(linkBox!.y).toBeGreaterThanOrEqual(cardBox!.y + cardBox!.height - 1);
  expect(Math.abs((linkBox!.x + linkBox!.width) - (cardBox!.x + cardBox!.width))).toBeLessThanOrEqual(2);
  // A quoting post is not the article itself: no source row.
  await expect(focus.locator('[data-focus-article-link="source"]')).toHaveCount(0);

  const popup = context.waitForEvent('page');
  await link.click();
  await (await popup).close();
  expect(new URL(page.url()).pathname).toBe(FOX_QUOTER);

  // The card itself still navigates internally to the article post.
  await card.click();
  await expect(page).toHaveURL(/\/EnergyTech\/posts\/cw-lKbxc5cl2soN0n8e$/);
});
