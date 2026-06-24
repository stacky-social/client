import { Page, Locator } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

/** The research feed route (renamed from /listy-injection). */
export const FEED_ROUTE = '/ChineseEVs';

export const entries = mockData as unknown as Array<{
  focusPost: { id: string; content: string };
  relatedPosts: Array<{ id: string; category: string; topic?: string; relations?: any[] }>;
  replies?: unknown[];
}>;

export const focusIds: string[] = entries.map((e) => e.focusPost.id);
export const firstFocusId = focusIds[0];
export const richestFocusId = focusIds[0]; // entry 0 has 15 related + 15 replies
/** Related-post count per entry, e.g. [15,13,12,10,5,5]. */
export const relatedCounts = entries.map((e) => e.relatedPosts.length);

/** §11 viewports. side-by-side is expected at every size (no mobile drawer). */
export const VIEWPORTS = {
  wide: { width: 1920, height: 1080 },
  roomy: { width: 1440, height: 900 },
  mid: { width: 1200, height: 900 },
  tablet: { width: 768, height: 1024 },
  phone: { width: 375, height: 812 },
} as const;

/** Stable selectors verified against the live DOM. */
export const sel = {
  topNav: '[data-testid="top-nav"]',
  contentGroup: '[data-testid="content-group"]',
  feed: '[data-testid="feed"]',
  aside: '[data-testid="col-aside"]',
  resizeSeparator: '[role="separator"][aria-label="Resize feed and related panels"]',
  post: '[data-testid="post"]',
  activePost: '[data-testid="post"][data-active="true"]',
  relatedCard: '[data-related-card]',
  hoverTooltip: '[data-testid="hover-tooltip"]',
  focusReveal: '[data-testid="focus-reveal"]',
  stackCount: '[data-stack-count]',
  rangeMark: 'mark[data-range-id]',
  /** category tag label inside a related card */
  cardTagText: 'p.related-tag-text',
  // grouping / reorder hooks
  cardCategoryTag: '[data-testid="card-category-tag"]',
  topicBlockHeader: '[data-testid="topic-block-header"]',
  moreLikeThis: '[data-testid="more-like-this"]',
  groupedByPill: '[data-testid="grouped-by-pill"]',
} as const;

/** Ordered list of related-card post ids currently in the aside. */
export async function asideCardOrder(page: Page): Promise<(string | null)[]> {
  return page
    .locator(`${sel.aside} ${sel.relatedCard}`)
    .evaluateAll((els) =>
      els.map((e) => e.querySelector('[data-post-id]')?.getAttribute('data-post-id') ?? null),
    );
}

/** Hover a related card and read the leading number from its "N more <Topic>"
 *  tooltip (the count of OTHER posts on that card's topic). null if no tooltip. */
export async function tooltipCountForCard(page: Page, index: number): Promise<number | null> {
  await page.locator(`${sel.aside} ${sel.relatedCard}`).nth(index).hover();
  await page.waitForTimeout(250);
  const tip = page.locator(sel.hoverTooltip).first();
  if (!(await tip.count())) return null;
  const text = await tip.innerText();
  const m = text.match(/^\s*(\d+)\s+more/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Active feed-post blue border color (R-FEED-2/5). */
export const ACTIVE_BORDER_RGB = '156, 184, 255';

/** Navigate to the feed and wait until exactly one post is focused. */
export async function gotoFeed(page: Page): Promise<void> {
  await page.goto(FEED_ROUTE);
  await page.locator(sel.activePost).first().waitFor({ state: 'visible' });
}

/** The data-post-id of the wrapper that contains the active feed post. */
export async function activePostWrapperId(page: Page): Promise<string | null> {
  const wrapper = page
    .locator('div[data-post-id]', { has: page.locator(sel.activePost) })
    .first();
  if (!(await wrapper.count())) return null;
  return wrapper.getAttribute('data-post-id');
}

/** Related cards currently rendered in the aside. */
export function relatedCards(page: Page): Locator {
  return page.locator(`${sel.aside} ${sel.relatedCard}`);
}

/** Category filter chips in the aside (button[aria-label="Show X filter"]). */
export function filterChips(page: Page): Locator {
  return page.locator(sel.aside).getByRole('button', { name: /^Show .+ filter$/ });
}

/** Horizontal overflow of the document in px (should be ~0). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.scrollingElement as HTMLElement;
    return el.scrollWidth - el.clientWidth;
  });
}

/** Collect uncaught page exceptions for the life of the test (assert empty). */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Number of focus-post marks currently painted (non-transparent background). */
export async function litMarkCount(page: Page): Promise<number> {
  return page
    .locator(`${sel.activePost} ${sel.rangeMark}`)
    .evaluateAll(
      (els) =>
        els.filter(
          (e) => !['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(e).backgroundColor),
        ).length,
    );
}

/** feed : (feed+aside) width ratio, ~0.65 by default. */
export async function feedRatio(page: Page): Promise<number> {
  const feed = await page.locator(sel.feed).boundingBox();
  const aside = await page.locator(sel.aside).boundingBox();
  if (!feed || !aside) return NaN;
  return feed.width / (feed.width + aside.width);
}
