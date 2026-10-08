/**
 * API monitoring + direct-request helper.
 *
 * Two responsibilities:
 *  1. `NetworkMonitor` — passively records browser network traffic for a page
 *     so tests can assert on the Upload / Notification / Approval API calls
 *     (status codes, payloads) that the UI triggers.
 *  2. `ApiHelper` — actively performs authenticated REST calls via Playwright's
 *     APIRequestContext for negative/security tests (e.g. unauthorized 403).
 */
import type { APIRequestContext, APIResponse, Page, Request, Response } from '@playwright/test';
import { API_PATTERNS } from '../config/constants.js';

export interface CapturedCall {
  url: string;
  method: string;
  status: number;
  ok: boolean;
  requestBody: string | null;
  responseBody: unknown;
  timestamp: number;
}

/**
 * Attaches to a Page and records every request/response. Tests can then query
 * the captured calls by URL pattern after performing a UI action.
 */
export class NetworkMonitor {
  private readonly calls: CapturedCall[] = [];
  private readonly pending = new Map<Request, number>();

  constructor(private readonly page: Page) {}

  /** Begin recording. Call once, typically right after page creation. */
  start(): void {
    this.page.on('request', (req: Request) => this.pending.set(req, Date.now()));
    this.page.on('response', (res: Response) => void this.record(res));
  }

  private async record(res: Response): Promise<void> {
    const req = res.request();
    let responseBody: unknown = null;
    try {
      const text = await res.text();
      responseBody = this.tryJson(text);
    } catch {
      // body may be unavailable (redirects, opaque responses) — ignore.
    }
    this.calls.push({
      url: res.url(),
      method: req.method(),
      status: res.status(),
      ok: res.ok(),
      requestBody: req.postData(),
      responseBody,
      timestamp: this.pending.get(req) ?? Date.now(),
    });
  }

  private tryJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** All recorded calls (newest last). */
  all(): CapturedCall[] {
    return [...this.calls];
  }

  /** Calls whose URL matches a pattern, newest first. */
  findByPattern(pattern: RegExp): CapturedCall[] {
    return this.calls.filter((c) => pattern.test(c.url)).reverse();
  }

  /** The most recent upload-API call, if any. */
  lastUploadCall(): CapturedCall | undefined {
    return this.findByPattern(API_PATTERNS.upload)[0];
  }

  /** The most recent notification-API call, if any. */
  lastNotificationCall(): CapturedCall | undefined {
    return this.findByPattern(API_PATTERNS.notification)[0];
  }

  /** The most recent approval/reject-API call, if any. */
  lastApprovalCall(): CapturedCall | undefined {
    return this.findByPattern(API_PATTERNS.approval)[0];
  }

  /** Any captured call that returned an error status (>= 400). */
  errorResponses(): CapturedCall[] {
    return this.calls.filter((c) => c.status >= 400);
  }

  /**
   * Wait until a call matching `pattern` is recorded, or time out.
   * Useful when an action fires an async request after the UI settles.
   */
  async waitForCall(pattern: RegExp, timeoutMs = 15_000): Promise<CapturedCall> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hit = this.findByPattern(pattern)[0];
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`No API call matching ${pattern} captured within ${timeoutMs}ms`);
  }

  clear(): void {
    this.calls.length = 0;
    this.pending.clear();
  }
}

/**
 * Performs direct REST requests using Playwright's request context.
 * Primarily for security/negative tests (calling APIs without a valid session,
 * with a wrong role, etc.).
 */
export class ApiHelper {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseURL: string,
  ) {}

  /** GET with optional bearer token; returns the raw APIResponse. */
  async get(path: string, token?: string): Promise<APIResponse> {
    return this.request.get(this.url(path), { headers: this.authHeaders(token) });
  }

  /** POST JSON with optional bearer token; returns the raw APIResponse. */
  async post(path: string, body: unknown, token?: string): Promise<APIResponse> {
    return this.request.post(this.url(path), {
      headers: { 'content-type': 'application/json', ...this.authHeaders(token) },
      data: body as Record<string, unknown>,
    });
  }

  /** Assert a response has the expected status, returning its parsed JSON. */
  async expectStatus(response: APIResponse, expected: number): Promise<unknown> {
    const status = response.status();
    if (status !== expected) {
      const text = await response.text().catch(() => '<unreadable>');
      throw new Error(`Expected status ${expected} but got ${status}. Body: ${text}`);
    }
    return response.json().catch(() => null);
  }

  private authHeaders(token?: string): Record<string, string> {
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  private url(path: string): string {
    return path.startsWith('http') ? path : `${this.baseURL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }
}
