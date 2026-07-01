import { test, expect, type Page } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

// Stress / exploratory user-journey suite for the ChineseEVs research surface.
// These drive the app the way a real (and impatient) user would — scrolling,
// filtering, hovering, opening posts, commenting, navigating deep and back, and
// hammering interactions rapidly — while collecting every error signal. It is a
// free, local, repeatable stand-in for a cloud exploration agent.
//
// Error taxonomy (so failures point at the APP, not the test environment):
//   HARD FAIL  — uncaught JS exceptions (pageerror), React error boundaries /
//                not-found states, broken SAME-ORIGIN requests (4xx/5xx or
//                network failures to localhost — e.g. the old defaultAvatarUrl
//                bug), and catastrophic main-thread freezes (> 10s).
//   TOLERATED  — failures to the external backend (beta.stacky.social), which is
//                not running in the test env, and known dev-only console noise.
//
// Randomised choices use a seeded PRNG so a failing run is reproducible.

const FEED = '/ChineseEVs';
const firstFocusId = (mockData as any)[0].focusPost.id as string;
const DETAIL_URL = `/ChineseEVs/posts/${firstFocusId}`;

// ── seeded PRNG (mulberry32) ───────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isExternalBackend = (u: string) => u.includes('beta.stacky.social');
const BENIGN_CONSOLE = [
  'Failed to fetch real-time feedback', // reply feedback POST — no live backend in test env
  'cannot be a descendant of',          // known nested-button hydration warning (tracked separately)
  'Download the React DevTools',
  'Warning: Extra attributes from the server',
];

function wireErrorCapture(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const badRequests: string[] = [];

  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!BENIGN_CONSOLE.some((b) => t.includes(b))) consoleErrors.push(t);
  });
  page.on('response', (r) => {
    const u = r.url();
    const s = r.status();
    if (s >= 400 && !isExternalBackend(u) && !u.includes('favicon') && !u.includes('__nextjs')) {
      badRequests.push(`${s} ${u}`);
    }
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    const aborted = r.failure()?.errorText?.includes('ERR_ABORTED'); // RSC prefetch cancels
    if (!isExternalBackend(u) && !u.includes('favicon') && !aborted) {
      badRequests.push(`FAILED ${u} (${r.failure()?.errorText ?? '?'})`);
    }
  });

  return { pageErrors, consoleErrors, badRequests };
}

function assertClean(errs: ReturnType<typeof wireErrorCapture>, label: string) {
  // eslint-disable-next-line no-console
  console.log(`[stress:${label}] pageErrors=${JSON.stringify(errs.pageErrors)} console=${JSON.stringify(errs.consoleErrors)} badReq=${JSON.stringify(errs.badRequests)}`);
  expect(errs.pageErrors, `[${label}] no uncaught JS exceptions`).toEqual([]);
  expect(errs.badRequests, `[${label}] no broken same-origin requests`).toEqual([]);
}

async function assertHealthy(page: Page) {
  await expect(page.getByText(/Application error/i)).toHaveCount(0);
  await expect(page.getByText(/not found in mock data/i)).toHaveCount(0);
  await expect(page.locator('nextjs-portal')).toHaveCount(0); // Next dev runtime-error overlay
}

async function scrollWindow(page: Page, ys: number[], settle = 120) {
  for (const y of ys) {
    await page.evaluate((_y) => window.scrollTo(0, _y), y);
    await page.waitForTimeout(settle);
  }
}

async function scrollAside(page: Page) {
  await page.evaluate(() => {
    const aside = document.querySelector('aside') || document.querySelector('[class*="aside" i]');
    if (!aside) return;
    const cands = [aside, ...Array.from(aside.querySelectorAll('*'))] as HTMLElement[];
    const sc = cands.find((el) => el.scrollHeight > el.clientHeight + 40);
    if (sc) { sc.scrollTop = sc.scrollHeight; sc.scrollTop = Math.floor(sc.scrollHeight / 2); }
  });
  await page.waitForTimeout(120);
}

// Install a main-thread stall detector; returns a getter for the max frame gap.
async function startFreezeDetector(page: Page) {
  await page.evaluate(() => {
    (window as any).__maxGap = 0;
    let last = performance.now();
    const loop = () => {
      const n = performance.now();
      const g = n - last - 16;
      if (g > (window as any).__maxGap) (window as any).__maxGap = g;
      last = n;
      (window as any).__rafId = requestAnimationFrame(loop);
    };
    (window as any).__rafId = requestAnimationFrame(loop);
  });
  return async () => {
    return (await page.evaluate(() => {
      cancelAnimationFrame((window as any).__rafId);
      return Math.round((window as any).__maxGap || 0);
    })) as number;
  };
}

