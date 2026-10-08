// =============================================================================
//  Global teardown — runs ONCE after the whole suite. Hook for cross-run
//  cleanup; kept intentionally light.
// =============================================================================

import type { FullConfig } from '@playwright/test';

async function globalTeardown(_config: FullConfig): Promise<void> {
  console.log('✓ Suite complete. Reports in playwright-report/ and allure-results/.');
}

export default globalTeardown;
