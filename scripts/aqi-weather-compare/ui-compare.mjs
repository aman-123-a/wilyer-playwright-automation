import { chromium } from '@playwright/test';
import fs from 'fs';
import { OUT, OLD_WIDGET_HOST, NEW_WIDGET_HOST, stats, sleep } from './common.mjs';

const pairs = JSON.parse(fs.readFileSync(OUT + '/pairs.json', 'utf8'));
fs.mkdirSync(OUT + '/screenshots', { recursive: true });
const R = { startedAt: new Date().toISOString(), display: [], refresh: [], errors: [], network: [] };
const SIDES = [['old', OLD_WIDGET_HOST, p => p.oldId], ['new', NEW_WIDGET_HOST, p => p.newId]];
const firstCity = p => String((p.data.cities || p.data.city || [''])[0]);
const save = () => fs.writeFileSync(OUT + '/ui-results.json', JSON.stringify(R, null, 1));
const browser = await chromium.launch();

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const m = { reqs: [], failed: [], console: [], pageErrors: [] };
  page.on('request', r => { if (/widget\/readPublic\//.test(r.url())) m.reqs.push({ t: performance.now(), url: r.url() }); });
  page.on('response', r => {
    if (/widget\/readPublic\//.test(r.url())) {
      const q = m.reqs.find(x => x.url === r.url() && x.status === undefined);
      if (q) q.status = r.status();
    }
  });
  // request start -> body fully received, measured on the test side (Request.timing() returned -1 for these requests)
  page.on('requestfinished', r => {
    if (/widget\/readPublic\//.test(r.url())) {
      const q = m.reqs.find(x => x.url === r.url() && x.apiMs === undefined);
      if (q) q.apiMs = +(performance.now() - q.t).toFixed(1);
    }
  });
  page.on('requestfailed', r => m.failed.push(r.method() + ' ' + r.url().slice(0, 100) + ' ' + (r.failure()?.errorText || '')));
  page.on('console', c => { if (['error', 'warning'].includes(c.type())) m.console.push(c.type() + ': ' + c.text().slice(0, 160)); });
  page.on('pageerror', e => m.pageErrors.push(String(e).slice(0, 200)));
  return { ctx, page, m };
}
const dataVisible = (page, city, ms = 20000) =>
  page.waitForFunction(c => {
    const t = document.body.innerText.toLowerCase();
    return t.includes(c.toLowerCase().split(' ')[0]) && /[0-9]/.test(t);
  }, city, { timeout: ms, polling: 50 }).then(() => true).catch(() => false);
const bodyText = async page => (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

// ---- TC05 / TC08: widget display, load time, request counts over a 30s observation window
if (process.env.SKIP_DISPLAY) {
  // display phase already completed in an earlier run; its firstApi.apiMs was unusable (-1) so it is dropped, not reused
  const prev = JSON.parse(fs.readFileSync(OUT + '/ui-results.json', 'utf8'));
  R.display = prev.display.map(d => ({ ...d, firstApi: d.firstApi ? { status: d.firstApi.status, apiMs: null } : null }));
}
for (const p of process.env.SKIP_DISPLAY ? [] : pairs) {
  for (const [side, host, idf] of SIDES) {
    const { ctx, page, m } = await open();
    const url = `${host}/widget/${idf(p)}`;
    const t0 = performance.now();
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const vis = await dataVisible(page, firstCity(p));
    const tVis = vis ? +(performance.now() - t0).toFixed(0) : null;
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/screenshots/display-${p.key}-${side}.png` });
    const text = (await bodyText(page)).slice(0, 300);
    const reqAtLoad = m.reqs.length;
    await sleep(30000);
    R.display.push({ key: p.key, type: p.type, side, url, dataVisible: vis, timeToDataVisibleMs: tVis,
      firstApi: m.reqs[0] ? { status: m.reqs[0].status, apiMs: m.reqs[0].apiMs } : null,
      requestsAtLoad: reqAtLoad, requestsAfter30s: m.reqs.length, failed: m.failed,
      console: m.console.slice(0, 5), pageErrors: m.pageErrors, textSample: text });
    console.log('display', p.key, side, 'vis', vis, tVis, 'req', reqAtLoad, '->', m.reqs.length);
    await ctx.close();
  }
  save();
}

// ---- TC09: 10 reloads on one weather + one AQI widget, per side
for (const key of ['W-DEL', 'A-DEL']) {
  const p = pairs.find(x => x.key === key);
  for (const [side, host, idf] of SIDES) {
    const { ctx, page, m } = await open();
    const url = `${host}/widget/${idf(p)}`;
    const runs = [];
    for (let i = 0; i < 10; i++) {
      const before = m.reqs.length;
      const t0 = performance.now();
      await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      const vis = await dataVisible(page, firstCity(p), 20000);
      const ms = +(performance.now() - t0).toFixed(0);
      await sleep(1200);
      const mine = m.reqs.slice(before);
      runs.push({ vis, timeToDataMs: ms, requests: mine.length, status: mine[0]?.status, apiMs: mine[0]?.apiMs });
      await sleep(800);
    }
    R.refresh.push({ key, side, runs,
      apiStats: stats(runs.filter(r => r.apiMs && r.status === 200).map(r => r.apiMs)),
      dataStats: stats(runs.filter(r => r.vis).map(r => r.timeToDataMs)),
      failed: runs.filter(r => !r.vis || r.status !== 200).length,
      dupRequests: runs.filter(r => r.requests > 1).length });
    console.log('refresh', key, side, JSON.stringify(R.refresh.at(-1).apiStats));
    await ctx.close();
  }
}
save();

// ---- TC06: error handling (W-DEL + A-DEL, both sides), responses mocked at the browser
const json = (status, body) => r => r.fulfill({ status, contentType: 'application/json', body });
const SCEN = [
  ['400', json(400, '{"message":"Bad request"}')], ['401', json(401, '{"message":"Unauthorized"}')],
  ['403', json(403, '{"message":"Forbidden"}')], ['404', json(404, '{"message":"Not found"}')],
  ['408', r => r.fulfill({ status: 408, body: '' })], ['429', json(429, '{"message":"Too many"}')],
  ['500', json(500, '{"message":"err"}')], ['502', r => r.fulfill({ status: 502, body: 'Bad Gateway' })],
  ['503', r => r.fulfill({ status: 503, body: 'Service Unavailable' })],
  ['network-abort', r => r.abort('failed')], ['hang-timeout', () => {}],
  ['empty-200', json(200, '')], ['empty-json', json(200, '{}')], ['malformed-json', json(200, '{"weather":[{"city":')],
];
for (const key of ['W-DEL', 'A-DEL']) {
  const p = pairs.find(x => x.key === key);
  for (const [side, host, idf] of SIDES) {
    for (const [name, h] of SCEN) {
      const { ctx, page, m } = await open();
      await page.route(/widget\/readPublic\//, h);
      await page.goto(`${host}/widget/${idf(p)}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(name.startsWith('hang') ? 12000 : 6000);
      const text = await bodyText(page);
      const spinner = await page.locator('[class*=load],[class*=spin],[role=progressbar]').count().catch(() => 0);
      const shot = `${OUT}/screenshots/err-${key}-${side}-${name.replace(/[^a-z0-9]+/gi, '_')}.png`;
      await page.screenshot({ path: shot });
      R.errors.push({ key, side, scenario: name, visibleText: text.slice(0, 160), blank: text.length === 0,
        spinnerEls: spinner, requests: m.reqs.length, pageErrors: m.pageErrors,
        consoleErrors: m.console.filter(c => c.startsWith('error')).slice(0, 3), screenshot: shot });
      await ctx.close();
    }
    console.log('errors done', key, side);
    save();
  }
}

// ---- TC10: network conditions (W-DEL + A-DEL)
const COND = {
  normal: null,
  slow: { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 20 * 1024 },
  highLatency: { offline: false, latency: 2000, downloadThroughput: -1, uploadThroughput: -1 },
  offlineBeforeLoad: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
};
for (const key of ['W-DEL', 'A-DEL']) {
  const p = pairs.find(x => x.key === key);
  for (const [side, host, idf] of SIDES) {
    for (const [cn, c] of Object.entries(COND)) {
      const { ctx, page, m } = await open();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      if (c) await cdp.send('Network.emulateNetworkConditions', c);
      const t0 = performance.now();
      await page.goto(`${host}/widget/${idf(p)}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      const vis = await dataVisible(page, firstCity(p), cn === 'offlineBeforeLoad' ? 5000 : 40000);
      const ms = +(performance.now() - t0).toFixed(0);
      const text = (await bodyText(page)).slice(0, 120);
      await page.screenshot({ path: `${OUT}/screenshots/net-${key}-${side}-${cn}.png` });
      R.network.push({ key, side, condition: cn, dataVisible: vis, timeMs: ms, textSample: text, pageErrors: m.pageErrors });
      console.log('net', key, side, cn, vis, ms);
      await ctx.close();
    }
    // offline AFTER load, then reconnect + reload => recovery time
    const { ctx, page, m } = await open();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await page.goto(`${host}/widget/${idf(p)}`, { waitUntil: 'domcontentloaded' });
    const ok = await dataVisible(page, firstCity(p));
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await sleep(8000);
    const still = await dataVisible(page, firstCity(p), 500);
    await page.screenshot({ path: `${OUT}/screenshots/net-${key}-${side}-offline-after-load.png` });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const t1 = performance.now();
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    const rec = await dataVisible(page, firstCity(p), 30000);
    R.network.push({ key, side, condition: 'offline-after-load, reconnect, reload', loadedBeforeOffline: ok,
      stillShownWhileOffline: still, recovered: rec, recoveryMs: rec ? +(performance.now() - t1).toFixed(0) : null, pageErrors: m.pageErrors });
    await ctx.close();
    save();
  }
}
R.finishedAt = new Date().toISOString();
save();
await browser.close();
console.log('UI DONE');
