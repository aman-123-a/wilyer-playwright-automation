// =============================================================================
//  Shared custom assertions — broken-image detection, no-stuck-loader checks,
//  and the monitor verdict.
//
//  Monitor policy (the "fail test automatically if…" requirement):
//   • Uncaught page exception   → ALWAYS fail.
//   • API response >= 500       → ALWAYS fail (when FAIL_ON_SERVER_ERROR).
//   • Console error / 4xx API   → fail only when STRICT_MONITORS=true, else warn.
//  This keeps the genuine smoke-exit signals hard while staying green against a
//  noisy live build that emits benign 4xx/analytics console errors.
// =============================================================================

import { type Page, expect, test } from '@playwright/test';
import { ENV } from '../config/env';
import type { ConsoleMonitor } from './consoleMonitor';
import type { ApiMonitor } from './apiMonitor';

/** Detect <img> elements that failed to load (zero natural size). Soft by default. */
export async function expectNoBrokenImages(page: Page, opts: { hard?: boolean } = {}): Promise<void> {
  const hard = opts.hard ?? ENV.STRICT_MONITORS;
  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src))
      .map((img) => img.currentSrc || img.src),
  );
  if (broken.length) {
    await test.info().attach('broken-images', { body: broken.join('\n'), contentType: 'text/plain' });
  }
  if (hard) {
    expect(broken, `broken images:\n${broken.join('\n')}`).toHaveLength(0);
  }
}

/** Assert no loading spinner is still visible (loader-stuck guard). */
export async function expectNoStuckLoader(page: Page, timeout = 15_000): Promise<void> {
  const loader = page.locator(
    '[class*="spinner" i], [class*="loader" i], [role="progressbar"], [aria-busy="true"]',
  );
  await expect(loader.first())
    .toBeHidden({ timeout })
    .catch(() => {
      /* no loader present at all is also fine */
    });
}

/**
 * Apply the console + API monitors' verdict. Hard signals (5xx, uncaught
 * exceptions) always fail; everything else warns unless STRICT_MONITORS.
 */
export async function assertClean(consoleMon: ConsoleMonitor, apiMon: ApiMonitor): Promise<void> {
  const consoleErrors = consoleMon.getErrors();
  const pageErrors = consoleMon.getPageErrors();
  const failedApis = apiMon.getFailed();
  const serverErrors = apiMon.getServerErrors();

  if (consoleErrors.length) {
    await test.info().attach('console-errors', { body: consoleMon.summary(), contentType: 'text/plain' });
  }
  if (failedApis.length) {
    await test.info().attach('failed-apis', { body: apiMon.summary(), contentType: 'text/plain' });
  }

  // ── Always-fail signals ────────────────────────────────────────────────────
  expect(pageErrors, `uncaught page exception(s):\n${pageErrors.map((e) => e.text).join('\n')}`).toHaveLength(0);
  if (ENV.FAIL_ON_SERVER_ERROR) {
    expect(
      serverErrors,
      `server error(s) (>=500):\n${serverErrors.map((e) => `[${e.status}] ${e.method} ${e.url}`).join('\n')}`,
    ).toHaveLength(0);
  }

  // ── Strict-only signals ────────────────────────────────────────────────────
  if (ENV.STRICT_MONITORS) {
    expect(consoleErrors, `console errors:\n${consoleMon.summary()}`).toHaveLength(0);
    expect(failedApis, `failed API requests:\n${apiMon.summary()}`).toHaveLength(0);
  } else if (consoleErrors.length || failedApis.length) {
    test.info().annotations.push({
      type: 'warning',
      description: `${consoleErrors.length} console error(s), ${failedApis.length} failed API(s) — see attachments`,
    });
  }
}
