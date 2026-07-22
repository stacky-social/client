import { test, expect } from '@playwright/test';

// Study Mode is the primary participant entry; Mastodon OAuth remains available
// as the visually-secondary production login path.
test.describe('Landing page', () => {
  test('renders the primary study entry, secondary login, and branding', async ({ page }) => {
    await page.goto('/');

    // Headline + subtitle.
    await expect(page.getByText('Explore CrossWeave')).toBeVisible();
    await expect(page.getByText('AI-Curated Democratic Discourse')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start study session' })).toBeVisible();

    // Instance input (labelled "Mastodon Instance") + Login button.
    await expect(page.getByLabel('Mastodon Instance')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Mastodon' })).toBeVisible();

    // Brand lockup: the CrossWeave mark (one inline SVG) + wordmark.
    await expect(page.getByRole('img', { name: 'CrossWeave logo' })).toHaveCount(1);
    await expect(page.getByText('CrossWeave', { exact: true })).toBeVisible();
  });

  test('rejects an invalid instance domain without navigating', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Mastodon Instance').fill('notadomain');
    await page.getByRole('button', { name: 'Continue with Mastodon' }).click();

    // Validation message appears (form regex: ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$).
    await expect(page.getByText(/valid instance domain/i)).toBeVisible();

    // No navigation occurred — still on "/".
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('a valid instance builds the OAuth authorize URL', async ({ page }) => {
    await page.goto('/');

    // Block any outbound request to the chosen instance so we don't actually
    // leave the app — we only want to inspect the URL the form builds.
    await page.route('https://mastodon.social/**', (route) => route.abort());

    const reqPromise = page.waitForRequest(/\/oauth\/authorize\?/);

    await page.getByLabel('Mastodon Instance').fill('mastodon.social');
    await page.getByRole('button', { name: 'Continue with Mastodon' }).click();

    const req = await reqPromise;
    const url = req.url();
    expect(url).toContain('client_id=');
    expect(url).toContain('redirect_uri=');
    expect(url).toContain('response_type=code');
    expect(url).toContain('scope=');
    expect(url).toContain('state=mastodon.social');
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

    await page.getByRole('button', { name: 'Start study session' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('button', { name: 'End study session' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Experiment settings' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Logout' })).toHaveCount(0);

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
        sessionStorageLength: sessionStorage.length,
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
    expect(active.sessionStorageLength).toBe(0);

    await page.reload();
    await expect(page.getByRole('button', { name: 'End study session' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Experiment settings' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Logout' })).toHaveCount(0);

    await page.getByRole('button', { name: 'End study session' }).click();
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
