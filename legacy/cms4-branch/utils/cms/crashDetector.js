// =============================================================================
//  crashDetector — frontend health probes for the "Global Frontend Validation"
//  requirements. Detects:
//    • white screen / blank page          (no meaningful rendered content)
//    • infinite loading spinner            (loader never disappears)
//    • React error boundary / crash screen (common crash text)
// =============================================================================

import { expect } from '@playwright/test';

const CRASH_TEXT = [
  /something went wrong/i,
  /application error/i,
  /unexpected error/i,
  /this page (isn'?t|is not) working/i,
  /chunk(?:Load)?Error/i,
  /loading chunk \d+ failed/i,
  /minified react error/i,
];

const LOADER_SELECTORS = [
  '.spinner',
  '.loader',
  '.loading',
  '[class*="spinner" i]',
  '[class*="loading" i]',
  '[role="progressbar"]',
  '[aria-busy="true"]',
];

/**
 * Returns true if the page rendered meaningful content (not a blank/white screen).
 * A blank page typically has near-empty body text and no interactive elements.
 */
export async function hasRenderedContent(page) {
  return page.evaluate(() => {
    const text = (document.body?.innerText ?? '').trim();
    const interactive = document.querySelectorAll(
      'a, button, input, table, [role="button"], [role="link"], nav, main, img'
    ).length;
    return text.length > 20 || interactive > 3;
  });
}

/** Throws if the page looks like a white/blank screen. */
export async function assertNotBlank(page, label = 'page') {
  const ok = await hasRenderedContent(page);
  expect(ok, `Blank/white screen detected on ${label}`).toBeTruthy();
}

/** Throws if a known crash / error-boundary message is on screen. */
export async function assertNoCrashScreen(page, label = 'page') {
  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  for (const re of CRASH_TEXT) {
    expect(re.test(body), `Crash screen text matched ${re} on ${label}`).toBeFalsy();
  }
}

/**
 * Waits for any loading spinner to disappear within `timeout`.
 * Throws if a loader is still visible — i.e. an "infinite spinner".
 */
export async function assertLoaderCleared(page, { timeout = 15_000, label = 'page' } = {}) {
  const loader = page.locator(LOADER_SELECTORS.join(', ')).first();
  const present = await loader.count();
  if (present === 0) return; // no loader rendered at all — fine
  await expect(loader, `Infinite loading spinner on ${label}`).toBeHidden({ timeout });
}

/** One-shot full health check used by global-frontend tests. */
export async function assertHealthy(page, label = 'page') {
  await assertNotBlank(page, label);
  await assertNoCrashScreen(page, label);
  await assertLoaderCleared(page, { label });
}

export default { hasRenderedContent, assertNotBlank, assertNoCrashScreen, assertLoaderCleared, assertHealthy };
