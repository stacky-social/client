import { expect, test, type Page } from '@playwright/test';

// #259: the focus post has exactly two states — FULL (full size, flowing with
// the page up to its sticky pin line, replies not independently scrollable)
// and COMPACT (compact AND pinned, replies scroll). Scrolling down past the
// pin line collapses and pins in one transition; scrolling up with the
// replies at their top expands and detaches in one transition. The old
// behaviour pinned the FULL post while the replies scrolled ~300px, then
// collapsed and let the anchoring residual scroll the page back to 0, leaving
// the compact post unpinned with the Back link showing.

const PIN = 64;

type Frame = {
  phase: string; compact: boolean; focusTop: number; scrollTop: number;
  scrollY: number; reply: number; aside: number;
};

/** Per-frame samples, taken after layout and after the app's ResizeObservers
 * (this observer is created later, so it is delivered later) — the painted
 * state, not an intermediate one. */
async function startSampling(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    const region = document.querySelector('[data-testid="reply-scroll-region"]') as HTMLElement;
    const posts = region.querySelectorAll('[data-testid="post"]');
    const reply = posts[Math.min(2, posts.length - 1)] as HTMLElement;
    const aside = document.querySelector('[data-testid="col-aside"]') as HTMLElement;
    const focus = document.querySelector('[data-focus-compact]') as HTMLElement;
    w.samples = [];
    w.phase = 'down';
    const sample = () => {
      const card = aside.querySelectorAll('[data-post-id]')[1] as HTMLElement | undefined;
      w.samples.push({
        phase: w.phase,
        compact: focus.dataset.focusCompact === 'true',
        focusTop: focus.getBoundingClientRect().top,
        scrollTop: region.scrollTop,
        scrollY: window.scrollY,
        reply: reply.getBoundingClientRect().top,
        aside: card ? card.getBoundingClientRect().top : aside.getBoundingClientRect().top,
      });
    };
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(probe);
    new ResizeObserver(sample).observe(probe);
    let flip = false;
    const frame = () => {
      flip = !flip;
      probe.style.width = flip ? '2px' : '1px';
      w.sampleFrame = requestAnimationFrame(frame);
    };
    w.sampleFrame = requestAnimationFrame(frame);
  });
}

const setPhase = (page: Page, phase: string) => page.evaluate((p) => { (window as any).phase = p; }, phase);
const samples = (page: Page): Promise<Frame[]> => page.evaluate(() => (window as any).samples);
const pinned = (f: { focusTop: number }) => Math.abs(f.focusTop - PIN) <= 1.5;

async function settled(page: Page) {
  return page.evaluate(() => {
    const region = document.querySelector('[data-testid="reply-scroll-region"]') as HTMLElement;
    const focus = document.querySelector('[data-focus-compact]') as HTMLElement;
    return {
      compact: focus.dataset.focusCompact === 'true',
      focusTop: focus.getBoundingClientRect().top,
      scrollTop: region.scrollTop,
      scrollY: window.scrollY,
    };
  });
}

/** compact ⇔ pinned, and never the full post pinned over scrolled replies. */
function expectTwoStates(state: { compact: boolean; focusTop: number; scrollTop: number }, label: string) {
  if (state.compact) expect(pinned(state), `${label}: compact focus is pinned`).toBe(true);
  else if (pinned(state)) expect(state.scrollTop, `${label}: full + pinned keeps replies at the top`).toBeLessThanOrEqual(1);
}

async function open(page: Page, post: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(post);
  const region = page.getByTestId('reply-scroll-region');
  await expect(region.locator('[data-testid="post"]').nth(2)).toBeVisible();
  await page.waitForTimeout(600);
  return region;
}

