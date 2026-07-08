import { test, expect } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

// Regression tests for the focus-post highlighting layer (Post.tsx →
// ActiveHighlightedContent). Four fixes are covered:
//   #1 cross-highlight L2 emphasis must NOT reflow text — faux-bold via
//      text-shadow, never a real font-weight.
//   #2 cross-highlight L2 colour is a *light* shade of the category colour.
//   #3 clicking a focus span keeps it visibly dark and stable (no blink / no
//      turn-off until the mouse moves).
//   #4 a highlight below the "Read more" fold auto-expands the post, then
//      collapses again once the highlight ends.
//
// The feed renders from local mock JSON (no backend / no auth).
//
// The related cards are visually stacked and their hover handlers are debounced,
// so a headless `.hover()` can't reliably target a specific card. The
// cross-highlight cases therefore invoke the cards' real React hover handlers
// directly via page.evaluate — the same code path a real cursor drives — which
// keeps these deterministic. The click case (#3) uses a genuine click.

const firstFocusId = (mockData as any)[0].focusPost.id as string;
const DETAIL_URL = `/ChineseEVs/posts/${firstFocusId}`;

// The dark shade a clicked/filtered focus span settles to — matches the .fp-dark
// direct-hover shade so clicking a hovered span is seamless.
const DARK = 'rgb(193, 199, 209)';
const focusMarks = '[data-testid="focus-reveal"] mark[data-fs]';

// Browser-side helper source: drive the i-th related-card's L1 (card) hover and,
// optionally, its mark's L2 hover through the real React prop handlers.
const DRIVER = `
  (function(){
    const findProps = (el) => { const k = Object.keys(el).find(k => k.startsWith('__reactProps$')); return k ? el[k] : null; };
    const mkEvt = (el, rel) => { const r = el.getBoundingClientRect(); return { currentTarget: el, target: el, relatedTarget: rel || document.body, clientX: r.left + 2, clientY: r.top + 2, pointerType: 'mouse', preventDefault(){}, stopPropagation(){}, nativeEvent: {} }; };
    const aside = document.querySelector('aside') || document.querySelector('[class*="aside" i]');
    window.__hl = {
      cardMarkCount: () => aside.querySelectorAll('mark').length,
      cardFor: (i) => {
        const mark = aside.querySelectorAll('mark')[i];
        let div = mark, cp = null;
        while (div) { const p = findProps(div); if (p && p.onMouseEnter && p.onMouseLeave && div !== mark) { cp = p; break; } div = div.parentElement; }
        return { mark, div, cp, mp: findProps(mark) };
      },
      enter: (i, withMark) => { const c = window.__hl.cardFor(i); if (c.cp && c.cp.onMouseEnter) c.cp.onMouseEnter(mkEvt(c.div)); if (withMark && c.mp) { const r = c.mark.getBoundingClientRect(); const ev = { currentTarget: c.mark, target: c.mark, relatedTarget: document.body, clientX: r.left + 2, clientY: r.top + r.height / 2, pointerType: 'mouse', preventDefault(){}, stopPropagation(){}, nativeEvent: {} }; /* single-contributor marks resolve on enter; overlap marks resolve the hovered band via mouse MOVE (Y position) */ if (c.mp.onMouseEnter) c.mp.onMouseEnter(ev); if (c.mp.onMouseMove) c.mp.onMouseMove(ev); if (c.mp.onPointerMove) c.mp.onPointerMove(ev); } return !!c.cp; },
      leave: (i) => { const c = window.__hl.cardFor(i); if (c.mp && c.mp.onMouseLeave) c.mp.onMouseLeave(mkEvt(c.div)); if (c.cp && c.cp.onMouseLeave) c.cp.onMouseLeave(mkEvt(c.div)); },
      clickCardSpan: (i) => { const mark = aside.querySelectorAll('mark')[i]; const r = mark.getBoundingClientRect(); mark.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + 2, clientY: r.top + 2 })); },
    };
    return window.__hl.cardMarkCount();
  })()
`;

