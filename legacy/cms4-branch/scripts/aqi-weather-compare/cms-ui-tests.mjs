// CMS UI tests on https://cms.pocsample.in : AQI + Weather widget create form, validation, save/reopen, preview, location input.
// Creates only QA_CMP_UI_* widgets and ALWAYS deletes them (by id, via the API token of the logged-in session) in `finally`.
import { chromium } from '@playwright/test';
import fs from 'fs';
import { OUT, NEW_API, env, sleep } from './common.mjs';

fs.mkdirSync(OUT + '/screenshots', { recursive: true });
const R = { startedAt: new Date().toISOString(), tests: [], created: [], cleanup: [] };
const save = () => fs.writeFileSync(OUT + '/cms-ui-results.json', JSON.stringify(R, null, 1));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let token = null;
const net = [], cons = [], pageErrs = [];
page.on('request', r => { const a = r.headers()['authorization']; if (a && r.url().startsWith(NEW_API)) token = a; });
page.on('response', async r => {
  const u = r.url();
  if (!u.startsWith(NEW_API)) return;
  if (/widget\/(create|update|read|readPublic|readPublicWidgetPreview)/.test(u)) {
    const rec = { m: r.request().method(), u: u.replace(NEW_API, '').slice(0, 90), s: r.status(), body: (r.request().postData() || '').slice(0, 400) };
    try { rec.ms = +r.request().timing().responseEnd.toFixed(0); } catch {}
    net.push(rec);
    if (/widget\/read\?/.test(u) && r.status() === 200) { try { const j = await r.json(); for (const d of j.docs || []) if (/^QA_CMP_UI_/.test(d.name)) R.created.indexOf(d.id) < 0 && R.created.push(d.id); } catch {} }
  }
});
page.on('console', c => { if (c.type() === 'error') cons.push(c.text().slice(0, 160)); });
page.on('pageerror', e => pageErrs.push(String(e).slice(0, 160)));
const rec = (id, name, status, detail) => { R.tests.push({ id, name, status, detail }); console.log(id, status, name, '-', String(detail).slice(0, 140)); save(); };
const shot = n => page.screenshot({ path: `${OUT}/screenshots/cmsui-${n}.png` }).catch(() => {});
const lastNet = (re, from = 0) => net.slice(from).filter(x => re.test(x.m + ' ' + x.u));

