import { test, expect } from '@playwright/test';

// Draft-feedback presentation on the reply composer (demo detail route).
// The feedback backend is stubbed so the spec runs offline and deterministic.
//
// Design under test (2026-07 demo feedback):
//  - Section title is "Feedback" (not "Writing feedback").
//  - Praise + advice read as ONE comment in ONE box (praise first — the
//    rhetorical softener), not two separately-tinted boxes.
//  - Simulated replies are formatted like actual replies: robot avatar,
//    "Possible Reply" author name, a SIMULATED disclosure chip, and thread
//    connector lines hanging the group off the draft. No
//    "How people might reply" header.

const FOCUS_ID = '143195604';
const DETAIL_URL = `/ChineseEVs/posts/${FOCUS_ID}`;

const PRAISE = "You've honed in on a crucial counterpoint about self-reliance.";
const ADVICE = 'Add a few more words to clarify why dependence is a downside.';
const SIM_REPLIES = [
  { id: 's1', content: "But isn't diversifying our energy sources worth the trade-off in dependency?" },
  { id: 's2', content: "True, but isn't economic interdependence also a form of diplomacy?" },
  { id: 's3', content: "Can we afford to rely on another country's goodwill, especially if it's not an ally?" },
];

test.describe('Reply-draft feedback presentation', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/posts/feedback', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': '*',
          },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ advice: ADVICE, praise: PRAISE, simulatedReplies: SIM_REPLIES }),
      });
    });
  });

  test('feedback is one comment; simulated replies look like replies with robot avatars', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const composer = page.getByPlaceholder('Post your reply');
    await expect(composer).toBeVisible();
    await composer.fill("wouldn't that just make us more dependent on chinese manufacturing?");

    // Wait for the stubbed feedback to render.
    await expect(page.getByText(PRAISE)).toBeVisible();

    // Title: "Feedback", not "Writing feedback".
    await expect(page.getByText('Feedback', { exact: true })).toBeVisible();
    await expect(page.getByText('Writing feedback')).toHaveCount(0);

    // Praise + advice are ONE comment in ONE container.
    const comment = page.getByTestId('feedback-comment');
    await expect(comment).toHaveCount(1);
    await expect(comment).toContainText(PRAISE);
    await expect(comment).toContainText(ADVICE);

    // No "How people might reply" header; each simulated reply is authored by
    // "Possible Reply", wears a robot avatar and a SIMULATED disclosure chip,
    // and hangs off a thread connector line.
    await expect(page.getByText(/how people might reply/i)).toHaveCount(0);
    await expect(page.getByText('Possible Reply', { exact: true })).toHaveCount(SIM_REPLIES.length);
    await expect(page.locator('img[src*="/avatar/stacky_"]')).toHaveCount(SIM_REPLIES.length);
    await expect(page.getByText(/^simulated$/i)).toHaveCount(SIM_REPLIES.length);
    await expect(page.getByTestId('sim-reply-connector')).toHaveCount(SIM_REPLIES.length);
  });
});
