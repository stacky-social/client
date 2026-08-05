import { test, expect } from '@playwright/test';

// OAuth callback failure UX. Visiting /callback with no query params used to
// strand the user on an infinite spinner; the page now shows an explicit
// failure state with a way back to login. This guards that fix.
test.describe('OAuth callback', () => {
  test('shows a failure UI (not just a spinner) when params are missing', async ({ page }) => {
    await page.goto('/callback');

    // Failure message + escape hatch.
    await expect(page.getByText('Login failed.')).toBeVisible();

    const backLink = page.getByRole('link', { name: 'Back to login' });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute('href', '/');
  });

  test('stores only the returned user session and continues to the real home timeline', async ({ page }) => {
    await page.route('**/api/auth/mastodon/callback', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'test-access-token',
        account: {
          id: 'account-1',
          username: 'river',
          acct: 'river',
          display_name: 'River Chen',
          avatar: '/avatar/stacky_default.PNG',
        },
        instance: 'https://beta.stacky.social',
      }),
    }));
    await page.route('https://beta.stacky.social/api/v1/timelines/home**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    }));

    await page.goto('/callback?code=test-code&state=test-state');
    await expect(page).toHaveURL(/\/home$/);
    const session = await page.evaluate(() => ({
      token: localStorage.getItem('accessToken'),
      account: JSON.parse(localStorage.getItem('currentUser') || 'null'),
      instance: localStorage.getItem('mastodonInstance'),
    }));
    expect(session.token).toBe('test-access-token');
    expect(session.account.acct).toBe('river');
    expect(session.instance).toBe('https://beta.stacky.social');
  });
});
