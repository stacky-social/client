import { test, expect } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

// WS3/T2 — X-style click-to-focus (scroll-pin + fade).
//
// Clicking a reply/ancestor in the thread navigates to that post's detail page
// (posts/[id]/page.tsx onNavigate → navigateFromPanelScope) after stashing an
// "animate intent" in sessionStorage keyed by the destination id. On arrival the
// destination pins the clicked post just under the nav — OVERRIDING the route's
// normal top-of-page scroll — and plays a brief rise+fade.
//
// The contract these tests guard:
//   • Click-to-focus → the clicked post is pinned near the top (window scrolled
//     down so its ancestor sits above it): scrollY > 0, focus top ≈ under-nav.
//   • A deep-link load of the SAME url has no matching intent → no pin, no
//     animation: it keeps the default top-of-page scroll (scrollY === 0), so the
//     ancestor is what shows at the top.
//
// Runs on local mock JSON (no backend / no auth).

type Reply = { id: string; inReplyToId?: string };
type Entry = { focusPost: { id: string }; replies?: Reply[] };

// A focus post with top-level replies and NO ancestors of its own, so clicking
// a reply produces a destination that DOES have an ancestor (the old focus) —
// which is exactly the case where pinning is observable (scroll must move off 0).
const entry = (mockData as unknown as Entry[]).find(
  (e) => e.focusPost.id === '143195604',
)!;
const FOCUS_ID = entry.focusPost.id;
const DETAIL_URL = `/ChineseEVs/posts/${FOCUS_ID}`;
const firstTopReply = (entry.replies ?? []).find((r) => r.inReplyToId === FOCUS_ID)!;
const REPLY_ID = firstTopReply.id;

// TOP_NAV_HEIGHT (56) + 8, per FocusPostStickyBar.returnToPost / FOCUS_PIN_OFFSET.
const PIN_TOP = 64;

// Entry 143195604 now has 15 top-level replies (real descendant data) and the
// reply list paginates at 5, so reveal the full top level before targeting a
// specific reply by id. (These anchors are all top-level; grandchildren, which
// T8 collapses by default, are not involved.)
async function revealTopLevelReplies(page: import('@playwright/test').Page) {
  const target = page.locator(`[data-post-id="${REPLY_ID}"]`).first();
  for (let i = 0; i < 6; i++) {
    const more = page.getByRole('button', { name: /^\d+ more repl/i });
    // The reply thread is deliberately deferred until after the focus post
    // paints. Under a loaded parallel run, checking `count()` immediately can
    // race that render and falsely conclude there is nothing to reveal.
    await expect.poll(
      async () => (await target.count()) + (await more.count()),
      { timeout: 10_000, message: 'reply thread or its pagination control should render' },
    ).toBeGreaterThan(0);
    if ((await target.count()) > 0) return;
    if ((await more.count()) === 0) break;
    await more.first().click();
  }
  await expect(target).toBeVisible({ timeout: 10_000 });
}

test.describe('X-style click-to-focus (scroll-pin + fade)', () => {
  test('clicking a reply pins it near the top with the destination scrolled down', async ({ page }) => {
    await page.goto(DETAIL_URL);
    await revealTopLevelReplies(page);

    const reply = page.locator(`[data-post-id="${REPLY_ID}"]`).first();
    await expect(reply).toBeVisible();

    // Click the reply's header row (center — past the avatar, above any content
    // marks) so the card-level navigation fires, not a highlight span. y:30 lands
    // inside the header content div (below the Paper's 16px top padding).
    const box = await reply.boundingBox();
    expect(box).not.toBeNull();
    await reply.click({ position: { x: box!.width / 2, y: 30 } });

    // Navigated to the clicked reply's own detail page.
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${REPLY_ID}(\\?|$)`));

    // Let the pin scroll + fade settle (transition is 240ms).
    await page.waitForTimeout(500);

    // The page scrolled DOWN off the top: the clicked reply is pinned, its
    // ancestor (the old focus) sits above.
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY, 'destination scrolled down to pin the focus post').toBeGreaterThan(0);

    // The clicked reply is now the focus post, sitting just under the nav.
    const focus = page.locator(`[data-post-id="${REPLY_ID}"]`).first();
    const focusBox = await focus.boundingBox();
    expect(focusBox).not.toBeNull();
    expect(
      Math.abs(focusBox!.y - PIN_TOP),
      `focus post pinned near ${PIN_TOP}px (got ${focusBox!.y})`,
    ).toBeLessThan(36);

    // The ancestor (old focus) is above the pinned post.
    const ancestor = page.locator(`[data-post-id="${FOCUS_ID}"]`).first();
    const ancestorBox = await ancestor.boundingBox();
    expect(ancestorBox).not.toBeNull();
    expect(ancestorBox!.y, 'ancestor sits above the pinned focus post').toBeLessThan(focusBox!.y);
  });

  test('browser Back after an animated nav returns to the source without pinning it', async ({ page }) => {
    await page.goto(DETAIL_URL);
    await revealTopLevelReplies(page);
    const reply = page.locator(`[data-post-id="${REPLY_ID}"]`).first();
    await expect(reply).toBeVisible();
    const box = await reply.boundingBox();
    await reply.click({ position: { x: box!.width / 2, y: 30 } });
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${REPLY_ID}(\\?|$)`));
    await page.waitForTimeout(400);

    // The animate-intent was consumed at the destination — nothing lingers to
    // re-fire on a later load.
    const lingering = await page.evaluate(() =>
      sessionStorage.getItem('stacky:focusAnimateIntent'),
    );
    expect(lingering, 'animate-intent is consumed once (not left in sessionStorage)').toBeNull();

    // Back: navigateFromPanelScope kept a single clean history entry (no phantom
    // sentinel), so ONE Back returns to the source post (browser natively
    // restores its prior scroll — our pin only fires on a click-to-focus intent).
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${FOCUS_ID}(\\?|$)`));
  });

  test('a deep-link load of the same post does NOT pin (keeps top-of-page scroll)', async ({ page }) => {
    // No click → no animate-intent stashed → normal load.
    await page.goto(`/ChineseEVs/posts/${REPLY_ID}`);
    await expect(page.locator(`[data-post-id="${REPLY_ID}"]`).first()).toBeVisible();
    await page.waitForTimeout(500);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY, 'a deep link keeps the default top-of-page scroll (no pin)').toBe(0);
  });
});
