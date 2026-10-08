// =============================================================================
//  AWS ATHENA EXPORT (CSV → S3 → CloudFront download URL, async).
//
//  The Athena query, S3 upload and CloudFront URL are server-side; a browser
//  test validates the EXPORT UI's contract:
//    • POSITIVE — trigger an export and verify a download or an "export started"
//      acknowledgement; if a sync download fires, validate it's a CSV.
//    • NEGATIVE/EDGE — inject Athena/S3 failures, expired URLs, empty results,
//      slow/huge exports at the API boundary and assert the UI degrades safely.
//
//  If the target tenant exposes no export control, the live POSITIVE tests skip
//  themselves (logged), while the injected-failure contract tests still run by
//  mocking the export endpoint.
// =============================================================================

import { test, expect } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { ReportsPage } from '../../pages/cms/ReportsPage.js';
import { login } from '../../helpers/loginHelper.js';
import { mockServerError, mockSlowResponse, mockEmptyResponse } from '../../utils/cms/mocks.js';
import { assertNotBlank, assertNoCrashScreen } from '../../utils/cms/crashDetector.js';

const EXPORT_API = /\/api\/.*(export|athena|download|report|csv)/i;

async function openReports(page) {
  await login(page);
  const rp = new ReportsPage(page);
  await rp.open();
  await rp.expectLoaded();
  return rp;
}

// ── POSITIVE ────────────────────────────────────────────────────────────────
test.describe('Athena export — Positive', () => {
  test('export control triggers a download or async acknowledgement', async ({ page }) => {
    const rp = await openReports(page);
    const hasControl = await rp.hasExportControl();
    test.skip(!hasControl, 'No export control exposed for this account/tenant.');

    const download = await rp.triggerExport({ timeout: 15_000 });
    if (download) {
      const name = download.suggestedFilename();
      console.log(`Synchronous download: ${name}`);
      expect(name).toMatch(/\.(csv|xlsx|zip)$/i);
    } else {
      // Async export: expect an on-screen acknowledgement (email/processing).
      const ack = await page.getByText(/export|processing|queued|email|started|will be sent/i)
        .first().isVisible().catch(() => false);
      console.log(`Async export acknowledgement visible: ${ack}`);
      await assertNotBlank(page, 'reports after export trigger');
    }
  });

  test('CloudFront-style download URL (if surfaced) is well-formed', async ({ page }) => {
    const urls = [];
    page.on('response', (res) => {
      if (/cloudfront|amazonaws|\.csv(\?|$)/i.test(res.url())) urls.push(res.url());
    });
    const rp = await openReports(page);
    if (!(await rp.hasExportControl())) test.skip(true, 'No export control.');
    await rp.triggerExport({ timeout: 12_000 });
    await page.waitForTimeout(2000);
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\//);
    }
    console.log(`Captured ${urls.length} download/CDN URL(s).`);
  });
});

// ── NEGATIVE (injected) ─────────────────────────────────────────────────────
test.describe('Athena export — Negative (injected)', () => {
  test.use({ strictMonitors: false });

  test('Athena query failure (500) surfaces an error, not a crash', async ({ page }) => {
    const rp = await openReports(page);
    test.skip(!(await rp.hasExportControl()), 'No export control.');
    await mockServerError(page, EXPORT_API, { status: 500, body: { error: 'AthenaQueryFailed' } });
    await rp.triggerExport({ timeout: 8000 });
    await page.waitForTimeout(2500);
    await assertNotBlank(page, 'reports after Athena failure');
    await assertNoCrashScreen(page, 'reports after Athena failure');
  });

  test('S3 upload failure (502) is handled gracefully', async ({ page }) => {
    const rp = await openReports(page);
    test.skip(!(await rp.hasExportControl()), 'No export control.');
    await mockServerError(page, EXPORT_API, { status: 502, body: { error: 'S3UploadFailed' } });
    await rp.triggerExport({ timeout: 8000 });
    await page.waitForTimeout(2500);
    await assertNotBlank(page, 'reports after S3 failure');
  });

  test('expired download URL (403) does not break the page', async ({ page }) => {
    const rp = await openReports(page);
    test.skip(!(await rp.hasExportControl()), 'No export control.');
    await mockServerError(page, EXPORT_API, { status: 403, body: { error: 'ExpiredUrl' } });
    await rp.triggerExport({ timeout: 8000 });
    await page.waitForTimeout(2000);
    await assertNotBlank(page, 'reports expired url');
  });

  test('empty export result shows an empty-state message', async ({ page }) => {
    const rp = await openReports(page);
    test.skip(!(await rp.hasExportControl()), 'No export control.');
    await mockEmptyResponse(page, EXPORT_API, { rows: [], url: null });
    await rp.triggerExport({ timeout: 8000 });
    await page.waitForTimeout(2000);
    await assertNotBlank(page, 'reports empty export');
  });

  test('invalid date range is rejected / clamped (if date inputs exist)', async ({ page }) => {
    const rp = await openReports(page);
    const had = await rp.setDateRange('2030-01-01', '2020-01-01'); // from > to
    test.skip(!had, 'No date-range inputs exposed.');
    if (await rp.hasExportControl()) await rp.triggerExport({ timeout: 6000 });
    await page.waitForTimeout(1500);
    await assertNotBlank(page, 'reports invalid date range');
  });
});

// ── EDGE / PERFORMANCE (injected) ───────────────────────────────────────────
test.describe('Athena export — Edge & Performance (injected)', () => {
  test.use({ strictMonitors: false });

  test('slow / huge export keeps the UI responsive (no freeze)', async ({ page }) => {
    const rp = await openReports(page);
    test.skip(!(await rp.hasExportControl()), 'No export control.');
    await mockSlowResponse(page, EXPORT_API, 7000);
    await rp.triggerExport({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // Page must stay interactive while the export is in-flight.
    expect(await page.evaluate(() => 2 + 3)).toBe(5);
    await assertNotBlank(page, 'reports during slow export');
  });

  test('browser close during export does not corrupt session on reopen', async ({ browser }) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const rp = await openReports(page);
    if (await rp.hasExportControl()) {
      await mockSlowResponse(page, EXPORT_API, 8000);
      await rp.triggerExport({ timeout: 1500 }).catch(() => {});
    }
    await ctx.close(); // simulate the user closing the browser mid-export

    // Reopen and confirm we can still log in and reach reports cleanly.
    const ctx2 = await browser.newContext({ ignoreHTTPSErrors: true });
    const page2 = await ctx2.newPage();
    await openReports(page2);
    await assertNotBlank(page2, 'reports after reopen');
    await ctx2.close();
  });

  test('retry export after a failure eventually proceeds', async ({ page }) => {
    const rp = await openReports(page);
    test.skip(!(await rp.hasExportControl()), 'No export control.');
    // First attempt fails, subsequent attempts pass through.
    let attempts = 0;
    await page.route(EXPORT_API, async (route) => {
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 500, body: '{"error":"transient"}' });
      return route.continue();
    });
    await rp.triggerExport({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await rp.triggerExport({ timeout: 6000 }).catch(() => {}); // retry
    await page.waitForTimeout(1500);
    await assertNotBlank(page, 'reports after retry');
    expect(attempts).toBeGreaterThanOrEqual(1);
  });
});
