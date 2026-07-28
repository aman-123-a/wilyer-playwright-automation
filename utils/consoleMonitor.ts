// =============================================================================
//  ConsoleMonitor — attaches to a Page and records console errors + uncaught
//  page exceptions. Filters known third-party noise (reCAPTCHA, Google Maps,
//  analytics) so only app-originated errors are asserted on.
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
  /Failed to load resource: the server responded with a status of 4\d\d/i, // expected auth/asset 4xx
];

export interface ConsoleEntry {
  type: string;
  text: string;
  location?: string;
}

export class ConsoleMonitor {
  private readonly errors: ConsoleEntry[] = [];

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
      this.errors.push({ type: 'pageerror', text: err.message });
    });
  }

  private isNoise(s: string): boolean {
    return IGNORE_PATTERNS.some((re) => re.test(s));
  }

  /** App-originated console errors recorded so far. */
  getErrors(): ConsoleEntry[] {
    return [...this.errors];
  }

  clear(): void {
    this.errors.length = 0;
  }

  /** Human-readable summary for attaching to a failure. */
  summary(): string {
    if (this.errors.length === 0) return 'No console errors.';
    return this.errors
      .map((e, i) => `${i + 1}. [${e.type}] ${e.text} ${e.location ?? ''}`)
      .join('\n');
  }
}

export default ConsoleMonitor;
