import { test, expect } from '@playwright/test';

// The OAuth login landing page ("/"). No auth or backend required — this is the
// instance-selection form that kicks off the Mastodon OAuth flow.
test.describe('Landing page', () => {
  test('renders the login form and branding', async ({ page }) => {
    await page.goto('/');

    // Headline + subtitle.
    await expect(page.getByText('Login to Mastodon')).toBeVisible();
    await expect(page.getByText('AI-Curated Democratic Discourse')).toBeVisible();

    // Instance input (labelled "Mastodon Instance") + Login button.
    await expect(page.getByLabel('Mastodon Instance')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();

    // Brand lockup: the crossweave mark (one inline SVG) + wordmark.
    await expect(page.getByRole('img', { name: 'crossweave logo' })).toHaveCount(1);
    await expect(page.getByText('crossweave', { exact: true })).toBeVisible();
  });

  test('rejects an invalid instance domain without navigating', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Mastodon Instance').fill('notadomain');
    await page.getByRole('button', { name: 'Login' }).click();

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
    await page.getByRole('button', { name: 'Login' }).click();

    const req = await reqPromise;
    const url = req.url();
    expect(url).toContain('client_id=');
    expect(url).toContain('redirect_uri=');
    expect(url).toContain('response_type=code');
    expect(url).toContain('scope=');
    expect(url).toContain('state=mastodon.social');
  });
});
