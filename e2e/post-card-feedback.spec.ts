import { test, expect } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';
import scaleDemo from '../src/app/FakeData/scale-demo.json';

const timeline = (mockData as any[]).filter((entry) => entry.timelineRoot !== false);
const shortQuote = timeline[0];
const longQuote = timeline[1];
const annaEntry = (mockData as any[]).find(
  (entry) => entry.focusPost.account.acct === 'anna@nytimes.com',
);
const linkedReplyId = 'cw-AKIXHkh6YtvzbL3D';
const linkedReplyEntry = (mockData as any[]).find(
  (entry) => entry.relatedPosts?.some((post: any) => post.id === linkedReplyId),
);
const multiLinkReplyId = 'cw-TGODIhKeqWxSgADI';
const multiLinkEntry = (scaleDemo as any[]).find(
  (entry) => entry.relatedPosts?.[0]?.id === multiLinkReplyId,
);

test.describe('post-card feedback', () => {
  test('shows truncation only when content is actually clamped and embeds regular posts', async ({ page }) => {
    await page.goto('/AIWorkforce');

    const shortCard = page.locator(`[data-post-id="${shortQuote.focusPost.id}"]`).first();
    const longCard = page.locator(`[data-post-id="${longQuote.focusPost.id}"]`).first();
    await expect(shortCard).toBeVisible({ timeout: 15_000 });
    await expect(longCard).toBeVisible({ timeout: 15_000 });

    await expect(shortCard.getByRole('button', { name: 'Read more' })).toHaveCount(0);
    await expect(shortCard.getByTestId('post-clamp-ellipsis')).toHaveCount(0);

    await expect(longCard.getByRole('button', { name: 'Read more' })).toBeVisible();
    const ellipsis = longCard.getByRole('button', { name: 'Read full post' });
    await expect(ellipsis).toBeVisible();
    await expect(ellipsis).toHaveText('…');
    await expect(ellipsis).toHaveAttribute('data-inline-positioned', 'true');
    const markerGeometry = await longCard.evaluate((card) => {
      const text = card.querySelector<HTMLElement>('.postClampedText')!;
      const marker = card.querySelector<HTMLElement>('[data-testid="post-clamp-ellipsis"]')!;
      const markerRect = marker.getBoundingClientRect();
      const textRect = text.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(marker);
      const glyphRect = range.getBoundingClientRect();
      const style = getComputedStyle(marker);
      return {
        maskBeforeGlyph: glyphRect.left - markerRect.left,
        glyphRightInset: textRect.right - glyphRect.right,
        coversTextTail: markerRect.right >= textRect.right - 0.5,
        background: style.backgroundColor,
        color: style.color,
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: style.fontWeight,
      };
    });
    expect(markerGeometry.maskBeforeGlyph).toBeGreaterThanOrEqual(3);
    expect(markerGeometry.glyphRightInset).toBeGreaterThanOrEqual(0);
    expect(markerGeometry.glyphRightInset).toBeLessThanOrEqual(markerGeometry.fontSize);
    expect(markerGeometry.coversTextTail).toBe(true);
    expect(markerGeometry.background).toBe('rgb(255, 255, 255)');
    expect(markerGeometry.color).toBe('rgb(100, 116, 139)');
    expect(markerGeometry.fontWeight).toBe('600');

    await ellipsis.click();
    await expect(ellipsis).toHaveCount(0);
    await expect(longCard.getByRole('button', { name: 'Read less' })).toBeVisible();

    const quoteAction = shortCard.getByTestId('quoted-post');
    await expect(quoteAction).not.toContainText('Quoted source');
    await expect(quoteAction).toHaveAttribute(
      'aria-label',
      `Open post by ${shortQuote.focusPost.quotedPost.account.display_name}`,
    );
    await expect(quoteAction.locator('[data-default-profile-avatar]')).toBeVisible();
    await expect(quoteAction).toContainText(shortQuote.focusPost.quotedPost.account.display_name);
    await expect(quoteAction).toContainText(shortQuote.focusPost.quotedPost.title);
    await expect(quoteAction).toContainText(shortQuote.focusPost.quotedPost.content);
    expect((await quoteAction.boundingBox())?.height).toBeGreaterThan(70);
  });

  test('keeps newly imported authors local when an older store is already persisted', async ({ page }) => {
    expect(annaEntry).toBeTruthy();
    await page.addInitScript(() => {
      window.localStorage.setItem('stacky:localStore:v1', JSON.stringify({
        posts: {},
        accounts: {
          legacy: {
            acct: 'legacy', display_name: 'Legacy', username: 'legacy', avatar: '',
            followers_count: 0, following_count: 0, statuses_count: 0, note: '',
          },
        },
        liked: [], bookmarked: [], following: [], followingTags: [], comments: {},
        me: {
          acct: 'you', display_name: 'You', username: 'you', avatar: '',
          followers_count: 0, following_count: 0, statuses_count: 0, note: '',
        },
      }));
    });

    await page.goto(`/AIWorkforce/posts/${annaEntry.focusPost.id}`);
    const annaCard = page.locator(`[data-post-id="${annaEntry.focusPost.id}"]`).first();
    await expect(annaCard).toBeVisible({ timeout: 15_000 });
    await annaCard.locator('button').filter({ hasText: /^Anna$/ }).click();

    await expect(page).toHaveURL(/\/user\/anna(?:%40|@)nytimes\.com$/);
    await expect(page.getByText("Couldn't load @anna@nytimes.com.")).toHaveCount(0);
    await expect(page.getByText('@anna@nytimes.com', { exact: true })).toBeVisible();
  });

  test('keeps source URLs visible and clickable without assuming their content type', async ({ page }) => {
    expect(linkedReplyEntry).toBeTruthy();
    await page.goto(`/AIWorkforce/posts/${linkedReplyEntry.focusPost.id}`);

    const card = page.locator('[data-related-card]').filter({
      has: page.locator(`[data-post-id="${linkedReplyId}"]`),
    }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-related-card-content]')).toContainText('https://en.wikipedia.org/wiki/Jevons_paradox');
    await expect(card.locator('mark').first()).toBeVisible();
    await expect(card.getByRole('link', { name: 'https://en.wikipedia.org/wiki/Jevons_paradox' })).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Jevons_paradox',
    );
    await expect(card.getByText(/Read article/i)).toHaveCount(0);
  });

  test('renders multiple authored URLs as separate inline links', async ({ page }) => {
    expect(multiLinkEntry).toBeTruthy();
    await page.goto(`/EnergyTech/posts/${multiLinkEntry.focusPost.id}`);

    const card = page.locator(`[data-post-id="${multiLinkReplyId}"]`).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    const readMore = card.getByRole('button', { name: 'Read more' });
    if (await readMore.isVisible()) await readMore.click();

    await expect(card.getByRole('link', { name: 'https://ember-energy.org/countries-and-regions/china' }))
      .toHaveAttribute('href', 'https://ember-energy.org/countries-and-regions/china');
    await expect(card.getByRole('link', {
      name: 'https://www.carbonbrief.org/analysis-clean-energy-just-put-chinas-co2-emissions-into-reverse-for-first-time',
    })).toHaveAttribute(
      'href',
      'https://www.carbonbrief.org/analysis-clean-energy-just-put-chinas-co2-emissions-into-reverse-for-first-time',
    );
    await expect(card.getByRole('link', {
      name: 'https://www.nytimes.com/interactive/2025/06/30/climate/china-clean-energy-power.html',
    })).toHaveAttribute(
      'href',
      'https://www.nytimes.com/interactive/2025/06/30/climate/china-clean-energy-power.html',
    );
  });
});
