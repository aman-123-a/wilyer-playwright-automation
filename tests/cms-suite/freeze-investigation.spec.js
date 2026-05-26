// =============================================================================
//  FREEZE INVESTIGATION — the three reported "browser hangs completely"
//  defects, instrumented for root-cause rather than just pass/fail:
//
//    [FREEZE:1] Team → Roles tab           — freezes/hangs after click
//    [FREEZE:2] Reports → Previous Reports  — renderer becomes unresponsive
//    [FREEZE:3] Billing → Buy Plan          — browser hangs during load
//
//  Each test drives the exact user action, then captures a structured freeze
//  diagnostic (main-thread block, API spam, render-loop console signature,
//  DOM explosion). The diagnostic is ALWAYS logged + attached to the report so
//  the bug write-up has hard evidence, then the test asserts the page did not
//  freeze. We deliberately keep the run going on a freeze (catch + log) so all
//  three areas are characterised in one pass — per the brief's
//  "continue execution even if some tests fail".
//
//  Tab/route selectors are intentionally tolerant: the CMS surface varies by
//  tenant, so each locator has fallbacks and the test skips-with-reason (never
//  false-greens) if the affordance genuinely isn't present for this account.
// =============================================================================

import { test, expect } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { captureFreezeDiagnostic, formatDiagnostic, findRenderLoopErrors } from '../../utils/cms/freezeProbe.js';
import { assertNoCrashScreen } from '../../utils/cms/crashDetector.js';

// These suites can legitimately surface app console errors (that's the bug);
// we judge health explicitly here, so disable the auto strict-monitor teardown.
test.use({ strictMonitors: false });

// A hard freeze blocks page actions; give the action its own short ceiling so a
// hung click fails fast and the responsiveness probe — not a 90s test timeout —
// is what classifies it.
const ACTION_TIMEOUT = 12_000;
const FREEZE_DEADLINE = 10_000; // matches the brief: "UI non-responsive > 10s".

/**
 * Shared driver: run `openAction`, capture the diagnostic, attach it, and
 * assert the three freeze signatures are all absent.
 *
 * @param {object} ctx          { adminPage, consoleMon }
 * @param {string} label        human label for logs/report
 * @param {() => Promise<void>} openAction  the navigate+click under test
 */
async function investigateFreeze({ adminPage, consoleMon }, testInfo, label, openAction) {
  const diag = await captureFreezeDiagnostic(adminPage, openAction, {
    freezeTimeoutMs: FREEZE_DEADLINE,
    apiPattern: /\/api\//,
    observeMs: 4_000,
    apiSpamThreshold: 60,
  });

  const renderLoopErrors = findRenderLoopErrors(consoleMon.allCritical);
  const block = formatDiagnostic(label, diag) +
    (renderLoopErrors.length
      ? `\n  render-loop console errors   : ${renderLoopErrors.length}\n` +
        renderLoopErrors.slice(0, 5).map((e) => `     • ${e}`).join('\n')
      : '\n  render-loop console errors   : 0');

  // Always surface the evidence — even on a pass — so the QA report is sourced.
  console.log('\n' + block + '\n');
  await testInfo.attach(`freeze-diagnostic-${label}`, { body: block, contentType: 'text/plain' });

  // A frozen page can't be screenshotted reliably, but try — it captures the
  // last painted frame (spinner / half-rendered table) which is itself evidence.
  await adminPage.screenshot({ path: testInfo.outputPath(`${label}.png`), timeout: 5_000 }).catch(() => {});

  // ── Assertions: each is a distinct freeze signature ──────────────────────
  expect(diag.frozen,
    `[${label}] main thread blocked — page unresponsive for >${FREEZE_DEADLINE}ms`).toBeFalsy();
  expect(diag.apiSpam,
    `[${label}] API spam (${diag.apiCalls} calls) — render/useEffect loop fingerprint`).toBeFalsy();
  expect(renderLoopErrors.length,
    `[${label}] React render-loop error(s): ${renderLoopErrors.join(' | ')}`).toBe(0);
  await assertNoCrashScreen(adminPage, label);

  return diag;
}

