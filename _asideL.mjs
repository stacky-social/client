import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:3000/ChineseEVs/posts/143195604', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const M = () => page.evaluate(() => {
  const a = document.querySelector('[data-testid="col-aside"]')?.getBoundingClientRect();
  const g = document.querySelector('[data-testid="content-group"]')?.getBoundingClientRect();
  const f = document.querySelector('[data-testid="feed"]')?.getBoundingClientRect();
  // first related card left edge (inside the aside)
  const card = document.querySelector('[data-testid="col-aside"] [data-related-card]')?.getBoundingClientRect();
  return { asideL: a?+a.left.toFixed(1):null, asideR: a?+a.right.toFixed(1):null,
           groupL: g?+g.left.toFixed(1):null, groupR: g?+g.right.toFixed(1):null,
           feedR: f?+f.right.toFixed(1):null, cardL: card?+card.left.toFixed(1):null };
});
console.log('UNGROUPED:', JSON.stringify(await M()));
const cards = await page.$$('[data-testid="col-aside"] [data-related-card]');
for (const c of cards) { const m = await c.$('mark'); if (!m) continue; await m.click().catch(()=>{}); await page.waitForTimeout(900);
  const gg = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="col-aside"] [data-related-card]')).filter(c=>parseFloat(getComputedStyle(c).borderLeftWidth)>=2).length);
  if (gg >= 2) break; await m.click().catch(()=>{}); await page.waitForTimeout(300); }
await page.waitForTimeout(600);
const a = await M();
console.log('GROUPED:  ', JSON.stringify(a));
console.log('aside LEFT moved:', 'measure both above (want asideL unchanged, asideR +)');
await browser.close();
