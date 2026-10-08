// Re-run of the 3-minute readPublic request count on the NEW host using two EXISTING widgets (read-only viewing; nothing created/changed).
// (The first run used the QA_CMP mirrors, which had already been deleted, so its new-side numbers were invalid.)
import { chromium } from '@playwright/test';
import fs from 'fs';
import { OUT, NEW_WIDGET_HOST, sleep } from './common.mjs';
const targets = [['aqi', '6abe3cfa36f9ebeed640c15b'], ['weather', '6abe3cac36f9ebeed640c138']];
const browser = await chromium.launch();
const out = await Promise.all(targets.map(async ([type, id]) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(); const t = []; const st = []; const t0 = performance.now();
  page.on('request', r => { if (/widget\/readPublic\//.test(r.url())) t.push(+((performance.now() - t0) / 1000).toFixed(1)); });
  page.on('response', r => { if (/widget\/readPublic\//.test(r.url())) st.push(r.status()); });
  await page.goto(`${NEW_WIDGET_HOST}/widget/${id}`, { waitUntil: 'domcontentloaded' });
  await sleep(180000);
  await ctx.close();
  return { side: 'new', widget: type, windowSeconds: 180, requests: t.length, atSeconds: t, statuses: [...new Set(st)], widgetId: id, note: 'existing widget, read-only' };
}));
const f = OUT + '/extra-results.json'; const R = JSON.parse(fs.readFileSync(f, 'utf8'));
R.requestCountInvalidFirstRunNew = R.requestCount.filter(x => x.side === 'new');
R.requestCount = [...R.requestCount.filter(x => x.side === 'old'), ...out];
fs.writeFileSync(f, JSON.stringify(R, null, 1));
console.log(JSON.stringify(out.map(o => ({ w: o.widget, n: o.requests, st: o.statuses, at: o.atSeconds.join(',') }))));
await browser.close();
