// =============================================================================
//  AQI + WEATHER WIDGETS — SMOKE (SM-01..SM-08, see AQI-WEATHER-TEST-CASES.md)
//  Creates one QA_SMOKE_* AQI and one Weather widget through the UI, checks the
//  list, reopen, CMS preview and the public player page, then deletes both by id.
//  SM-09 (widget plays on a device) needs a physical player and is not automated.
//
//  Run:  npx playwright test --config=playwright.cms.config.js aqi-weather-smoke.spec.js
// =============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../fixtures/cms-fixtures.js';
import { WidgetsPage } from '../../pages/cms/WidgetsPage.js';

const ADMIN_STATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.auth', 'admin.json');
const RUN = Date.now();
const KINDS = [
  { type: 'aqi', label: 'AQI', name: `QA_SMOKE_aqi_${RUN}`, n: { list: 2, create: 4, player: 6 } },
  { type: 'weather', label: 'Weather', name: `QA_SMOKE_weather_${RUN}`, n: { list: 3, create: 5, player: 7 } },
];

test.describe.configure({ mode: 'serial', retries: 0 });

test.describe('AQI & Weather widgets — Smoke', () => {
  /** @type {WidgetsPage} */
  let w;
  const created = {}; // type -> widget id

  test.beforeEach(async ({ adminPage }) => {
    w = new WidgetsPage(adminPage);
    await w.goto('/library', 'domcontentloaded');
    await w.expectShellReady();
    // Learn apiBase/token from the library's own authenticated calls.
    await expect.poll(() => w.token, { timeout: 30_000 }).toBeTruthy();
  });

  // Runs even when an earlier serial test failed, so QA_SMOKE_* widgets never leak.
  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: fs.existsSync(ADMIN_STATE) ? ADMIN_STATE : undefined });
    try {
      const page = await ctx.newPage();
      const cleaner = new WidgetsPage(page);
      await cleaner.goto('/library', 'domcontentloaded');
      await expect.poll(() => cleaner.token, { timeout: 30_000 }).toBeTruthy();
      for (const k of KINDS) {
        const id = created[k.type] || (await cleaner.findByName(k.type, k.name))?.id;
        if (id) await cleaner.deleteById(id);
      }
    } finally {
      await ctx.close();
    }
  });

  test('SM-01 login lands on a working shell', async () => {
    await w.expectShellReady();
  });

  for (const k of KINDS) {
    test(`SM-0${k.n.list} ${k.label} widget list opens`, async () => {
      const read = w.page.waitForResponse((r) => /\/widget\/read\?/.test(r.url()) && r.status() === 200, { timeout: 30_000 });
      await w.openType(k.label);
      await read;
      await expect(w.page.getByRole('button', { name: /add new/i })).toBeVisible();
    });
  }

  for (const k of KINDS) {
    test(`SM-0${k.n.create} create ${k.label} widget (Mumbai) and find it in the list`, async () => {
      await w.openType(k.label);
      const res = await w.createWidget(k.name, 'Mumbai');
      expect(res?.status, 'create call must return 200: ' + JSON.stringify(res?.body) + ' sent=' + res?.sent).toBe(200);

      await w.openType(k.label);
      const row = await w.searchList(k.name);
      await expect(row).toBeVisible({ timeout: 15_000 });

      const doc = await w.findByName(k.type, k.name);
      expect(doc, 'widget must be readable via the API').toBeTruthy();
      created[k.type] = doc.id;
    });
  }

  for (const k of KINDS) {
    test(`SM-0${k.n.player} ${k.label} player page shows data`, async ({ browser }) => {
      expect(created[k.type], 'widget id from the create step').toBeTruthy();
      const pub = await w.api('GET', `/v3/cms/widget/readPublic/${created[k.type]}`);
      expect(pub.status).toBe(200);
      const data = pub.json;
      const rows = k.type === 'aqi' ? data.aqiData : data.weather;
      expect(Array.isArray(rows) && rows.length > 0, `${k.label} payload has data rows: ${JSON.stringify(pub.json).slice(0, 600)}`).toBeTruthy();
      if (k.type === 'aqi') {
        expect(typeof rows[0].aqi).toBe('number');
        expect(rows[0].iaqi?.pm25?.v).toBeDefined();
      } else {
        expect(typeof rows[0].todayData?.main?.temp).toBe('number');
        expect(rows[0].forecast?.length).toBeGreaterThan(0);
      }

      // Public player page (no login) renders the data.
      const playerUrl = data.path;
      expect(playerUrl, 'player URL').toMatch(/^https:\/\//);
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      const errors = [];
      p.on('pageerror', (e) => errors.push(String(e)));
      try {
        await p.goto(playerUrl, { waitUntil: 'domcontentloaded' });
        await expect(p.locator('body')).toContainText(/mumbai/i, { timeout: 10_000 });
        await expect(p.locator('body')).toContainText(/\d/);
        expect(errors, 'no uncaught JS errors on the player').toEqual([]);
      } finally {
        await ctx.close();
      }
    });
  }

  for (const k of KINDS) {
    test(`SM-08 ${k.label} reopen + CMS preview render`, async () => {
      await w.openType(k.label);
      const row = await w.searchList(k.name);
      await expect(row).toBeVisible({ timeout: 15_000 });
      const d = await w.rowEditButton(row);
      await expect(d.locator('input[name="name"]')).toHaveValue(k.name);
      await expect(d.locator('input[name="city1"]').first()).toHaveValue(/mumbai/i);

      // The preview auto-renders on open; the Preview button re-renders it. Assert the
      // rendered widget (an iframe), not a network event that may already have fired.
      await d.getByRole('button', { name: /^preview$/i }).click();
      // Preview is rendered by the public widget host inside an iframe.
      await expect
        .poll(async () => {
          const f = w.page.frames().find((fr) => fr !== w.page.mainFrame() && /signagecloud|widget/i.test(fr.url()));
          if (!f) return '';
          return (await f.evaluate(() => document.body.innerText).catch(() => '')) || '';
        }, { timeout: 20_000, message: 'preview iframe text' })
        .toMatch(/mumbai[\s\S]*\d/i);
      await w.page.keyboard.press('Escape');
    });
  }
});
