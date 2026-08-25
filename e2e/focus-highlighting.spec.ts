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
      enterPost: (postId) => { const paper = aside.querySelector('[data-post-id="' + postId + '"]'); if (!paper) return false; const props = findProps(paper); const ev = mkEvt(paper); if (props && props.onMouseEnter) props.onMouseEnter(ev); if (props && props.onMouseMove) props.onMouseMove(ev); return !!props; },
      enterContribution: (i, bandIdx) => { const c = window.__hl.cardFor(i); if (c.cp && c.cp.onMouseEnter) c.cp.onMouseEnter(mkEvt(c.div)); if (!c.mp) return false; const rects = Array.from(c.mark.getClientRects()); const r = rects[0] || c.mark.getBoundingClientRect(); const bands = Number(c.mark.dataset.overlapBands || 1); const band = Math.max(0, Math.min(bands - 1, bandIdx == null ? 0 : bandIdx)); const ev = { currentTarget: c.mark, target: c.mark, relatedTarget: document.body, clientX: r.left + 2, clientY: r.top + r.height * ((band + 0.5) / bands), pointerType: 'mouse', preventDefault(){}, stopPropagation(){}, nativeEvent: {} }; if (c.mp.onMouseEnter) c.mp.onMouseEnter(ev); if (c.mp.onMouseMove) c.mp.onMouseMove(ev); if (c.mp.onPointerMove) c.mp.onPointerMove(ev); return true; },
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

  test('direct-hover bucket survives the retained related-card reading anchor', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const focus = page.locator('[data-testid="focus-reveal"]');
    await expect(focus).toBeVisible();
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    await page.evaluate(DRIVER);

    // A related-card leave intentionally retains its focus-post reading anchor.
    // Reproduce that retained store state without keeping the physical pointer
    // over the card, then move the real pointer into a visible focus mark.
    await page.evaluate(() => (window as any).__hl.enter(0, false));
    await page.waitForTimeout(700);
    const point = await focus.evaluate((el) => {
      const box = el.getBoundingClientRect();
      for (const mark of Array.from(el.querySelectorAll('mark[data-fs]'))) {
        for (const rect of Array.from(mark.getClientRects())) {
          if (rect.width > 2 && rect.height > 2 && rect.top >= box.top && rect.bottom <= box.bottom) {
            return { x: rect.left + Math.min(20, rect.width / 2), y: rect.top + rect.height / 2 };
          }
        }
      }
      throw new Error('No fully visible focus mark found');
    });
    await page.mouse.move(point.x, point.y);

    // Publishing focusHoverRanges after 90 ms re-renders both panes. The old
    // regression let the retained card colour win that commit and lost every
    // fp-dark class. Assert after that handoff has comfortably completed.
    await page.waitForTimeout(300);
    await expect(focus).toHaveClass(/fp-hovering/);
    const darkMarks = focus.locator('mark.fp-dark');
    expect(await darkMarks.count()).toBeGreaterThan(0);
    const colors = await darkMarks.evaluateAll((marks) => marks.map((m) => getComputedStyle(m).backgroundColor));
    expect(new Set(colors)).toEqual(new Set([DARK]));
  });

  test('overlapping focus segments recompute their semantic hover bucket', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const focus = page.locator('[data-testid="focus-reveal"]');
    await expect(focus).toBeVisible();
    await expect(page.locator('[data-related-card]').first()).toBeVisible();

    // Segment 183–199's union reaches the opening segment, but the opening
    // segment belongs to a smaller bucket. Moving there must shrink the union
    // even though that next segment is already painted dark.
    const points = await focus.evaluate((el) => [5, 0].map((index) => {
      const mark = el.querySelectorAll('mark[data-fs]')[index] as HTMLElement;
      const rect = Array.from(mark.getClientRects()).find((r) => r.width > 4 && r.height > 4);
      if (!rect) throw new Error(`No visible rectangle for focus segment ${index}`);
      return {
        index,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        ids: mark.dataset.rangeIds,
      };
    }));
    expect(points[0].ids).not.toBe(points[1].ids);

    const bucketState = (hoveredIndex: number) => focus.evaluate((el, index) => {
      const marks = Array.from(el.querySelectorAll('mark[data-fs]')) as HTMLElement[];
      const hoveredIds = new Set((marks[index].dataset.rangeIds ?? '').split(/\s+/).filter(Boolean));
      const expected = marks.flatMap((mark, markIndex) => {
        const intersects = (mark.dataset.rangeIds ?? '')
          .split(/\s+/)
          .some((id) => hoveredIds.has(id));
        return intersects ? [markIndex] : [];
      });
      const actual = marks.flatMap((mark, markIndex) => mark.classList.contains('fp-dark') ? [markIndex] : []);
      return {
        expected,
        actual,
        darkColors: actual.map((markIndex) => getComputedStyle(marks[markIndex]).backgroundColor),
        faintColors: marks
          .filter((_, markIndex) => !actual.includes(markIndex))
          .map((mark) => getComputedStyle(mark).backgroundColor),
      };
    }, hoveredIndex);

    await page.mouse.move(points[0].x, points[0].y);
    await page.waitForTimeout(220);
    const firstBucket = await bucketState(points[0].index);
    expect(firstBucket.actual).toEqual(firstBucket.expected);
    expect(new Set(firstBucket.darkColors)).toEqual(new Set([DARK]));
    expect(new Set(firstBucket.faintColors)).toEqual(new Set(['rgb(236, 238, 241)']));
    expect(firstBucket.expected).toContain(points[1].index);

    // Before the fix, `classList.contains('fp-dark')` returned early here and
    // left the larger first bucket active.
    await page.mouse.move(points[1].x, points[1].y);
    await page.waitForTimeout(220);
    const secondBucket = await bucketState(points[1].index);
    expect(secondBucket.actual).toEqual(secondBucket.expected);
    expect(secondBucket.actual.length).toBeLessThan(firstBucket.actual.length);
    expect(new Set(secondBucket.darkColors)).toEqual(new Set([DARK]));
    expect(new Set(secondBucket.faintColors)).toEqual(new Set(['rgb(236, 238, 241)']));
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

  test('#4 card hover scrolls the fixed-size post to a whole passage and preserves it on leave', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const focus = page.locator('[data-testid="focus-reveal"]');
    await expect(focus).toBeVisible();
    await expect(page.getByText('Read more').first()).toBeVisible();

    const count = (await page.evaluate(DRIVER)) as number;
    const baselineH = await focus.evaluate((el) => Math.round(el.getBoundingClientRect().height));

    // A card can relate to several passages that cannot all fit in one fixed
    // window. At least one target passage is shown, and EVERY rendered text
    // fragment—not just highlighted marks—is either fully inside or fully outside
    // the focus window. This catches the one-pixel slivers that the old synthetic
    // line-height grid permitted.
    const spanState = () =>
      focus.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const painted = (Array.from(el.querySelectorAll('mark[data-fs]')) as HTMLElement[]).filter(
          (m) => m.style.backgroundColor
        );
        let anyTargetLineFullyIn = false;
        for (const m of painted) {
          const range = document.createRange();
          range.selectNodeContents(m);
          if (Array.from(range.getClientRects()).some((rect) =>
            rect.width > 0.25 && rect.top >= box.top - 0.5 && rect.bottom <= box.bottom + 0.5
          )) anyTargetLineFullyIn = true;
          range.detach();
        }
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const visibleTextRects: DOMRect[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if ((node.parentElement as HTMLElement | null)?.closest('.focus-window-prefix')) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          visibleTextRects.push(...Array.from(range.getClientRects()).filter(
            (rect) => rect.width > 0.25 && rect.bottom > box.top + 0.5 && rect.top < box.bottom - 0.5,
          ));
          range.detach();
        }
        const partialTextLines = visibleTextRects.filter((rect) =>
          (rect.top < box.top - 0.5 && rect.bottom > box.top + 0.5)
          || (rect.top < box.bottom - 0.5 && rect.bottom > box.bottom + 0.5)
        ).length;
        return {
          h: Math.round(box.height),
          scrollTop: Math.round(el.scrollTop),
          painted: painted.length,
          noPartialTextLines: partialTextLines === 0,
          shownCleanly: painted.length > 0 && anyTargetLineFullyIn,
        };
      });

    let anyScrolled = false;
    let lastHoverScroll = 0;
    for (let i = 0; i < Math.min(count, 10); i++) {
      await page.evaluate((idx: number) => (window as any).__hl.enter(idx, false), i);
      // The jump must land directly on a measured line boundary: no partially
      // visible text at either edge, highlighted or otherwise.
      await expect
        .poll(
          async () => {
            const s = await spanState();
            return s.shownCleanly && s.noPartialTextLines;
          },
          {
            timeout: 5000,
            message: `card ${i}: the focus excerpt must contain only complete text lines`,
          }
        )
        .toBe(true);
      const st = await spanState();
      // THE core contract: the box NEVER changes size on hover.
      expect(st.h, `card ${i}: focus post height must not change on hover`).toBeGreaterThanOrEqual(baselineH - 2);
      expect(st.h, `card ${i}: focus post height must not change on hover`).toBeLessThanOrEqual(baselineH + 2);
      if (st.scrollTop > 0) anyScrolled = true;
      lastHoverScroll = st.scrollTop;
      await page.evaluate((idx: number) => (window as any).__hl.leave(idx), i);
      await page.waitForTimeout(200);
      await expect.poll(() => focus.evaluate((el) =>
        Array.from(el.querySelectorAll('mark[data-fs]'))
          .filter((mark) => (mark as HTMLElement).style.backgroundColor)
          .length
      )).toBe(0);
    }

    // At least one card's span sits below the fold, so internal scrolling must
    // have engaged somewhere — otherwise the mechanism is dead, not just idle.
    expect(anyScrolled, 'internal scroll-to-span should engage for below-fold spans').toBe(true);

    // Manual Read-more stays available and independent throughout.
    await expect(page.getByText('Read more').first()).toBeVisible();

    // Leaving a related span preserves reading position. Moving to another
    // span in the loop above is what intentionally changes the scroll target.
    await expect
      .poll(async () => (await spanState()).scrollTop, { timeout: 8000 })
      .toBe(lastHoverScroll);
    const finalH = await focus.evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(finalH).toBe(baselineH);
  });

  test('two related cards for the same focus passage do not reposition it', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const focus = page.locator('[data-testid="focus-reveal"]');
    const first = page.locator('[data-post-id="143203013"]');
    const second = page.locator('[data-post-id="143198536"]');
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    await page.evaluate(DRIVER);

    await page.evaluate(() => (window as any).__hl.enterPost('143203013'));
    await expect.poll(async () => Math.round(await focus.evaluate((el) => el.scrollTop))).toBeGreaterThan(0);
    await expect(page.locator('.focus-window-prefix')).toBeVisible();
    await expect(page.locator('[data-focus-window-offset="true"]')).toBeVisible();
    await page.waitForTimeout(500);
    const settledTop = Math.round(await focus.evaluate((el) => el.scrollTop));

    await focus.evaluate((element) => {
      const node = element as HTMLElement & { __originalScrollTo?: typeof element.scrollTo };
      node.__originalScrollTo ??= node.scrollTo.bind(node);
      (window as any).__focusRepeatScrollCalls = 0;
      node.scrollTo = ((...args: Parameters<typeof element.scrollTo>) => {
        (window as any).__focusRepeatScrollCalls += 1;
        return node.__originalScrollTo!(...args);
      }) as typeof element.scrollTo;
    });

    // Both posts cite focus offsets 889–992. Crossing between them should only
    // change the related-card emphasis; the focus passage is already correct.
    await page.evaluate(() => (window as any).__hl.enterPost('143198536'));
    await page.waitForTimeout(500);
    expect(Math.round(await focus.evaluate((el) => el.scrollTop))).toBe(settledTop);
    expect(await page.evaluate(() => (window as any).__focusRepeatScrollCalls)).toBe(0);

    // The continuation marker belongs inside the text measure, behaves as a
    // real control, and never covers the first visible line.
    const beginning = page.getByRole('button', { name: 'Show beginning of post' });
    await expect(beginning).toBeVisible();
    const continuationGeometry = await page.evaluate(() => {
      const focusEl = document.querySelector('[data-testid="focus-reveal"]') as HTMLElement;
      const control = document.querySelector('.focus-window-prefix') as HTMLElement;
      const focusRect = focusEl.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();
      const walker = document.createTreeWalker(focusEl, NodeFilter.SHOW_TEXT);
      const visibleTextRects: DOMRect[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if ((node.parentElement as HTMLElement | null)?.closest('.focus-window-prefix')) continue;
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        visibleTextRects.push(...Array.from(range.getClientRects()).filter(
          (rect) => rect.bottom > focusRect.top && rect.top < focusRect.bottom,
        ));
      }
      const overlapsText = visibleTextRects.some((rect) =>
        Math.min(rect.right, controlRect.right) - Math.max(rect.left, controlRect.left) > 1
        && Math.min(rect.bottom, controlRect.bottom) - Math.max(rect.top, controlRect.top) > 1,
      );
      const lineStarts: Array<{ top: number; left: number }> = [];
      visibleTextRects
        .slice()
        .sort((a, b) => a.top - b.top || a.left - b.left)
        .forEach((rect) => {
          const line = lineStarts.find((candidate) => Math.abs(candidate.top - rect.top) < 2);
          if (line) line.left = Math.min(line.left, rect.left);
          else lineStarts.push({ top: rect.top, left: rect.left });
        });
      const firstLine = lineStarts[0];
      const firstLineRects = visibleTextRects.filter((rect) => Math.abs(rect.top - firstLine.top) < 2);
      const firstLineBottom = Math.max(...firstLineRects.map((rect) => rect.bottom));
      const followingLine = lineStarts.find((line) => line.top > firstLine.top + 4);
      const hit = document.elementFromPoint(
        controlRect.left + controlRect.width / 2,
        controlRect.top + controlRect.height / 2,
      );
      return {
        inside:
          controlRect.left >= focusRect.left - 0.5
          && controlRect.right <= focusRect.right + 0.5
          && controlRect.top >= focusRect.top - 0.5
          && controlRect.bottom <= focusRect.bottom + 0.5,
        overlapsText,
        markerIsOnFirstLine:
          controlRect.bottom >= firstLine.top
          && controlRect.top <= firstLineBottom
          && Math.abs(
            (controlRect.top + controlRect.bottom) / 2 - (firstLine.top + firstLineBottom) / 2
          ) <= 2.5,
        markerPrecedesFirstText: firstLine.left >= controlRect.right - 1.5,
        firstLineFullyVisible:
          firstLine.top >= focusRect.top - 0.5
          && firstLineBottom <= focusRect.bottom + 0.5,
        followingLineRestoresEdge: !!followingLine && followingLine.left <= focusRect.left + 1.5,
        hitTarget: hit === control || control.contains(hit),
        width: controlRect.width,
        height: controlRect.height,
      };
    });
    expect(continuationGeometry.inside).toBe(true);
    expect(continuationGeometry.overlapsText).toBe(false);
    expect(continuationGeometry.markerIsOnFirstLine).toBe(true);
    expect(continuationGeometry.markerPrecedesFirstText).toBe(true);
    expect(continuationGeometry.firstLineFullyVisible).toBe(true);
    expect(continuationGeometry.followingLineRestoresEdge).toBe(true);
    expect(continuationGeometry.hitTarget).toBe(true);
    expect(continuationGeometry.width).toBeGreaterThanOrEqual(14);
    expect(continuationGeometry.height).toBeGreaterThanOrEqual(24);

    const detailUrl = page.url();
    await beginning.click();
    await expect.poll(async () => Math.round(await focus.evaluate((el) => el.scrollTop))).toBe(0);
    await expect(page.locator('[data-focus-window-offset="false"]')).toBeVisible();
    await expect(beginning).toHaveCount(0);
    expect(page.url()).toBe(detailUrl);

    // The click suppresses only that reading anchor. A genuinely new related
    // hover can establish an automatic passage again.
    await page.evaluate(() => (window as any).__hl.enterPost('143203013'));
    await expect.poll(async () => Math.round(await focus.evaluate((el) => el.scrollTop))).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Show beginning of post' })).toBeVisible();
  });

  test('narrower panes also reveal only complete focus lines', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto(DETAIL_URL);
    const focus = page.locator('[data-testid="focus-reveal"]');
    await expect(focus).toBeVisible();
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    await page.evaluate(DRIVER);
    await page.evaluate(() => (window as any).__hl.enterPost('143203013'));
    await expect(page.getByRole('button', { name: 'Show beginning of post' })).toBeVisible();

    await expect.poll(() => focus.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let partialLines = 0;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if ((node.parentElement as HTMLElement | null)?.closest('.focus-window-prefix')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        partialLines += Array.from(range.getClientRects()).filter((rect) =>
          rect.width > 0.25
          && (
            (rect.top < box.top - 0.5 && rect.bottom > box.top + 0.5)
            || (rect.top < box.bottom - 0.5 && rect.bottom > box.bottom + 0.5)
          )
        ).length;
        range.detach();
      }
      const prefix = el.querySelector('.focus-window-prefix')?.getBoundingClientRect();
      return partialLines === 0
        && !!prefix
        && prefix.top >= box.top - 0.5
        && prefix.bottom <= box.bottom + 0.5;
    })).toBe(true);
  });

  test('scrolling the related panel preserves the exact focus reading anchor', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const focus = page.locator('[data-testid="focus-reveal"]');
    const aside = page.getByTestId('col-aside');
    await expect(focus).toBeVisible();
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    await page.evaluate(DRIVER);

    // Drive a specific contribution (not merely its card) so the retained state
    // includes the exact related-span index the user was reading.
    const contributionIndex = await page.evaluate(() => {
      const asideEl = document.querySelector('aside') || document.querySelector('[class*="aside" i]');
      const paper = asideEl?.querySelector('[data-post-id="143203013"]');
      const card = paper?.closest('[data-related-card]');
      return Array.from(asideEl?.querySelectorAll('mark') ?? []).findIndex((mark) => card?.contains(mark));
    });
    expect(contributionIndex).toBeGreaterThanOrEqual(0);
    await page.evaluate((index) => (window as any).__hl.enterContribution(index, 0), contributionIndex);
    await expect.poll(async () => Math.round(await focus.evaluate((el) => el.scrollTop))).toBeGreaterThan(0);
    await page.waitForTimeout(700);
    const readFocusState = () => focus.evaluate((el) => ({
      scrollTop: Math.round(el.scrollTop),
      height: Math.round(el.getBoundingClientRect().height),
      paintedRanges: Array.from(el.querySelectorAll('mark[data-fs]'))
        .filter((mark) => (mark as HTMLElement).style.backgroundColor)
        .map((mark) => ({
          from: mark.getAttribute('data-fs'),
          to: mark.getAttribute('data-fe'),
          color: getComputedStyle(mark).backgroundColor,
        })),
    }));
    const anchoredState = await readFocusState();
    expect(anchoredState.paintedRanges.length).toBeGreaterThan(0);
    const asideTopBeforeScroll = Math.round(await aside.evaluate((el) => el.scrollTop));

    // Scrolling the right pane dismisses temporary card dimming AND focus colour,
    // but must not clear/recompute the retained range's reading position.
    await aside.evaluate((element) => element.scrollTo({
      top: Math.min(element.scrollHeight - element.clientHeight, element.scrollTop + 420),
      behavior: 'instant',
    }));
    await expect.poll(async () => Math.round(await aside.evaluate((el) => el.scrollTop)))
      .toBeGreaterThan(asideTopBeforeScroll);
    await page.waitForTimeout(350);
    const afterPanelScroll = await readFocusState();
    expect(afterPanelScroll.scrollTop).toBe(anchoredState.scrollTop);
    expect(afterPanelScroll.height).toBe(anchoredState.height);
    expect(afterPanelScroll.paintedRanges).toEqual([]);
    const cardOpacities = await page.locator('[data-related-card]').evaluateAll(
      (cards) => cards.map((card) => getComputedStyle(card).opacity),
    );
    expect(new Set(cardOpacities)).toEqual(new Set(['1']));
    await expect(page.getByRole('button', { name: 'Show beginning of post' })).toBeVisible();

    // A genuinely new related-post hover is allowed to choose its own passage.
    await page.evaluate(() => (window as any).__hl.enterPost('149294261'));
    await expect.poll(async () => Math.round(await focus.evaluate((el) => el.scrollTop)))
      .not.toBe(anchoredState.scrollTop);
    await expect.poll(() => focus.evaluate((el) =>
      Array.from(el.querySelectorAll('mark[data-fs]'))
        .filter((mark) => (mark as HTMLElement).style.backgroundColor)
        .length
    )).toBeGreaterThan(0);
  });

  test('#5 related-card span click groups the panel (anchor) — distinct from the focus-post filter', async ({ page }) => {
    await page.goto(DETAIL_URL);
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    await page.evaluate(DRIVER);

    // The two span clicks must do DIFFERENT things:
    //   - related-card span  → toggle a TOPIC ANCHOR (panel groups; the active
    //     anchor card shows the inline grouping indicator, data-testid
    //     "active-group-anchor" — the "Grouped by:" pill was removed in T4)
    //   - focus-post span     → apply the overlap FILTER (clicked span turns dark)
    // The regression collapsed both onto the focus-post filter.
    const groupIndicator = page.getByTestId('active-group-anchor');
    await expect(groupIndicator).toHaveCount(0);

    // Related-card span click → panel groups (inline grouping indicator appears).
    await page.evaluate(() => (window as any).__hl.clickCardSpan(0));
    await expect(groupIndicator.first()).toBeVisible();

    // Clicking the same span again toggles the grouping off.
    await page.evaluate(() => (window as any).__hl.clickCardSpan(0));
    await expect(groupIndicator).toHaveCount(0);

    // The focus-post span click is the OTHER mechanism: it must NOT group, and it
    // turns the clicked span dark (the filter).
    await page.locator(focusMarks).first().click();
    await expect(groupIndicator).toHaveCount(0);
    await expect
      .poll(async () => page.locator(focusMarks).first().evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(DARK);
  });

  test('#6 Level-2: hovering a specific contribution targets a stable complete-line passage', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const focus = page.locator('[data-testid="focus-reveal"]');
    await expect(focus).toBeVisible();
    await expect(page.locator('[data-related-card]').first()).toBeVisible();

    // Collapsed cards intentionally show only the relationship window nearest
    // the current reading section. Expand one card so both of its distinct
    // contributions are available as explicit Level-2 hover targets.
    const expandable = page.locator('[data-related-card]').filter({
      has: page.getByRole('button', { name: 'Read more' }),
    }).first();
    const expandableId = await expandable.locator('[data-post-id]').getAttribute('data-post-id');
    expect(expandableId).toBeTruthy();
    const stableExpandable = page.locator(`[data-related-card] [data-post-id="${expandableId}"]`).locator('..');
    await stableExpandable.getByRole('button', { name: 'Read more' }).click();
    await expect(stableExpandable.getByRole('button', { name: 'See less' })).toBeVisible();
    await page.evaluate(DRIVER);

    // Map the aside's contribution targets (same mark order __hl.cardFor uses)
    // to their owning card, so we can drive TWO contributions on the SAME card
    // and prove the focus post follows the specific hovered span. Coincident
    // contributions intentionally render as bands inside one striped mark, so a
    // target is a mark index plus an optional band index. Deterministic: no
    // cursor hovering.
    const grouped = (await page.evaluate(() => {
      const aside = document.querySelector('aside') || document.querySelector('[class*="aside" i]');
      const marks = Array.from(aside!.querySelectorAll('mark'));
      const byCard = new Map<Element, Array<{ markIdx: number; bandIdx: number | null }>>();
      marks.forEach((m, i) => {
        const card = m.closest('[data-related-card]');
        if (!card) return;
        const arr = byCard.get(card) ?? [];
        const bands = Number((m as HTMLElement).dataset.overlapBands || 1);
        if (bands > 1) {
          for (let bandIdx = 0; bandIdx < bands; bandIdx++) arr.push({ markIdx: i, bandIdx });
        } else {
          arr.push({ markIdx: i, bandIdx: null });
        }
        byCard.set(card, arr);
      });
      // Cards with ≥2 contributions, including striped bands that share a mark.
      return Array.from(byCard.values()).filter((a) => a.length >= 2);
    })) as Array<Array<{ markIdx: number; bandIdx: number | null }>>;

    expect(grouped.length, 'need a card with ≥2 contributions').toBeGreaterThan(0);

    // Settled focus-window state. A specific hovered contribution drives the
    // target, and the complete-line rule applies to all text even when other
    // dimmed relation spans remain painted.
    const state = () =>
      focus.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const painted = (Array.from(el.querySelectorAll('mark[data-fs]')) as HTMLElement[]).filter(
          (m) => m.style.backgroundColor
        );
        const anyIn = painted.some((m) => {
          const range = document.createRange();
          range.selectNodeContents(m);
          const result = Array.from(range.getClientRects()).some((rect) =>
            rect.width > 0.25 && rect.top >= box.top - 0.5 && rect.bottom <= box.bottom + 0.5
          );
          range.detach();
          return result;
        });
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let partialTextLines = 0;
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if ((node.parentElement as HTMLElement | null)?.closest('.focus-window-prefix')) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          partialTextLines += Array.from(range.getClientRects()).filter((rect) =>
            rect.width > 0.25
            && (
              (rect.top < box.top - 0.5 && rect.bottom > box.top + 0.5)
              || (rect.top < box.bottom - 0.5 && rect.bottom > box.bottom + 0.5)
            )
          ).length;
          range.detach();
        }
        return {
          scrollTop: Math.round(el.scrollTop),
          noPartialTextLines: partialTextLines === 0,
          anyIn,
        };
      });

    const settledScrollTop = async (target: { markIdx: number; bandIdx: number | null }) => {
      // reset, then drive card + specific-mark (Level-2) hover synchronously
      await page.evaluate((i: number) => (window as any).__hl.leave(i), target.markIdx);
      await page.waitForTimeout(250);
      await page.evaluate(
        ({ markIdx, bandIdx }) => (window as any).__hl.enterContribution(markIdx, bandIdx),
        target
      );
      // Level-2 selection is intentionally debounced. With semantic scroll
      // retention there is no longer a transient reset-to-top to keep this
      // helper from mistaking the previous stable position for the new target.
      await page.waitForTimeout(350);
      // Wait for the smooth scroll to STABILIZE: two consecutive equal reads that
      // contain complete lines with a passage shown. Requiring stability rules out
      // sampling the pre-scroll (old) position, which was the flake.
      let prev: number | null = null;
      for (let t = 0; t < 30; t++) {
        await page.waitForTimeout(200);
        const s = await state();
        if (s.noPartialTextLines && s.anyIn && prev !== null && s.scrollTop === prev) return s.scrollTop;
        prev = s.scrollTop;
      }
      throw new Error(`mark ${target.markIdx}, band ${target.bandIdx ?? 0}: focus window never stabilized`);
    };

    // Exercise several explicit contributions. Multiple distant contributions
    // can legitimately share the same maximum line-aligned scroll target when
    // the fixed window has reached the document end, so canonical stability is
    // the contract here; the same-target no-animation case is asserted above.
    const allTops = new Set<number>();
    let exercised = 0;
    for (const targets of grouped) {
      for (const target of targets.slice(0, 4)) {
        const top = await settledScrollTop(target);
        allTops.add(top);
        exercised += 1;
      }
      if (exercised >= 4) break;
    }

    expect(exercised).toBeGreaterThanOrEqual(2);
    expect(allTops.size, 'specific contributions should resolve to real canonical passages').toBeGreaterThanOrEqual(1);
  });
});
