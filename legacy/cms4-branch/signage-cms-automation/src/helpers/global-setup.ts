// =============================================================================
//  Global setup — runs ONCE before the whole suite (before any project), for
//  EVERY invocation style (full run, --grep, single test in the IDE).
//   • Ensures artifact directories exist.
//   • Verifies the application is reachable (fail fast with a clear message).
//   • Logs in once as admin and caches the session to .auth/admin.json so every
//     browser project reuses it via storageState (the "reusable login fixture so
//     all smoke tests authenticate automatically" requirement).
//
//  Doing auth here (rather than as a `setup` project dependency) makes it
//  filter-proof: a path-/grep-filtered run still gets an authenticated session.
// =============================================================================

import { chromium, request, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ENV, ADMIN_STORAGE_STATE } from '../config/env';
import { LoginPage } from '../pages/LoginPage';

async function globalSetup(_config: FullConfig): Promise<void> {
  for (const dir of ['.auth', 'reports', 'allure-results']) {
    mkdirSync(dir, { recursive: true });
  }

  // ── Reachability check ──────────────────────────────────────────────────────
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const res = await ctx.get(ENV.BASE_URL, { timeout: 30_000 });
    if (res.status() >= 500) {
      throw new Error(
        `CMS unreachable: ${ENV.BASE_URL} returned ${res.status()}. ` +
          `Check CMS_BASE_URL / network before running the suite.`,
      );
    }
    console.log(`✓ CMS reachable at ${ENV.BASE_URL} (HTTP ${res.status()})`);
  } finally {
    await ctx.dispose();
  }

  // ── Authenticate once + cache the session ───────────────────────────────────
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: ENV.BASE_URL, ignoreHTTPSErrors: true });
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ENV.ADMIN);

    const authed = await login.isAuthenticated();
    if (!authed) {
      throw new Error('Admin login failed during global setup — check CMS_ADMIN_EMAIL / CMS_ADMIN_PASSWORD.');
    }
    await page.context().storageState({ path: ADMIN_STORAGE_STATE });
    console.log('✓ Admin session cached to', ADMIN_STORAGE_STATE);
  } finally {
    await browser.close();
  }
}

export default globalSetup;
