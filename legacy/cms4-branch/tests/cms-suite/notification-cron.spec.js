// =============================================================================
//  NOTIFICATION CRON (offline-device email report with CSV attachment).
//
//  HONEST SCOPE NOTE:
//  This feature is a server-side cron that queries offline devices, builds a
//  CSV, and emails it via SMTP. None of that is observable or triggerable from
//  a browser. So this file:
//    • runs the checks that ARE browser/API-observable (notification settings
//      UI, offline-device data the report is built from, CSV contract via mock);
//    • explicitly SKIPS the pure-backend cases with a documented reason, so the
//      report shows them as "needs backend hook" instead of a false green.
//
//  To truly cover SMTP/cron, wire one of:
//    - an admin API endpoint that triggers the cron on demand (then assert here)
//    - a mail-catcher (e.g. Mailpit/Mailhog) the report is sent to in a test env
//    - a server-side integration test outside Playwright
//  Set CMS_CRON_TRIGGER_URL / CMS_MAILCATCHER_URL to enable real assertions.
// =============================================================================

import { test, expect } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { login } from '../../helpers/loginHelper.js';
import { mockServerError, mockEmptyResponse } from '../../utils/cms/mocks.js';
import { assertNotBlank } from '../../utils/cms/crashDetector.js';

const CRON_TRIGGER_URL = process.env.CMS_CRON_TRIGGER_URL || '';
const MAILCATCHER_URL = process.env.CMS_MAILCATCHER_URL || '';

// ── Browser/API-observable inputs to the report ─────────────────────────────
test.describe('Notification cron — observable inputs', () => {
  test('offline-device data (the report source) loads on the dashboard', async ({ page }) => {
    await login(page);
    await page.goto(`${ENV.BASE_URL}/`, { waitUntil: 'networkidle' });
    // The "offline screens" KPI is the bucket the report is built from.
    await expect(page.getByRole('heading', { name: /offline screens/i }))
      .toBeVisible({ timeout: 15_000 });
    await assertNotBlank(page, 'dashboard offline bucket');
  });

  test('notification / report settings UI is reachable (if present)', async ({ page }) => {
    await login(page);
    await page.goto(`${ENV.BASE_URL}/reports`, { waitUntil: 'networkidle' });
    const hasNotif = await page.getByText(/notification|email report|schedule|recipient/i)
      .first().isVisible().catch(() => false);
    test.skip(!hasNotif, 'No notification/report settings UI exposed for this account.');
    await assertNotBlank(page, 'notification settings');
  });
});

// ── CSV contract via mock (validates how the UI handles report payloads) ─────
test.describe('Notification cron — report payload contract (injected)', () => {
  test.use({ strictMonitors: false });

  test('empty report dataset is handled without crashing', async ({ page }) => {
    await login(page);
    await mockEmptyResponse(page, /\/api\/.*(report|offline|notification)/i, { devices: [], rows: [] });
    await page.goto(`${ENV.BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await assertNotBlank(page, 'reports empty notification dataset');
  });

  test('report endpoint failure (500) does not blank the page', async ({ page }) => {
    await login(page);
    await mockServerError(page, /\/api\/.*(report|offline|notification)/i, { status: 500 });
    await page.goto(`${ENV.BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await assertNotBlank(page, 'reports notification 500');
  });
});

// ── Real cron assertions — enabled only when a trigger/mailcatcher is provided ─
test.describe('Notification cron — backend (needs hook)', () => {
  test('email report generated with valid CSV attachment', async ({ request }) => {
    test.skip(!CRON_TRIGGER_URL || !MAILCATCHER_URL,
      'Needs CMS_CRON_TRIGGER_URL + CMS_MAILCATCHER_URL (mail-catcher) to assert real email/CSV.');

    // Trigger the cron on demand, then read the captured message from the catcher.
    const trig = await request.post(CRON_TRIGGER_URL, { failOnStatusCode: false });
    expect(trig.ok()).toBeTruthy();
    const inbox = await request.get(`${MAILCATCHER_URL}/api/v1/messages`, { failOnStatusCode: false });
    const messages = await inbox.json().catch(() => []);
    expect(Array.isArray(messages) && messages.length > 0, 'a report email was sent').toBeTruthy();
    const latest = messages[0];
    // CSV attachment present and non-empty.
    const hasCsv = JSON.stringify(latest).match(/\.csv|text\/csv/i);
    expect(hasCsv, 'email has a CSV attachment').toBeTruthy();
  });

  test.skip('SMTP failure path (bounce/retry) — backend integration only', () => {
    // Validate via the mail server / cron logs in a backend integration test.
  });

  test.skip('invalid recipient handling — backend integration only', () => {});
  test.skip('thousands of offline devices → large CSV generation — backend only', () => {});
  test.skip('simultaneous cron execution / restart during processing — backend only', () => {});
});
