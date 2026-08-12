import { expect, test, type Page } from '@playwright/test';

const account = {
  id: 'account-1',
  username: 'river',
  acct: 'river',
  display_name: 'River Chen',
  avatar: '/avatar/stacky_default.PNG',
  followers_count: 12,
  following_count: 8,
  statuses_count: 4,
  note: '<p>Battery systems researcher.</p>',
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

async function authenticate(page: Page, suffix: string) {
  await page.addInitScript(({ account, suffix }) => {
    localStorage.setItem('accessToken', `unified-token-${suffix}`);
    localStorage.setItem('currentUser', JSON.stringify(account));
  }, { account, suffix });
}

test.describe('unified discovery and interactions', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await authenticate(page, `${testInfo.testId}-${testInfo.retry}`);
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

  test('search combines saved and Mastodon hashtags, people, and posts', async ({ page }) => {
    let searchAuthorization = '';
    await page.route('https://beta.stacky.social/api/v2/search**', (route) => {
      searchAuthorization = route.request().headers().authorization || '';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accounts: [account],
          statuses: [status('live-search', 'Remote battery manufacturing result')],
          hashtags: [{ name: 'BatteryFuture', url: 'https://beta.stacky.social/tags/batteryfuture' }],
        }),
      });
    });
    await page.route('https://beta.stacky.social/api/v1/statuses/live-search', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(status('live-search', 'Remote battery manufacturing result')),
    }));
    await page.route('https://beta.stacky.social/api/v1/statuses/live-search/context', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ancestors: [], descendants: [] }),
    }));

    await page.goto('/search');
    await expect(page.getByRole('button', { name: 'Open #ChineseEVs hashtag' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open #StackyInjection hashtag' })).toBeVisible();

    await page.getByLabel('Search hashtags, people, and posts').fill('battery');
    await expect(page.getByRole('button', { name: 'Open #BatteryFuture hashtag' })).toBeVisible();
    await expect(page.locator('[data-search-origin="local"]').filter({ hasText: /battery/i }).first()).toBeVisible();
    const remotePost = page.locator('[data-search-origin="mastodon"]').filter({ hasText: 'Remote battery manufacturing result' });
    await expect(remotePost).toBeVisible();
    expect(searchAuthorization).toMatch(/^Bearer unified-token-/);

    await remotePost.click();
    await expect(page).toHaveURL(/\/posts\/live-search$/);
    await expect(page.getByText('Remote battery manufacturing result')).toBeVisible();
  });

  test('keeps hashtag discovery usable on a phone-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/search');

    const chineseEvs = page.getByRole('button', { name: 'Open #ChineseEVs hashtag' });
    const stackyInjection = page.getByRole('button', { name: 'Open #StackyInjection hashtag' });
    await expect(chineseEvs).toBeVisible();
    await expect(stackyInjection).toBeVisible();

    const viewportFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(viewportFits).toBe(true);
  });

  test('opens a Mastodon person from search and follows them on the server', async ({ page }) => {
    await page.route('https://beta.stacky.social/api/v2/search**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accounts: [account], statuses: [], hashtags: [] }),
    }));
    await page.route('https://beta.stacky.social/api/v1/accounts/account-1', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(account),
    }));
    await page.route('https://beta.stacky.social/api/v1/accounts/account-1/statuses**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([status('profile-post', 'A post on the live profile')]),
    }));
    await page.route('https://beta.stacky.social/api/v1/accounts/relationships**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'account-1', following: false }]),
    }));
    let followed = false;
    await page.route('https://beta.stacky.social/api/v1/accounts/account-1/follow', (route) => {
      followed = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ following: true }) });
    });

    await page.goto('/search');
    await page.getByLabel('Search hashtags, people, and posts').fill('River Chen');
    const person = page.locator('[data-search-origin="mastodon"]').filter({ hasText: '@river' }).first();
    await person.click();

    await expect(page).toHaveURL(/\/user\/river\?source=mastodon&id=account-1$/);
    await expect(page.getByText('Battery systems researcher.')).toBeVisible();
    await expect(page.getByText('A post on the live profile')).toBeVisible();
    await page.getByRole('button', { name: 'Follow', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unfollow', exact: true })).toBeVisible();
    expect(followed).toBe(true);
  });

  test('following a Mastodon hashtag refreshes Home and adds its posts', async ({ page }) => {
    let followed = false;
    let homeRequests = 0;
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => {
      homeRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          status('base-home', 'Existing Home post'),
        ]),
      });
    });
    await page.route('https://beta.stacky.social/api/v1/tags/StackyInjectionPost', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        name: 'StackyInjectionPost',
        url: 'https://beta.stacky.social/tags/stackyinjectionpost',
        following: followed,
        history: [{ day: '1785888000', accounts: '0', uses: '0' }],
      }),
    }));
    await page.route('https://beta.stacky.social/api/v1/timelines/tag/StackyInjectionPost**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        status('tagged-home', 'A #StackyInjection conversation'),
        ...(followed
          ? [status('tagged-reply', 'A #StackyInjection reply', { in_reply_to_id: 'tagged-home' })]
          : []),
      ]),
    }));
    await page.route('https://beta.stacky.social/api/v1/tags/StackyInjectionPost/follow', (route) => {
      followed = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ following: true }) });
    });

    await page.goto('/home');
    await expect(page.getByText('Existing Home post')).toBeVisible();
    await page.goto('/tag/StackyInjection');
    await expect(page.getByText('Earlier New York Times, Fox News, and community conversations')).toBeVisible();
    await expect(page.getByText('A #StackyInjection conversation')).toBeVisible();
    await page.getByRole('button', { name: 'Follow hashtag' }).click();
    await expect(page.getByRole('button', { name: 'Unfollow hashtag' })).toBeVisible();

    await page.goto('/home');
    await expect(page.getByText('A #StackyInjection conversation')).toBeVisible();
    await expect(page.getByText('A #StackyInjection reply')).toHaveCount(0);
    await expect(page.locator('[data-feed-origin="mastodon"]').filter({ hasText: '#StackyInjection' })).toBeVisible();
    expect(homeRequests).toBeGreaterThanOrEqual(2);
  });

  test('expands legacy StackyInjection groups into modern related-post cards', async ({ page }) => {
    await page.setViewportSize({ width: 1720, height: 960 });
    const focus = status('legacy-focus', 'A legacy newsroom injection post');
    const secondFocus = status('legacy-focus-2', `A second legacy newsroom injection post ${'with enough reading context '.repeat(45)}`);
    const thirdFocus = status('legacy-focus-3', `A third legacy newsroom injection post ${'with enough reading context '.repeat(45)}`);
    const longContext = 'additional context '.repeat(80);
    const firstRelated = status('legacy-related-1', 'unused', {
      content: `<p><strong>First expanded related response</strong> Their lives are online and one had a apple air tag before going to a ATM. ${longContext}
        <a href="https://example.com/report" target="_blank">
          <span class="invisible">https://</span><span class="ellipsis">example.com</span><span class="invisible">/report</span>
        </a> Published: 2025-09-05T19:48:47Z</p>`,
      content_rewritten: '',
      rewrite: {
        content: `First expanded related response⌈[.]⌉ Their lives are online⌈[,]⌉ and one had ⌊[a a]⌋⌈[an A]⌉pple ⌊[air tag]⌋⌈[AirTag]⌉ before going to ⌊[a]⌋⌈[an]⌉ ATM. ${longContext}`,
        significant: true,
      },
      // Reproduce the reported backend shape: the legacy card carries offset
      // annotations as well as a track-changes rewrite. Annotated cards used to
      // bypass revision parsing in order to preserve their original geometry.
      relations: [{
        focusStart: 0,
        focusEnd: 31,
        contentStart: 0,
        contentEnd: 31,
        focusCommentStart: 0,
        focusCommentEnd: 31,
        contentCommentStart: 0,
        contentCommentEnd: 31,
        category: 'pointers',
        topic: 'Newsroom context',
      }],
    });
    const secondRelated = status('legacy-related-2', 'Second expanded related response', {
      content_rewritten: '',
      rewrite: { content: '', significant: false },
    });
    const agreeRelated = status('legacy-related-3', 'A third response in the agree category', {
      content_rewritten: '',
      rewrite: { content: '', significant: false },
    });
    const otherLeader = status('other-related-1', 'Another focus post related leader');
    const otherMember = status('other-related-2', 'Another focus post related member');
    const lowerLeader = status('lower-related-1', 'Lower focus post related leader');
    const distantPrefix = 'Opening context before the actual relationship. '.repeat(14);
    const distantRelationLead = 'The broad supporting passage continues with background detail. '.repeat(7);
    const distantCrux = 'The specific bolded related crux must be visible.';
    const distantRelationTail = ' The supporting passage closes after the emphasized point.'.repeat(3);
    const distantOriginal = `${distantPrefix}${distantRelationLead}${distantCrux}${distantRelationTail}`;
    const distantRelationStart = distantPrefix.length;
    const distantCommentStart = distantPrefix.length + distantRelationLead.length;
    const distantRelated = status('distant-related-1', 'unused', {
      content: `<p>${distantOriginal}</p>`,
      rewrite: {
        content: `AI clarification added at the beginning. ${distantOriginal}`,
        significant: true,
        editSummary: 'Adds context before the original response.',
      },
      relations: [{
        focusStart: 10,
        focusEnd: 220,
        contentStart: distantRelationStart,
        contentEnd: distantOriginal.length,
        focusCommentStart: 80,
        focusCommentEnd: 120,
        contentCommentStart: distantCommentStart,
        contentCommentEnd: distantCommentStart + distantCrux.length,
        category: 'framing',
        topic: 'Distant related passage',
      }],
    });

    await page.route('https://beta.stacky.social/api/v1/tags/StackyInjectionPost', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        name: 'StackyInjectionPost',
        url: 'https://beta.stacky.social/tags/stackyinjectionpost',
        following: false,
        history: [],
      }),
    }));
    await page.route('https://beta.stacky.social/api/v1/timelines/tag/StackyInjectionPost**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([focus, secondFocus, thirdFocus]),
    }));
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([focus]),
    }));
    await page.route('https://beta.stacky.social:3002/stacks/legacy-focus/related', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        size: 3,
        relatedStacks: [
          {
            stackId: 'stack:legacy-pointers',
            rel: 'pointers',
            size: 2,
            topPost: firstRelated,
          },
          {
            stackId: 'stack:legacy-agree',
            rel: 'agree',
            size: 1,
            topPost: agreeRelated,
          },
        ],
      }),
    }));
    await page.route('https://beta.stacky.social:3002/stacks/legacy-focus-2/related', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        size: 2,
        relatedStacks: [{
          stackId: 'stack:other-values',
          rel: 'values',
          size: 2,
          topPost: otherLeader,
        }],
      }),
    }));
    await page.route('https://beta.stacky.social:3002/stacks/legacy-focus-3/related', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        size: 2,
        relatedStacks: [
          {
            stackId: 'stack:lower-evidence',
            rel: 'evidence_personal',
            size: 1,
            topPost: lowerLeader,
          },
          {
            stackId: 'stack:distant-framing',
            rel: 'framing',
            size: 1,
            topPost: distantRelated,
          },
        ],
      }),
    }));
    await page.route('https://beta.stacky.social:3002/stacks/stack%3Alegacy-pointers/posts', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([firstRelated, secondRelated]),
    }));
    await page.route('https://beta.stacky.social:3002/stacks/stack%3Alegacy-agree/posts', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([agreeRelated]),
    }));
    await page.route('https://beta.stacky.social:3002/stacks/stack%3Aother-values/posts', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([otherLeader, otherMember]),
    }));
    await page.goto('/tag/StackyInjection');

    await expect(page.getByRole('button', { name: 'Modified by AI' })).toBeVisible();
    await expect(page.getByText('Second expanded related response')).toBeVisible();
    await expect(page.getByText('A third response in the agree category')).toBeVisible();
    await expect(page.locator('[data-related-card]')).toHaveCount(3);
    await expect(page.locator('[data-related-stack-count]')).toHaveCount(0);
    await expect(page.locator('[data-related-stack-layer]')).toHaveCount(0);
    const firstCard = page.locator('[data-related-card]').first();
    await expect(firstCard.locator('[data-ai-edited-default]')).toContainText(
      'Their lives are online, and one had an Apple AirTag before going to an ATM.',
    );
    await expect(firstCard.locator('[data-ai-edited-default]')).not.toContainText('Published:');
    await expect(firstCard.locator('[data-ai-edited-default]')).not.toContainText('https://');
    await expect(firstCard.locator('[data-related-card-content]')).not.toContainText(/[⌊⌋⌈⌉\[\]]/);
    await expect(firstCard.getByRole('link', { name: 'Read article · example.com' })).toHaveAttribute('href', 'https://example.com/report');

    const aiBadge = firstCard.getByRole('button', { name: 'Modified by AI' });
    const cardBeforeDiff = await firstCard.boundingBox();
    await aiBadge.hover();
    await expect(firstCard.locator('[data-ai-inline-diff]')).toHaveAttribute('aria-hidden', 'false');
    await expect(firstCard.locator('[data-ai-inline-diff]')).not.toContainText(/[⌊⌋⌈⌉\[\]]/);
    await expect(firstCard.locator('[data-ai-inline-diff]').locator('ins')).toContainText(['.', ',', 'an', 'Apple', 'AirTag', 'an']);
    const cardWithDiff = await firstCard.boundingBox();
    expect(cardWithDiff?.width).toBeCloseTo(cardBeforeDiff!.width, 2);
    expect(cardWithDiff?.height).toBeCloseTo(cardBeforeDiff!.height, 2);

    await page.getByRole('button', { name: 'Show Pointers filter' }).click();
    await expect(page.getByText('2 Pointers posts')).toBeVisible();
    await expect(page.locator('[data-related-card]')).toHaveCount(2);
    await expect(page.locator('[data-related-card][data-related-category="pointers"]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Show Agree filter' }).click();
    await expect(page.getByText('1 Agree post')).toBeVisible();
    await expect(page.locator('[data-related-card][data-related-category="agree"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove Agree filter' }).click();
    await expect(page.locator('[data-related-card]')).toHaveCount(3);

    const collapsedContent = page.locator('[data-related-card-content]').first();
    await expect(collapsedContent).toHaveAttribute('data-expanded', 'false');
    expect(await collapsedContent.evaluate((element) => getComputedStyle(element).maxHeight)).not.toBe('none');
    await firstCard.getByRole('button', { name: 'Read more' }).click();
    await expect(collapsedContent).toHaveAttribute('data-expanded', 'true');
    expect(await collapsedContent.evaluate((element) => getComputedStyle(element).maxHeight)).toBe('none');
    await firstCard.getByRole('button', { name: 'See less' }).click();
    await expect(collapsedContent).toHaveAttribute('data-expanded', 'false');

    // Scrolling upward to a legacy focus for the first time must paint its final
    // individual-card set atomically. Rendering the group leader first and
    // replacing it a microtask later makes one focus change look like two pane
    // changes. Jump over the middle post so its expansion is not cached first.
    await page.locator('[data-feed-origin="mastodon"]').evaluateAll((posts) => {
      posts.forEach((post) => { (post as HTMLElement).style.minHeight = '620px'; });
    });
    const thirdFocusCard = page.locator('[data-feed-origin="mastodon"][data-post-id="legacy-focus-3"]');
    await thirdFocusCard.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(thirdFocusCard.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.getByText('Lower focus post related leader')).toBeVisible();
    await expect(page.locator('[data-related-card]')).toHaveCount(2);
    const spanlessRelatedCard = page.locator('[data-related-card][data-related-category="evidence_personal"]');
    await expect(spanlessRelatedCard.locator('[data-related-tag][data-related-span="false"]')).toHaveAttribute(
      'aria-label',
      'Evidence (Personal)',
    );
    const distantRelatedCard = page.locator('[data-related-card]').filter({
      has: page.locator('[data-post-id="distant-related-1"]'),
    });
    const distantMark = distantRelatedCard.locator('mark[data-range-id="0"]');
    await expect(distantRelatedCard.locator('[data-ai-edited-default]')).toContainText(distantCrux);
    await expect(distantMark).toBeVisible();
    await distantRelatedCard.hover();
    await expect(distantMark.locator('span')).toHaveText(distantCrux);

    await page.evaluate(() => {
      const snapshots: string[][] = [];
      let last = '';
      const snapshot = () => {
        const ids = Array.from(document.querySelectorAll('[data-related-card]'))
          .map((card) => card.querySelector('[data-post-id]')?.getAttribute('data-post-id') || '')
          .filter(Boolean);
        if (ids.length === 0) return;
        const key = ids.join('|');
        if (key !== last) {
          last = key;
          snapshots.push(ids);
        }
      };
      (window as any).__relatedSnapshots = snapshots;
      new MutationObserver(snapshot).observe(document.body, { childList: true, subtree: true });
    });
    const secondFocusCard = page.locator('[data-feed-origin="mastodon"][data-post-id="legacy-focus-2"]');
    await secondFocusCard.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await expect(secondFocusCard.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.getByText('Another focus post related member')).toBeVisible();
    await expect(page.locator('[data-related-card]')).toHaveCount(2);
    await expect(page.locator(
      '[data-related-card][data-related-category="values"] [data-related-tag][data-related-span="false"][aria-label="Values"]',
    )).toHaveCount(2);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => (window as any).__relatedSnapshots)).toEqual([
      ['lower-related-1', 'distant-related-1'],
      ['other-related-1', 'other-related-2'],
    ]);

    // The same legacy post must keep the modern presentation when it appears
    // in Home; this was the route-specific regression reported by users.
    await page.goto('/home');
    await expect(page.getByText('A legacy newsroom injection post')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Modified by AI' })).toBeVisible();
    await expect(page.locator('[data-related-card]')).toHaveCount(3);
    await expect(page.locator('[data-related-stack-count]')).toHaveCount(0);
    await expect(page.locator('[data-related-stack-layer]')).toHaveCount(0);
    await expect(page.locator('[data-related-card-content]').first()).toHaveAttribute('data-expanded', 'false');
  });

  test('interleaves followed #ChineseEVs posts without adding source labels', async ({ page }) => {
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        status('live-1', 'Live one'),
        status('live-2', 'Live two'),
        status('live-3', 'Live three'),
        status('live-4', 'Live four'),
      ]),
    }));

    await page.goto('/tag/ChineseEVs');
    await page.getByRole('button', { name: 'Follow hashtag' }).click();
    await page.goto('/home');

    const origins = page.locator('[data-feed-origin]');
    await expect(origins.nth(0)).toHaveAttribute('data-feed-origin', 'mastodon');
    await expect(origins.nth(1)).toHaveAttribute('data-feed-origin', 'mastodon');
    await expect(origins.nth(2)).toHaveAttribute('data-feed-origin', 'mastodon');
    await expect(origins.nth(3)).toHaveAttribute('data-feed-origin', 'demo');
    await expect(origins.nth(3)).not.toContainText(/JSON|Mastodon|curated/i);
  });

  test('keeps like, bookmark, and share behavior consistent across both sources', async ({ page }) => {
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([status('live-action', 'Backend interaction target')]),
    }));
    await page.route('https://beta.stacky.social/api/v1/favourites**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([status('live-action', 'Backend interaction target', { favourited: true })]),
    }));
    await page.route('https://beta.stacky.social/api/v1/bookmarks**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([status('live-action', 'Backend interaction target', { bookmarked: true })]),
    }));
    const backendActions: string[] = [];
    await page.route('https://beta.stacky.social/api/v1/statuses/live-action/favourite', (route) => {
      backendActions.push('favourite');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ favourited: true }) });
    });
    await page.route('https://beta.stacky.social/api/v1/statuses/live-action/bookmark', (route) => {
      backendActions.push('bookmark');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bookmarked: true }) });
    });

    await page.goto('/tag/ChineseEVs');
    await page.getByRole('button', { name: 'Follow hashtag' }).click();
    await page.goto('/home');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value: string) => sessionStorage.setItem('copied-link', value) },
      });
    });

    const backendCard = page.locator('[data-feed-origin="mastodon"]').first();
    const localCard = page.locator('[data-feed-origin="demo"]').first();
    await backendCard.getByRole('button', { name: 'Like', exact: true }).click();
    await backendCard.getByRole('button', { name: 'Bookmark', exact: true }).click();
    await backendCard.getByRole('button', { name: 'Share post' }).click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('copied-link'))).toContain('/posts/live-action');

    const localId = await localCard.getAttribute('data-post-id');
    expect(localId).toBeTruthy();
    await localCard.getByRole('button', { name: 'Like', exact: true }).click();
    await localCard.getByRole('button', { name: 'Bookmark', exact: true }).click();
    await localCard.getByRole('button', { name: 'Share post' }).click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('copied-link'))).toContain(`/ChineseEVs/posts/${localId}`);
    expect(backendActions).toEqual(['favourite', 'bookmark']);

    await page.goto('/liked');
    await expect(page.locator('[data-feed-origin="mastodon"]')).toContainText('Backend interaction target');
    await expect(page.locator(`[data-feed-origin="demo"][data-post-id="${localId}"]`)).toBeVisible();

    await page.goto('/bookmarks');
    await expect(page.locator('[data-feed-origin="mastodon"]')).toContainText('Backend interaction target');
    await expect(page.locator(`[data-feed-origin="demo"][data-post-id="${localId}"]`)).toBeVisible();
  });
});

test.describe('public Mastodon hashtag reading', () => {
  test('loads #StackyInjection without requiring a login', async ({ page }) => {
    const authorizations: string[] = [];
    await page.route('https://beta.stacky.social/api/v1/tags/StackyInjectionPost', (route) => {
      authorizations.push(route.request().headers().authorization || '');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: 'StackyInjectionPost',
          url: 'https://beta.stacky.social/tags/stackyinjectionpost',
          history: [{ day: '1785888000', accounts: '1', uses: '1' }],
        }),
      });
    });
    await page.route('https://beta.stacky.social/api/v1/timelines/tag/StackyInjectionPost**', (route) => {
      authorizations.push(route.request().headers().authorization || '');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([status('public-tag-post', 'A public #StackyInjection post')]),
      });
    });
    await page.route('https://beta.stacky.social:3002/stacks/**/related', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ relatedStacks: [], size: 0 }),
    }));

    await page.goto('/tag/StackyInjection');

    await expect(page.getByText('A public #StackyInjection post')).toBeVisible();
    await expect(page.getByTestId('tag-load-error')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in to follow' })).toBeDisabled();
    expect(authorizations).toEqual(['', '']);
  });
});
