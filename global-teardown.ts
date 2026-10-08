// =============================================================================
//  Global teardown — runs ONCE after the whole suite.
//  Hook for cross-run cleanup (deleting test data created during destructive
//  runs, flushing aggregate logs, etc.). Kept intentionally light.
// =============================================================================

import type { FullConfig } from '@playwright/test';
import { ENV } from './config/env';

async function globalTeardown(_config: FullConfig): Promise<void> {
  const reports = `reports/${ENV.NAME}`;

  console.log(
    `✓ Suite complete against ${ENV.NAME} (${ENV.LABEL}). ` +
      `HTML: ${reports}/html — Allure: ${reports}/allure-results`,
  );
}

export default globalTeardown;
