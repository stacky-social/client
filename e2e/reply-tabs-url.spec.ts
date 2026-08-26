import { test, expect } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';
import { FLAGS_STORAGE_KEY } from '../src/utils/experimentFlagsCore.mjs';

// F-1 (docs/hci-ux-audit-2026-07-06.md): a stale/shared ?tab= URL opened under
// the other experiment-flag condition must degrade to the active tab set's
// default — never an empty reply area (flag OFF + ?tab=top) or a tab strip
// with nothing selected (flag ON + ?tab=recommended). Legit same-condition
// links must keep hydrating even though the persisted condition only loads a
// render after mount.

// Pick a real thread large enough to render the sort strip (it is suppressed
// for threads of <=5 top-level replies).
const focusEntryIndex = (mockData as any[]).findIndex((entry) => (
  (entry.replies ?? []).filter((reply: any) => reply.inReplyToId === entry.focusPost.id).length > 5
));
const focusId = (mockData as any)[focusEntryIndex].focusPost.id as string;

// Real reply ids are numeric (like the focus post + ancestors), so select the
// reply area by the fixture's actual top-level reply ids rather than an id
// prefix. A visible node from this set means the reply area actually rendered.
const topLevelIdsOf = (entryIdx: number, parentId: string): string[] =>
  (((mockData as any)[entryIdx].replies ?? []) as { id: string; inReplyToId?: string }[])
    .filter((r) => r.inReplyToId === parentId)
    .map((r) => r.id);
const nodesSelector = (ids: string[]): string => ids.map((rid) => `[data-post-id="${rid}"]`).join(', ');
const replyNodes = nodesSelector(topLevelIdsOf(focusEntryIndex, focusId));

function seedFlags(page: import('@playwright/test').Page, flags: Record<string, boolean>) {
  return page.addInitScript(
    ([key, val]) => window.localStorage.setItem(key, val),
    [FLAGS_STORAGE_KEY, JSON.stringify(flags)] as const
  );
}

test.describe('Reply tab URL hydration across flag conditions', () => {
  test('flag OFF + foreign ?tab=top on a cold load degrades to Time with replies visible', async ({ page }) => {
    await seedFlags(page, { replySortTabs: false });
    await page.goto(`/AIWorkforce/posts/${focusId}?tab=top`);

    await expect(page.getByRole('tab', { name: 'Time' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(replyNodes).first()).toBeVisible();
    // The foreign param is healed out of the URL so re-shares are clean.
    await expect(page).not.toHaveURL(/tab=/);
  });

  test('flag OFF + SPA arrival at a stale ?tab=top renders Time with replies (was: empty reply area)', async ({ page }) => {
    // The F-1 critical path: the page mounts via client-side navigation with
    // the condition already settled, so hydration is the LAST tab write and
    // nothing re-validates it. Cold loads dodge this only because the
    // persisted condition loads one render after mount.
    await seedFlags(page, { replySortTabs: false });
    const otherEntryIndex = (mockData as any[]).findIndex((entry, index) => (
      index !== focusEntryIndex
      && (entry.replies ?? []).some((reply: any) => reply.inReplyToId === entry.focusPost.id)
    ));
    const otherId = (mockData as any)[otherEntryIndex].focusPost.id as string;
    const otherReplyNodes = nodesSelector(topLevelIdsOf(otherEntryIndex, otherId));
    await page.goto(`/AIWorkforce/posts/${otherId}`);
    await expect(page.locator(otherReplyNodes).first()).toBeVisible();

    // A stale cross-condition URL sits in history (e.g. from a flag-ON
    // session); back/forward re-enters it as a same-document navigation.
    await page.evaluate((url) => history.pushState(null, '', url), `/AIWorkforce/posts/${focusId}?tab=top`);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(otherId));
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(focusId));

    await expect(page.locator(replyNodes).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Time' })).toHaveAttribute('aria-selected', 'true');
  });

  test('flag ON + foreign ?tab=recommended degrades to Top with replies visible', async ({ page }) => {
    await seedFlags(page, { replySortTabs: true });
    await page.goto(`/AIWorkforce/posts/${focusId}?tab=recommended`);

    await expect(page.getByRole('tab', { name: 'Top' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(replyNodes).first()).toBeVisible();
    await expect(page).not.toHaveURL(/tab=/);
  });

  test('flag OFF + legit ?tab=recommended still hydrates Recommended', async ({ page }) => {
    // Persisted OFF differs from the all-on defaults, so this exercises the
    // flag-settle window: hydration must not validate against the default set.
    await seedFlags(page, { replySortTabs: false });
    await page.goto(`/AIWorkforce/posts/${focusId}?tab=recommended`);

    await expect(page.getByRole('tab', { name: 'Recommended' })).toHaveAttribute('aria-selected', 'true');
    // The legit param survives the debounced URL write-back.
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(/tab=recommended/);
  });

  test('flag ON + legit ?tab=liked still hydrates Most liked', async ({ page }) => {
    await seedFlags(page, { replySortTabs: true });
    await page.goto(`/AIWorkforce/posts/${focusId}?tab=liked`);

    await expect(page.getByRole('tab', { name: 'Most liked' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(replyNodes).first()).toBeVisible();
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(/tab=liked/);
  });
});
