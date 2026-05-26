// =============================================================================
//  ApiMonitor — observes all network traffic for the API-validation and
//  API-instability requirements:
//    • captures failed requests (status >= 400, or transport-level failures)
//    • captures slow requests (over a configurable threshold)
//    • records status codes and timing for every API call
//    • flags unexpected 500s
// =============================================================================
//  Usage:
//    const api = new ApiMonitor(page, { apiPattern: /\/api\//, slowMs: 3000 });
//    ... drive the page ...
//    api.assertNoServerErrors();   // fail on unexpected 5xx
//    console.log(api.summary());

import { ENV } from './env.js';

export class ApiMonitor {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {{apiPattern?:RegExp, slowMs?:number}} [opts]
   */
  constructor(page, opts = {}) {
    this.page = page;
    this.apiPattern = opts.apiPattern ?? /\/api\//;
    this.slowMs = opts.slowMs ?? ENV.API_SLOW_MS;

    /** @type {{url:string,method:string,status:number,ms:number}[]} */
    this.calls = [];
    /** @type {{url:string,method:string,reason:string}[]} */
    this.failures = [];

    this._starts = new Map();

    page.on('request', (req) => {
      if (this.apiPattern.test(req.url())) {
        this._starts.set(req, Date.now());
      }
    });

    page.on('response', (res) => {
      const req = res.request();
      if (!this.apiPattern.test(res.url())) return;
      const started = this._starts.get(req) ?? Date.now();
      this.calls.push({
        url: res.url(),
        method: req.method(),
        status: res.status(),
        ms: Date.now() - started,
      });
    });

    // Transport-level failures (DNS, connection reset, aborted).
    page.on('requestfailed', (req) => {
      if (!this.apiPattern.test(req.url())) return;
      this.failures.push({
        url: req.url(),
        method: req.method(),
        reason: req.failure()?.errorText ?? 'unknown',
      });
    });
  }

  get serverErrors() {
    return this.calls.filter((c) => c.status >= 500);
  }

  get clientErrors() {
    return this.calls.filter((c) => c.status >= 400 && c.status < 500);
  }

  get slowCalls() {
    return this.calls.filter((c) => c.ms > this.slowMs);
  }

  /** Fail if any API call returned 5xx (unexpected server error). */
  assertNoServerErrors() {
    const errs = this.serverErrors;
    if (errs.length > 0) {
      throw new Error(
        `ApiMonitor: ${errs.length} unexpected 5xx response(s):\n` +
          errs.map((e) => `  ${e.status} ${e.method} ${e.url}`).join('\n')
      );
    }
  }

  /** Fail if any monitored request failed at the transport level. */
  assertNoTransportFailures() {
    if (this.failures.length > 0) {
      throw new Error(
        `ApiMonitor: ${this.failures.length} request transport failure(s):\n` +
          this.failures.map((f) => `  ${f.method} ${f.url} — ${f.reason}`).join('\n')
      );
    }
  }

  summary() {
    return {
      total: this.calls.length,
      ok: this.calls.filter((c) => c.status < 400).length,
      clientErrors: this.clientErrors.length,
      serverErrors: this.serverErrors.length,
      transportFailures: this.failures.length,
      slow: this.slowCalls.length,
      slowestMs: this.calls.reduce((m, c) => Math.max(m, c.ms), 0),
    };
  }
}

export default ApiMonitor;
