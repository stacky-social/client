import { test, expect, Page } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

// T7 — the cross-pane "group HERE, filter THERE" model on the thread/detail
// route (/ChineseEVs/posts/[id]). One shared `topicInteraction` primitive:
//   - a REPLY contribution span click → the reply list CLUSTERS by that topic
//     (left, inline rail) and the aside is FILTERED to it ("Filtered by: <t>").
//   - a RELATED-CARD span click → the aside GROUPS by that topic (right, the
//     `active-group-anchor` indicator) and the reply list is FILTERED to it
//     ("Filtered by: <t>", non-matching replies hidden).
//   - re-clicking the active span clears BOTH panes.
//
// The feed renders from local mock JSON (no backend / no auth), so the flow is
// exercised against the SAME committed fixture the app ships (T0's regen laid
// down reply relations + nested threads). Anchors/topics are derived from that
// fixture below so the spec stays honest if the data is regenerated.

// ── Derive a deterministic scenario from the fixture ─────────────────────────
type Rel = { topic?: string };
type Reply = { id: string; inReplyToId?: string; relations?: Rel[] };
type Related = { id: string; relations?: Rel[] };
type Entry = {
  focusPost: { id: string };
  replies?: Reply[];
  relatedPosts?: Related[];
};

const entry = (mockData as unknown as Entry[]).find((e) => e.focusPost.id === '143195604')!;
const FOCUS_ID = entry.focusPost.id;
const DETAIL_URL = `/ChineseEVs/posts/${FOCUS_ID}`;

const focusId = entry.focusPost.id;
const allReplies = entry.replies ?? [];
const relById = new Map(allReplies.map((r) => [r.id, r.relations ?? []]));
const childIds = new Map<string, string[]>();
for (const r of allReplies) {
  if (!r.inReplyToId) continue;
  const arr = childIds.get(r.inReplyToId) ?? [];
  arr.push(r.id);
  childIds.set(r.inReplyToId, arr);
}
const topLevel = allReplies.filter((r) => r.inReplyToId === focusId);
const branchTopics = (r: Reply): Set<string> => {
  const out = new Set<string>();
  const stack = [r.id];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const rel of relById.get(id) ?? []) if (rel.topic) out.add(rel.topic);
    for (const c of childIds.get(id) ?? []) stack.push(c);
  }
  return out;
};

// Topics that live on this entry's related posts (a real cross-pane target).
const relatedTopics = new Set(
  (entry.relatedPosts ?? []).flatMap((rp) => (rp.relations ?? []).map((r) => r.topic)).filter(Boolean) as string[],
);

// Reply anchor: the first top-level reply whose OWN relation carries a topic
// that also exists on the aside (so the reply click filters the aside).
const REPLY_ANCHOR = (() => {
  for (const r of topLevel) {
    const rels = relById.get(r.id) ?? [];
    const idx = rels.findIndex((x) => x.topic && relatedTopics.has(x.topic));
    if (idx >= 0) return { replyId: r.id, rangeIndex: idx, topic: rels[idx].topic! };
  }
  throw new Error('fixture: no reply anchor with a cross-pane topic found for ' + FOCUS_ID);
})();

// Aside grouping topic: one that matches SOME but not ALL top-level reply
// branches, so filtering the reply list demonstrably hides a reply.
const ASIDE_TOPIC = (() => {
  for (const t of relatedTopics) {
    const n = topLevel.filter((r) => branchTopics(r).has(t)).length;
    if (n > 0 && n < topLevel.length) return t;
  }
  throw new Error('fixture: no discriminating aside topic found for ' + FOCUS_ID);
})();
// Related cards whose EVERY relation is ASIDE_TOPIC → clicking any of their
// marks groups by that exact topic regardless of overlap band (deterministic).
const ALL_TOPIC_CARD_IDS = (entry.relatedPosts ?? [])
  .filter((rp) => (rp.relations ?? []).length > 0 && (rp.relations ?? []).every((x) => x.topic === ASIDE_TOPIC))
  .map((rp) => rp.id);
const MATCHING_REPLY_IDS = topLevel.filter((r) => branchTopics(r).has(ASIDE_TOPIC)).map((r) => r.id);
const NON_MATCHING_REPLY_IDS = topLevel.filter((r) => !branchTopics(r).has(ASIDE_TOPIC)).map((r) => r.id);

// ── DOM helpers ──────────────────────────────────────────────────────────────
const replyAnchorMark = `[data-post-id="${REPLY_ANCHOR.replyId}"] mark[data-reply-range-id="${REPLY_ANCHOR.rangeIndex}"]`;

/** Click a mark on the first rendered aside related-card whose id is in `ids`
 *  (or the specific `forceId` card, for re-clicking the exact same anchor).
 *  Returns the clicked card id, or null if none matched. */