test.describe('Focus-post highlighting', () => {
  test('#3 clicking a focus span keeps it visibly dark and stable', async ({ page }) => {
    await page.goto(DETAIL_URL);

    const mark = page.locator(focusMarks).first();
    await expect(mark).toBeVisible();

    const before = await mark.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(before).not.toBe(DARK);

    await mark.click();

    // Becomes dark immediately and STAYS dark with no further interaction (the
    // old bug dropped it to a lighter filter tint / turned it off until the mouse
    // moved again).
    await expect
      .poll(async () => mark.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(DARK);
    await page.waitForTimeout(700);
    expect(await mark.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(DARK);
  });

  test('#1/#2 cross-highlight emphasis is non-reflowing faux-bold and lightly coloured', async ({ page }) => {
    await page.goto(DETAIL_URL);
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    const count = (await page.evaluate(DRIVER)) as number;
    expect(count).toBeGreaterThan(0);

    // Drive card+mark hover until a relation with an optional bold sub-span lights
    // up (not every relation carries a focusComment).
    let fcFound = false;
    for (let i = 0; i < Math.min(count, 12) && !fcFound; i++) {
      await page.evaluate((idx: number) => (window as any).__hl.enter(idx, true), i);
      await page.waitForTimeout(350); // onRangeHover → store index is debounced ~200ms
      fcFound = (await page.locator('[data-testid="focus-reveal"] span[data-fc]').count()) > 0;
      if (!fcFound) await page.evaluate((idx: number) => (window as any).__hl.leave(idx), i);
    }
    expect(fcFound, 'a related-card span hover should emphasise a focus sub-span').toBeTruthy();

    // #1: the emphasis is faux-bold (text-shadow), NOT a real font-weight that
    // widens glyphs and reflows the article.
    const emphasis = await page.locator('[data-testid="focus-reveal"] span[data-fc]').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fontWeight: cs.fontWeight, textShadow: cs.textShadow };
    });
    expect(emphasis.fontWeight).toBe('400');
    expect(emphasis.textShadow).not.toBe('none');
    expect(emphasis.textShadow).toContain('0.7px');

    // #2: the lit L2 region is a *light* category colour (pastel — high channel
    // sum) rather than the previous over-dark blend toward the border.
    const litBg = await page.evaluate(() => {
      const marks = Array.from(document.querySelectorAll('[data-testid="focus-reveal"] mark[data-fs]')) as HTMLElement[];
      const isCategory = (b: string) =>
        b && b !== 'rgba(0, 0, 0, 0)' && b !== 'rgba(100, 116, 139, 0)' &&
        b !== 'rgb(193, 199, 209)' && b !== 'rgb(236, 238, 241)';
      const m = marks.find((el) => isCategory(getComputedStyle(el).backgroundColor));
      return m ? getComputedStyle(m).backgroundColor : null;
    });
    expect(litBg, 'a focus region should carry the category cross-highlight').not.toBeNull();
    const ch = (litBg as string).match(/\d+/g)!.map(Number).slice(0, 3);
    expect(ch[0] + ch[1] + ch[2], 'L2 fill should stay pastel/light').toBeGreaterThan(600);
  });

  test('#4 card hover scrolls the FIXED-SIZE post to a whole passage; no half-peek; height never changes; restores on leave', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const focus = page.locator('[data-testid="focus-reveal"]');
    await expect(focus).toBeVisible();
    await expect(page.getByText('Read more').first()).toBeVisible();

    const count = (await page.evaluate(DRIVER)) as number;
    const baselineH = await focus.evaluate((el) => Math.round(el.getBoundingClientRect().height));

    // Per-mark classification against the window. A card can relate to several
    // passages scattered across the post; a fixed window can't show ones that are
    // lines apart, so the contract is: at least one painted mark is fully visible
    // (a passage IS shown), NO painted mark half-peeks at an edge (straddles it —
    // the "By resorting to…" clip this test pins), and the window rests on a whole
    // line. A single passage taller than the whole box is the one legitimate
    // straddle (unavoidable) and is excepted.
    const spanState = () =>
      focus.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const lineH = 1.5 * (parseFloat(getComputedStyle(el).fontSize) || 16);
        const painted = (Array.from(el.querySelectorAll('mark[data-fs]')) as HTMLElement[]).filter(
          (m) => m.style.backgroundColor
        );
        let anyFullyIn = false;
        let straddlers = 0;
        for (const m of painted) {
          const r = m.getBoundingClientRect();
          if (r.height === 0) continue;
          const fullyIn = r.top >= box.top - 1.5 && r.bottom <= box.bottom + 1.5;
          const fullyOut = r.bottom <= box.top + 1.5 || r.top >= box.bottom - 1.5;
          if (fullyIn) anyFullyIn = true;
          else if (!fullyOut && r.height <= box.height + 1) straddlers++; // half-peek (not a too-tall passage)
        }
        return {
          h: Math.round(box.height),
          scrollTop: Math.round(el.scrollTop),
          painted: painted.length,
          lineAligned: Math.abs(el.scrollTop / lineH - Math.round(el.scrollTop / lineH)) < 0.06,
          shownCleanly: painted.length > 0 && anyFullyIn && straddlers === 0,
        };
      });

    let anyScrolled = false;
    for (let i = 0; i < Math.min(count, 10); i++) {
      await page.evaluate((idx: number) => (window as any).__hl.enter(idx, false), i);
      // Wait for the smooth scroll to SETTLE: a passage shown cleanly (no
      // half-peek) AND resting on a whole line (mid-animation isn't line-aligned).
      await expect
        .poll(
          async () => {
            const s = await spanState();
            return s.shownCleanly && s.lineAligned;
          },
          {
            timeout: 5000,
            message: `card ${i}: a whole passage must settle line-aligned with no half-peek`,
          }
        )
        .toBe(true);
      const st = await spanState();
      // THE core contract: the box NEVER changes size on hover.
      expect(st.h, `card ${i}: focus post height must not change on hover`).toBeGreaterThanOrEqual(baselineH - 2);
      expect(st.h, `card ${i}: focus post height must not change on hover`).toBeLessThanOrEqual(baselineH + 2);
      if (st.scrollTop > 0) anyScrolled = true;
      await page.evaluate((idx: number) => (window as any).__hl.leave(idx), i);
      await page.waitForTimeout(200);
    }

    // At least one card's span sits below the fold, so internal scrolling must
    // have engaged somewhere — otherwise the mechanism is dead, not just idle.
    expect(anyScrolled, 'internal scroll-to-span should engage for below-fold spans').toBe(true);

    // Manual Read-more stays available and independent throughout.
    await expect(page.getByText('Read more').first()).toBeVisible();

    // After the last leave the box rests where it started: same height,
    // scrolled back to the top.
    await expect
      .poll(async () => (await spanState()).scrollTop, { timeout: 8000 })
      .toBeLessThanOrEqual(1);
    const finalH = await focus.evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(finalH).toBe(baselineH);
  });

  test('#5 related-card span click groups the panel (anchor) — distinct from the focus-post filter', async ({ page }) => {
    await page.goto(DETAIL_URL);
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    await page.evaluate(DRIVER);

    // The two span clicks must do DIFFERENT things:
    //   - related-card span  → toggle a TOPIC ANCHOR (panel groups, "Grouped by:" pill)
    //   - focus-post span     → apply the overlap FILTER (clicked span turns dark)
    // The regression collapsed both onto the focus-post filter.
    const groupedBy = page.getByText('Grouped by:');
    await expect(groupedBy).toHaveCount(0);

    // Related-card span click → panel groups.
    await page.evaluate(() => (window as any).__hl.clickCardSpan(0));
    await expect(groupedBy.first()).toBeVisible();

    // Clicking the same span again toggles the grouping off.
    await page.evaluate(() => (window as any).__hl.clickCardSpan(0));
    await expect(groupedBy).toHaveCount(0);

    // The focus-post span click is the OTHER mechanism: it must NOT group, and it
    // turns the clicked span dark (the filter).
    await page.locator(focusMarks).first().click();
    await expect(groupedBy).toHaveCount(0);
    await expect
      .poll(async () => page.locator(focusMarks).first().evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(DARK);
  });

  test('#6 Level-2: hovering a specific contribution scrolls to THAT span, not the card’s largest passage', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const focus = page.locator('[data-testid="focus-reveal"]');
    await expect(focus).toBeVisible();
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    await page.evaluate(DRIVER);

    // Map the aside's marks (same order __hl.cardFor uses) to their owning card,
    // so we can drive TWO contributions on the SAME card and prove the focus post
    // follows the specific hovered span. Deterministic: no cursor hovering.
    const grouped = (await page.evaluate(() => {
      const aside = document.querySelector('aside') || document.querySelector('[class*="aside" i]');
      const marks = Array.from(aside!.querySelectorAll('mark'));
      const byCard = new Map<Element, number[]>();
      marks.forEach((m, i) => {
        const card = m.closest('[data-related-card]');
        if (!card) return;
        const arr = byCard.get(card) ?? [];
        arr.push(i);
        byCard.set(card, arr);
      });
      // cards with ≥2 contribution marks, as arrays of global mark indices
      return Array.from(byCard.values()).filter((a) => a.length >= 2);
    })) as number[][];

    expect(grouped.length, 'need a card with ≥2 contributions').toBeGreaterThan(0);

    // Settled focus-window state. #6 is about SPECIFICITY (a specific hovered
    // span drives the scroll), so it asserts line-alignment + that a passage is
    // shown — the target-span no-half-peek guarantee is #4's job. (At Level 2 the
    // card's OTHER, dimmed spans are still painted and may sit at an edge, so a
    // global no-straddle check would wrongly fail here.)
    const state = () =>
      focus.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const lineH = 1.5 * (parseFloat(getComputedStyle(el).fontSize) || 16);
        const painted = (Array.from(el.querySelectorAll('mark[data-fs]')) as HTMLElement[]).filter(
          (m) => m.style.backgroundColor
        );
        const anyIn = painted.some((m) => {
          const r = m.getBoundingClientRect();
          return r.height > 0 && r.top >= box.top - 1.5 && r.bottom <= box.bottom + 1.5;
        });
        return {
          scrollTop: Math.round(el.scrollTop),
          lineAligned: Math.abs(el.scrollTop / lineH - Math.round(el.scrollTop / lineH)) < 0.06,
          anyIn,
        };
      });

    const settledScrollTop = async (globalMarkIdx: number) => {
      // reset, then drive card + specific-mark (Level-2) hover synchronously
      await page.evaluate((i: number) => (window as any).__hl.leave(i), globalMarkIdx);
      await page.waitForTimeout(250);
      await page.evaluate((i: number) => (window as any).__hl.enter(i, true), globalMarkIdx);
      // Wait for the smooth scroll to STABILIZE: two consecutive equal reads that
      // are line-aligned with a passage shown. Requiring stability rules out
      // sampling the pre-scroll (old) position, which was the flake.
      let prev: number | null = null;
      for (let t = 0; t < 30; t++) {
        await page.waitForTimeout(200);
        const s = await state();
        if (s.lineAligned && s.anyIn && prev !== null && s.scrollTop === prev) return s.scrollTop;
        prev = s.scrollTop;
      }
      throw new Error(`mark ${globalMarkIdx}: focus window never stabilized`);
    };

    // For at least one card, two of its contributions must settle the focus post
    // at DIFFERENT line-aligned positions — proving the scroll follows the
    // SPECIFIC hovered span, not the card's largest passage (the reported bug).
    let proven = false;
    for (const markIdxs of grouped) {
      const tops = new Set<number>();
      for (const gi of markIdxs.slice(0, 4)) tops.add(await settledScrollTop(gi));
      if (tops.size >= 2) { proven = true; break; }
    }

    expect(
      proven,
      'two contributions on one card must scroll the focus post to different (line-aligned) spans'
    ).toBe(true);
  });
});
