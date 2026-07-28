// =============================================================================
//  HttpClient — the single HTTP entry point for every API service.
//
//  Responsibilities:
//   • GET / POST / PUT / PATCH / DELETE over Playwright's APIRequestContext
//   • Automatic Authorization header injection
//   • Retry with exponential backoff, on transport errors and 5xx/429 only
//   • Structured request/response logging, attachable to the test report
//   • Two call styles per verb, because tests need both:
//       raw*   → returns the APIResponse; the caller asserts the status
//       typed  → throws ApiError on non-2xx and returns the parsed body
//
//  Design note: retries are deliberately NOT applied to 4xx. A 400/403/404 is
//  a determinate answer from the server — retrying it hides negative-path
//  behaviour and makes RBAC and validation suites slow and misleading.
// =============================================================================

import type { APIRequestContext, APIResponse } from '@playwright/test';
import { ENV } from '../config/env';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Query parameters. `undefined` values are dropped rather than serialised. */
export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  /** Query string parameters. */
  params?: QueryParams;
  /** JSON body (objects are serialised; strings are sent verbatim). */
  data?: unknown;
  /** Extra headers, merged over the defaults. */
  headers?: Record<string, string>;
  /** Per-request timeout in ms. */
  timeout?: number;
  /** Override the retry count for this call. */
  retries?: number;
  /**
   * Send no Authorization header. Used by the auth/IDOR suites to prove an
   * endpoint actually rejects anonymous callers.
   */
  anonymous?: boolean;
}

/** One recorded HTTP exchange, used for logging and report attachments. */
export interface HttpLogEntry {
  method: HttpMethod;
  url: string;
  status: number;
  durationMs: number;
  attempt: number;
  requestBody?: string;
  responseBody?: string;
}

