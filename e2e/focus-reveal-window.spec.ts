import { expect, test } from '@playwright/test';

// Clicking a focus phrase, or hovering a related card, locks the post into a
// fixed-height reading window and scrolls just far enough to show the chosen
// passage whole, keeping as much of the text before it as fits. A trailing
// spacer the height of the window sits below the text.
//
// That spacer must never be visible on a post that already fits: scrolling a
// late passage to the top there pushes the opening lines out of view and fills
// the rest of the card with empty space, for no reading benefit — the whole post
// was already on screen.

test('a post that fits its reading window is never scrolled inside it', async ({ page }) => {
  // The dev server compiles this route on demand, which can outlast the default.
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/EnergyTech', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="focus-reveal"]').first()
    .waitFor({ state: 'attached', timeout: 90_000 });
  await page.waitForTimeout(2000);

  const cards = await page.locator('[data-testid="focus-reveal"]').count();
  expect(cards, 'feed needs focus posts to exercise').toBeGreaterThan(0);

  let observedFitting = 0;
  const offenders: string[] = [];

  for (let i = 0; i < Math.min(cards, 6); i++) {
    const reveal = page.locator('[data-testid="focus-reveal"]').nth(i);
    const marks = reveal.locator('mark');
    const markCount = await marks.count();
    if (markCount === 0) continue;

    // The LAST phrase is the interesting one: it is the case that scrolls a
    // short post away from its own first line.
    const last = marks.nth(markCount - 1);
    try {
      await last.scrollIntoViewIfNeeded({ timeout: 5000 });
      await last.click({ timeout: 5000 });
    } catch {
      continue; // card moved or is off-screen; not what this test is about
    }
    await page.waitForTimeout(700);

    const state = await reveal.evaluate((el) => {
      const windowed = el.hasAttribute('data-reveal-window');
      const height = Math.round(el.getBoundingClientRect().height);
      // The ::after spacer is exactly one window tall, so remove it to get the
      // real content height.
      const content = el.scrollHeight - (windowed ? height : 0);
      return { windowed, height, content, scrollTop: Math.round(el.scrollTop) };
    });

    if (!state.windowed || state.content > state.height + 1) continue;
    observedFitting++;
    if (state.scrollTop > 0) {
      offenders.push(`card ${i}: window ${state.height}px, content ${state.content}px, `
        + `scrolled ${state.scrollTop}px — ${state.scrollTop}px of the card renders empty`);
    }
  }

  expect(observedFitting, 'no card entered the window while fitting it — test proved nothing')
    .toBeGreaterThan(0);
  expect(offenders, offenders.join('; ')).toEqual([]);
});

