import { expect, test, type Locator, type Page } from '@playwright/test';

// #259 — a reply's contribution-type tag is the reply pane's "more like this":
// a REPLY-origin interaction keyed by type (fo=replies, fg=category). The
// comment list GROUPS the replies of that type around the clicked reply (the
// same cluster rail a reply-span topic click draws), and the related panel
// FILTERS to the posts carrying the type. The mirror holds for the aside: a
// card's type icon GROUPS the panel and FILTERS the comments. A tag never opens
// the reply; the active type toggles off, Back undoes, and the reply holds still.

const FOCUS_ID = '143195604';
const DETAIL_PATH = `/ChineseEVs/posts/${FOCUS_ID}`;

async function openDetail(page: Page) {
  await page.goto(DETAIL_PATH);
  await expect(page.locator('[data-related-card]').first()).toBeVisible();
  await expect(page.locator('[data-testid="reply-scroll-region"] [data-reply-badge]').first()).toBeVisible();
}

/** The first TOP-LEVEL reply carrying `category` (the reply list clusters its
 *  top level), its tag, and its id. */
async function replyTag(page: Page, category: string) {
  const replyId = await page.locator('[data-testid="reply-scroll-region"]').evaluate((region, cat) => {
    const posts = Array.from(region.querySelectorAll('[data-testid="post"][data-post-id]'));
    const hit = posts.find((post) =>
      post.closest('[data-reply-depth]')?.getAttribute('data-reply-depth') === '0'
      && post.querySelector(`[data-reply-badge="${cat}"]`));
    return hit?.getAttribute('data-post-id') ?? null;
  }, category);
  expect(replyId).toBeTruthy();
  const reply = page.locator(`[data-testid="reply-scroll-region"] [data-testid="post"][data-post-id="${replyId}"]`);
  const tag = reply.locator(`[data-reply-badge="${category}"]`).first();
  await tag.scrollIntoViewIfNeeded();
  return { tag, reply, replyId: replyId! };
}

const topOf = async (locator: Locator) => (await locator.boundingBox())!.y;

/** Distinct related posts carrying the type, from the top chip bar. */
const relatedTypeCount = async (page: Page, category: string) =>
  Number(await page
    .locator(`[data-testid="related-sticky-header"] button[data-contribution-category="${category}"]`)
    .getAttribute('data-contribution-count'));

/** Types carried by each drawn related card. */
const drawnCardTypes = (page: Page) =>
  page.locator('[data-related-card]').evaluateAll((cards) =>
    cards.map((card) => Array.from(card.querySelectorAll('[data-related-tag][data-contribution-category]'))
      .map((icon) => icon.getAttribute('data-contribution-category'))));

/** Types carried by each top-level cluster member's own post. */
const clusterMemberTypes = (page: Page) =>
  page.locator('[data-reply-cluster-member]').evaluateAll((members) =>
    members.map((member) => {
      const post = member.querySelector('[data-testid="post"]');
      return Array.from(post?.querySelectorAll('[data-reply-badge]') ?? [])
        .map((badge) => badge.getAttribute('data-reply-badge'));
    }));

