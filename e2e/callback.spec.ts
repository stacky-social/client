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
});
