// =============================================================================
//  Performance helpers — Navigation Timing + paint metrics pulled from the
//  browser, plus a simple JS-heap reader (Chromium only) for memory-leak checks.
// =============================================================================

import { type Page, expect, test } from '@playwright/test';
import { ENV } from '../config/env';

export interface PageMetrics {
  /** navigationStart → loadEventEnd. */
  loadMs: number;
  /** navigationStart → domContentLoadedEventEnd. */
  domContentLoadedMs: number;
  /** First Contentful Paint, if available. */
  fcpMs: number | null;
  /** Time to first byte. */
  ttfbMs: number;
}

/** Read Navigation Timing + paint metrics from the current page. */
export async function collectMetrics(page: Page): Promise<PageMetrics> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0] as
      PerformanceEntry | undefined;
    return {
      loadMs: nav ? Math.round(nav.loadEventEnd) : 0,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      fcpMs: fcp ? Math.round(fcp.startTime) : null,
      ttfbMs: nav ? Math.round(nav.responseStart) : 0,
    };
  });
}

/** Current JS heap usage in MB (Chromium only; null elsewhere). */
export async function jsHeapMB(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    // @ts-expect-error — non-standard, Chromium only.
    const mem = performance.memory;
    return mem ? Math.round(mem.usedJSHeapSize / (1024 * 1024)) : null;
  });
}

/**
 * Measure wall-clock time for an async navigation/action against `budgetMs`.
 * The elapsed time is always recorded as a test annotation. By default a budget
 * overrun is a *soft* failure (annotation/warning) so a slow staging build does
 * not block the suite; set CMS_STRICT_MONITORS=true (or pass `hard: true`) to
 * turn it into a hard assertion for nightly/perf gates.
 * Returns the elapsed time.
 */
export async function measure(
  label: string,
  budgetMs: number,
  action: () => Promise<unknown>,
  opts: { hard?: boolean } = {},
): Promise<number> {
  const hard = opts.hard ?? ENV.STRICT_MONITORS;
  const start = Date.now();
  await action();
  const elapsed = Date.now() - start;

  const within = elapsed < budgetMs;
  test.info().annotations.push({
    type: within ? 'perf' : 'perf-budget-exceeded',
    description: `${label}: ${elapsed}ms (budget ${budgetMs}ms)`,
  });

  if (hard) {
    expect(
      elapsed,
      `${label} should complete under ${budgetMs}ms (took ${elapsed}ms)`,
    ).toBeLessThan(budgetMs);
  }
  return elapsed;
}
