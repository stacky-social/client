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

let feedbackRequests: Array<Record<string, any>> = [];

test.describe('Reply-draft feedback presentation', () => {
  test.beforeEach(async ({ page }) => {
    feedbackRequests = [];
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
      feedbackRequests.push(route.request().postDataJSON());
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
    // Deliberately long draft: the composer textarea wraps to multiple lines,
    // and the rail bridge must still span the whole (variable-height) row.
    const initialDraft =
      "wouldn't that just make us more dependent on chinese manufacturing? " +
      "we already rely on them for batteries, rare earths, and most of the cell supply chain, " +
      "so tariffs alone don't obviously fix the dependency problem.";
    await composer.fill(initialDraft);

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
    // "Possible Reply", wears a robot avatar and a SIMULATED disclosure chip.
    await expect(page.getByText(/how people might reply/i)).toHaveCount(0);
    await expect(page.getByText('Possible Reply', { exact: true })).toHaveCount(SIM_REPLIES.length);
    await expect(page.locator('img[src*="/avatar/robot_"]')).toHaveCount(SIM_REPLIES.length);
    await expect(page.getByText(/^simulated$/i)).toHaveCount(SIM_REPLIES.length);

    // The thread rail attaches the simulated replies to the USER'S DRAFT, not
    // to the feedback: it drops from the draft's avatar column, the replies
    // indent under the draft like real replies (right of the rail), and the
    // feedback box indents further than the replies so the rail passes it.
    const rail = page.getByTestId('sim-reply-thread-rail');
    await expect(rail).toHaveCount(1);
    const railBox = (await rail.boundingBox())!;
    const avatarBox = (await page.locator('img[src*="/avatar/robot_"]').first().boundingBox())!;
    const commentBox = (await comment.boundingBox())!;
    expect(railBox.x, 'rail must sit left of the reply avatars').toBeLessThan(avatarBox.x);
    expect(commentBox.x, 'feedback must be indented more than the replies').toBeGreaterThan(avatarBox.x);

    // The rail must reach UP past the (multiline) draft text and hit the
    // user's photo: a bridge segment spans the composer row from just below
    // the avatar down to the feedback block, at the same x as the rail.
    const bridge = page.getByTestId('draft-rail-bridge');
    await expect(bridge).toHaveCount(1);
    const bridgeBox = (await bridge.boundingBox())!;
    const composerBox = (await composer.boundingBox())!;
    expect(composerBox.height, 'draft should actually be multiline for this test').toBeGreaterThan(50);
    expect(bridgeBox.y, 'bridge must start at the avatar, above the draft text bottom').toBeLessThan(composerBox.y + 45);
    expect(bridgeBox.y + bridgeBox.height, 'bridge must span down past the whole draft row').toBeGreaterThanOrEqual(composerBox.y + composerBox.height);
    expect(Math.abs(bridgeBox.x - railBox.x), 'bridge and rail must be collinear').toBeLessThanOrEqual(1);

    // Whiteboard spec: the rail connects the user's photo to the BOT PHOTOS —
    // an elbow reaches each robot avatar, and the vertical line stops at the
    // last robot instead of running past it.
    await expect(page.getByTestId('sim-reply-elbow')).toHaveCount(SIM_REPLIES.length);
    const lastAvatar = (await page.locator('img[src*="/avatar/robot_"]').last().boundingBox())!;
    const segBoxes = await Promise.all(
      (await page.getByTestId('sim-reply-rail-seg').all()).map((s) => s.boundingBox()),
    );
    expect(segBoxes.length).toBeGreaterThan(0);
    const railBottom = Math.max(...segBoxes.map((b) => b!.y + b!.height));
    const lastAvatarCenter = lastAvatar.y + lastAvatar.height / 2;
    expect(railBottom, 'rail must stop at the last robot avatar').toBeLessThanOrEqual(lastAvatarCenter + 4);

    // Refining the same draft keeps its stable conversation id and includes a
    // bounded snapshot of feedback the writer already saw. This prevents a
    // later response from contradicting an earlier suggestion just because a
    // different backend worker handled the request.
    await composer.fill(`${initialDraft} The main concern is supply resilience, not isolation.`);
    await expect.poll(() => feedbackRequests.length).toBeGreaterThanOrEqual(2);
    expect(feedbackRequests[1].draftID).toBe(feedbackRequests[0].draftID);
    expect(feedbackRequests[1].feedbackHistory).toHaveLength(1);
    expect(feedbackRequests[1].feedbackHistory[0]).toMatchObject({
      draftText: initialDraft,
      advice: ADVICE,
      praise: PRAISE,
    });
  });
});
