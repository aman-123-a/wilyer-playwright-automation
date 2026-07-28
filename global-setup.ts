// =============================================================================
//  Global setup — runs ONCE before the whole suite (before any project).
//  Responsibilities:
//   • Print the resolved target so a run is never ambiguous in a CI log.
//   • Fail fast, with a clear message, when the app or credentials are missing.
//   • Warn when pointed at an API host we have not actually confirmed.
//   • Ensure artifact + storage directories exist.
//
//  Authentication itself happens in the `setup` project (tests/global.setup.ts)
//  so the cached session can be reused across all browser projects.
// =============================================================================

import { request, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ENV, hasAdminCredentials } from './config/env';

function banner(): void {
  const lines = [
    `Environment : ${ENV.NAME} (${ENV.LABEL})`,
    `Application : ${ENV.BASE_URL}`,
    `API         : ${ENV.API_BASE_URL} [${ENV.API_CONFIDENCE}]`,
    `Destructive : ${ENV.ALLOW_DESTRUCTIVE ? 'ALLOWED' : 'blocked'}${
      ENV.IS_PRODUCTION ? ' (forced off — production)' : ''
    }`,
  ];
  const width = Math.max(...lines.map((l) => l.length));
  const box = [
    `┌─${'─'.repeat(width)}─┐`,
    ...lines.map((l) => `│ ${l.padEnd(width)} │`),
    `└─${'─'.repeat(width)}─┘`,
  ];
  // eslint-disable-next-line no-console
  console.log(`\n${box.join('\n')}\n`);
}

async function globalSetup(_config: FullConfig): Promise<void> {
  banner();

  for (const dir of [`storage/${ENV.NAME}`, 'reports', 'lighthouse-reports']) {
    mkdirSync(dir, { recursive: true });
  }

  if (!hasAdminCredentials()) {
    throw new Error(
      'No admin credentials. Copy .env.example to .env and set CMS_ADMIN_EMAIL / ' +
        'CMS_ADMIN_PASSWORD (or supply them as CI secrets). Credentials are never ' +
        'committed to this repository.',
    );
  }

  // An inferred API host produces confusing 404s that read like product bugs.
  // Say so once, loudly, rather than letting every API spec fail mysteriously.
  if (ENV.API_CONFIDENCE === 'convention') {
    // eslint-disable-next-line no-console
    console.warn(
      `⚠ API host for "${ENV.NAME}" is inferred from the cmsN → v3-5apiN naming ` +
        `convention and has NOT been confirmed against the live server. ` +
        `If API suites fail, verify the host and set CMS_API_BASE_URL.`,
    );
  }

  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const res = await ctx.get(ENV.BASE_URL, { timeout: 30_000 });
    if (!res.ok() && res.status() >= 500) {
      throw new Error(
        `CMS unreachable: ${ENV.BASE_URL} returned ${res.status()}. ` +
          `Check the target environment / network before running the suite.`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(`✓ CMS reachable at ${ENV.BASE_URL} (HTTP ${res.status()})`);
  } finally {
    await ctx.dispose();
  }
}

export default globalSetup;
