// =============================================================================
//  Screenshot helpers — capture and attach a named screenshot to the active
//  test (so it shows in the HTML + Allure reports). Used by the fixtures to grab
//  a "before execution" and "after execution" frame for every test, in addition
//  to Playwright's automatic "on failure" capture.
// =============================================================================

import { type Page, test } from '@playwright/test';

/** Take a full-page screenshot and attach it to the current test report. */
export async function captureAndAttach(page: Page, label: string): Promise<void> {
  // Never let a screenshot failure (e.g. page already closed) break the test.
  try {
    const buffer = await page.screenshot({ fullPage: false, timeout: 8_000 });
    await test.info().attach(label, { body: buffer, contentType: 'image/png' });
  } catch {
    /* page not in a screenshot-able state — ignore */
  }
}
