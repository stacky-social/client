import { expect, type Page } from '@playwright/test';

/** Drive the same automatic pagination readers trigger inside the reply pane. */
export async function revealTopLevelReplies(page: Page) {
  const region = page.getByTestId('reply-scroll-region');
  await expect(region.locator('[data-reply-depth="0"]').first()).toBeAttached();
  await expect.poll(async () => {
    await region.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    return region.getByTestId('reply-load-sentinel').count();
  }, { timeout: 30_000 }).toBe(0);
}
