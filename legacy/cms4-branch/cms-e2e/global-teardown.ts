// =============================================================================
//  Global teardown — runs ONCE after the whole suite.
//  Hook for cross-run cleanup (deleting test data created during destructive
//  runs, flushing aggregate logs, etc.). Kept intentionally light.
// =============================================================================

import type { FullConfig } from '@playwright/test';

async function globalTeardown(_config: FullConfig): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('✓ Suite complete. Reports in playwright-report/ and allure-results/.');
}

export default globalTeardown;
