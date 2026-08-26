import { expect, test } from '@playwright/test';
import aiWorkforceData from '../src/app/FakeData/listy-injection.json';
import chineseEvsData from '../src/app/FakeData/chinese-evs.json';

const chineseFirstId = (chineseEvsData as any)[0].focusPost.id as string;
const aiFirstId = (aiWorkforceData as any).find((entry: any) => entry.timelineRoot !== false).focusPost.id as string;

test('keeps Chinese EVs and AI Workforce as isolated demo conversations', async ({ page }) => {
  const chineseResponse = page.waitForResponse((response) =>
    response.url().includes('/api/demo/timelines/chinese-evs') && response.status() === 200,
  );
  await page.goto('/ChineseEVs');
  const chinesePage = await (await chineseResponse).json();
  await expect(page.getByText('#ChineseEVs', { exact: true })).toBeVisible();
  await expect(page.locator(`[data-demo-feed-post="${chineseFirstId}"]`)).toBeVisible();
  expect(chinesePage.stats.posts).toBe(6);

  const aiResponse = page.waitForResponse((response) =>
    response.url().includes('/api/demo/timelines/ai-workforce') && response.status() === 200,
  );
  await page.goto('/AIWorkforce');
  const aiPage = await (await aiResponse).json();
  await expect(page.getByText('#AIWorkforce', { exact: true })).toBeVisible();
  await expect(page.locator(`[data-demo-feed-post="${aiFirstId}"]`)).toBeVisible();
  expect(aiPage.stats.posts).toBeGreaterThan(6);
  expect(aiPage.items.map((entry: any) => entry.focusPost.id)).not.toContain(chineseFirstId);

  await expect(page.getByRole('button', { name: '#ChineseEVs' })).toBeVisible();
  await expect(page.getByRole('button', { name: '#AIWorkforce' })).toBeVisible();
});

test('follows each local conversation independently', async ({ page }) => {
  await page.goto('/ChineseEVs');
  await page.getByRole('button', { name: 'Follow hashtag' }).click();

  await page.goto('/AIWorkforce');
  await expect(page.getByRole('button', { name: 'Follow hashtag' })).toBeVisible();
  await page.getByRole('button', { name: 'Follow hashtag' }).click();

  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('stacky:localStore:v1') || '{}');
    return [...(state.followingTags || [])].sort();
  })).toEqual(['aiworkforce', 'chineseevs']);
});
