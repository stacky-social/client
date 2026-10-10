import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120_000);

const divider = (page: Page) => page.getByRole('separator', { name: 'Resize feed and related panels' });

// Geometry alone missed this bug: the bridge endpoints stayed correct while
// the hover guide / focus outline painted a second line through its opening.
async function expectUnbrokenSurface(page: Page) {
  const bridge = page.getByTestId('weave-bridge');
  await expect(bridge).toHaveAttribute('data-bridge-state', 'connected');
  await expect.poll(async () => {
    const clip = await bridge.evaluate((svg) => ({
      x: Math.round(Number(svg.getAttribute('data-target-x'))) - 6,
      y: Math.round((Number(svg.getAttribute('data-source-top-y')) + Number(svg.getAttribute('data-source-bottom-y'))) / 2),
      width: 12, height: 4,
    }));
    const png = await page.screenshot({ clip });
    return page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      return Math.min(...Array.from(pixels).filter((_, index) => index % 4 !== 3));
    }, png.toString('base64'));
  }, { message: 'divider guide and focus outline must not split the white bridge opening' }).toBeGreaterThanOrEqual(250);
}

async function hoverDivider(page: Page) {
  const box = (await divider(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, 300);
  await expect(page.getByTestId('resize-divider-guide')).toHaveCSS('width', '3px');
}

test('divider hover, click, drag, and retained keyboard focus leave no line through the bridge', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/Tariffs/posts/cw-bpvqBrw_B23dLVfY', { waitUntil: 'domcontentloaded' });
  await expectUnbrokenSurface(page);
  await hoverDivider(page);
  await expectUnbrokenSurface(page);
  await page.mouse.down();
  await page.mouse.up();
  await expectUnbrokenSurface(page);
  await page.mouse.move(20, 70);
  await expectUnbrokenSurface(page);

  await hoverDivider(page);
  const before = await divider(page).getAttribute('aria-valuenow');
  const box = (await divider(page).boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, 300, { steps: 10 });
  await page.mouse.up();
  await expect(divider(page)).not.toHaveAttribute('aria-valuenow', before!);
  await expectUnbrokenSurface(page);
  await page.mouse.move(20, 70);
  await expectUnbrokenSurface(page);

  await divider(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(divider(page)).toBeFocused();
  await expectUnbrokenSurface(page);
  // Focus feedback still exists on the divider outside the bridge mouth.
  await expect(divider(page)).not.toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Home');
  await expectUnbrokenSurface(page);
  await page.keyboard.press('Tab');
  await expect(divider(page)).not.toBeFocused();
  await expectUnbrokenSurface(page);
});


test('compacted reply view stays joined while the divider and viewport resize', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/EnergyTech/posts/cw-lKbxc5cl2soN0n8e', { waitUntil: 'domcontentloaded' });
  await expectUnbrokenSurface(page);
  await page.getByTestId('reply-scroll-region').evaluate((element) => { element.scrollTop = 100; });
  await expect(page.locator('[data-focus-compact]')).toHaveAttribute('data-focus-compact', 'true');
  for (const width of [1010, 1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await hoverDivider(page);
    await expectUnbrokenSurface(page);
    await divider(page).focus();
    await page.keyboard.press('ArrowLeft');
    await expectUnbrokenSurface(page);
  }
  await page.keyboard.press('Tab');
  await page.mouse.move(20, 70);
  await expectUnbrokenSurface(page);
});
