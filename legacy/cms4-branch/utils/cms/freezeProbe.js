// =============================================================================
//  freezeProbe — detects UI freezes / renderer hangs that the crashDetector
//  (blank screen / spinner / crash text) cannot catch.
//
//  The three reported defects (Team→Roles, Reports→Previous Reports,
//  Billing→Buy Plan) all present as "the browser hangs completely". That has a
//  small set of mechanical signatures, and this module measures each one:
//
//    1. MAIN-THREAD BLOCK  — a true freeze. While JS spins (e.g. while(true) or
//       a synchronous render storm) the page cannot run *any* script, so a
//       trivial `page.evaluate(() => 1)` never resolves. We race it against a
//       deadline; if the deadline wins, the main thread is blocked.
//
//    2. RENDER-LOOP / API SPAM — a useEffect dependency loop or recursive render
//       fires the same request hundreds of times. We count API hits during the
//       action; an abnormal burst is the fingerprint of a render loop.
//
//    3. INFINITE-UPDATE CONSOLE SIGNATURE — React logs
//       "Maximum update depth exceeded" / "Too many re-renders" when a
//       setState loop trips its guard. We scan captured console/page errors.
//
//    4. DOM EXPLOSION — a large table rendered without virtualization balloons
//       the node count and stalls layout. We snapshot document node count.
//
//  Everything here is non-throwing and returns structured data so a spec can
//  log a full diagnostic even when one signal trips, then assert at the end.
// =============================================================================

const RENDER_LOOP_TEXT = [
  /maximum update depth exceeded/i,
  /too many re-?renders/i,
  /maximum call stack size exceeded/i,
  /rendered more hooks than during the previous render/i,
];

/**
 * Probe whether the renderer main thread is responsive.
 * Races a trivial in-page evaluate against a deadline. If the evaluate cannot
 * complete, the main thread is blocked (a hard freeze).
 *
 * @returns {Promise<{responsive:boolean, ms:number}>}
 */
export async function probeResponsiveness(page, timeoutMs = 10_000) {
  const start = Date.now();
  const probe = page
    .evaluate(() => Date.now())
    .then(() => true)
    .catch(() => false); // navigation/exec-context teardown ≠ freeze
  const deadline = new Promise((resolve) =>
    setTimeout(() => resolve('TIMEOUT'), timeoutMs)
  );
  const result = await Promise.race([probe, deadline]);
  return {
    responsive: result === true,
    ms: result === 'TIMEOUT' ? timeoutMs : Date.now() - start,
  };
}

/** Total DOM node count — a proxy for un-virtualized large-table rendering. */
export async function domNodeCount(page) {
  return page
    .evaluate(() => document.getElementsByTagName('*').length)
    .catch(() => -1); // -1 means we couldn't even ask → likely frozen
}

/** Scan a list of console/page error strings for render-loop signatures. */
export function findRenderLoopErrors(errorStrings = []) {
  return errorStrings.filter((t) => RENDER_LOOP_TEXT.some((re) => re.test(t)));
}

/**
 * Run `action` (e.g. clicking the offending tab) while counting API calls and
 * watching for a main-thread block. Returns a structured diagnostic.
 *
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} action          the navigation/click under test
 * @param {object} opts
 * @param {RegExp} [opts.apiPattern=/\/api\//]   which requests to count
 * @param {number} [opts.freezeTimeoutMs=10000]  responsiveness deadline
 * @param {number} [opts.observeMs=4000]         settle window after the action
 * @param {number} [opts.apiSpamThreshold=60]    calls above this = render loop
 * @returns {Promise<FreezeDiagnostic>}
 */
export async function captureFreezeDiagnostic(page, action, opts = {}) {
  const {
    apiPattern = /\/api\//,
    freezeTimeoutMs = 10_000,
    observeMs = 4_000,
    apiSpamThreshold = 60,
  } = opts;

  let apiCalls = 0;
  const requestHandler = (req) => {
    if (apiPattern.test(req.url())) apiCalls++;
  };
  page.on('request', requestHandler);

  const domBefore = await domNodeCount(page);
  const start = Date.now();

  // The action itself may hang (Playwright will throw on its own action
  // timeout); we swallow that and let the responsiveness probe classify it.
  let actionError = null;
  try {
    await action();
  } catch (e) {
    actionError = String(e?.message ?? e);
  }

  // Let any render loop / late requests breathe so we can observe the burst.
  await page.waitForTimeout(observeMs).catch(() => {});

  const responsiveness = await probeResponsiveness(page, freezeTimeoutMs);
  const domAfter = await domNodeCount(page);
  page.off('request', requestHandler);

  return {
    frozen: !responsiveness.responsive,
    responsiveMs: responsiveness.ms,
    actionError,
    apiCalls,
    apiSpam: apiCalls > apiSpamThreshold,
    apiSpamThreshold,
    domBefore,
    domAfter,
    domGrowth: domAfter >= 0 && domBefore >= 0 ? domAfter - domBefore : null,
    elapsedMs: Date.now() - start,
  };
}

/** Pretty one-block summary for test logs / the bug report. */
export function formatDiagnostic(label, d) {
  return [
    `── Freeze diagnostic: ${label} ───────────────────────────────`,
    `  frozen (main-thread blocked) : ${d.frozen}`,
    `  responsiveness probe         : ${d.responsiveMs} ms`,
    `  API calls during action      : ${d.apiCalls}  (spam>${d.apiSpamThreshold}: ${d.apiSpam})`,
    `  DOM nodes                    : ${d.domBefore} → ${d.domAfter} (Δ ${d.domGrowth})`,
    `  total elapsed                : ${d.elapsedMs} ms`,
    d.actionError ? `  action error                 : ${d.actionError}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export default {
  probeResponsiveness,
  domNodeCount,
  findRenderLoopErrors,
  captureFreezeDiagnostic,
  formatDiagnostic,
};