/** Thrown by the typed helpers when the server answers non-2xx. */
export class ApiError extends Error {
  constructor(
    readonly method: HttpMethod,
    readonly url: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${method} ${url} → ${status}\n${body.slice(0, 2000)}`);
    this.name = 'ApiError';
  }
}

export interface HttpClientOptions {
  /** Base URL every path is resolved against. Defaults to the environment API. */
  baseUrl?: string;
  /** Bearer token. Omit for an unauthenticated client. */
  token?: string;
  /** Default retry attempts for retryable failures. */
  retries?: number;
  /** Base backoff delay in ms; doubles per attempt. */
  backoffMs?: number;
}

/** Statuses worth retrying — transient server/infra conditions only. */
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/** Header names whose values must never reach a log or a report artifact. */
const REDACTED_HEADERS = new Set(['authorization', 'cookie', 'set-cookie']);

/** Body keys whose values must never reach a log or a report artifact. */
const REDACTED_KEYS = /("(?:password|token|jwt|secret|authorization)"\s*:\s*)"[^"]*"/gi;

const redactBody = (body: string): string => body.replace(REDACTED_KEYS, '$1"***"');

export class HttpClient {
  private readonly log: HttpLogEntry[] = [];

  constructor(
    private readonly request: APIRequestContext,
    private readonly options: HttpClientOptions = {},
  ) {}

  private get baseUrl(): string {
    return (this.options.baseUrl ?? ENV.API_BASE_URL).replace(/\/+$/, '');
  }

  /** A client hitting the same base URL with a different identity. */
  withToken(token: string): HttpClient {
    return new HttpClient(this.request, { ...this.options, token });
  }

  /** A client with no credentials — for anonymous-access probes. */
  anonymous(): HttpClient {
    const { token: _dropped, ...rest } = this.options;
    return new HttpClient(this.request, rest);
  }

  /** Everything this client has sent so far, for report attachments. */
  history(): readonly HttpLogEntry[] {
    return this.log;
  }

  /** Human-readable transcript of every call, safe to attach to a report. */
  summary(): string {
    if (this.log.length === 0) return 'No API calls recorded.';
    return this.log
      .map(
        (e) =>
          `${e.status} ${e.method} ${e.url} (${e.durationMs}ms` +
          `${e.attempt > 1 ? `, attempt ${e.attempt}` : ''})`,
      )
      .join('\n');
  }

  /** Slowest-first view of recorded calls that breached the latency budget. */
  slowCalls(budgetMs: number = ENV.PERF.apiSlowMs): HttpLogEntry[] {
    return this.log
      .filter((e) => e.durationMs > budgetMs)
      .sort((a, b) => b.durationMs - a.durationMs);
  }

  // ── URL + header construction ──────────────────────────────────────────────

  /** Resolve a path against the base URL; absolute URLs pass through. */
  private resolve(path: string, params?: QueryParams): string {
    const url = /^https?:\/\//i.test(path) ? path : `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
    if (!params) return url;

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) query.append(key, String(value));
    }
    const qs = query.toString();
    return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
  }

  private buildHeaders(opts: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...opts.headers,
    };
    if (!opts.anonymous && this.options.token) {
      headers.Authorization = `Bearer ${this.options.token}`;
    }
    return headers;
  }

  // ── Core dispatch ──────────────────────────────────────────────────────────

  /**
   * Issue a request, retrying only transport errors and retryable statuses.
   * Always resolves with the final APIResponse — status assertions belong to
   * the caller. Transport failures that survive every attempt are rethrown,
   * because there is no response to reason about.
   */
  async send(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<APIResponse> {
    const url = this.resolve(path, opts.params);
    const headers = this.buildHeaders(opts);
    const maxAttempts = (opts.retries ?? this.options.retries ?? (ENV.IS_CI ? 2 : 1)) + 1;
    const backoff = this.options.backoffMs ?? 400;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const started = Date.now();
      try {
        const response = await this.request.fetch(url, {
          method,
          headers,
          timeout: opts.timeout ?? 30_000,
          ...(opts.data === undefined
            ? {}
            : typeof opts.data === 'string'
              ? { data: opts.data }
              : { data: opts.data as Record<string, unknown> }),
        });

        await this.record(method, url, response, started, attempt, opts.data);

        if (RETRYABLE.has(response.status()) && attempt < maxAttempts) {
          await this.pause(backoff * 2 ** (attempt - 1));
          continue;
        }
        return response;
      } catch (error) {
        // Transport-level failure (DNS, TLS, timeout) — no response exists.
        lastError = error;
        if (attempt >= maxAttempts) break;
        await this.pause(backoff * 2 ** (attempt - 1));
      }
    }

    throw new Error(
      `${method} ${url} failed after ${maxAttempts} attempt(s): ${String(lastError)}`,
    );
  }

  private async record(
    method: HttpMethod,
    url: string,
    response: APIResponse,
    started: number,
    attempt: number,
    requestBody: unknown,
  ): Promise<void> {
    // Bodies are capped: a listing endpoint can return megabytes, and the log
    // is attached to failing tests where huge payloads bury the useful line.
    const body = await response.text().catch(() => '<unreadable>');
    this.log.push({
      method,
      url,
      status: response.status(),
      durationMs: Date.now() - started,
      attempt,
      requestBody:
        requestBody === undefined
          ? undefined
          : redactBody(
              typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody),
            ).slice(0, 2000),
      responseBody: redactBody(body).slice(0, 4000),
    });
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Raw verbs — caller asserts the status ─────────────────────────────────

  rawGet(path: string, opts: RequestOptions = {}): Promise<APIResponse> {
    return this.send('GET', path, opts);
  }

  rawPost(path: string, opts: RequestOptions = {}): Promise<APIResponse> {
    return this.send('POST', path, opts);
  }

  rawPut(path: string, opts: RequestOptions = {}): Promise<APIResponse> {
    return this.send('PUT', path, opts);
  }

  rawPatch(path: string, opts: RequestOptions = {}): Promise<APIResponse> {
    return this.send('PATCH', path, opts);
  }

  rawDelete(path: string, opts: RequestOptions = {}): Promise<APIResponse> {
    return this.send('DELETE', path, opts);
  }

  // ── Typed verbs — throw ApiError on non-2xx, return the parsed body ────────

  private async json<T>(method: HttpMethod, path: string, opts: RequestOptions): Promise<T> {
    const response = await this.send(method, path, opts);
    if (!response.ok()) {
      throw new ApiError(
        method,
        response.url(),
        response.status(),
        await response.text().catch(() => ''),
      );
    }
    const text = await response.text();
    if (text.length === 0) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(
        method,
        response.url(),
        response.status(),
        `Expected JSON but got: ${text.slice(0, 500)}`,
      );
    }
  }

  get<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.json<T>('GET', path, opts);
  }

  post<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.json<T>('POST', path, opts);
  }

  put<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.json<T>('PUT', path, opts);
  }

  patch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.json<T>('PATCH', path, opts);
  }

  delete<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.json<T>('DELETE', path, opts);
  }
}

/** Header redaction is exported so monitors and reporters reuse one rule. */
export const isRedactedHeader = (name: string): boolean => REDACTED_HEADERS.has(name.toLowerCase());

export default HttpClient;
