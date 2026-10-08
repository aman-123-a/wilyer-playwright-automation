// Repeats "load -> go offline -> watch" to see whether the NEW weather widget really blanks while the OLD keeps its data.
// Lifecycle: creates two temporary QA_CMP_REPEAT_* mirror widgets on cms.pocsample.in, runs, and ALWAYS deletes them (finally).
import { chromium } from '@playwright/test';
import fs from 'fs';
import { OUT, NEW_API, OLD_WIDGET_HOST, NEW_WIDGET_HOST, loginNew, api, sleep } from './common.mjs';

const pairs = JSON.parse(fs.readFileSync(OUT + '/pairs.json', 'utf8'));
const { browser: cmsBrowser, token } = await loginNew();
const created = [];
const rows = [];
const browser = await chromium.launch();
try {
  const targets = [];
  for (const key of ['W-DEL', 'W-MAA']) {
    const p = pairs.find(x => x.key === key);
    const name = 'QA_CMP_REPEAT_' + key;
    const r = await api('POST', NEW_API + '/v3/cms/widget/create', token, { name, data: p.data, type: 'weather', faceId: p.faceId, faceUrl: '/media/widgets/weather.png' });
    if (r.status !== 200) throw new Error('create failed ' + r.status);
    await sleep(1200);
    const l = await api('GET', `${NEW_API}/v3/cms/widget/read?page=1&limit=50&type=weather&search=${name}&sort=createdAt&order=-1&folderId=`, token);
    const doc = (l.json?.docs || []).find(d => d.name === name);
    if (!doc) throw new Error('created widget not found: ' + name);
    created.push(doc.id);
    targets.push({ key, p, newId: doc.id });
    // warm the new widget once so the cold-start does not distort the check
    await fetch(`${NEW_API}/v3/cms/widget/readPublic/${doc.id}`).then(r => r.text());
  }
  for (const { key, p, newId } of targets) {
    for (const [side, host, id] of [['old', OLD_WIDGET_HOST, p.oldId], ['new', NEW_WIDGET_HOST, newId]]) {
      for (let i = 1; i <= 3; i++) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await ctx.newPage();
        const city = String((p.data.city || [''])[0]).toLowerCase().split(' ')[0];
        const vis = async () => (await page.locator('body').innerText().catch(() => '')).toLowerCase().includes(city);
        await page.goto(`${host}/widget/${id}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(c => document.body.innerText.toLowerCase().includes(c), city, { timeout: 20000 }).catch(() => {});
        const before = await vis();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
        const row = { key, side, run: i, visibleBeforeOffline: before };
        let last = 0;
        for (const s of [1, 3, 8, 15]) { await sleep((s - last) * 1000); last = s; row['t+' + s + 's'] = await vis(); }
        rows.push(row);
        console.log(JSON.stringify(row));
        await ctx.close();
      }
    }
  }
} finally {
  const del = [];
  for (const id of created) { const r = await api('DELETE', `${NEW_API}/v3/cms/widget/delete/${id}`, token); del.push({ id, status: r.status }); }
  fs.writeFileSync(OUT + '/offline-repeat.json', JSON.stringify({ rows, cleanup: del }, null, 1));
  console.log('cleanup', JSON.stringify(del));
  await browser.close();
  await cmsBrowser.close();
}
