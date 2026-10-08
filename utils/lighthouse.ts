// =============================================================================
//  Lighthouse helper — runs an audit against a URL using the Chromium instance
//  Playwright already launched (via the remote-debugging port), then asserts
//  category scores meet the configured thresholds. Writes an HTML report.
//
//  Requires the chromium project to expose a debugging port. We launch a fresh
//  audit context so the page state doesn't interfere with the test browser.
// =============================================================================

import { test, expect } from '@playwright/test';
import { playAudit } from 'playwright-lighthouse';
import { chromium } from '@playwright/test';
import { ENV } from '../config/env';

export interface LighthouseOptions {
  url: string;
  /** Report file name (under lighthouse-reports/). */
  name: string;
  thresholds?: Partial<typeof ENV.LIGHTHOUSE>;
}

/**
 * Run a Lighthouse audit. Launches its own headless Chromium with a fixed
 * remote-debugging port (playwright-lighthouse connects over CDP).
 */
export async function runLighthouse({ url, name, thresholds }: LighthouseOptions): Promise<void> {
  const port = 9222;
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'load' });
    await playAudit({
      page,
      port,
      thresholds: { ...ENV.LIGHTHOUSE, ...thresholds },
      reports: {
        formats: { html: true, json: true },
        name,
        directory: 'lighthouse-reports',
      },
    });
  } finally {
    await page.close();
    await browser.close();
  }
}

/** Convenience wrapper that also attaches the report path to the test. */
export async function auditPage(opts: LighthouseOptions): Promise<void> {
  await runLighthouse(opts);
  test.info().annotations.push({
    type: 'lighthouse',
    description: `Report: lighthouse-reports/${opts.name}.html`,
  });
  expect(true).toBeTruthy();
}
