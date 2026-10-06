// Extra QA checks, old vs new widget pages. Responses are mocked in the browser (no data created anywhere, nothing written to either backend).
// 1 AQI boundaries + which field drives the status word   2 missing/null fields (AQI + weather)   3 XSS + long input   4 bundle secret scan   5 3-minute request count
import { chromium } from '@playwright/test';
import fs from 'fs';
import { OUT, OLD_WIDGET_HOST, NEW_WIDGET_HOST, sleep } from './common.mjs';

const S = OUT + '/samples/';
const SIDES = {
  old: { host: OLD_WIDGET_HOST, aqi: JSON.parse(fs.readFileSync(S + 'cmp-old-A-DEL.json', 'utf8')), weather: JSON.parse(fs.readFileSync(S + 'cmp-old-W-DEL.json', 'utf8')), id: { aqi: '66364047c2a9e090b94bec49', weather: '6458ede82a3e6572987ac131' } },
  new: { host: NEW_WIDGET_HOST, aqi: JSON.parse(fs.readFileSync(S + 'cmp-new-A-DEL.json', 'utf8')), weather: JSON.parse(fs.readFileSync(S + 'cmp-new-W-DEL.json', 'utf8')), id: { aqi: '6abe4633f5746abddbb33d63', weather: '6abe4630f5746abddbb33d54' } },
};
const R = { startedAt: new Date().toISOString(), aqiBoundary: [], missing: [], xss: [], secrets: [], requestCount: [] };
const save = () => fs.writeFileSync(OUT + '/extra-results.json', JSON.stringify(R, null, 1));
const browser = await chromium.launch();
const clone = o => JSON.parse(JSON.stringify(o));
const LABELS = /(Good|Satisfactory|Moderate|Watch Level|Unhealthy for Sensitive[A-Za-z ]*|Very Unhealthy|Unhealthy|Hazardous|Very Poor|Poor|Severe)/i;

