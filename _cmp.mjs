import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:3000/ChineseEVs/posts/143195604', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const M = () => page.evaluate(() => {
  const card = document.querySelector('[data-testid="col-aside"] [data-related-card]');
  const paper = card?.querySelector('[data-post-id]');           // white card body
  const cr = card?.getBoundingClientRect(), pr = paper?.getBoundingClientRect();
  return { cardOuterL: cr?+cr.left.toFixed(1):null, paperL: pr?+pr.left.toFixed(1):null, paperR: pr?+pr.right.toFixed(1):null };
});
console.log('UNGROUPED:', JSON.stringify(await M()));
// screenshot ungrouped aside (fixed clip)
const CLIP = { x: 1070, y: 220, width: 520, height: 420 };
await page.screenshot({ path: '_cmp_before.png', clip: CLIP });
// group
const cards = await page.$$('[data-testid="col-aside"] [data-related-card]');
for (const c of cards) { const m = await c.$('mark'); if (!m) continue; await m.click().catch(()=>{}); await page.waitForTimeout(900);
  const gg = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="col-aside"] [data-related-card]')).filter(c=>parseFloat(getComputedStyle(c).borderLeftWidth)>=2).length);
  if (gg >= 2) break; await m.click().catch(()=>{}); await page.waitForTimeout(300); }
await page.waitForTimeout(600);
console.log('GROUPED:  ', JSON.stringify(await M()));
await page.evaluate(() => { const a=document.querySelector('[data-testid="col-aside"]'); if(a) a.scrollTop=0; });
await page.waitForTimeout(300);
await page.screenshot({ path: '_cmp_after.png', clip: CLIP });
await browser.close();
