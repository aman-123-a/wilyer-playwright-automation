// =============================================================================
//  loginHelper — single source of truth for authenticating against the CMS.
//  Uses the proven, role-based selectors that work on cms.pocsample.in.
//
//  Robustness notes:
//   • We never wait on 'networkidle' — this app keeps long-lived connections
//     open (analytics/beacons), so networkidle can never settle. We wait on
//     concrete UI signals instead (dashboard link appears / login form gone).
//   • login() is IDEMPOTENT: if the session is already authenticated (e.g. the
//     context was created from a cached storageState), it returns immediately.
//   • One retry with backoff absorbs transient rate-limiting (HTTP 429).
// =============================================================================

import { expect } from '@playwright/test';
import { ENV } from '../utils/cms/env.js';

const loginButton = (page) => page.getByRole('button', { name: /log in/i });
const dashboardLink = (page) => page.getByRole('link', { name: /dashboard/i });

/** Are we already past auth (dashboard shell visible, no login form)? */
export async function isAuthenticated(page) {
  if (await dashboardLink(page).isVisible().catch(() => false)) return true;
  return (await loginButton(page).count()) === 0
    && !/login|signin/i.test(page.url());
}

/**
 * Fill the login form and submit. Does NOT assert success — callers decide.
 * @param {import('@playwright/test').Page} page
 */
export async function fillLogin(page, email, password) {
  await page.goto(ENV.BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(
    'input[type="email"], input[placeholder*="email" i], input[name="email"]',
    { timeout: 15_000 }
  );
  await page.getByRole('textbox', { name: /email|phone/i }).fill(email);
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await loginButton(page).click();
}

/**
 * Full login that asserts we reached the dashboard. Idempotent and retrying.
 */
export async function login(page, { email = ENV.ADMIN_EMAIL, password = ENV.ADMIN_PASSWORD } = {}) {
  // Fast path: a context restored from cached storageState is already logged in.
  await page.goto(ENV.BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  if (await isAuthenticated(page)) {
    // isAuthenticated can be true on a still-rendering shell (no login form yet,
    // but the dashboard link hasn't painted). Confirm the link, and if it never
    // appears, fall through to a real login rather than throwing.
    if (await dashboardLink(page).isVisible().catch(() => false)
        || await dashboardLink(page).waitFor({ state: 'visible', timeout: 40_000 })
             .then(() => true).catch(() => false)) {
      return page;
    }
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    await fillLogin(page, email, password);
    try {
      await dashboardLink(page).waitFor({ state: 'visible', timeout: 25_000 });
      await expect(loginButton(page), 'Expected to be past the login screen')
        .toHaveCount(0, { timeout: 10_000 });
      return page;
    } catch (err) {
      // Still on the login screen — likely transient rate-limiting (429). Back off and retry once.
      if (attempt === 1 && (await loginButton(page).count()) > 0) {
        await page.waitForTimeout(4000);
        continue;
      }
      throw err;
    }
  }
  return page;
}

export const loginAsAdmin = (page) =>
  login(page, { email: ENV.ADMIN_EMAIL, password: ENV.ADMIN_PASSWORD });

export const loginAsSubuser = (page) =>
  login(page, { email: ENV.SUBUSER_EMAIL, password: ENV.SUBUSER_PASSWORD });

/** Log out via the sidebar link and confirm we're back on the login screen. */
export async function logout(page) {
  await page.getByRole('link', { name: /logout|log out|sign out/i }).first().click();
  await expect(loginButton(page)).toBeVisible({ timeout: 15_000 });
}

export default { isAuthenticated, fillLogin, login, loginAsAdmin, loginAsSubuser, logout };
