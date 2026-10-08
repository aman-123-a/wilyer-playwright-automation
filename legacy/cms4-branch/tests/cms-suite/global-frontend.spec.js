// =============================================================================
//  GLOBAL FRONTEND VALIDATION — runs the crash/health probes across every
//  major route. Detects React crashes, white screens, infinite spinners,
//  unhandled rejections, console errors, network failures, and 404 assets.
// =============================================================================

import { test, expect } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { login } from '../../helpers/loginHelper.js';
import { assertHealthy } from '../../utils/cms/crashDetector.js';
import { ConsoleMonitor } from '../../utils/cms/consoleMonitor.js';
import { ApiMonitor } from '../../utils/cms/apiMonitor.js';

const ROUTES = ['/', '/screens', '/groups', '/clusters', '/library', '/playlists', '/reports'];

test.describe('Global frontend health — per route', () => {
  for (const route of ROUTES) {
    test(`route ${route} is healthy (no crash / blank / infinite loader)`, async ({ page }) => {
      const console404 = [];
      page.on('response', (res) => {
        if (res.status() === 404 && /\.(js|css|png|jpg|svg|woff2?)/i.test(res.url())) {
          console404.push(res.url());
        }
      });
      const consoleMon = new ConsoleMonitor(page);

      await login(page);
      await page.goto(`${ENV.BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});

      await assertHealthy(page, route);

      // 404 assets are reported; fail only in strict mode.
      if (console404.length) {
        const msg = `404 asset(s) on ${route}: ${console404.slice(0, 3).join(', ')}`;
        if (ENV.STRICT_MONITORS) throw new Error(msg);
        console.warn(`[404] ${msg}`);
      }
      // Console/page errors → fail in strict mode, warn otherwise.
      const errors = consoleMon.allCritical;
      if (errors.length) {
        if (ENV.STRICT_MONITORS) consoleMon.assertClean(route);
        else consoleMon.report(route);
      }
    });
  }
});

test.describe('Global frontend health — rapid cross-module navigation', () => {
  test('rapid navigation across all modules leaves no crash', async ({ page }) => {
    const consoleMon = new ConsoleMonitor(page);
    const apiMon = new ApiMonitor(page);
    await login(page);

    const path = [...ROUTES, ...ROUTES].slice(0, 12);
    for (const r of path) {
      await page.goto(`${ENV.BASE_URL}${r}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible({ timeout: 10_000 });
    }
    console.log('API summary after rapid nav:', apiMon.summary());
    apiMon.assertNoTransportFailures();
    if (ENV.STRICT_MONITORS) consoleMon.assertClean('rapid-nav');
    else consoleMon.report('rapid-nav');
  });

  test('unhandled promise rejections are not produced during a session', async ({ page }) => {
    const rejections = [];
    page.on('pageerror', (e) => rejections.push(String(e?.message ?? e)));
    await login(page);
    await page.goto(`${ENV.BASE_URL}/playlists`, { waitUntil: 'networkidle' });
    await page.goto(`${ENV.BASE_URL}/library`, { waitUntil: 'networkidle' });
    expect(rejections, `pageerror/unhandled rejections: ${rejections.join('; ')}`).toHaveLength(0);
  });
});