async function toType(label) {
  await page.goto('https://cms.pocsample.in/library', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /Widgets \(/.test(document.body.innerText), null, { timeout: 60000 });
  await page.getByText(/^Widgets [(][0-9]+[)]$/).first().click();
  await sleep(2000);
  await page.getByText(new RegExp('^' + label + ' [(][0-9]+[)]$')).first().click();
  await sleep(2500);
}
const openNew = async () => { await page.getByRole('button', { name: /add new/i }).click(); const d = page.getByRole('dialog'); await d.waitFor({ timeout: 10000 }); return d; };
async function pickCity(d, idx, text) {
  const inp = d.locator('input[name="city1"]').nth(idx);
  await inp.click(); await inp.fill(''); await inp.pressSequentially(text, { delay: 60 });
  await sleep(1800);
  const n = await page.locator('.pac-item').count();
  if (n) { await page.locator('.pac-item').first().click(); await sleep(800); }
  return n;
}
async function search(name) {
  const s = page.getByRole('textbox', { name: /^search/i }).last();
  await s.fill(name); await sleep(1800);
}
async function saveDlg(d) { const t0 = performance.now(); const from = net.length; await d.getByRole('button', { name: /^save$/i }).click(); await sleep(3500); return { ms: +(performance.now() - t0).toFixed(0), calls: net.slice(from) }; }

try {
  await page.goto('https://cms.pocsample.in', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /email|phone/i }).fill(env.CMS_ADMIN_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(env.CMS_ADMIN_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForFunction(() => /Library/.test(document.body.innerText), null, { timeout: 60000 });
  rec('UI-01', 'Login and dashboard shell loads', 'PASS', `console errors so far: ${cons.length}`);

  for (const [label, type] of [['AQI', 'aqi'], ['Weather', 'weather']]) {
    await toType(label);
    const listed = await page.locator('p').count();
    await shot(`${type}-list`);
    rec(`UI-02-${type}`, `${label} widget list opens`, listed > 5 ? 'PASS' : 'FAIL', `${listed} <p> elements; read calls: ${lastNet(/widget\/read\?/).length}`);

    // ---- form opens
    let d = await openNew();
    const fields = await d.locator('input,select').evaluateAll(e => e.map(x => x.name || x.type).join(','));
    await shot(`${type}-form`);
    rec(`UI-03-${type}`, `${label} create form opens with expected fields`, /name/.test(fields) && /city1/.test(fields) ? 'PASS' : 'FAIL', fields);

    // ---- empty name
    let r = await saveDlg(d);
    const created0 = r.calls.filter(c => c.m === 'POST' && /widget\/create/.test(c.u));
    const stillOpen = await d.isVisible().catch(() => false);
    rec(`UI-04-${type}`, `${label}: Save with EMPTY name is blocked`, !created0.length && stillOpen ? 'PASS' : 'FAIL', `create calls=${created0.length}, dialog open=${stillOpen}`);
    await shot(`${type}-empty-name`);

    // ---- name only, empty location
    const nEmpty = `QA_CMP_UI_${type}_nolocation`;
    await d.locator('input[name="name"]').fill(nEmpty);
    r = await saveDlg(d);
    const c1 = r.calls.find(c => /widget\/create/.test(c.u));
    rec(`UI-05-${type}`, `${label}: Save with valid name but EMPTY location`, c1 && c1.s === 200 ? 'FAIL (candidate bug)' : 'PASS', c1 ? `create HTTP ${c1.s}; body ${c1.body.slice(0, 160)}` : 'no create call (blocked)');
    await shot(`${type}-empty-location`);
    await sleep(1500);

    // ---- valid location via autocomplete, save, reopen
    await toType(label);
    d = await openNew();
    const nOk = `QA_CMP_UI_${type}_mumbai`;
    await d.locator('input[name="name"]').fill(nOk);
    const items = await pickCity(d, 0, 'Mumbai');
    const picked = await d.locator('input[name="city1"]').nth(0).inputValue();
    r = await saveDlg(d);
    const c2 = r.calls.find(c => /widget\/create/.test(c.u));
    const body2 = c2 ? c2.body : '';
    rec(`UI-06-${type}`, `${label}: create with valid location (autocomplete suggestions=${items}, field="${picked}")`, c2 && c2.s === 200 && /mumbai/i.test(body2) ? 'PASS' : 'FAIL', `HTTP ${c2?.s}, ${r.ms} ms to saved; payload: ${body2.slice(0, 260)}`);
    if (type === 'aqi') rec('UI-06b-aqi', 'AQI: coordinates saved with the location', /"lat"\s*:\s*1[89]\./.test(body2) ? 'PASS' : 'FAIL', body2.slice(0, 260));

    await toType(label);
    await search(nOk);
    const row = page.locator('p', { hasText: new RegExp('^' + nOk + '$') }).first();
    const found = await row.isVisible().catch(() => false);
    rec(`UI-07-${type}`, `${label}: saved widget appears in list / search`, found ? 'PASS' : 'FAIL', `found=${found}`);
    if (found) {
      await row.locator('xpath=..').getByRole('button').first().click();
      const ed = page.getByRole('dialog'); await ed.waitFor({ timeout: 10000 }); await sleep(1500);
      const nameV = await ed.locator('input[name="name"]').inputValue();
      const cityV = await ed.locator('input[name="city1"]').nth(0).inputValue();
      await shot(`${type}-reopen`);
      rec(`UI-08-${type}`, `${label}: reopen shows saved name and location`, nameV === nOk && /mumbai/i.test(cityV) ? 'PASS' : 'FAIL', `name="${nameV}", city1="${cityV}"`);

      // ---- preview
      const from = net.length; const t0 = performance.now();
      const prev = ed.getByRole('button', { name: /^preview$/i });
      await prev.click().catch(() => {});
      await sleep(6000);
      const pv = net.slice(from).filter(x => /readPublic|Preview|widget/.test(x.u));
      const txt = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      await shot(`${type}-preview`);
      rec(`UI-09-${type}`, `${label}: Preview renders for saved location`, /mumbai/i.test(txt) && /[0-9]/.test(txt) ? 'PASS' : 'REVIEW', `calls: ${pv.map(x => x.m + ' ' + x.u + ' ' + x.s + (x.ms ? ' ' + x.ms + 'ms' : '')).join(' | ') || 'none'}; ${(performance.now() - t0).toFixed(0)} ms to settle`);
      await page.keyboard.press('Escape'); await sleep(800);
    }

    // ---- invalid location text (typed, no suggestion picked)
    await toType(label);
    d = await openNew();
    const nBad = `QA_CMP_UI_${type}_invalidloc`;
    await d.locator('input[name="name"]').fill(nBad);
    const inp = d.locator('input[name="city1"]').nth(0);
    await inp.fill('zzqqxxnotacity12345'); await sleep(1500);
    const sugg = await page.locator('.pac-item').count();
    r = await saveDlg(d);
    const c3 = r.calls.find(c => /widget\/create/.test(c.u));
    rec(`UI-10-${type}`, `${label}: invalid free-text location (no suggestion, suggestions=${sugg})`, c3 && c3.s === 200 && /zzqq/.test(c3.body) ? 'FAIL (candidate bug: junk saved)' : 'PASS', c3 ? `HTTP ${c3.s}; ${c3.body.slice(0, 200)}` : 'no create call (blocked)');
    await sleep(1500);

    // ---- XSS + long name
    await toType(label);
    d = await openNew();
    const xssName = `QA_CMP_UI_${type}_<img src=x onerror=window.__x=1>`;
    await d.locator('input[name="name"]').fill(xssName);
    await pickCity(d, 0, 'Delhi');
    r = await saveDlg(d);
    const c4 = r.calls.find(c => /widget\/create/.test(c.u));
    await toType(label); await search('QA_CMP_UI_' + type + '_<img');
    const xssRan = await page.evaluate(() => window.__x === 1);
    rec(`UI-11-${type}`, `${label}: XSS payload in widget name is not executed`, !xssRan ? 'PASS' : 'FAIL (XSS)', `create HTTP ${c4?.s}; script executed=${xssRan}; page errors=${pageErrs.length}`);
    await shot(`${type}-xss-list`);

    await toType(label);
    d = await openNew();
    await d.locator('input[name="name"]').fill('QA_CMP_UI_' + type + '_' + 'L'.repeat(600));
    await pickCity(d, 0, 'Pune');
    r = await saveDlg(d);
    const c5 = r.calls.find(c => /widget\/create/.test(c.u));
    rec(`UI-12-${type}`, `${label}: 600-character name is limited or handled`, c5 ? (c5.s === 200 ? 'REVIEW (accepted 600 chars; no limit)' : `PASS (rejected HTTP ${c5.s})`) : 'PASS (blocked in UI)', c5 ? `HTTP ${c5.s}` : 'no create call');
    await shot(`${type}-long-name`);
  }
  rec('UI-99', 'Console / page errors during CMS widget flows', cons.length + pageErrs.length ? 'REVIEW' : 'PASS', `console errors: ${cons.length} ${JSON.stringify([...new Set(cons)].slice(0, 5))}; page errors: ${pageErrs.length}`);
} catch (e) {
  rec('UI-ABORT', 'Test run aborted', 'ERROR', e.message);
} finally {
  // cleanup: delete every QA_CMP_UI_* widget this run saw in list responses (ids captured above)
  await sleep(1000);
  for (const type of ['aqi', 'weather']) {
    try {
      const r = await fetch(`${NEW_API}/v3/cms/widget/read?page=1&limit=50&type=${type}&search=QA_CMP_UI_&sort=createdAt&order=-1&folderId=`, { headers: { authorization: token } });
      const j = await r.json();
      for (const d of j.docs || []) if (/^QA_CMP_UI_/.test(d.name) && R.created.indexOf(d.id) < 0) R.created.push(d.id);
    } catch {}
  }
  for (const id of R.created) {
    const r = await fetch(`${NEW_API}/v3/cms/widget/delete/${id}`, { method: 'DELETE', headers: { authorization: token } });
    R.cleanup.push({ id, status: r.status });
  }
  R.network = net.slice(0, 80);
  R.finishedAt = new Date().toISOString();
  save();
  console.log('cleanup', JSON.stringify(R.cleanup.map(c => c.status)));
  await browser.close();
}