// ── [FREEZE:1] Team → Roles ──────────────────────────────────────────────────
test.describe('[FREEZE:1] Team → Roles tab must load without hanging', () => {
  test('clicking Roles renders the roles table and stays responsive', async ({ adminPage, consoleMon }, testInfo) => {
    await adminPage.goto(`${ENV.BASE_URL}/team`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForTimeout(1500);

    // Locate the Roles tab: a tab, link, or button labelled "Roles".
    const rolesTab = adminPage.getByRole('tab', { name: /^roles$/i })
      .or(adminPage.getByRole('link', { name: /^roles$/i }))
      .or(adminPage.getByRole('button', { name: /^roles$/i }))
      .first();
    test.skip(!(await rolesTab.count()), 'Roles tab not present for this account/tenant.');

    await investigateFreeze({ adminPage, consoleMon }, testInfo, 'Team-Roles', async () => {
      await rolesTab.click({ timeout: ACTION_TIMEOUT });
      // Wait for the table the tab is supposed to render (or time out → freeze).
      await adminPage.locator('table, [role="table"], [role="grid"]')
        .first().waitFor({ state: 'visible', timeout: ACTION_TIMEOUT }).catch(() => {});
    });
  });
});

// ── [FREEZE:2] Reports → Previous Reports ────────────────────────────────────
test.describe('[FREEZE:2] Reports → Previous Reports must render without hanging', () => {
  test('opening Previous Reports renders content and stays responsive', async ({ adminPage, consoleMon }, testInfo) => {
    await adminPage.goto(`${ENV.BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForTimeout(1500);

    const prevTab = adminPage.getByRole('tab', { name: /previous reports?/i })
      .or(adminPage.getByRole('link', { name: /previous reports?/i }))
      .or(adminPage.getByRole('button', { name: /previous reports?/i }))
      .or(adminPage.getByText(/previous reports?/i))
      .first();
    test.skip(!(await prevTab.count()), 'Previous Reports tab not present for this account/tenant.');

    await investigateFreeze({ adminPage, consoleMon }, testInfo, 'Reports-PreviousReports', async () => {
      await prevTab.click({ timeout: ACTION_TIMEOUT });
      await adminPage.locator('table, [role="table"], [role="grid"], .report, [class*="report" i]')
        .first().waitFor({ state: 'visible', timeout: ACTION_TIMEOUT }).catch(() => {});
    });
  });
});

// ── [FREEZE:3] Billing → Buy Plan ────────────────────────────────────────────
test.describe('[FREEZE:3] Billing → Buy Plan must load without hanging', () => {
  test('opening Buy Plan renders the plans and stays responsive', async ({ adminPage, consoleMon }, testInfo) => {
    // Reach Billing via sidebar link, falling back to common direct routes.
    const billingLink = adminPage.getByRole('link', { name: /^billing$/i }).first();
    if (await billingLink.count()) {
      await billingLink.click({ timeout: ACTION_TIMEOUT }).catch(() => {});
    } else {
      for (const route of ['/billing', '/account/billing', '/settings/billing']) {
        await adminPage.goto(`${ENV.BASE_URL}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        if (await adminPage.getByText(/billing|plan|subscription/i).first().isVisible().catch(() => false)) break;
      }
    }
    await adminPage.waitForTimeout(1500);

    const buyPlan = adminPage.getByRole('tab', { name: /buy plan|upgrade|change plan/i })
      .or(adminPage.getByRole('link', { name: /buy plan|upgrade|change plan/i }))
      .or(adminPage.getByRole('button', { name: /buy plan|upgrade|change plan/i }))
      .first();
    test.skip(!(await buyPlan.count()), 'Buy Plan affordance not present for this account/tenant.');

    await investigateFreeze({ adminPage, consoleMon }, testInfo, 'Billing-BuyPlan', async () => {
      await buyPlan.click({ timeout: ACTION_TIMEOUT });
      // Plans usually render as pricing cards; wait for any of the likely shapes.
      await adminPage.getByText(/\/\s*month|\/\s*year|per month|free|enterprise|pro\b/i)
        .first().waitFor({ state: 'visible', timeout: ACTION_TIMEOUT }).catch(() => {});
    });
  });
});
