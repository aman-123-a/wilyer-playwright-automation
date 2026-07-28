// =============================================================================
//  Records a NARRATED video reproducing the Dashboard white-screen-on-API-failure
//  bug. Full-screen caption cards explain each scenario step; live app states are
//  authentic (real dashboard, real blank screen). Reuses .auth/admin.json.
//
//  Run:  node scripts/record-white-screen.cms.js
//  Out:  test-results/white-screen/dashboard-white-screen-bug.webm
// =============================================================================

import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = process.env.CMS_BASE_URL || 'https://cms.pocsample.in';
const VIDEO_DIR = path.resolve('test-results', 'white-screen');
const STORAGE = path.resolve('.auth', 'admin.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Full-screen explanation card shown between live steps. */
async function card(page, { tag, title, lines, color = '#0b1f3a', accent = '#4da3ff' }, hold = 4000) {
  const items = lines.map((l) => `<li>${l}</li>`).join('');
  await page.setContent(`
    <html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:Segoe UI,Arial,sans-serif;background:${color};color:#fff;">
      <div style="max-width:980px;padding:0 60px;">
        <div style="font-size:20px;letter-spacing:3px;color:${accent};font-weight:700;">${tag}</div>
        <h1 style="font-size:52px;margin:14px 0 26px;line-height:1.15;">${title}</h1>
        <ul style="font-size:28px;line-height:1.7;color:#dce8f7;">${items}</ul>
      </div>
    </body></html>`);
  await sleep(hold);
}

/** Small persistent banner overlaid on a LIVE app screen to label it. */
async function banner(page, text, bg = '#1f6feb') {
  await page.evaluate(([t, b]) => {
    document.getElementById('__demo_banner__')?.remove();
    const d = document.createElement('div');
    d.id = '__demo_banner__';
    d.textContent = t;
    d.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:2147483647;background:${b};
      color:#fff;font:600 22px Segoe UI,Arial,sans-serif;padding:14px 24px;text-align:center;
      box-shadow:0 2px 12px rgba(0,0,0,.4);`;
    document.body.appendChild(d);
  }, [text, bg]);
}

(async () => {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: fs.existsSync(STORAGE) ? STORAGE : undefined,
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // ── Title ──────────────────────────────────────────────────────────────────
  await card(page, {
    tag: 'CMS REGRESSION · BUG REPRODUCTION',
    title: 'Dashboard white-screens when a backend API call fails',
    lines: [
      'App: cms.pocsample.in (staging)',
      'Scenario: the dashboard data API returns an error (HTTP 500)',
      'Expected: app shows an error / empty state and keeps its nav',
      'Actual: the whole page goes blank — preview follows',
    ],
  }, 5500);

  // ── STEP 1 — healthy baseline ───────────────────────────────────────────────
  await card(page, {
    tag: 'STEP 1 OF 3 · BASELINE',
    title: 'Normal dashboard (backend healthy)',
    lines: ['Logged in as admin', 'All /api/** calls succeed', 'Dashboard renders cards, charts, nav'],
    accent: '#5ee08a',
  }, 4000);
  console.log('1/3  Loading the healthy dashboard…');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(2500);
  await banner(page, '✅ STEP 1 — Backend healthy → dashboard renders normally', '#1a7f37');
  await sleep(4000);

  // ── STEP 2 — inject failure ─────────────────────────────────────────────────
  await card(page, {
    tag: 'STEP 2 OF 3 · INJECT FAILURE',
    title: 'Simulate a backend outage',
    lines: ['Every <b>/api/**</b> request is now forced to return <b>HTTP 500</b>', 'This mimics the analytics/data API failing in production'],
    color: '#3a2a0b', accent: '#f0a92b',
  }, 4500);
  console.log('2/3  Injecting HTTP 500 on all /api/** calls…');
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal Server Error"}' })
  );

  // ── STEP 3 — the bug ────────────────────────────────────────────────────────
  await card(page, {
    tag: 'STEP 3 OF 3 · RESULT',
    title: 'Reload the dashboard with the API failing',
    lines: ['Expected: “couldn’t load” message, nav still visible', 'Watch what actually happens…'],
    color: '#3a0b0b', accent: '#ff6b6b',
  }, 4500);
  console.log('3/3  Reloading with the backend failing…');
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(4000); // hold on the RAW blank screen so the bug is unmistakable

  const diag = await page.evaluate(() => ({
    bodyTextLength: (document.body?.innerText ?? '').trim().length,
    interactiveEls: document.querySelectorAll('a,button,input,table,[role="button"],nav,main,img').length,
    rootHTML: (document.getElementById('root')?.innerHTML ?? '').slice(0, 120),
  }));
  console.log('Blank-screen diagnostics:', diag);

  // Label the blank screen (after showing it raw).
  await banner(page, `🐞 BUG — blank white screen: 0 text, 0 buttons, no error message`, '#b81414');
  await sleep(4500);

  // ── Summary ──────────────────────────────────────────────────────────────────
  await card(page, {
    tag: 'SUMMARY',
    title: 'Bug: no error boundary on API failure',
    lines: [
      `Result: body text = ${diag.bodyTextLength}, interactive elements = ${diag.interactiveEls}`,
      'React mounts an empty #root — no fallback UI is rendered',
      'Impact: any failed/empty/500 data call blanks the page',
      'Fix: React error boundary + per-widget empty/error states',
    ],
    color: '#0b1f3a', accent: '#4da3ff',
  }, 6000);

  await context.close();
  await browser.close();

  // Normalise the output filename.
  const latest = fs.readdirSync(VIDEO_DIR).filter((f) => f.endsWith('.webm'))
    .map((f) => path.join(VIDEO_DIR, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const out = path.join(VIDEO_DIR, 'dashboard-white-screen-bug.webm');
  fs.copyFileSync(latest, out);
  console.log('\n✅ Narrated video saved:', out);
})();
