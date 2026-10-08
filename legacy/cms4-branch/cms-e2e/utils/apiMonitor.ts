// =============================================================================
//  ApiMonitor — records network responses and surfaces failed (>=400) and slow
//  API calls. Scopes to same-origin XHR/fetch so third-party widgets don't
//  pollute the report.
// =============================================================================

import type { Page, Response, Request } from '@playwright/test';
import { ENV } from '../config/env';

export interface FailedRequest {
  url: string;
  status: number;
  method: string;
}

export interface SlowRequest {
  url: string;
  method: string;
  durationMs: number;
}

export class ApiMonitor {
  private readonly failed: FailedRequest[] = [];
  private readonly slow: SlowRequest[] = [];
  private readonly started = new Map<Request, number>();

  constructor(
    page: Page,
    private readonly slowThresholdMs = ENV.PERF.apiSlowMs,
  ) {
    page.on('request', (req) => this.started.set(req, Date.now()));

    page.on('response', (res: Response) => {
      const req = res.request();
      const url = req.url();
      if (!this.isAppApi(url, req)) return;

      const status = res.status();
      if (status >= 400) {
        this.failed.push({ url, status, method: req.method() });
      }

      const start = this.started.get(req);
      if (start) {
        const durationMs = Date.now() - start;
        if (durationMs > this.slowThresholdMs) {
          this.slow.push({ url, method: req.method(), durationMs });
        }
      }
    });

    page.on('requestfailed', (req) => {
      if (!this.isAppApi(req.url(), req)) return;
      this.failed.push({ url: req.url(), status: 0, method: req.method() });
    });
  }

  /** Same-origin XHR / fetch only. */
  private isAppApi(url: string, req: Request): boolean {
    if (!url.startsWith(ENV.BASE_URL)) return false;
    const type = req.resourceType();
    return type === 'xhr' || type === 'fetch';
  }

  getFailed(): FailedRequest[] {
    return [...this.failed];
  }

  getSlow(): SlowRequest[] {
    return [...this.slow];
  }

  summary(): string {
    const lines: string[] = [];
    if (this.failed.length) {
      lines.push('Failed API requests:');
      this.failed.forEach((f, i) => lines.push(`  ${i + 1}. [${f.status}] ${f.method} ${f.url}`));
    }
    if (this.slow.length) {
      lines.push(`Slow API requests (> ${this.slowThresholdMs}ms):`);
      this.slow.forEach((s, i) => lines.push(`  ${i + 1}. ${s.durationMs}ms ${s.method} ${s.url}`));
    }
    return lines.length ? lines.join('\n') : 'No failed or slow API requests.';
  }

  clear(): void {
    this.failed.length = 0;
    this.slow.length = 0;
    this.started.clear();
  }
}

export default ApiMonitor;