// #224: a phrase the reader clicks must not move. Once the window is showing a
// passage, clicking another phrase that is already wholly inside it selects
// that phrase in place instead of top-aligning it.
test('a phrase already visible in the reading window stays put when clicked', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/ChineseEVs', { waitUntil: 'domcontentloaded' });
  const reveal = page.locator('[data-testid="post"][data-active="true"] [data-testid="focus-reveal"]').first();
  await reveal.waitFor({ state: 'visible', timeout: 90_000 });
  await page.waitForTimeout(1000);

  // Select the first phrase (visible, so no window yet).
  const first = reveal.locator('mark[role="button"]').first();
  const firstPoint = await first.evaluate((mark) => {
    const rect = Array.from(mark.getClientRects()).find((r) => r.width > 0)!;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(firstPoint.x, firstPoint.y);
  await expect(first).toHaveClass(/fp-selected/);

  // Enter the window legitimately: hover related spans until one reveals a
  // passage below the clamp. Leaving it returns the window to the selection.
  const spans = page.locator('[data-related-card] mark[data-range-id]');
  await expect(spans.first()).toBeVisible();
  let windowed = false;
  for (let i = 0; i < Math.min(await spans.count(), 12) && !windowed; i += 1) {
    const span = spans.nth(i);
    if (!(await span.isVisible())) continue;
    await span.hover();
    await page.waitForTimeout(400);
    windowed = await reveal.evaluate((el) => el.hasAttribute('data-reveal-window') && el.scrollTop > 0);
  }
  test.skip(!windowed, 'no related span reveals a passage below the clamp');
  await page.mouse.move(2, 500);
  await page.waitForTimeout(500);
  await expect(reveal).toHaveAttribute('data-reveal-window', '');

  const next = await reveal.evaluate((el, after) => {
    const box = el.getBoundingClientRect();
    const marks = Array.from(el.querySelectorAll('mark[role="button"]'));
    for (let i = after + 1; i < marks.length; i += 1) {
      const rects = Array.from(marks[i].getClientRects()).filter((r) => r.width > 0);
      if (rects.length && rects.every((r) => r.top >= box.top + 4 && r.bottom <= box.bottom)) {
        const first = rects[0];
        return { index: i, x: first.left + first.width / 2, y: first.top + first.height / 2, top: first.top };
      }
    }
    return null;
  }, 0);
  expect(next, 'a later phrase should be wholly inside the window').not.toBeNull();

  await page.mouse.click(next!.x, next!.y);
  const clicked = reveal.locator('mark[role="button"]').nth(next!.index);
  await expect(clicked).toHaveClass(/fp-selected/);
  await page.waitForTimeout(500);
  const top = await clicked.evaluate((mark) =>
    Array.from(mark.getClientRects()).find((r) => r.width > 0)!.top);
  expect(Math.abs(top - next!.top)).toBeLessThanOrEqual(1);
});

// #224: hovering a related card must never scroll the focus post past its last
// line, trading text above the passage for empty space below it, and must show
// the whole highlighted passage when it fits. Leaving the card returns the post
// to its opening.
test('a related-card hover shows its whole passage without blank space and leaving restores the opening', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/ChineseEVs', { waitUntil: 'domcontentloaded' });
  const reveal = page.locator('[data-testid="post"][data-active="true"] [data-testid="focus-reveal"]').first();
  await reveal.waitFor({ state: 'visible', timeout: 90_000 });
  await page.waitForTimeout(1000);

  const cards = page.locator('[data-related-card]');
  await expect(cards.first()).toBeVisible();
  let scrolled = 0;
  const offenders: string[] = [];
  for (let i = 0; i < Math.min(await cards.count(), 10); i += 1) {
    const card = cards.nth(i);
    const span = card.locator('mark[data-range-id]').first();
    try {
      await card.scrollIntoViewIfNeeded({ timeout: 5000 });
      await span.hover({ timeout: 5000 });
    } catch {
      continue; // card moved or has no span; not what this test is about
    }
    await page.waitForTimeout(500);

    const state = await reveal.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      const glyphs = (root: Element) => {
        range.selectNodeContents(root);
        return Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
      };
      const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
      const textBottom = Math.max(...glyphs(el).map((rect) => rect.bottom));
      const passage = Array.from(el.querySelectorAll('[data-aside-highlight="strong"]')).flatMap(glyphs);
      const passageTop = Math.min(...passage.map((rect) => rect.top));
      const passageBottom = Math.max(...passage.map((rect) => rect.bottom));
      return {
        scrollTop: Math.round(el.scrollTop),
        blankBelow: Math.round(box.bottom - textBottom),
        lineHeight,
        passageFits: passage.length > 0 && passageBottom - passageTop <= box.height,
        passageShown: passage.every((rect) => rect.top >= box.top - 0.5 && rect.bottom <= box.bottom + 0.5),
      };
    });
    if (state.scrollTop > 0) scrolled += 1;
    if (state.blankBelow > state.lineHeight) {
      offenders.push(`card ${i}: ${state.blankBelow}px of empty space below the text`);
    }
    if (state.passageFits && !state.passageShown) {
      offenders.push(`card ${i}: the highlighted passage fits the window but is cut off`);
    }

    // Leave to the empty left gutter, not another card.
    await page.mouse.move(4, 600);
    await expect.poll(() => reveal.evaluate((el) => el.scrollTop), {
      message: `card ${i}: leaving the card should restore the post's opening`,
    }).toBe(0);
    await expect(reveal).not.toHaveAttribute('data-reveal-window');
  }

  expect(scrolled, 'no hover scrolled the reading window — test proved nothing').toBeGreaterThan(0);
  expect(offenders, offenders.join('; ')).toEqual([]);
});
