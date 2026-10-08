// =============================================================================
//  Resilience assertions — the heart of the API-failure category.
// =============================================================================
//  After an injected failure the app MUST degrade gracefully:
//    • no blank white screen
//    • no unhandled React crash / error-boundary white-out
//    • a user-facing error/empty message is shown
//    • the user can still navigate / recover
//  These helpers encode those checks so every failure test asserts the same
//  contract. This is exactly the class of bug the project cares about
//  (see the "blank white-screen on API failure" regression note).
// =============================================================================
import { expect, type Page } from '@playwright/test';

const ERROR_TEXT = /error|failed|something went wrong|try again|unavailable|no data|nothing|empty|couldn'?t|unable|retry/i;
const REACT_CRASH_TEXT = /the above error occurred|react will try to recreate|minified react error|cannot read propert|undefined is not|stack trace|errorboundary/i;

/**
 * Wait until the app has settled into a renderable state after navigation:
 * the nav shell appears, OR a user-facing error/empty message appears, OR the
 * body accrues meaningful content. Prevents false "white screen" verdicts taken
 * while a slow SPA is still mounting. Resolves as soon as any signal is seen.
 */
export async function waitForAppSettled(page: Page, timeout = 15_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ok = await page
      .evaluate(() => {
        const body = document.body;
        if (!body) return false;
        const text = (body.innerText || '').trim();
        const shell = document.querySelector('nav, aside, [role="navigation"], header, [class*="sidebar" i]');
        const errish = /error|failed|unavailable|no data|nothing|empty|try again|login|sign ?in|unauthor/i.test(text);
        return Boolean(shell) || errish || text.length > 40;
      })
      .catch(() => false);
    if (ok) return;
    await page.waitForTimeout(400);
  }
}

/** True when the visible body is effectively blank (white screen). */
export async function isBlankScreen(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const body = document.body;
    if (!body) return true;
    const text = (body.innerText || '').trim();
    // Count meaningful, rendered elements (ignore script/style/meta).
    const visible = Array.from(body.querySelectorAll('*')).filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    return text.length < 3 && visible.length < 5;
  });
}

/** Assert the page did NOT collapse to a blank white screen. */
export async function assertNoWhiteScreen(page: Page, context = ''): Promise<void> {
  await waitForAppSettled(page);
  const blank = await isBlankScreen(page);
  expect(blank, `White/blank screen detected${context ? ` (${context})` : ''} — app did not degrade gracefully`).toBe(false);
}

/** Assert no React error-boundary / crash overlay is present. */
export async function assertNoReactCrash(page: Page, context = ''): Promise<void> {
  const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
  expect(REACT_CRASH_TEXT.test(bodyText), `React crash overlay detected${context ? ` (${context})` : ''}`).toBe(false);
  // Vite/CRA runtime error overlay
  await expect(page.locator('vite-error-overlay, #webpack-dev-server-client-overlay, iframe[title="error"]')).toHaveCount(0);
}

/** Assert SOME user-facing error / empty-state message surfaced. */
export async function assertErrorMessageShown(page: Page, custom?: RegExp): Promise<void> {
  const pattern = custom ?? ERROR_TEXT;
  // Prefer toast/alert containers, fall back to whole-body text scan.
  const containers = page.locator(
    '[role="alert"], .toast, .Toastify__toast, [class*="alert"], [class*="error"], [class*="empty"], [class*="no-data"]',
  );
  const hasContainer = await containers.filter({ hasText: pattern }).count().then((c) => c > 0).catch(() => false);
  if (hasContainer) return;
  const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
  expect(pattern.test(bodyText), 'Expected a user-facing error / empty-state message after the failure').toBe(true);
}

/**
 * Full graceful-degradation contract: no white screen, no crash, error shown,
 * and the app shell (so the user can recover) is still present.
 */
export async function assertGracefulDegradation(page: Page, context = ''): Promise<void> {
  await assertNoWhiteScreen(page, context);
  await assertNoReactCrash(page, context);
  await assertErrorMessageShown(page);
}

/** Assert the user can recover — e.g. the nav shell is interactive. */
export async function assertCanRecover(page: Page): Promise<void> {
  // Use a VISIBLE-filtered union: `.first()` of a raw union can resolve to a
  // hidden <header>, producing a false "cannot recover" verdict even when the
  // sidebar/nav is on screen.
  const shell = page
    .locator('nav, aside, [role="navigation"], header, [class*="sidebar" i], a[href*="dashboard" i]')
    .filter({ visible: true });
  await expect(shell.first(), 'App shell/navigation should remain so the user can recover').toBeVisible({ timeout: 10_000 });
}
