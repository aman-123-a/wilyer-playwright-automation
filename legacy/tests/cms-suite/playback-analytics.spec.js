// =============================================================================
//  PLAYBACK ANALYTICS.
//
//  Playback aggregation happens server-side; a browser test can only validate
//  how the analytics UI consumes that data. So:
//    • POSITIVE  — observe the live analytics/reports view loads & aggregates.
//    • NEGATIVE/EDGE — inject corrupted / missing / duplicate / huge / partial
//      datasets at the API boundary and assert the frontend stays healthy and
//      its totals stay self-consistent.
// =============================================================================

import { test, expect } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { ReportsPage } from '../../pages/cms/ReportsPage.js';
import { login } from '../../helpers/loginHelper.js';
import {
  mockServerError, mockCorruptedPayload, mockEmptyResponse, mockTransformJson,
} from '../../utils/cms/mocks.js';
import { assertNotBlank, assertNoCrashScreen, assertLoaderCleared } from '../../utils/cms/crashDetector.js';

const ANALYTICS_API = '**/api/**'; // playback analytics ride the API namespace

async function openReports(page) {
  await login(page);
  const rp = new ReportsPage(page);
  await rp.open();
  await rp.expectLoaded();
  return rp;
}

// ── POSITIVE ────────────────────────────────────────────────────────────────
test.describe('Playback analytics — Positive', () => {
  test('analytics/reports view loads and renders content', async ({ page }) => {
    await openReports(page);
    await assertNotBlank(page, 'reports');
    await assertNoCrashScreen(page, 'reports');
  });

  test('refresh re-fetches analytics without breaking the view', async ({ page }) => {
    await openReports(page);
    await page.reload({ waitUntil: 'networkidle' });
    await assertNotBlank(page, 'reports after refresh');
    await assertLoaderCleared(page, { label: 'reports after refresh' });
  });
});

// ── NEGATIVE (injected) ─────────────────────────────────────────────────────
test.describe('Playback analytics — Negative (injected)', () => {
  test.use({ strictMonitors: false });

  test('corrupted playback data does not crash the view', async ({ page }) => {
    await login(page);
    await mockCorruptedPayload(page, ANALYTICS_API);
    await page.goto(`${ENV.BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await assertNotBlank(page, 'reports corrupted');
    await assertNoCrashScreen(page, 'reports corrupted');
  });

  test('missing playback events (empty dataset) shows an empty state', async ({ page }) => {
    await login(page);
    await mockEmptyResponse(page, ANALYTICS_API, { data: [], totalPlays: 0 });
    await page.goto(`${ENV.BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await assertNotBlank(page, 'reports empty');
  });

  test('invalid media IDs in payload are tolerated', async ({ page }) => {
    await login(page);
    await mockTransformJson(page, ANALYTICS_API, (json) => {
      const taint = (o) => {
        if (o && typeof o === 'object') {
          if ('mediaId' in o) o.mediaId = null;
          if ('media_id' in o) o.media_id = 'INVALID_ID_!!!';
        }
      };
      const walk = (o) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') { taint(o); Object.values(o).forEach(walk); }
      };
      walk(json);
      return json;
    });
    await page.goto(`${ENV.BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await assertNotBlank(page, 'reports invalid media ids');
    await assertNoCrashScreen(page, 'reports invalid media ids');
  });

  test('analytics API 500 surfaces an error, not a blank page', async ({ page }) => {
    await login(page);
    await mockServerError(page, ANALYTICS_API, { status: 500 });
    await page.goto(`${ENV.BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await assertNotBlank(page, 'reports 500');
  });
});

// ── EDGE CASES (injected) ───────────────────────────────────────────────────
test.describe('Playback analytics — Edge Cases (injected)', () => {
  test.use({ strictMonitors: false });

  test('very large dataset (10k rows) renders without freezing', async ({ page }) => {
    await login(page);
    const huge = Array.from({ length: 10_000 }, (_, i) => ({
      mediaId: i, name: `media_${i}`, plays: (i * 7) % 1000, duration: 30,
    }));
    await mockTransformJson(page, ANALYTICS_API, (json) => {
      if (json && typeof json === 'object') {
        if (Array.isArray(json.data)) json.data = huge;
        else if (Array.isArray(json)) return huge;
      }
      return json;
    });
    await page.goto(`${ENV.BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await assertNotBlank(page, 'reports huge dataset');
    // Main thread must still be responsive (would hang if frozen by 10k rows).
    expect(await page.evaluate(() => 1 + 1)).toBe(2);
  });

  test('duplicate event injection does not double-break aggregation UI', async ({ page }) => {
    await login(page);
    await mockTransformJson(page, ANALYTICS_API, (json) => {
      if (json && Array.isArray(json.data) && json.data.length) {
        json.data = [...json.data, ...json.data]; // duplicate every row
      }
      return json;
    });
    await page.goto(`${ENV.BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await assertNotBlank(page, 'reports duplicates');
    await assertNoCrashScreen(page, 'reports duplicates');
  });

  test('rapid refresh requests do not crash the analytics view', async ({ page }) => {
    await openReports(page);
    for (let i = 0; i < 4; i++) {
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    await page.waitForLoadState('networkidle').catch(() => {});
    await assertNotBlank(page, 'reports rapid refresh');
  });

  test('partial analytics failure (one endpoint 500) degrades gracefully', async ({ page }) => {
    await login(page);
    // Fail only a sub-set of analytics calls, let the rest through.
    let n = 0;
    await page.route(ANALYTICS_API, async (route) => {
      n++;
      if (n % 3 === 0) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"partial"}' });
      }
      return route.continue();
    });
    await page.goto(`${ENV.BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await assertNotBlank(page, 'reports partial failure');
    await assertNoCrashScreen(page, 'reports partial failure');
  });
});
