import { expect, test } from '@playwright/test';
import scaleDemo from '../src/app/FakeData/scale-demo.json';

const timelineRoots = (scaleDemo as any[]).filter((entry) => entry.timelineRoot === true);
const timelineIds = timelineRoots.map((entry) => entry.focusPost.id as string);
const topicIds = new Map(
  timelineRoots.map((entry) => [entry.topicId as string, entry.focusPost.id as string]),
);
const rgQuote = timelineRoots.find(
  (entry) => entry.focusPost.sourceKey === 'nyt_ai-work-force-training-job-losses.json::152115016',
)!;

test.describe('Curated Home', () => {
  test('shows every scale-demo timeline root in a session-stable shuffled order', async ({ page }) => {
    await page.goto('/home');
    const cards = page.locator('[data-store-feed-post]');
    await expect(cards).toHaveCount(timelineIds.length);

    for (const postId of topicIds.values()) {
      await expect(page.locator(`[data-store-feed-post="${postId}"]`)).toHaveCount(1);
    }
    await expect(page.locator('[data-store-feed-post="143195604"]')).toHaveCount(0);

    const initialOrder = await cards.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.storeFeedPost),
    );
    expect(initialOrder).not.toEqual(timelineIds);

    await page.goto('/search');
    await page.goto('/home');
    await expect(cards).toHaveCount(timelineIds.length);
    const restoredOrder = await cards.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.storeFeedPost),
    );
    expect(restoredOrder).toEqual(initialOrder);
  });

  test('keeps only production navigation actions in the top bar', async ({ page }) => {
    await page.goto('/home');
    const nav = page.getByTestId('top-nav');

    await expect(nav.getByRole('button', { name: 'Search' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Bookmarks' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Liked' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: '#ChineseEVs' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: '#AIWorkforce' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Experiment settings' })).toHaveCount(0);
  });

  test('uses the original focus copy, embeds its article, and parses NYT dates', async ({ page }) => {
    // Reproduce the intermittent path: older builds persisted the response-role
    // copy for this id. The current seed must refresh immutable corpus fields
    // without discarding participant-owned state.
    await page.addInitScript(({ postId, quotedId }) => {
      localStorage.setItem('stacky:localStore:v1', JSON.stringify({
        posts: {
          [postId]: {
            id: postId,
            content: '<p>Universal basic income (UBI) is a good idea.</p>',
            in_reply_to_id: quotedId,
          },
        },
        accounts: {}, liked: [], bookmarked: [], following: [], followingTags: [], comments: {},
      }));
    }, { postId: rgQuote.focusPost.id, quotedId: rgQuote.focusPost.quotedPost.id });
    await page.goto('/home');
    const card = page.locator(`[data-store-feed-post="${rgQuote.focusPost.id}"]`);
    await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));

    await expect(card).toContainText(rgQuote.focusPost.plainText);
    await expect(card).not.toContainText('Universal basic income (UBI)');
    await expect(card.getByTestId('reply-context')).toHaveCount(0);
    await expect(card.getByTestId('quoted-post')).toContainText('Quoted article');
    await expect(card.getByTestId('quoted-post')).toContainText('New York Times');
    await expect(card).not.toContainText('Date unavailable');

    await card.getByTestId('post').click();
    await expect(page).toHaveURL(new RegExp(`/AIWorkforce/posts/${rgQuote.focusPost.id}$`));
    await expect(page.locator(`[data-post-id="${rgQuote.focusPost.id}"]`).first()).toContainText(
      rgQuote.focusPost.plainText,
    );
    await expect(page.getByText(rgQuote.focusPost.quotedPost.title, { exact: true })).toHaveCount(0);
    await expect(page.locator(`[data-post-id="${rgQuote.focusPost.id}"]`).first().getByTestId('quoted-post'))
      .toContainText('New York Times');
  });

  test('opens the focused Home post without blanking the related panel', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/home');
    const activeCard = page.locator('[data-store-feed-post]').filter({
      has: page.locator('[data-testid="post"][data-active="true"]'),
    }).first();
    await expect(activeCard).toBeVisible();
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    const postId = await activeCard.getAttribute('data-store-feed-post');
    expect(postId).toBeTruthy();

    // Watch the stable AppShell aside across the parallel-route swap. A
    // same-post context toggle used to remove every card immediately, leaving
    // the right column visibly blank until the detail page's effect ran.
    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __relatedPanelBlanked?: boolean;
        __relatedPanelObserver?: MutationObserver;
      };
      const aside = document.querySelector('[data-testid="col-aside"]');
      if (!aside) throw new Error('Aside column not found');
      testWindow.__relatedPanelBlanked = false;
      const check = () => {
        const hasCards = aside.querySelector('[data-related-card]') !== null;
        const hasExplicitEmptyState = aside.querySelector(
          '[data-testid="home-related-empty"], [data-testid="detail-related-empty"]',
        ) !== null;
        if (!hasCards && !hasExplicitEmptyState) testWindow.__relatedPanelBlanked = true;
      };
      const observer = new MutationObserver(check);
      observer.observe(aside, { childList: true, subtree: true });
      testWindow.__relatedPanelObserver = observer;
    });

    await activeCard.getByTestId('post').locator(':scope > [role="button"]').click();
    await expect(page).toHaveURL(new RegExp(`/posts/${postId}$`));
    await expect(page.locator(`[data-post-id="${postId}"]`).first()).toBeVisible();
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    const panelBlanked = await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __relatedPanelBlanked?: boolean;
        __relatedPanelObserver?: MutationObserver;
      };
      testWindow.__relatedPanelObserver?.disconnect();
      return testWindow.__relatedPanelBlanked ?? false;
    });
    expect(panelBlanked).toBe(false);
  });

  test('clicking a span on a non-focused post focuses, filters, and keeps the bridge connected', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/home');
    await expect(page.locator('[data-store-feed-post]')).toHaveCount(timelineIds.length);
    await expect(page.locator('[data-testid="post"][data-active="true"]')).toHaveCount(1);

    // Dispatch without Playwright auto-scrolling the target first: auto-scroll
    // would let the feed observer focus it before the click and would bypass the
    // exact non-focused transition this regression protects.
    const clicked = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-store-feed-post]'));
      const target = cards.find((card) =>
        card.querySelector('[data-testid="post"][data-active="false"] mark[data-fs]'));
      const post = target?.querySelector<HTMLElement>('[data-testid="post"]');
      const mark = target?.querySelector<HTMLElement>('mark[data-fs]');
      if (!target || !post || !mark) throw new Error('No non-focused highlighted Home post found');
      const postId = target.dataset.storeFeedPost;
      mark.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: mark.getBoundingClientRect().left + 2,
        clientY: mark.getBoundingClientRect().top + 2,
      }));
      return { postId };
    });
    expect(clicked.postId).toBeTruthy();

    const targetPost = page.locator(`[data-store-feed-post="${clicked.postId}"] [data-testid="post"]`);
    await expect(targetPost).toHaveAttribute('data-active', 'true');
    await expect(page.locator(`[data-related-focus-post-id="${clicked.postId}"]`).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove passage filter' })).toBeVisible();
    await expect(page.getByTestId('weave-bridge')).toHaveAttribute('data-focus-id', clicked.postId!);
    await expect(page.getByTestId('weave-bridge')).toBeVisible();

    // The selected passage remains painted even when it is a union of several
    // overlapping relation ranges (the old exact-offset lookup lost it).
    await expect.poll(async () => targetPost.locator('mark[data-fs]').evaluateAll((marks) =>
      marks.filter((mark) => getComputedStyle(mark).backgroundColor === 'rgb(193, 199, 209)').length,
    )).toBeGreaterThan(0);

    // A related contribution hover emphasizes the exact data-authored crux on
    // both sides. Both use non-reflowing faux-bold, so neither pane changes line
    // wrapping while the cross-highlight appears.
    const relatedCard = page.locator('[data-related-card]').first();
    const relatedMark = relatedCard.locator('mark').first();
    await expect(relatedMark).toBeVisible();
    await relatedCard.hover();
    await page.waitForTimeout(140);
    await relatedMark.hover();
    await page.waitForTimeout(350);
    await expect(targetPost.locator('span[data-fc]').first()).toBeVisible();
    await expect(relatedCard.locator('span[data-content-comment]').first()).toBeVisible();
    const emphasis = await Promise.all([
      targetPost.locator('span[data-fc]').first().evaluate((node) => ({
        weight: getComputedStyle(node).fontWeight,
        shadow: getComputedStyle(node).textShadow,
      })),
      relatedCard.locator('span[data-content-comment]').first().evaluate((node) => ({
        weight: getComputedStyle(node).fontWeight,
        shadow: getComputedStyle(node).textShadow,
      })),
    ]);
    expect(emphasis.every(({ weight, shadow }) => weight === '400' && shadow.includes('0.7px'))).toBe(true);
  });
});