async function openFirstPost(page: Page) {
  const opener = page.locator('[data-related-card] [data-post-id]').first();
  if (await opener.count()) {
    const box = await opener.boundingBox();
    await opener.click({ position: { x: (box?.width ?? 40) - 25, y: 8 } });
    await page.waitForURL(/\/ChineseEVs\/posts\//, { timeout: 10_000 }).catch(() => {});
  }
  if (!/\/ChineseEVs\/posts\//.test(page.url())) await page.goto(DETAIL_URL);
}

// Wait for the detail view to be interactive. NOTE: [data-testid="focus-reveal"]
// only wraps focus posts that carry highlight/relation data, so it's absent when
// the journey drills into arbitrary related posts — use universal detail markers
// (the reply composer / Back control) instead. Generous timeout absorbs dev
// on-demand route compilation.
async function waitForDetail(page: Page) {
  await expect(
    page.getByPlaceholder('Post your reply').or(page.getByRole('button', { name: 'Back' })).first(),
  ).toBeVisible({ timeout: 25_000 });
}

test.describe('Stress: full user journey', () => {
  // These scenarios hammer navigation/interaction and can overwhelm a single
  // dev server if run in parallel. Serialize them so they never pile on at once
  // (run the whole suite normally, or target a prod build via E2E_BASE_URL).
  test.describe.configure({ mode: 'serial' });

  test('deep journey — browse, filter, open, comment, dive, back (×5)', async ({ page }) => {
    test.setTimeout(180_000);
    const errs = wireErrorCapture(page);
    const rand = mulberry32(1337);

    await page.goto(FEED);
    await expect(page.getByText('#ChineseEVs')).toBeVisible();
    await assertHealthy(page);

    await scrollWindow(page, [800, 1600, 2600, 0]);
    await scrollAside(page);

    // Filter chips: toggle a random-ish subset on and off.
    const chips = page.locator('[aria-label*="filter"]');
    const chipCount = Math.min(await chips.count(), 5);
    for (let i = 0; i < chipCount; i++) { await chips.nth(i).click().catch(() => {}); await page.waitForTimeout(120); }
    await assertHealthy(page);
    for (let i = chipCount - 1; i >= 0; i--) { await chips.nth(i).click().catch(() => {}); await page.waitForTimeout(100); }

    // Group by a relation tag; hover a spread of cards.
    const tag = page.locator('[data-related-card] .related-tag-text').first();
    if (await tag.count()) { await tag.click().catch(() => {}); await page.waitForTimeout(180); await assertHealthy(page); }
    const feedCards = page.locator('[data-related-card]');
    const hoverN = Math.min(await feedCards.count(), 6);
    for (let i = 0; i < hoverN; i++) { await feedCards.nth(i).hover().catch(() => {}); await page.waitForTimeout(90); }

    await openFirstPost(page);
    await waitForDetail(page);
    await assertHealthy(page);

    // Core loop: dive several posts deep.
    for (let iter = 0; iter < 3; iter++) {
      await waitForDetail(page);
      await scrollWindow(page, [500, 1100, 200, 0]);

      const readMore = page.getByText('Read more').first();
      if (await readMore.count()) { await readMore.click().catch(() => {}); await page.waitForTimeout(130); }

      // Click a random focus span (filter), then clear by clicking again.
      const spans = page.locator('[data-testid="focus-reveal"] mark[data-fs]');
      const sn = await spans.count();
      if (sn > 0) {
        const idx = Math.floor(rand() * sn);
        await spans.nth(idx).click().catch(() => {});
        await page.waitForTimeout(180);
        await spans.nth(idx).click().catch(() => {});
        await page.waitForTimeout(120);
      }
      await assertHealthy(page);
      await scrollAside(page);

      const composer = page.getByPlaceholder('Post your reply');
      if (await composer.count()) {
        await composer.fill(`Stress comment #${iter} — ${Math.floor(rand() * 1e6)}`);
        await page.waitForTimeout(120);
        const submit = page.getByRole('button', { name: 'Submit' }).first();
        if (await submit.count()) {
          await submit.click().catch(() => {});
          await expect(composer).toHaveValue('', { timeout: 5_000 }).catch(() => {});
        }
      }
      await assertHealthy(page);

      const next = page.locator('[data-related-card] [data-post-id]');
      const nc = await next.count();
      if (nc > 0) {
        const pickIdx = Math.floor(rand() * Math.min(nc, 5));
        const card = next.nth(pickIdx);
        const nid = await card.getAttribute('data-post-id');
        const nbox = await card.boundingBox();
        const urlBefore = page.url();
        await card.click({ position: { x: (nbox?.width ?? 40) - 25, y: 8 } });
        await page.waitForURL((u) => u.toString() !== urlBefore, { timeout: 10_000 }).catch(() => {});
        if (nid) expect(page.url(), 'related-card click navigates to that post').toContain(nid);
      }
      await assertHealthy(page);
    }

    // Back out several levels.
    for (let i = 0; i < 3; i++) { await page.goBack().catch(() => {}); await page.waitForTimeout(300); await assertHealthy(page); }

    assertClean(errs, 'deep-journey');
  });

  test('rapid interaction burst — fuzz the debounced highlight system without freezing', async ({ page }) => {
    test.setTimeout(120_000);
    const errs = wireErrorCapture(page);

    await page.goto(DETAIL_URL);
    await expect(page.locator('[data-related-card]').first()).toBeVisible();

    const getMaxGap = await startFreezeDetector(page);

    const cards = page.locator('[data-related-card]');
    const cn = Math.min(await cards.count(), 8);
    const marks = page.locator('aside mark');
    const mn = Math.min(await marks.count(), 12);

    // Sweep hover across cards fast (no settle) — the classic freeze trigger.
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < cn; i++) await cards.nth(i).hover({ timeout: 2000 }).catch(() => {});
    }
    // Rapid-fire clicks on aside marks (grouping toggles) with almost no gap.
    for (let i = 0; i < mn; i++) { await marks.nth(i).click({ timeout: 2000, force: true }).catch(() => {}); }
    // Rapid scroll thrash.
    await scrollWindow(page, [1200, 0, 1800, 400, 0], 40);
    await assertHealthy(page);

    const maxGap = await getMaxGap();
    // eslint-disable-next-line no-console
    console.log(`[stress:burst] max main-thread frame gap during burst: ${maxGap}ms`);
    // Only fail on a catastrophic freeze (infinite loop / lockup). Dev-build jank is tolerated.
    expect(maxGap, 'no catastrophic main-thread freeze during rapid interaction').toBeLessThan(10_000);

    assertClean(errs, 'burst');
  });

  test('navigation churn — repeatedly open a post and go back', async ({ page }) => {
    test.setTimeout(120_000);
    const errs = wireErrorCapture(page);

    await page.goto(FEED);
    await expect(page.getByText('#ChineseEVs')).toBeVisible();

    // Open→back many times fast; this exercises the PostList SWR cache + scroll
    // restoration + back-nav path that has regressed before (e.g. Load More).
    for (let i = 0; i < 5; i++) {
      const opener = page.locator('[data-related-card] [data-post-id]').first();
      if (!(await opener.count())) break;
      const box = await opener.boundingBox();
      const before = page.url();
      await opener.click({ position: { x: (box?.width ?? 40) - 25, y: 8 } });
      await page.waitForURL(/\/ChineseEVs\/posts\//, { timeout: 10_000 }).catch(() => {});
      await assertHealthy(page);
      await page.goBack().catch(() => {});
      await page.waitForURL((u) => u.toString().endsWith('/ChineseEVs') || u.toString() === before, { timeout: 10_000 }).catch(() => {});
      await expect(page.getByText('#ChineseEVs')).toBeVisible();
      await assertHealthy(page);
    }

    assertClean(errs, 'nav-churn');
  });

  test('mobile viewport — condensed journey at 375px', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 812 });
    const errs = wireErrorCapture(page);

    await page.goto(FEED);
    await expect(page.getByText('#ChineseEVs')).toBeVisible();
    await assertHealthy(page);
    await scrollWindow(page, [600, 1400, 0]);

    // Filter chips collapse on narrow panels — exercise them at this width.
    const chips = page.locator('[aria-label*="filter"]');
    const cc = Math.min(await chips.count(), 3);
    for (let i = 0; i < cc; i++) { await chips.nth(i).click().catch(() => {}); await page.waitForTimeout(120); }
    await assertHealthy(page);

    await openFirstPost(page);
    await waitForDetail(page);
    await assertHealthy(page);
    await scrollWindow(page, [500, 1000, 0]);
    const readMore = page.getByText('Read more').first();
    if (await readMore.count()) { await readMore.click().catch(() => {}); await page.waitForTimeout(150); }
    await assertHealthy(page);
    await page.goBack().catch(() => {});
    await page.waitForTimeout(300);
    await assertHealthy(page);

    assertClean(errs, 'mobile');
  });
});
