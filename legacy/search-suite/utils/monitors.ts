// =============================================================================
//  ConsoleNetworkMonitor — reusable console + network watchdog.
//  Captures console errors, uncaught page exceptions, failed requests and 5xx
//  responses, filtering this app's known-benign noise. The fixture asserts the
//  report is clean on teardown unless a test opts out via relax().
// =============================================================================

import { type Page } from '@playwright/test';

/** Known-benign noise on cms.pocsample.in (documented in the suite). */
const BENIGN: RegExp[] = [
  /\/auth\/checkAccess/i,                 // pre/post-session 401 probe
  /status of 401/i,                       // same, as a console string
  /recaptcha/i,                           // 3rd-party widget
  /cdn-cgi\/rum/i,                         // Cloudflare RUM beacon
  /net::ERR_ABORTED/i,                    // XHR cancelled by nav/teardown
  /favicon/i,
  /ResizeObserver loop/i,                 // benign browser warning
];

export interface MonitorReport {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: { url: string; failure: string }[];
  serverErrors: { url: string; status: number }[];
}

export class ConsoleNetworkMonitor {
  relaxed = false;
  private readonly allowList: RegExp[] = [];
  private consoleErrors: string[] = [];
  private pageErrors: string[] = [];
  private failedRequests: { url: string; failure: string }[] = [];
  private serverErrors: { url: string; status: number }[] = [];

  constructor(private readonly page: Page) {}

  /** Begin listening. Call once, right after the page exists. */
  attach(): this {
    this.page.on('console', (m) => {
      if (m.type() === 'error' && !this.ignored(m.text())) this.consoleErrors.push(m.text());
    });
    this.page.on('pageerror', (e) => {
      if (!this.ignored(e.message)) this.pageErrors.push(e.message);
    });
    this.page.on('requestfailed', (r) => {
      const failure = r.failure()?.errorText ?? 'unknown';
      if (!this.ignored(r.url()) && !this.ignored(failure)) {
        this.failedRequests.push({ url: r.url(), failure });
      }
    });
    this.page.on('response', (r) => {
      if (r.status() >= 500 && !this.ignored(r.url())) {
        this.serverErrors.push({ url: r.url(), status: r.status() });
      }
    });
    return this;
  }

  /** Add expected-failure patterns (e.g. a deliberately mocked endpoint). */
  allow(...patterns: RegExp[]): this {
    this.allowList.push(...patterns);
    return this;
  }

  /** Stop the teardown assertion (for tests that inject failures on purpose). */
  relax(): this {
    this.relaxed = true;
    return this;
  }

  reset(): this {
    this.consoleErrors = [];
    this.pageErrors = [];
    this.failedRequests = [];
    this.serverErrors = [];
    return this;
  }

  report(): MonitorReport {
    return {
      consoleErrors: [...this.consoleErrors],
      pageErrors: [...this.pageErrors],
      failedRequests: [...this.failedRequests],
      serverErrors: [...this.serverErrors],
    };
  }

  private ignored(s: string): boolean {
    return BENIGN.concat(this.allowList).some((r) => r.test(s));
  }
}

export default ConsoleNetworkMonitor;
