import { expect, test, type Locator, type Page } from '@playwright/test';

// #259 — a reply's contribution-type tag does what a related card's type icon
// does (#224): it groups "more like this" by that type (fg=category), so the
// aside gathers the type into its bordered block and the reply list keeps the
// replies that make the same contribution. It never opens the reply. The
// active type toggles off, Back undoes, and the clicked reply holds still.

const FOCUS_ID = '143195604';
const DETAIL_PATH = `/ChineseEVs/posts/${FOCUS_ID}`;

async function openDetail(page: Page) {
  await page.goto(DETAIL_PATH);
  await expect(page.locator('[data-related-card]').first()).toBeVisible();
  await expect(page.locator('[data-testid="reply-scroll-region"] [data-reply-badge]').first()).toBeVisible();
}

/** The first visible reply carrying `category`, its tag, and the tag's top. */
async function replyTag(page: Page, category: string) {
  const first = page.locator('[data-testid="reply-scroll-region"] [data-testid="post"]', {
    has: page.locator(`[data-reply-badge="${category}"]`),
  }).first();
  // Pin the locators to this reply's id: a filter can re-render the list.
  const replyId = (await first.getAttribute('data-post-id'))!;
  const reply = page.locator(`[data-testid="reply-scroll-region"] [data-testid="post"][data-post-id="${replyId}"]`);
  const tag = reply.locator(`[data-reply-badge="${category}"]`);
  await tag.scrollIntoViewIfNeeded();
  return { tag, reply, replyId };
}

const topOf = async (locator: Locator) => (await locator.boundingBox())!.y;

/** Contribution types carried by every reply drawn in the reply list. */
const drawnReplyTypes = (page: Page) =>
  page.locator('[data-testid="reply-scroll-region"] [data-testid="post"]').evaluateAll((posts) =>
    posts.map((post) => Array.from(post.querySelectorAll('[data-reply-badge]'))
      .map((badge) => badge.getAttribute('data-reply-badge'))));

test.describe('reply contribution-type tags group like the aside icon (#259)', () => {
  test('a click groups by the type in both panes without opening the reply', async ({ page }) => {
    await openDetail(page);
    const { tag, reply, replyId } = await replyTag(page, 'agree');
    await expect(tag).toHaveAttribute('role', 'button');
    await expect(tag).toHaveCSS('cursor', 'pointer');
    await expect(tag).toHaveAttribute('aria-pressed', 'false');

    // Hover reads like a span tooltip: "N more Agree".
    await tag.hover();
    await expect(page.getByText(/\d+ more Agree/)).toBeVisible();

    const before = await topOf(reply);
    await tag.click();

    // No navigation to the reply: same path, the group is in the query.
    await expect(page).toHaveURL(/[?&]fg=category/);
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
    const params = new URL(page.url()).searchParams;
    expect(params.get('ft')).toBe('agree');
    expect(params.get('fo')).toBe('aside');
    expect(replyId).not.toBe(FOCUS_ID);

    // The aside shows the type group; the reply list is filtered by the type.
    await expect(page.locator('[data-related-group-header]')).toContainText('Agree (');
    await expect(page.getByTestId('active-group-anchor')).toHaveCount(1);
    await expect(page.getByTestId('reply-topic-filter')).toContainText('Agree');
    await expect(tag).toHaveAttribute('aria-pressed', 'true');
    // Every drawn branch carries Agree somewhere (a top-level reply can be kept
    // as context for a matching nested reply, as with the aside icon).
    const drawn = await drawnReplyTypes(page);
    expect(drawn.some((types) => types.includes('agree'))).toBe(true);
    expect(drawn.length).toBeGreaterThan(0);

    // The clicked reply holds still.
    expect(Math.abs((await topOf(reply)) - before)).toBeLessThanOrEqual(1);

    // Clicking the active tag clears the group in both panes.
    await tag.click();
    await expect(page).not.toHaveURL(/[?&]fg=/);
    await expect(page).not.toHaveURL(/[?&]ft=/);
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
    await expect(page.locator('[data-related-group-header]')).toHaveCount(0);
    await expect(page.getByTestId('reply-filter-bar')).toHaveCount(0);
    await expect(tag).toHaveAttribute('aria-pressed', 'false');
    expect(Math.abs((await topOf(reply)) - before)).toBeLessThanOrEqual(1);

    // Back restores the group; Back again returns to the plain view, still on
    // the same post.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]fg=category/);
    await expect(page.locator('[data-related-group-header]')).toContainText('Agree (');
    await expect(page.getByTestId('reply-topic-filter')).toContainText('Agree');
    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]fg=/);
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
    await expect(page.locator('[data-related-group-header]')).toHaveCount(0);
  });

  test('each tag of a multi-type reply acts on its own type, and Enter works too', async ({ page }) => {
    await openDetail(page);
    const reply = page
      .locator('[data-testid="reply-scroll-region"] [data-testid="post"]', {
        has: page.locator('[data-reply-badge="framing"]'),
      })
      .filter({ has: page.locator('[data-reply-badge="agree"]') })
      .first();
    await reply.scrollIntoViewIfNeeded();
    const framing = reply.locator('[data-reply-badge="framing"]');
    const agree = reply.locator('[data-reply-badge="agree"]');

    await framing.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/[?&]ft=framing/);
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
    await expect(page.locator('[data-related-group-header]')).toContainText('Framing (');

    // The other tag switches the group to its own type.
    await agree.click();
    await expect(page).toHaveURL(/[?&]ft=agree/);
    await expect(page.locator('[data-related-group-header]')).toContainText('Agree (');
    await expect(agree).toHaveAttribute('aria-pressed', 'true');
    await expect(framing).toHaveAttribute('aria-pressed', 'false');
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
  });

  test('the aside icon and a reply tag of the same type toggle the same group', async ({ page }) => {
    await openDetail(page);
    const icon = page.locator('[data-related-card] [data-related-tag][data-contribution-category="agree"]').first();
    await icon.scrollIntoViewIfNeeded();
    await icon.click();
    await expect(page).toHaveURL(/[?&]ft=agree/);
    await expect(page).toHaveURL(/[?&]fg=category/);

    const { tag } = await replyTag(page, 'agree');
    await expect(tag).toHaveAttribute('aria-pressed', 'true');
    await tag.hover();
    await expect(page.getByText(/Showing Agree/)).toBeVisible();
    await tag.click();
    await expect(page).not.toHaveURL(/[?&]fg=/);
    await expect(page.getByTestId('active-group-anchor')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
  });
});
