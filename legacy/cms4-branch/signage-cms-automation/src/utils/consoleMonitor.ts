// =============================================================================
//  ConsoleMonitor — attaches to a Page (page.on('console') + page.on('pageerror'))
//  and records console errors + uncaught page exceptions. Filters known
//  third-party noise (reCAPTCHA, Google Maps, analytics, asset 4xx) so only
//  app-originated errors are asserted on.
// =============================================================================

import type { Page, ConsoleMessage } from '@playwright/test';

/** Substrings of messages/URLs we treat as third-party noise, not app bugs. */
const IGNORE_PATTERNS: RegExp[] = [
  /recaptcha/i,
  /gstatic\.com/i,
  /google(apis|tagmanager)?\.com/i,
  /maps\.google/i,
  /favicon/i,
  /ResizeObserver loop/i,
  // Expected auth/asset 4xx surfaced as "Failed to load resource" console noise.
  /Failed to load resource: the server responded with a status of 4\d\d/i,
];

export interface ConsoleEntry {
  type: string;
  text: string;
  location?: string;
}

export class ConsoleMonitor {
  private readonly errors: ConsoleEntry[] = [];
  private readonly pageErrors: ConsoleEntry[] = [];

  constructor(page: Page) {
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      const url = msg.location()?.url ?? '';
      if (this.isNoise(text) || this.isNoise(url)) return;
      this.errors.push({ type: msg.type(), text, location: url });
    });

    page.on('pageerror', (err) => {
      if (this.isNoise(err.message)) return;
      const entry = { type: 'pageerror', text: err.message };
      this.errors.push(entry);
      this.pageErrors.push(entry); // tracked separately — uncaught exceptions always fail
    });
  }

  private isNoise(s: string): boolean {
    return IGNORE_PATTERNS.some((re) => re.test(s));
  }

  /** App-originated console errors recorded so far. */
  getErrors(): ConsoleEntry[] {
    return [...this.errors];
  }

  /** Uncaught page exceptions only (the always-fail subset). */
  getPageErrors(): ConsoleEntry[] {
    return [...this.pageErrors];
  }

  clear(): void {
    this.errors.length = 0;
    this.pageErrors.length = 0;
  }

  /** Human-readable summary for attaching to a failure. */
  summary(): string {
    if (this.errors.length === 0) return 'No console errors.';
    return this.errors.map((e, i) => `${i + 1}. [${e.type}] ${e.text} ${e.location ?? ''}`).join('\n');
  }
}

export default ConsoleMonitor;