async function render(side, type, payload, waitMs = 3500) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.route(/widget\/readPublic\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }));
  await page.goto(`${SIDES[side].host}/widget/${SIDES[side].id[type]}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(waitMs);
  const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  const xss = await page.evaluate(() => window.__xss === 1).catch(() => false);
  return { ctx, page, text, errs, xss };
}
const single = (side, mut) => { const p = clone(SIDES[side].aqi); p.aqiData = [p.aqiData[0]]; p.data.cities = [p.data.cities[0]]; p.data.coordinates = [p.data.coordinates[0]]; mut(p.aqiData[0]); return p; };

// ---- 1. AQI boundaries: vary overall `aqi` alone (pm25 held at 50), then `pm25` alone (aqi held at 50)
const BOUND = [0, 1, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301, 500, 501, 999.5, 75.5];
for (const side of ['old', 'new']) {
  for (const field of ['aqi', 'pm25']) {
    for (const v of BOUND) {
      const p = single(side, e => { e.aqi = 50; e.iaqi.pm25 = { v: 50 }; if (field === 'aqi') e.aqi = v; else e.iaqi.pm25 = { v }; });
      const { ctx, text, errs } = await render(side, 'aqi', p);
      R.aqiBoundary.push({ side, varied: field, value: v, label: (text.match(LABELS) || [''])[0], blank: text.length === 0, jsErrors: errs.length, text: text.slice(0, 110) });
      await ctx.close();
    }
    console.log('boundary', side, field);
  }
}
save();

// ---- 2. missing / null fields
const AQI_CASES = [
  ['aqi=null', e => { e.aqi = null; }], ['aqi missing', e => { delete e.aqi; }], ['aqi="abc"', e => { e.aqi = 'abc'; }], ['aqi=-1', e => { e.aqi = -1; }],
  ['pm25=null', e => { e.iaqi.pm25 = { v: null }; }], ['pm25 object missing', e => { delete e.iaqi.pm25; }], ['iaqi={}', e => { e.iaqi = {}; }], ['iaqi missing', e => { delete e.iaqi; }],
  ['city missing', e => { delete e.city; }], ['all pollutants 0', e => { for (const k of Object.keys(e.iaqi)) e.iaqi[k] = { v: 0 }; }],
];
const W_CASES = [
  ['temp=null', t => { t.todayData.main.temp = null; }], ['temp missing', t => { delete t.todayData.main.temp; }], ['humidity=null', t => { t.todayData.main.humidity = null; }],
  ['wind missing', t => { delete t.todayData.wind; }], ['wind.speed=null', t => { t.todayData.wind = { speed: null }; }], ['weather[] empty', t => { t.todayData.weather = []; }],
  ['weather.main missing', t => { t.todayData.weather = [{}]; }], ['condition unknown "Foo"', t => { t.todayData.weather = [{ main: 'Foo' }]; }], ['icon missing (n/a on new)', t => { if (t.todayData.weather[0]) delete t.todayData.weather[0].icon; }],
  ['forecast empty', t => { t.forecast = []; }], ['forecast missing', t => { delete t.forecast; }], ['temp=-50', t => { t.todayData.main.temp = -50; }], ['temp=60', t => { t.todayData.main.temp = 60; }], ['temp=32.456 decimal', t => { t.todayData.main.temp = 32.456; }],
  ['todayData missing', t => { delete t.todayData; }], ['city.name missing', t => { delete t.city.name; }],
];
for (const side of ['old', 'new']) {
  for (const [name, mut] of AQI_CASES) {
    const { ctx, page, text, errs } = await render(side, 'aqi', single(side, mut));
    R.missing.push({ side, widget: 'aqi', case: name, blank: text.length === 0, jsErrors: errs, text: text.slice(0, 130) });
    if (!text.length || errs.length) await page.screenshot({ path: `${OUT}/screenshots/missing-aqi-${side}-${name.replace(/[^a-z0-9]+/gi, '_')}.png` });
    await ctx.close();
  }
  for (const [name, mut] of W_CASES) {
    const p = clone(SIDES[side].weather); p.weather = [p.weather[0]]; p.data.city = [p.data.city[0]]; mut(p.weather[0]);
    const { ctx, page, text, errs } = await render(side, 'weather', p);
    R.missing.push({ side, widget: 'weather', case: name, blank: text.length === 0, jsErrors: errs, text: text.slice(0, 130) });
    if (!text.length || errs.length) await page.screenshot({ path: `${OUT}/screenshots/missing-weather-${side}-${name.replace(/[^a-z0-9]+/gi, '_')}.png` });
    await ctx.close();
  }
  console.log('missing', side);
}
save();

// ---- 3. XSS + very long input (city names in the API payload, as if typed into the location field)
const XSS = ['<img src=x onerror="window.__xss=1">', '"><script>window.__xss=1</script>', "';window.__xss=1;//", 'A'.repeat(5000)];
for (const side of ['old', 'new']) {
  for (const s of XSS) {
    const label = s.length > 100 ? 'long(5000 chars)' : s;
    const pa = single(side, e => { e.city = s; });
    const a = await render(side, 'aqi', pa);
    R.xss.push({ side, widget: 'aqi', payload: label, xssExecuted: a.xss, blank: a.text.length === 0, jsErrors: a.errs.length, rawTagVisibleAsText: /<img|<script/i.test(a.text) });
    await a.ctx.close();
    const pw = clone(SIDES[side].weather); pw.weather = [pw.weather[0]]; pw.weather[0].city.name = s; pw.data.city = [s];
    const w = await render(side, 'weather', pw);
    R.xss.push({ side, widget: 'weather', payload: label, xssExecuted: w.xss, blank: w.text.length === 0, jsErrors: w.errs.length, rawTagVisibleAsText: /<img|<script/i.test(w.text) });
    await w.ctx.close();
  }
  console.log('xss', side);
}
save();

// ---- 4. secrets: scan the shipped widget bundles for credential-like strings (values are NOT stored, only a redacted hint)
for (const side of ['old', 'new']) {
  const html = await (await fetch(SIDES[side].host + '/widget/' + SIDES[side].id.aqi)).text();
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
  for (const sp of scripts) {
    const url = sp.startsWith('http') ? sp : SIDES[side].host + (sp.startsWith('/') ? '' : '/') + sp;
    const js = await (await fetch(url)).text();
    const pats = { 'appid/apikey param': /[?&](appid|apikey|api_key|key|token)=[A-Za-z0-9_-]{16,}/gi, 'long hex (32+)': /["'][0-9a-f]{32,}["']/gi, 'Bearer literal': /Bearer\s+[A-Za-z0-9._-]{20,}/g, 'AIza (Google key)': /AIza[0-9A-Za-z_-]{30,}/g, 'sk-/pk- style': /["'](sk|pk)_(live|test)_[A-Za-z0-9]{10,}/g };
    for (const [n, re] of Object.entries(pats)) { const m = js.match(re) || []; R.secrets.push({ side, bundle: sp, pattern: n, hits: m.length, sampleRedacted: m.slice(0, 2).map(x => x.slice(0, 8) + '…[' + x.length + ' chars]') }); }
  }
  console.log('secrets', side);
}
// unauthenticated + unexpected-parameter behaviour of readPublic (read-only GETs)
const NEWAPI = 'https://v3-5api.pocsample.in', OLDAPI = 'https://v3-5api.wilyersignage.com';
for (const [side, base, id] of [['old', OLDAPI, SIDES.old.id.aqi], ['new', NEWAPI, '6abe3cfa36f9ebeed640c15b']]) {
  const r0 = await fetch(`${base}/v3/cms/widget/readPublic/${id}`);
  const r1 = await fetch(`${base}/v3/cms/widget/readPublic/${id}?lat=0&lng=0&city=zzz&foo=<script>&limit=-1`);
  const r2 = await fetch(`${base}/v3/cms/widget/readPublic/${id}`, { headers: { origin: 'https://evil.example' } });
  R.secrets.push({ side, check: 'readPublic unauthenticated', status: r0.status, unexpectedParamsStatus: r1.status, sameBodyWithUnexpectedParams: (await r0.text()) === (await r1.text()), corsAllowOrigin: r2.headers.get('access-control-allow-origin'), note: 'reachable without login (by design for players); CORS value shown as returned' });
}
save();

// ---- 5. request count over 3 minutes (AQI + weather, both sides in parallel)
const tasks = [];
for (const side of ['old', 'new']) for (const type of ['aqi', 'weather']) tasks.push((async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(); const t = []; const t0 = performance.now();
  page.on('request', r => { if (/widget\/readPublic\//.test(r.url())) t.push(+((performance.now() - t0) / 1000).toFixed(1)); });
  await page.goto(`${SIDES[side].host}/widget/${SIDES[side].id[type]}`, { waitUntil: 'domcontentloaded' });
  await sleep(180000);
  R.requestCount.push({ side, widget: type, windowSeconds: 180, requests: t.length, atSeconds: t });
  await ctx.close();
})());
await Promise.all(tasks);
R.finishedAt = new Date().toISOString();
save();
await browser.close();
console.log('EXTRA DONE');
