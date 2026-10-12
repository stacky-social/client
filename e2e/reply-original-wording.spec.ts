import { expect, test } from '@playwright/test';
import data from '../src/app/FakeData/scale-demo.json';

const parentId = 'cw-Uqkr_kO7p7s38ggg';
const replyId = 'cw-vyPJW7taRHpwMt4h';
const original = data.find((entry) => entry.focusPost.id === replyId)!.focusPost.plainText;

test('a descendant keeps its original wording and aligned highlights when opened as focus', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/EnergyTech/posts/${parentId}`, { waitUntil: 'domcontentloaded' });
  const reply = page.getByTestId('reply-scroll-region').locator(`[data-testid="post"][data-post-id="${replyId}"]`);
  await expect(reply).toBeVisible();
  const body = reply.locator('.post-text-clamp-shell');
  await expect(body).toHaveText(original!);
  await expect(body).not.toContainText('Being a utility engineer');
  await expect(body.locator('mark').first()).toHaveText('Securing the access is the way to go, not disconnecting from the network.');

  // Enter opens the actual reply instead of activating a highlighted topic.
  await reply.locator('[role="button"][tabindex="0"]').first().press('Enter');
  await expect(page).toHaveURL(new RegExp(`/EnergyTech/posts/${replyId}$`));
  const focused = page.getByTestId('feed').locator(`[data-testid="post"][data-post-id="${replyId}"]`);
  // The focus renderer may append a visual ellipsis; its authored body must
  // still be identical to the descendant's complete original text.
  await expect(focused.locator('.post-text-clamp-shell')).toContainText(original!);
  await expect(focused.locator('.post-text-clamp-shell')).not.toContainText('Being a utility engineer');
});
