import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
  test('makes real account access primary and the JSON demo explicit', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Follow the conversation. See how ideas connect.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in to CrossWeave' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    const createAccount = page.getByRole('link', { name: /Create an account/ });
    await expect(createAccount).toHaveAttribute('href', 'https://beta.stacky.social/auth/sign_up');
    await expect(page.getByRole('button', { name: /Explore the AI & workforce demo/ })).toBeVisible();

    await expect(page.getByText('CrossWeave', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'CrossWeave logo' })).toHaveCount(1);
    await expect(page.getByText('CrossWeave · Mastodon-powered', { exact: true })).toBeVisible();
    await expect(page.getByText(/Stacky/)).toHaveCount(0);

    const connector = await page.evaluate(() => {
      const preview = document.querySelector('[class*="threadPreview"]');
      const avatars = preview?.querySelectorAll('[class*="previewPost"] b');
      const branch = preview?.querySelector('[class*="previewBranch"]');
      const top = avatars?.[0]?.getBoundingClientRect();
      const lower = avatars?.[1]?.getBoundingClientRect();
      const line = branch?.getBoundingClientRect();
      if (!top || !lower || !line) return null;
      return {
        topCenterDelta: Math.abs(line.left - ((top.left + top.right) / 2)),
        topJoinDelta: Math.abs(line.top - top.bottom),
        lowerJoinDelta: Math.abs(line.right - lower.left),
      };
    });
    expect(connector).not.toBeNull();
    expect(connector!.topCenterDelta).toBeLessThanOrEqual(1);
    expect(connector!.topJoinDelta).toBeLessThanOrEqual(3);
    expect(connector!.lowerJoinDelta).toBeLessThanOrEqual(3);
  });

  test('starts OAuth through the same-origin secure route', async ({ page }) => {
    await page.route('**/api/auth/mastodon/start', (route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<p>OAuth handoff intercepted</p>',
    }));
    const requestPromise = page.waitForRequest('**/api/auth/mastodon/start');

    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();

    const request = await requestPromise;
    expect(new URL(request.url()).pathname).toBe('/api/auth/mastodon/start');
    await expect(page.getByText('OAuth handoff intercepted')).toBeVisible();
  });

  test('starts and ends a clean local participant session', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('accessToken', 'old-token');
      localStorage.setItem('currentUser', JSON.stringify({ id: 'old-user' }));
      localStorage.setItem('authCode', 'old-code');
      localStorage.setItem('stacky:feedRatio', '0.2');
      localStorage.setItem('stacky:experimentFlags:v1', JSON.stringify({ summaryCard: true }));
      localStorage.setItem('stacky:localStore:v1', JSON.stringify({ liked: ['old-like'] }));
      sessionStorage.setItem('scrollY:/ChineseEVs', '800');
      sessionStorage.setItem('previousPath:/somewhere', '/old');
    });

    await page.getByRole('button', { name: /Explore the AI & workforce demo/ }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.locator('[data-feed-mode="curated-demo"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Experiment settings' })).toHaveCount(0);
    await expect(page.getByTestId('nav-logout')).toBeVisible();

    const active = await page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem('crossweave:studySession:v1') || 'null');
      const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
      const store = JSON.parse(localStorage.getItem('stacky:localStore:v1') || 'null');
      return {
        session,
        user,
        store,
        accessToken: localStorage.getItem('accessToken'),
        authCode: localStorage.getItem('authCode'),
        flags: localStorage.getItem('stacky:experimentFlags:v1'),
        feedRatio: localStorage.getItem('stacky:feedRatio'),
        sessionStorageKeys: Object.keys(sessionStorage),
      };
    });
    expect(active.session.id).toBeTruthy();
    expect(active.session.participant.id).toBe(active.session.id);
    expect(active.user.id).toBe(active.session.id);
    expect(active.store.me.acct).toBe('study-participant');
    expect(active.store.liked).toEqual([]);
    expect(active.store.bookmarked).toEqual([]);
    expect(active.store.following).toEqual([]);
    expect(active.accessToken).toBeNull();
    expect(active.authCode).toBeNull();
    expect(active.flags).toBeNull();
    expect(active.feedRatio).toBeNull();
    // Starting the participant session clears stale navigation state. Home may
    // immediately create its own session-scoped shuffle/analytics keys.
    expect(active.sessionStorageKeys).not.toContain('scrollY:/ChineseEVs');
    expect(active.sessionStorageKeys).not.toContain('previousPath:/somewhere');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/$/);
    const ended = await page.evaluate(() => ({
      studySession: localStorage.getItem('crossweave:studySession:v1'),
      currentUser: localStorage.getItem('currentUser'),
      store: JSON.parse(localStorage.getItem('stacky:localStore:v1') || 'null'),
    }));
    expect(ended.studySession).toBeNull();
    expect(ended.currentUser).toBeNull();
    expect(ended.store.me.acct).toBe('you');
    expect(ended.store.liked).toEqual([]);
  });
});
