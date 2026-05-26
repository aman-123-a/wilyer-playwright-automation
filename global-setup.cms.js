// =============================================================================
//  Global setup for the CMS regression suite.
// =============================================================================
//  Runs once before the whole suite. Responsibilities:
//   1. Fail fast with a clear message if the target app is unreachable.
//   2. Pre-authenticate the admin account once and persist the storage state
//      so specs can reuse it instead of logging in on every test (faster,
//      fewer auth requests). Specs that need a fresh/sub-user session still
//      log in explicitly.
//
//  Auth state is written to `.auth/admin.json` (git-ignored).
//  If pre-auth fails (e.g. creds changed), we DON'T hard-fail the run — specs
//  fall back to logging in themselves via loginHelper.
// =============================================================================

import { chromium, request } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from './utils/cms/env.js';
import { login, isAuthenticated } from './helpers/loginHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ADMIN_STATE = path.join(__dirname, '.auth', 'admin.json');

async function assertAppReachable() {
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const res = await ctx.get(ENV.BASE_URL, { timeout: 30_000 });
    if (res.status() >= 500) {
      throw new Error(`Target app returned ${res.status()} — server may be down.`);
    }
    console.log(`[global-setup] ${ENV.BASE_URL} reachable (HTTP ${res.status()})`);
  } finally {
    await ctx.dispose();
  }
}

async function cacheAdminSession() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  try {
    await login(page, { email: ENV.ADMIN_EMAIL, password: ENV.ADMIN_PASSWORD });

    if (!(await isAuthenticated(page))) {
      console.warn('[global-setup] Admin pre-auth did not reach dashboard — specs will self-login.');
      return;
    }

    fs.mkdirSync(path.dirname(ADMIN_STATE), { recursive: true });
    await page.context().storageState({ path: ADMIN_STATE });
    console.log(`[global-setup] Admin session cached -> ${ADMIN_STATE}`);
  } catch (err) {
    console.warn(`[global-setup] Could not cache admin session (${err.message}). Specs will self-login.`);
  } finally {
    await browser.close();
  }
}

export default async function globalSetup() {
  await assertAppReachable();
  await cacheAdminSession();
}