test.describe('reply type tags group the comments and filter the aside (#259)', () => {
  test('a click groups the comments by the type and filters the aside to it', async ({ page }) => {
    await openDetail(page);
    const expectedRelated = await relatedTypeCount(page, 'agree');
    expect(expectedRelated).toBeGreaterThan(0);
    const { tag, reply, replyId } = await replyTag(page, 'agree');
    await expect(tag).toHaveAttribute('role', 'button');
    await expect(tag).toHaveCSS('cursor', 'pointer');
    await expect(tag).toHaveAttribute('aria-pressed', 'false');

    // Hover reads like a reply-span tooltip: "N more Agree".
    await tag.hover();
    await expect(page.getByText(/\d+ more Agree/)).toBeVisible();

    const before = await topOf(reply);
    await tag.click();

    // No navigation to the reply: same path, a reply-origin type group.
    await expect(page).toHaveURL(/[?&]fg=category/);
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
    const params = new URL(page.url()).searchParams;
    expect(params.get('ft')).toBe('agree');
    expect(params.get('fo')).toBe('replies');
    expect(params.get('fa')).toBe(replyId);
    expect(replyId).not.toBe(FOCUS_ID);

    // The comments are GROUPED: the cluster rail labelled with the type, the
    // clicked reply inside it, every member carrying the type. No reply filter.
    const members = page.locator('[data-reply-cluster-member]');
    await expect(members.first()).toBeVisible();
    await expect(page.locator('[data-testid="reply-scroll-region"]')).toContainText(/Agree \(\d+\)/);
    await expect(page.locator(`[data-reply-cluster-member] [data-testid="post"][data-post-id="${replyId}"]`)).toHaveCount(1);
    for (const types of await clusterMemberTypes(page)) expect(types).toContain('agree');
    await expect(page.getByTestId('reply-topic-filter')).toHaveCount(0);
    await expect(tag).toHaveAttribute('aria-pressed', 'true');

    // The aside is FILTERED, not grouped: a type chip, no group block, and the
    // count is the related posts carrying the type.
    await expect(page.getByTestId('aside-type-filter')).toContainText('Agree');
    await expect(page.locator('[data-related-group-header]')).toHaveCount(0);
    await expect(page.getByTestId('active-group-anchor')).toHaveCount(0);
    await expect(page.getByTestId('related-filter-summary'))
      .toContainText(`Filtered: ${expectedRelated} related post${expectedRelated === 1 ? '' : 's'}`);
    for (const types of await drawnCardTypes(page)) expect(types).toContain('agree');

    // The clicked reply holds still.
    expect(Math.abs((await topOf(reply)) - before)).toBeLessThanOrEqual(1);

    // Clicking the active tag clears both panes.
    await tag.click();
    await expect(page).not.toHaveURL(/[?&]fg=/);
    await expect(page).not.toHaveURL(/[?&]ft=/);
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
    await expect(members).toHaveCount(0);
    await expect(page.getByTestId('aside-type-filter')).toHaveCount(0);
    await expect(tag).toHaveAttribute('aria-pressed', 'false');
    expect(Math.abs((await topOf(reply)) - before)).toBeLessThanOrEqual(1);

    // Back restores the group; Back again returns to the plain view, still on
    // the same post.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]fo=replies/);
    await expect(page).toHaveURL(/[?&]fg=category/);
    await expect(members.first()).toBeVisible();
    await expect(page.getByTestId('aside-type-filter')).toContainText('Agree');
    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]fg=/);
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
    await expect(members).toHaveCount(0);
    await expect(page.getByTestId('aside-type-filter')).toHaveCount(0);
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
    const framing = reply.locator('[data-reply-badge="framing"]').first();
    const agree = reply.locator('[data-reply-badge="agree"]').first();

    await framing.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/[?&]ft=framing/);
    await expect(page).toHaveURL(/[?&]fo=replies/);
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
    await expect(page.getByTestId('aside-type-filter')).toContainText('Framing');

    // The other tag switches the group to its own type.
    await agree.click();
    await expect(page).toHaveURL(/[?&]ft=agree/);
    await expect(page.getByTestId('aside-type-filter')).toContainText('Agree');
    await expect(agree).toHaveAttribute('aria-pressed', 'true');
    await expect(framing).toHaveAttribute('aria-pressed', 'false');
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
  });

  test('an aside type icon groups the aside and filters the comments', async ({ page }) => {
    await openDetail(page);
    const icon = page.locator('[data-related-card] [data-related-tag][data-contribution-category="agree"]').first();
    await icon.scrollIntoViewIfNeeded();
    await icon.click();
    await expect(page).toHaveURL(/[?&]ft=agree/);
    await expect(page).toHaveURL(/[?&]fo=aside/);
    await expect(page).toHaveURL(/[?&]fg=category/);

    // Aside GROUPS; comments FILTER (chip, no cluster rail), and every drawn
    // top-level branch carries the type somewhere.
    await expect(page.locator('[data-related-group-header]')).toContainText('Agree (');
    await expect(page.getByTestId('aside-type-filter')).toHaveCount(0);
    await expect(page.getByTestId('reply-topic-filter')).toContainText('Agree');
    await expect(page.locator('[data-reply-cluster-member]')).toHaveCount(0);
    const branches = await page.locator('[data-testid="reply-scroll-region"] [data-reply-depth="0"]').evaluateAll((groups) =>
      groups.map((group) => Array.from(group.querySelectorAll('[data-reply-badge]'))
        .map((badge) => badge.getAttribute('data-reply-badge'))));
    expect(branches.length).toBeGreaterThan(0);
    for (const types of branches) expect(types).toContain('agree');

    // A reply tag of the same type is not "active" here (the comments are
    // filtered, not grouped). Clicking it moves the group to the comments.
    const { tag } = await replyTag(page, 'agree');
    await expect(tag).toHaveAttribute('aria-pressed', 'false');
    await tag.click();
    await expect(page).toHaveURL(/[?&]fo=replies/);
    await expect(page.locator('[data-related-group-header]')).toHaveCount(0);
    await expect(page.getByTestId('aside-type-filter')).toContainText('Agree');
    await expect(page.locator('[data-reply-cluster-member]').first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
  });
});
