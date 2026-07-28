/**
 * Login + session-management helper.
 *
 * Provides:
 *  - `login()` with retry (handles flaky first-load / slow auth),
 *  - dashboard-load + network-idle validation after authentication,
 *  - storage-state persistence so authenticated sessions can be reused across
 *    tests without re-logging-in every time (faster, less flaky).
 *
 * The actual field interactions are delegated to LoginPage so selectors live in
 * one place; this helper owns the orchestration/retry policy.
 */
import fs from 'node:fs';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { DashboardPage } from '../pages/DashboardPage.js';
import { env, type UserCredentials } from '../config/env.js';
import { STORAGE_STATE } from '../config/constants.js';
import { createLogger } from './logger.js';

const log = createLogger('loginHelper');

export type Role = 'maker' | 'checker';

export const LoginHelper = {
  /**
   * Log a user in through the UI with retry, then validate the dashboard is
   * loaded and the network is idle.
   */
  async login(page: Page, user: UserCredentials, attempts = 3): Promise<void> {
    const loginPage = new LoginPage(page);
    const dashboard = new DashboardPage(page);

    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        log.info(`Login attempt ${attempt}/${attempts} for ${user.email}`);
        await loginPage.goto();
        await loginPage.login(user.email, user.password);
        await dashboard.waitForLoaded();
        await page.waitForLoadState('networkidle', { timeout: env.exec.navTimeoutMs });
        log.info(`Login succeeded for ${user.email}`);
        return;
      } catch (err) {
        lastError = err;
        log.warn(`Login attempt ${attempt} failed: ${String(err)}`);
        if (attempt < attempts) {
          await page.waitForTimeout(1_000 * attempt); // linear backoff
        }
      }
    }
    throw new Error(`Login failed for ${user.email} after ${attempts} attempts: ${String(lastError)}`);
  },

  /**
   * Create a fresh authenticated context for a role and persist its storage
   * state to disk. Used by global setup so specs can start already logged in.
   */
  async createAuthenticatedState(browser: Browser, role: Role): Promise<string> {
    fs.mkdirSync(STORAGE_STATE.authDir, { recursive: true });
    const user = env.users[role];
    const statePath = STORAGE_STATE[role];

    const context = await browser.newContext({ baseURL: env.app.baseURL });
    const page = await context.newPage();
    try {
      await this.login(page, user);
      await context.storageState({ path: statePath });
      log.info(`Stored ${role} session -> ${statePath}`);
      return statePath;
    } finally {
      await context.close();
    }
  },

  /** True if a non-empty storage-state file already exists for a role. */
  hasStoredState(role: Role): boolean {
    const p = STORAGE_STATE[role];
    return fs.existsSync(p) && fs.statSync(p).size > 0;
  },

  /** Open a new context pre-loaded with a role's stored session. */
  async contextForRole(browser: Browser, role: Role): Promise<BrowserContext> {
    return browser.newContext({
      baseURL: env.app.baseURL,
      storageState: STORAGE_STATE[role],
    });
  },
};
