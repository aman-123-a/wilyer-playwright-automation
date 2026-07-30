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

// ---------------------------------------------------------------------------
//  Latency sampling — for API performance checks.
//
//  A single timing is noise: one GC pause or one cold connection swings it by
//  hundreds of ms. Everything here works on a SAMPLE, and assertions are made
//  against p95 rather than max, so one outlier cannot fail a run on its own.
// ---------------------------------------------------------------------------

export interface LatencyStats {
  n: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

/** Percentile by nearest-rank over an unsorted sample. */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

export function latencyStats(samples: number[]): LatencyStats {
  const n = samples.length;
  if (n === 0) return { n: 0, min: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  return {
    n,
    min: Math.min(...samples),
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    max: Math.max(...samples),
    mean: Math.round(samples.reduce((a, b) => a + b, 0) / n),
  };
}

/**
 * Time an async action `runs` times and return the sample.
 *
 * The first call is discarded as a warm-up: it pays TLS handshake and
 * connection setup that the rest of the sample does not, and including it
 * inflates the mean on a small sample.
 */
export async function sampleLatency(
  runs: number,
  action: (iteration: number) => Promise<unknown>,
): Promise<number[]> {
  await action(-1); // warm-up, discarded
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = Date.now();
    await action(i);
    samples.push(Date.now() - start);
  }
  return samples;
}

/** One-line table row, for perf summaries attached to the test report. */
export function formatStats(label: string, s: LatencyStats, extra = ''): string {
  return (
    `${label.padEnd(38)} n=${String(s.n).padStart(2)}  ` +
    `min=${String(s.min).padStart(5)}ms  p50=${String(s.p50).padStart(5)}ms  ` +
    `p95=${String(s.p95).padStart(5)}ms  max=${String(s.max).padStart(5)}ms${extra}`
  );
}
