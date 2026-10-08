// =============================================================================
//  performance — load-time measurement + memory-leak / API-spam heuristics
//  for the "Performance stability" requirements.
// =============================================================================

/** Navigate to `url` and return wall-clock load time (ms) to networkidle. */
export async function measureLoad(page, url, { waitUntil = 'networkidle', timeout = 30_000 } = {}) {
  const start = Date.now();
  await page.goto(url, { waitUntil, timeout });
  return Date.now() - start;
}

/**
 * Read navigation + paint timings from the browser's Performance API.
 * Returns { domContentLoaded, load, firstContentfulPaint } in ms.
 */
export async function getPaintTimings(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
    return {
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      firstContentfulPaint: fcp ? Math.round(fcp.startTime) : null,
    };
  });
}

/**
 * JS heap size (bytes) if the runtime exposes it (Chromium only).
 * Returns null where unavailable.
 */
export async function getJsHeapUsed(page) {
  return page.evaluate(() => {
    const m = performance.memory;
    return m ? m.usedJSHeapSize : null;
  });
}

/**
 * Memory-leak heuristic: take a baseline, run `action` `iterations` times,
 * force GC if exposed, and return the heap growth. Caller asserts the growth
 * stays under a sane bound.
 */
export async function measureHeapGrowth(page, action, iterations = 5) {
  const before = await getJsHeapUsed(page);
  for (let i = 0; i < iterations; i++) await action(i);
  const after = await getJsHeapUsed(page);
  if (before == null || after == null) return { supported: false, before, after, growth: null };
  return { supported: true, before, after, growth: after - before };
}

/**
 * Counts requests matching `pattern` while `action` runs — used to detect
 * "API spam" (e.g. a render loop firing the same call repeatedly).
 */
export async function countRequests(page, pattern, action) {
  let n = 0;
  const handler = (req) => { if (pattern.test(req.url())) n++; };
  page.on('request', handler);
  try {
    await action();
  } finally {
    page.off('request', handler);
  }
  return n;
}

export default { measureLoad, getPaintTimings, getJsHeapUsed, measureHeapGrowth, countRequests };
