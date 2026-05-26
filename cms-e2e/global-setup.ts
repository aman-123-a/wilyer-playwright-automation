// =============================================================================
//  Global setup — runs ONCE before the whole suite (before any project).
//  Responsibilities:
//   • Verify the application is reachable (fail fast with a clear message).
//   • Ensure artifact directories exist.
//  Authentication itself happens in the `setup` project (tests/global.setup.ts)
//  so the cached session can be reused across all browser projects.
// =============================================================================

import { request, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ENV } from './config/env';

async function globalSetup(_config: FullConfig): Promise<void> {
  for (const dir of ['.auth', 'reports', 'lighthouse-reports']) {
    mkdirSync(dir, { recursive: true });
  }

  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const res = await ctx.get(ENV.BASE_URL, { timeout: 30_000 });
    if (!res.ok() && res.status() >= 500) {
      throw new Error(
        `CMS unreachable: ${ENV.BASE_URL} returned ${res.status()}. ` +
          `Check CMS_BASE_URL / network before running the suite.`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(`✓ CMS reachable at ${ENV.BASE_URL} (HTTP ${res.status()})`);
  } finally {
    await ctx.dispose();
  }
}

export default globalSetup;
