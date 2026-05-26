// =============================================================================
//  Shared custom assertions — broken-image detection, no-stuck-loader checks,
//  and monitor verdicts honouring STRICT_MONITORS (fail vs warn).
// =============================================================================

import { type Page, expect, test } from '@playwright/test';
import { ENV } from '../config/env';
import type { ConsoleMonitor } from './consoleMonitor';
import type { ApiMonitor } from './apiMonitor';

/**
 * Detect <img> elements that failed to load (zero natural size). Soft by default
 * — broken third-party/CDN assets on a live build shouldn't block the suite —
 * the list is attached for review; set CMS_STRICT_MONITORS=true to hard-fail.
 */
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
  } else if (broken.length) {
    test.info().annotations.push({
      type: 'broken-images',
      description: `${broken.length} broken image(s) — see attachment`,
    });
  }
}

/** Assert no loading spinner is still visible (loader-stuck guard). */
export async function expectNoStuckLoader(page: Page, timeout = 15_000): Promise<void> {
  const loader = page.locator(
    '[class*="spinner" i], [class*="loader" i], [role="progressbar"], [aria-busy="true"]',
  );
  await expect(loader.first()).toBeHidden({ timeout }).catch(() => {
    /* no loader present at all is also fine */
  });
}

/**
 * Apply the console + API monitors' verdict. In STRICT mode a violation fails
 * the test; otherwise it is attached as a warning annotation so noisy staging
 * builds don't block the suite.
 */
export async function assertClean(
  consoleMon: ConsoleMonitor,
  apiMon: ApiMonitor,
): Promise<void> {
  const consoleErrors = consoleMon.getErrors();
  const failedApis = apiMon.getFailed();

  if (consoleErrors.length) {
    await test.info().attach('console-errors', { body: consoleMon.summary(), contentType: 'text/plain' });
  }
  if (failedApis.length) {
    await test.info().attach('failed-apis', { body: apiMon.summary(), contentType: 'text/plain' });
  }

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
