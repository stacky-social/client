import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
for (const author of ['ViewedFromTheOutside', 'Dry-Tough-3099']) {
  test(`stationary ${author} at ${width}px hover preserves paint, glyph geometry and complete lines`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/EnergyTech/posts/cw-S1VeKWSitwk9wRrq');
    const region = page.getByTestId('reply-scroll-region');
    const wrapper = page.locator('[data-focus-compact]');
    const text = wrapper.getByTestId('focus-reveal');
    const reply = region.getByTestId('post').filter({ hasText: author }).first();
    await expect(reply).toBeVisible();
    await region.evaluate((element) => { element.scrollTop = 180; });
    await expect(wrapper).toHaveAttribute('data-focus-compact', 'true');
    const geometry = () => text.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const result: number[][] = [];
      let node;
      while ((node = walker.nextNode())) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width > 0) result.push([rect.x - box.x, rect.y - box.y + element.scrollTop, rect.width, rect.height]);
        }
      }
      return result;
    });
    const mark = reply.locator('[data-reply-range-id]').first();
    await mark.hover();
    await expect(text.locator('[data-aside-highlight]').first()).toBeAttached();
    await page.waitForTimeout(250);
    const before = await geometry();
    const scrollBefore = await text.evaluate((el) => el.scrollTop);
    // No pointer events for two seconds: this caught the aside's global clear.
    await page.waitForTimeout(2000);
    await expect(text.locator('[data-aside-highlight]').first()).toBeAttached();
    expect(await geometry()).toEqual(before);
    expect(await text.evaluate((el) => el.scrollTop)).toBe(scrollBefore);
    const partialLines = await text.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const inset = getComputedStyle(el).clipPath.match(/inset\(0px 0px ([\d.]+)px/);
      const bottom = box.bottom - Number(inset?.[1] ?? 0);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const partial: string[] = [];
      let node;
      while ((node = walker.nextNode())) {
        const range = document.createRange(); range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width && rect.bottom > box.top + .5 && rect.top < bottom - .5
            && (rect.top < box.top - .5 || rect.bottom > bottom + .5)) partial.push(node.textContent!);
        }
      }
      return partial;
    });
    expect(partialLines).toEqual([]);
    await page.screenshot({ path: `/tmp/stacky-stable-${author}-${width}.png` });
    // Ending paint may change emphasis, but never glyph widths or wrapping.
    await page.mouse.move(20, 20);
    await expect(text.locator('[data-aside-highlight]')).toHaveCount(0);
    const after = await geometry();
    expect(after.map((r) => [r[0], r[2], r[3]])).toEqual(before.map((r) => [r[0], r[2], r[3]]));
    await mark.click();
    const rail = region.locator('[data-reply-cluster-member]').first().locator(':scope > [aria-hidden]').first();
    await expect(rail).toBeAttached();
    const railBox = (await rail.boundingBox())!;
    const regionBox = (await region.boundingBox())!;
    expect(railBox.x).toBeGreaterThanOrEqual(regionBox.x);
    await page.screenshot({ path: `/tmp/stacky-filtered-${author}-${width}.png` });
  });
}
}
