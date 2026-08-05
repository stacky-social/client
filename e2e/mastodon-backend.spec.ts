import { expect, test, type Page } from '@playwright/test';

const account = {
  id: 'account-1',
  username: 'river',
  acct: 'river',
  display_name: 'River Chen',
  avatar: '/avatar/stacky_default.PNG',
};

function status(id: string, content: string) {
  return {
    id,
    content: `<p>${content}</p>`,
    created_at: '2026-08-05T12:00:00.000Z',
    account,
    replies_count: 2,
    favourites_count: 7,
    favourited: false,
    bookmarked: false,
    media_attachments: [],
    card: null,
  };
}

async function authenticate(page: Page, accessToken: string) {
  await page.addInitScript(({ account, accessToken }) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('currentUser', JSON.stringify(account));
  }, { account, accessToken });
}

test.describe('Mastodon-backed client mode', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // The app cache is intentionally module-scoped. A unique user token keeps
    // each browser contract isolated, just as separate users are in production.
    await authenticate(page, `backend-token-${testInfo.testId}-${testInfo.retry}`);
    await page.route('https://beta.stacky.social:3002/stacks/**/related', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ relatedStacks: [], size: 0 }),
    }));
    await page.route('https://beta.stacky.social:3002/posts/feedback', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ advice: [], praise: [], simulatedReplies: [] }),
    }));
  });

  test('loads the authenticated home timeline with its bearer token instead of JSON fixtures', async ({ page }) => {
    let authorization = '';
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => {
      authorization = route.request().headers().authorization || '';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([status('live-1', 'A post returned by the Mastodon home timeline.')]),
      });
    });

    await page.goto('/home');
    await expect(page.locator('[data-feed-mode="mastodon"]')).toBeVisible();
    await expect(page.getByText('A post returned by the Mastodon home timeline.')).toBeVisible();
    await expect(page.locator('[data-store-feed-post]')).toHaveCount(0);
    expect(authorization).toMatch(/^Bearer backend-token-/);
  });

  test('publishes through Mastodon and prepends the canonical returned status', async ({ page }) => {
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([status('live-1', 'Existing backend post')]),
    }));

    let requestBody: unknown;
    let authorization = '';
    await page.route('https://beta.stacky.social/api/v1/statuses', async (route) => {
      requestBody = route.request().postDataJSON();
      authorization = route.request().headers().authorization || '';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(status('live-2', 'A newly published backend post')),
      });
    });

    await page.goto('/home');
    const composer = page.getByLabel('Create a post');
    await composer.getByLabel('Post text').fill('A newly published backend post');
    await composer.getByRole('button', { name: 'Post' }).click();

    await expect(page.getByText('A newly published backend post')).toBeVisible();
    expect(requestBody).toEqual({ status: 'A newly published backend post' });
    expect(authorization).toMatch(/^Bearer backend-token-/);
  });

  test('follows Mastodon Link pagination once and stops at the final page', async ({ page }) => {
    const requestedMaxIds: Array<string | null> = [];
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => {
      const requestUrl = new URL(route.request().url());
      const maxId = requestUrl.searchParams.get('max_id');
      requestedMaxIds.push(maxId);
      if (maxId) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([status('live-final', 'The final paginated post')]),
        });
      }
      const firstPage = Array.from({ length: 40 }, (_, index) => status(`live-${index + 1}`, `Backend page post ${index + 1}`));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          link: '<https://beta.stacky.social/api/v1/timelines/home?max_id=next-page-cursor>; rel="next"',
          'access-control-expose-headers': 'Link',
        },
        body: JSON.stringify(firstPage),
      });
    });

    await page.goto('/home');
    await expect(page.getByText('Backend page post 1')).toBeVisible();
    const loadMore = page.getByRole('button', { name: 'Load more' });
    await expect(loadMore).toBeAttached();
    // Invoke the currently-mounted footer in one page task. Virtuoso may
    // replace its footer during Playwright's normal scroll-to-action cycle.
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find((candidate) => candidate.textContent?.includes('Load more'));
      if (button instanceof HTMLButtonElement && !button.disabled) button.click();
    });
    await expect.poll(() => requestedMaxIds.some((cursor) => cursor !== null)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByText('The final paginated post')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
    expect(requestedMaxIds.some((cursor) => cursor === 'next-page-cursor' || cursor === 'live-40')).toBe(true);
  });

  test('persists likes and bookmarks through Mastodon in authenticated mode', async ({ page }) => {
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([status('live-1', 'Backend interaction target')]),
    }));

    const requests: string[] = [];
    await page.route('https://beta.stacky.social/api/v1/statuses/live-1/favourite', (route) => {
      requests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ favourited: true }) });
    });
    await page.route('https://beta.stacky.social/api/v1/statuses/live-1/bookmark', (route) => {
      requests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bookmarked: true }) });
    });

    await page.goto('/home');
    const postCard = page.locator('[data-post-id="live-1"] [data-testid="post"]').first();
    await postCard.getByRole('button', { name: 'Like', exact: true }).click();
    await postCard.getByRole('button', { name: 'Bookmark', exact: true }).click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests).toEqual([
      'POST /api/v1/statuses/live-1/favourite',
      'POST /api/v1/statuses/live-1/bookmark',
    ]);
  });
});