async function clickAsideCardMark(page: Page, ids: string[], forceId?: string): Promise<string | null> {
  return page.evaluate(
    ({ ids, forceId }) => {
      const aside =
        document.querySelector('aside') || document.querySelector('[class*="aside" i]');
      if (!aside) return null;
      const cards = Array.from(aside.querySelectorAll('[data-related-card]'));
      const pidOf = (c: Element) => c.querySelector('[data-post-id]')?.getAttribute('data-post-id') ?? null;
      const target = forceId
        ? cards.find((c) => pidOf(c) === forceId)
        : cards.find((c) => { const p = pidOf(c); return !!p && ids.includes(p); });
      if (!target) return null;
      const mark = target.querySelector('mark');
      if (!mark) return null;
      const r = mark.getBoundingClientRect();
      mark.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + 2, clientY: r.top + 2 }),
      );
      return pidOf(target);
    },
    { ids, forceId: forceId ?? null },
  );
}

/** Entry 143195604 has 15 top-level replies (real descendant data) and the reply
 *  list paginates at 5; reveal the full top level so a fixture-derived anchor
 *  (which may sort past the first page) is rendered. */
async function revealTopLevelReplies(page: Page) {
  for (let i = 0; i < 6; i++) {
    const more = page.getByRole('button', { name: /^\d+ more repl/i });
    if ((await more.count()) === 0) break;
    await more.first().click();
  }
}

test.describe('Cross-pane grouping / filtering (T7)', () => {
  test('reply span → left clusters (rail) + aside "Filtered by"; re-click clears both', async ({ page }) => {
    await page.goto(DETAIL_URL);
    await revealTopLevelReplies(page);
    // Aside + reply contribution span both present.
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    const anchorMark = page.locator(replyAnchorMark).first();
    await expect(anchorMark).toBeVisible();

    const clusterMembers = page.locator('[data-reply-cluster-member]');
    const asideChip = page.getByTestId('aside-topic-filter');
    await expect(clusterMembers).toHaveCount(0);
    await expect(asideChip).toHaveCount(0);

    // Reply span click → GROUP here (reply list clusters, rail appears) …
    await anchorMark.click();
    await expect(clusterMembers.first()).toBeVisible();
    // … and FILTER there (the aside wears a "Filtered by: <topic>" chip).
    await expect(asideChip).toBeVisible();
    await expect(asideChip).toContainText(REPLY_ANCHOR.topic);

    // Re-clicking the active span clears BOTH panes (single primitive).
    await page.locator(replyAnchorMark).first().click();
    await expect(clusterMembers).toHaveCount(0);
    await expect(asideChip).toHaveCount(0);
  });

  test('related-card span → aside groups + reply list "Filtered by" hides non-matching; re-click clears', async ({ page }) => {
    // Preconditions the assertions below rely on (guard against a fixture regen
    // that would silently make this test vacuous).
    expect(ALL_TOPIC_CARD_IDS.length, 'need a single-topic aside card to click').toBeGreaterThan(0);
    expect(NON_MATCHING_REPLY_IDS.length, 'need a reply that will be filtered out').toBeGreaterThan(0);
    expect(MATCHING_REPLY_IDS.length, 'need a reply that survives the filter').toBeGreaterThan(0);

    await page.goto(DETAIL_URL);
    await revealTopLevelReplies(page);
    await expect(page.locator('[data-related-card]').first()).toBeVisible();

    // The non-matching reply is present BEFORE any grouping.
    const nonMatching = page.locator(`[data-post-id="${NON_MATCHING_REPLY_IDS[0]}"]`);
    await expect(nonMatching).toHaveCount(1);

    const groupIndicator = page.getByTestId('active-group-anchor');
    const replyBar = page.getByTestId('reply-filter-bar');
    const replyChip = page.getByTestId('reply-topic-filter');
    await expect(groupIndicator).toHaveCount(0);
    await expect(replyBar).toHaveCount(0);

    // Related-card span click → GROUP there (aside), FILTER here (reply list).
    const clickedCardId = await clickAsideCardMark(page, ALL_TOPIC_CARD_IDS);
    expect(clickedCardId, 'an all-topic aside card should be rendered and clickable').not.toBeNull();

    await expect(groupIndicator.first()).toBeVisible(); // aside groups
    await expect(replyBar).toBeVisible(); // reply list wears the filter
    await expect(replyChip).toBeVisible();
    await expect(replyChip).toContainText(ASIDE_TOPIC);
    // Non-matching reply hidden; matching reply still shown.
    await expect(nonMatching).toHaveCount(0);
    await expect(page.locator(`[data-post-id="${MATCHING_REPLY_IDS[0]}"]`)).toHaveCount(1);

    // Re-click the SAME aside anchor → both panes reset; the hidden reply returns.
    await clickAsideCardMark(page, ALL_TOPIC_CARD_IDS, clickedCardId!);
    await expect(groupIndicator).toHaveCount(0);
    await expect(replyBar).toHaveCount(0);
    await expect(nonMatching).toHaveCount(1);
  });
});
