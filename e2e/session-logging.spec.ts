import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import mockData from '../src/app/FakeData/listy-injection.json';

const TRAILS_KEY = 'crossweave:sessionTrails:v1';
const focusId = (mockData as any)[0].focusPost.id as string;

test.use({
  // PostHog correctly discards recognized bots. Use a normal Chrome UA here so
  // the configured-path test exercises transport rather than the bot guard.
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});

test('records opened posts and filter URL transitions in one bounded local session', async ({ page }) => {
  const postHogRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('posthog')) postHogRequests.push(request.url());
  });

  await page.goto(`/ChineseEVs/posts/${focusId}`);
  const chip = page.getByRole('button', { name: /filter$/i }).first();
  await expect(chip).toBeVisible();
  await chip.click();
  await page.waitForURL(/[?&]fc=/);

  const trail = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), TRAILS_KEY);
  expect(trail.version).toBe(1);
  expect(trail.sessions).toHaveLength(1);
  expect(trail.sessions[0].urls.map((entry: { url: string }) => entry.url)).toEqual([
    `/ChineseEVs/posts/${focusId}`,
    expect.stringMatching(new RegExp(`^/ChineseEVs/posts/${focusId}\\?fc=`)),
  ]);
  expect(postHogRequests).toEqual([]);
});

test('configured study analytics sends only the sanitized pageview', async ({ page }) => {
  test.skip(process.env.E2E_EXPECT_POSTHOG !== '1', 'requires a server compiled with a test PostHog token');

  const requests: Array<{ url: string; body: Buffer | null }> = [];
  await page.route('https://us.i.posthog.com/**', async (route) => {
    const request = route.request();
    requests.push({ url: request.url(), body: request.postDataBuffer() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.addInitScript(() => {
    localStorage.setItem('crossweave:studySession:v1', JSON.stringify({
      id: 'configured-analytics-test',
      startedAt: '2026-08-11T10:00:00.000Z',
      participant: { id: 'configured-analytics-test' },
    }));
  });

  await page.goto(`/ChineseEVs/posts/${focusId}?fc=agree&code=must-not-leave-browser`);
  await expect.poll(() => requests.length, { message: 'PostHog request log' }).toBeGreaterThan(0);
  const ingests = requests.filter((request) => /\/e\/?$/.test(new URL(request.url).pathname));
  expect(ingests).toHaveLength(1);
  const firstPayload = JSON.parse(gunzipSync(ingests[0].body!).toString('utf8'));
  const firstEvent = firstPayload.batch[0];
  expect(firstEvent.event).toBe('$pageview');
  expect(firstEvent.properties.$current_url).toBe(
    `http://localhost:3000/ChineseEVs/posts/${focusId}?fc=agree`,
  );
  expect(firstEvent.properties.crossweave_session_id).toBe('study:configured-analytics-test');
  expect(firstEvent.properties.filters).toEqual({ fc: 'agree' });
  expect(JSON.stringify(firstPayload)).not.toContain('must-not-leave-browser');

  const urls = await page.evaluate((key) => {
    const trail = JSON.parse(localStorage.getItem(key) || 'null');
    return trail.sessions[0].urls.map((entry: { url: string }) => entry.url);
  }, TRAILS_KEY);
  expect(urls).toEqual([`/ChineseEVs/posts/${focusId}?fc=agree`]);

  // The station is reused for another participant without a hard reload. Its
  // PostHog anonymous/device identity must rotate with the study session.
  await page.evaluate(() => {
    localStorage.setItem('crossweave:studySession:v1', JSON.stringify({
      id: 'configured-analytics-test-2',
      startedAt: '2026-08-11T11:00:00.000Z',
      participant: { id: 'configured-analytics-test-2' },
    }));
  });
  await page.getByTestId('top-nav').getByRole('button', { name: 'Home' }).nth(1).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect.poll(
    () => requests.filter((request) => /\/e\/?$/.test(new URL(request.url).pathname)).length,
  ).toBe(2);

  const secondIngest = requests.filter((request) => /\/e\/?$/.test(new URL(request.url).pathname))[1];
  const secondPayload = JSON.parse(gunzipSync(secondIngest.body!).toString('utf8'));
  const secondEvent = secondPayload.batch[0];
  expect(secondEvent.properties.crossweave_session_id).toBe('study:configured-analytics-test-2');
  expect(secondEvent.properties.distinct_id).not.toBe(firstEvent.properties.distinct_id);
  expect(secondEvent.properties.$device_id).not.toBe(firstEvent.properties.$device_id);
});
