/**
 * Global teardown — runs once after the whole test run.
 * Cleans up runtime-generated upload fixtures (large/corrupted/etc.).
 */
import type { FullConfig } from '@playwright/test';
import { UploadHelper } from './utils/uploadHelper.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('global-teardown');

async function globalTeardown(_config: FullConfig): Promise<void> {
  log.info('=== Global teardown: cleaning generated artifacts ===');
  UploadHelper.cleanup();
}

export default globalTeardown;
