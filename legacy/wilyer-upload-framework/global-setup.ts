/**
 * Global setup — runs once before the whole test run.
 *
 *  1. Validates required env is present (fails fast with a clear message).
 *  2. Logs both the Maker and Checker in via the UI and persists their
 *     storage-state to disk, so role-scoped fixtures start already authenticated
 *     (faster, less flaky than logging in per-test).
 *
 * If authentication fails here, the whole run aborts with a descriptive error
 * rather than every test failing opaquely.
 */
import { chromium, type FullConfig } from '@playwright/test';
import { LoginHelper } from './utils/loginHelper.js';
import { env } from './config/env.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('global-setup');

async function globalSetup(_config: FullConfig): Promise<void> {
  log.info('=== Global setup: preparing authenticated sessions ===');
  // Touch env early so a missing var fails before launching a browser.
  log.info(`Base URL: ${env.app.baseURL}`);

  const browser = await chromium.launch();
  try {
    await LoginHelper.createAuthenticatedState(browser, 'maker');
    await LoginHelper.createAuthenticatedState(browser, 'checker');
    log.info('=== Global setup complete ===');
  } catch (err) {
    log.error('Global setup failed — authentication could not be established', String(err));
    throw err;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
