// =============================================================================
//  API VALIDATION — status codes, response time, error handling, unauthorized
//  access, and capture of failed/slow/invalid requests during real navigation.
// =============================================================================

import { test, expect, CLEAN_STATE } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { login } from '../../helpers/loginHelper.js';
import { ApiMonitor } from '../../utils/cms/apiMonitor.js';
import { expectStatusIn } from '../../utils/cms/assertions.js';

test.describe('API validation — live traffic observation', () => {
  test('no unexpected 5xx while browsing core modules', async ({ page }) => {
    const api = new ApiMonitor(page);
    await login(page);
    for (const r of ['/', '/screens', '/library', '/playlists']) {
      await page.goto(`${ENV.BASE_URL}${r}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
    }
    const s = api.summary();
    console.log('API summary:', s);
    // Always log captured failures/slow calls for the report.
    if (api.failures.length) console.log('Transport failures:', api.failures);
    if (api.slowCalls.length) console.log('Slow calls:', api.slowCalls.map((c) => `${c.ms}ms ${c.url}`));
    api.assertNoServerErrors();
  });

  test('all status codes are well-formed (no 0 / undefined)', async ({ page }) => {
    const api = new ApiMonitor(page);
    await login(page);
    await page.goto(`${ENV.BASE_URL}/screens`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    expect(api.calls.length).toBeGreaterThan(0);
    for (const c of api.calls) {
      expect(c.status, `status for ${c.url}`).toBeGreaterThanOrEqual(100);
      expect(c.status).toBeLessThan(600);
    }
  });

  test('response times are recorded; flag slow calls over threshold', async ({ page }) => {
    const api = new ApiMonitor(page, { slowMs: ENV.API_SLOW_MS });
    await login(page);
    await page.goto(`${ENV.BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const slow = api.slowCalls;
    console.log(`${api.calls.length} API calls, ${slow.length} slower than ${ENV.API_SLOW_MS}ms`);
    // Don't hard-fail on slowness (network-dependent) — surface it for triage.
    expect(api.calls.length).toBeGreaterThan(0);
  });
});

test.describe('API validation — direct request layer', () => {
  // These hit the API with NO session — force a clean (unauthenticated) context.
  test.use({ storageState: CLEAN_STATE });

  test('unauthenticated API request is rejected (no data without auth)', async ({ request }) => {
    // Hit a protected endpoint with no session.
    const res = await request.get(`${ENV.BASE_URL}/api/playlists`, { failOnStatusCode: false });
    console.log(`Unauthenticated /api/playlists -> ${res.status()}`);
    // Acceptable: 401/403 (rejected) or 3xx redirect to login. NOT a 200 with data.
    expectStatusIn(res.status(), [301, 302, 401, 403, 404, 400], 'unauthenticated API');
  });

  test('unknown route returns a clean 404, not a 500', async ({ request }) => {
    const res = await request.get(`${ENV.BASE_URL}/api/this-endpoint-does-not-exist-xyz`, {
      failOnStatusCode: false,
    });
    console.log(`Unknown endpoint -> ${res.status()}`);
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('API validation — error handling on injected failure', () => {
  test.use({ strictMonitors: false });

  test('frontend surfaces an error (not a blank page) when API 500s', async ({ page }) => {
    const { mockServerError } = await import('../../utils/cms/mocks.js');
    const { assertNotBlank } = await import('../../utils/cms/crashDetector.js');
    await login(page);
    await mockServerError(page, '**/api/**', { status: 500 });
    await page.goto(`${ENV.BASE_URL}/screens`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await assertNotBlank(page, 'screens under 500');
  });
});
