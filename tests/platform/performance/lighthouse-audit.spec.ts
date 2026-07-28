// =============================================================================
//  LIGHTHOUSE PERFORMANCE AUDITS
//  Audits the public login page (no auth needed for CDP-driven Lighthouse) and
//  asserts category scores against configured thresholds. HTML+JSON reports
//  land in lighthouse-reports/.
//
//  Run:  npm run perf:lighthouse
//  Note: launches its own Chromium over a remote-debugging port — keep this in
//  the chromium project and avoid running it on webkit/firefox.
// =============================================================================

import { test } from '@playwright/test';
import { auditPage } from '../../../utils/lighthouse';
import { ENV } from '../../../config/env';

test.describe('Lighthouse', () => {
  // Lighthouse runs are slow; give them room and don't retry.
  test.describe.configure({ timeout: 180_000, retries: 0 });

  test('login page meets Lighthouse thresholds @regression', async () => {
    await auditPage({ url: `${ENV.BASE_URL}/`, name: 'login' });
  });
});
