// =============================================================================
//  ConsoleMonitor — captures browser console errors, page errors (uncaught
//  exceptions), and unhandled promise rejections for "global frontend health"
//  validation.
// =============================================================================
//  Usage:
//    const mon = new ConsoleMonitor(page);   // starts listening immediately
//    ... drive the page ...
//    mon.assertClean();                       // throws if real errors were seen
//
//  Known third-party / environmental noise is filtered out so the monitor only
//  fails on errors that originate from the app itself.

const NOISE = [
  'favicon',
  'analytics',
  'gtag',
  'recaptcha',
  'google-analytics',
  'googletagmanager',
  'hotjar',
  'sentry',
  'mixpanel',
  'the server responded with a status of 404', // asset 404s tracked separately
  'net::ERR_BLOCKED_BY_CLIENT', // adblock-style blocks
  'ResizeObserver loop', // benign browser warning
];

export class ConsoleMonitor {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    /** @type {{type:string,text:string}[]} */
    this.consoleErrors = [];
    /** @type {string[]} */
    this.pageErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.consoleErrors.push({ type: 'console', text: msg.text() });
      }
    });

    // Uncaught exceptions (React render crashes, etc.) surface here.
    page.on('pageerror', (err) => {
      this.pageErrors.push(String(err?.message ?? err));
    });
  }

  static isNoise(text) {
    const lower = String(text).toLowerCase();
    return NOISE.some((n) => lower.includes(n.toLowerCase()));
  }

  /** App-originated console errors, with third-party noise removed. */
  get criticalConsoleErrors() {
    return this.consoleErrors
      .map((e) => e.text)
      .filter((t) => !ConsoleMonitor.isNoise(t));
  }

  /** Every error worth failing on: page errors are always critical. */
  get allCritical() {
    return [...this.pageErrors, ...this.criticalConsoleErrors];
  }

  /** Throws with a readable summary if any critical errors were recorded. */
  assertClean(label = 'page') {
    const errors = this.allCritical;
    if (errors.length > 0) {
      throw new Error(
        `ConsoleMonitor: ${errors.length} console/page error(s) on ${label}:\n` +
          errors.slice(0, 10).map((e, i) => `  ${i + 1}. ${e}`).join('\n')
      );
    }
  }

  /** Non-throwing variant for soft (warn-only) mode. */
  report(label = 'page') {
    const errors = this.allCritical;
    if (errors.length > 0) {
      console.warn(`[ConsoleMonitor] ${errors.length} error(s) on ${label}:`);
      errors.slice(0, 5).forEach((e) => console.warn(`   • ${e}`));
    }
    return errors;
  }
}

export default ConsoleMonitor;
