import { expect, test, type Page } from '@playwright/test';

const account = {
  id: 'account-1',
  username: 'river',
  acct: 'river',
  display_name: 'River Chen',
  avatar: '/icon.svg',
};

function status(id: string, content: string, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
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
    await expect(page.getByRole('main')).toHaveCSS('border-left-width', '0px');
    await expect(page.getByRole('main')).toHaveCSS('border-right-width', '0px');
    await expect(page.getByRole('main')).toHaveCSS('box-shadow', 'none');
    await expect(page.getByRole('main')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByRole('main')).toHaveCSS('overflow', 'visible');
    const homeCard = page.locator('[data-post-id="live-1"] [data-testid="post"]');
    await expect(homeCard).toHaveCSS('border-radius', '10px 0px 0px 10px');
    await expect(homeCard).toHaveCSS('border-right-color', 'rgba(0, 0, 0, 0)');
    expect(await homeCard.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
    expect(authorization).toMatch(/^Bearer backend-token-/);
  });

  test('resolves a backend username link even when the post payload omitted its account id', async ({ page }) => {
    const georgia = {
      ...account,
      id: 'account-georgia',
      username: 'georgiagreen',
      acct: 'georgiagreen',
      display_name: 'Georgia Green',
      note: '<p>Housing and neighborhood reporting.</p>',
    };

    await page.route('https://beta.stacky.social/api/v1/accounts/lookup**', (route) => {
      expect(new URL(route.request().url()).searchParams.get('acct')).toBe('georgiagreen');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(georgia) });
    });
    await page.route('https://beta.stacky.social/api/v1/accounts/account-georgia', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(georgia) }),
    );
    await page.route('https://beta.stacky.social/api/v1/accounts/account-georgia/statuses**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([status('georgia-post', 'A backend profile post.', { account: georgia })]),
      }),
    );
    await page.route('https://beta.stacky.social/api/v1/accounts/relationships**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: georgia.id, following: false }]) }),
    );
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          status('georgia-feed', 'A backend timeline post.', {
            account: { ...georgia, id: undefined },
          }),
        ]),
      }),
    );

    await page.goto('/home');
    const backendPost = page.locator('[data-post-id="georgia-feed"]');
    await backendPost.getByText('Georgia Green', { exact: true }).click();
    await expect(page).toHaveURL(/\/user\/georgiagreen$/);

    await expect(page.getByText('Housing and neighborhood reporting.')).toBeVisible();
    await expect(page.getByText('A backend profile post.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Application error' })).toHaveCount(0);
  });

  test('deletes my Mastodon post through the backend and removes it from the timeline', async ({ page }) => {
    const otherAccount = { ...account, id: 'account-2', username: 'other', acct: 'other', display_name: 'Other person' };
    let deleteAuthorization = '';
    let deleteMethod = '';

    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        status('live-own', 'A post I can delete.'),
        status('live-other', 'Someone else’s post.', { account: otherAccount }),
      ]),
    }));
    await page.route('https://beta.stacky.social/api/v1/statuses/live-own', (route) => {
      deleteAuthorization = route.request().headers().authorization || '';
      deleteMethod = route.request().method();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status('live-own', 'A post I can delete.')) });
    });

    await page.goto('/home');
    const ownPost = page.locator('[data-feed-origin][data-post-id="live-own"]');
    const otherPost = page.locator('[data-feed-origin][data-post-id="live-other"]');
    await expect(ownPost.getByRole('button', { name: 'More post actions' })).toBeVisible();
    await expect(otherPost.getByRole('button', { name: 'More post actions' })).toHaveCount(0);

    await ownPost.getByRole('button', { name: 'More post actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete post' }).click();
    await page.getByRole('dialog', { name: 'Delete post?' }).getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText('Post deleted', { exact: true })).toBeVisible();
    await expect(page.locator('[data-feed-origin][data-post-id="live-own"]')).toHaveCount(0);
    await expect(otherPost).toBeVisible();
    expect(deleteMethod).toBe('DELETE');
    expect(deleteAuthorization).toMatch(/^Bearer backend-token-/);
  });

  test('hides Mastodon replies on Home unless the experiment is enabled', async ({ page }) => {
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        status('root-post', 'A followed account post'),
        status('reply-post', 'A reply from a followed account', { in_reply_to_id: 'root-post' }),
      ]),
    }));

    await page.goto('/home');
    await expect(page.getByText('A followed account post')).toBeVisible();
    await expect(page.getByText('A reply from a followed account')).toHaveCount(0);

    await page.evaluate(() => {
      localStorage.setItem('stacky:experimentFlags:v1', JSON.stringify({ homeReplies: true }));
    });
    await page.reload();
    await expect(page.getByText('A reply from a followed account')).toBeVisible();
  });

  test('keeps the final two Home posts reachable by viewport focus', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(Array.from(
        { length: 6 },
        (_, index) => status(`focus-${index + 1}`, `Focus runway post ${index + 1}`),
      )),
    }));

    await page.goto('/home');
    await expect(page.getByText('Focus runway post 6')).toBeAttached();
    await expect(page.locator('[data-feed-focus-runway="true"]')).toHaveCSS('padding-bottom', '450px');

    const centerPost = async (postId: string) => {
      await page.evaluate((id) => {
        const element = document.querySelector(`[data-post-id="${id}"]`);
        if (!(element instanceof HTMLElement)) throw new Error(`Missing post ${id}`);
        const rect = element.getBoundingClientRect();
        const target = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
        window.scrollTo(0, target);
      }, postId);
      await expect(page.locator(`[data-post-id="${postId}"] [data-testid="post"]`))
        .toHaveAttribute('data-active', 'true');
      await expect.poll(() => page.evaluate((id) => {
        const element = document.querySelector(`[data-post-id="${id}"]`);
        if (!(element instanceof HTMLElement)) return Number.POSITIVE_INFINITY;
        const rect = element.getBoundingClientRect();
        return Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
      }, postId)).toBeLessThan(20);
    };

    await centerPost('focus-5');
    await centerPost('focus-6');
  });

  test('blends an explicitly followed hashtag into authenticated Home', async ({ page }) => {
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }));

    await page.goto('/tag/ChineseEVs');
    await page.getByRole('button', { name: 'Follow hashtag' }).click();
    await expect(page.getByRole('button', { name: 'Unfollow hashtag' })).toBeVisible();

    await page.goto('/home');
    await expect(page.locator('[data-feed-mode="mastodon"]')).toBeVisible();
    await expect(page.locator('[data-feed-origin="demo"]').first()).toBeVisible();
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    await expect(page.getByText('Your Mastodon home timeline is empty.')).toHaveCount(0);
    await expect(page.getByRole('main')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
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

  test('browser Back restores the prior reply tab on a live post detail route', async ({ page }) => {
    const focus = status('live-detail', 'A live Mastodon detail post.');
    const reply = {
      ...status('live-reply', 'A reply that makes the tab strip visible.'),
      in_reply_to_id: 'live-detail',
    };

    await page.route('https://beta.stacky.social/api/v1/accounts/verify_credentials', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(account),
    }));
    await page.route('https://beta.stacky.social/api/v1/statuses/live-detail', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(focus),
    }));
    await page.route('https://beta.stacky.social/api/v1/statuses/live-detail/context', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ancestors: [], descendants: [reply] }),
    }));
    await page.route('https://beta.stacky.social:3002/replies/live-detail/summary', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ summary: 'A concise live-thread summary.' }),
    }));

    await page.goto('/posts/live-detail');
    const timeTab = page.getByRole('tab', { name: 'Time' });
    await expect(timeTab).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('tab', { name: 'Summary' }).click();
    await page.waitForURL(/[?&]tab=summary(?:&|$)/);
    await expect(page.getByText('A concise live-thread summary.')).toBeVisible();

    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]tab=/);
    await expect(timeTab).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/posts\/live-detail(?:\?.*)?$/);
  });
});