for (const post of ['/EnergyTech/posts/cw-ie_db4lx1rv_UOr_', '/ChineseEVs/posts/152053690']) {
  test(`one transition each way between full+flowing and compact+pinned: ${post}`, async ({ page }) => {
    const region = await open(page, post, 1400, 900);
    await startSampling(page);
    const box = (await region.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 40);

    for (let i = 0; i < 60; i += 1) {
      await page.mouse.wheel(0, 20);
      await page.waitForTimeout(40);
      const s = await settled(page);
      if (s.compact && s.scrollTop >= 120) break;
    }
    await page.waitForTimeout(300);
    expect((await settled(page)).compact).toBe(true);
    await setPhase(page, 'up');
    for (let i = 0; i < 80; i += 1) {
      await page.mouse.wheel(0, -20);
      await page.waitForTimeout(40);
      const s = await settled(page);
      if (!s.compact && s.scrollY <= 0.5) break;
    }
    await page.waitForTimeout(300);
    const end = await settled(page);
    expect(end.compact).toBe(false);
    expect(end.scrollY).toBeLessThanOrEqual(0.5);

    const frames = await samples(page);
    const transitions: boolean[] = [];
    let worstAside = 0;
    for (let i = 0; i < frames.length; i += 1) {
      const f = frames[i];
      expectTwoStates(f, `frame ${i} (${f.phase})`);
      if (i === 0) continue;
      const prev = frames[i - 1];
      if (f.compact !== prev.compact) transitions.push(f.compact);
      worstAside = Math.max(worstAside, Math.abs(f.aside - prev.aside));
      // The replies only ever move in the scroll direction (they slide with
      // the focus edge during the size change) — no jump back, no flip-flop.
      const move = f.reply - prev.reply;
      if (f.phase === prev.phase) {
        if (f.phase === 'down') expect(move, `frame ${i}: replies move up only`).toBeLessThanOrEqual(0.5);
        else expect(move, `frame ${i}: replies move down only`).toBeGreaterThanOrEqual(-0.5);
      }
      expect(Math.abs(move), `frame ${i}: no instant jump`).toBeLessThanOrEqual(100);
    }
    expect(transitions, 'one collapse, one expand — no oscillation at the boundary').toEqual([true, false]);
    expect(worstAside, 'related card per-frame displacement').toBeLessThanOrEqual(1);
    // The size change animates: several frames sit between the two heights.
    const collapseAt = frames.findIndex((f) => f.compact);
    const slide = frames.slice(collapseAt, collapseAt + 30).map((f) => f.reply);
    expect(new Set(slide.map(Math.round)).size, 'replies slide over several frames').toBeGreaterThan(4);
  });
}

test('keyboard paging keeps compact ⇔ pinned at every step', async ({ page }) => {
  await open(page, '/ChineseEVs/posts/152053690', 1280, 700);
  await page.mouse.move(5, 5);
  const states = [];
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(400);
    states.push(await settled(page));
  }
  expect(states.at(-1)!.compact).toBe(true);
  expect(states.at(-1)!.scrollTop).toBeGreaterThan(0);
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('PageUp');
    await page.waitForTimeout(400);
    const s = await settled(page);
    states.push(s);
    if (!s.compact && s.scrollY <= 0.5) break;
  }
  states.forEach((s, i) => expectTwoStates(s, `step ${i}`));
  expect(states.at(-1)!.compact).toBe(false);
  expect(states.at(-1)!.scrollY).toBeLessThanOrEqual(0.5);
});

test('wheeling over the compact post scrolls the replies, not the page', async ({ page }) => {
  const region = await open(page, '/EnergyTech/posts/cw-ie_db4lx1rv_UOr_', 1400, 900);
  const box = (await region.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 40); await page.waitForTimeout(40); }
  await page.waitForTimeout(300);
  const before = await settled(page);
  expect(before.compact).toBe(true);
  expect(before.scrollTop).toBeGreaterThan(100);
  const focus = (await page.locator('[data-focus-compact]').boundingBox())!;
  await page.mouse.move(focus.x + focus.width / 2, focus.y + focus.height / 2);
  await page.mouse.wheel(0, -60);
  await page.waitForTimeout(300);
  const after = await settled(page);
  expectTwoStates(after, 'after wheel over the compact post');
  expect(after.compact).toBe(true);
  expect(after.scrollY).toBe(before.scrollY);
  expect(after.scrollTop).toBeCloseTo(before.scrollTop - 60, 0);
});
