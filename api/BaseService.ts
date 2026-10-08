// =============================================================================
//  BaseService — shared behaviour for every module's API service.
//
//  Gives each service a configured HttpClient, identity-swapping helpers for
//  the RBAC / IDOR suites, and the paging loop that every CMS list endpoint
//  needs. Module services add only their own endpoints and types.
// =============================================================================

import type { APIRequestContext, BrowserContext } from '@playwright/test';
import { HttpClient, type HttpClientOptions } from './HttpClient';
import { tokenFromContext } from './session';

/** Shape every paginated CMS list endpoint returns. */
export interface Paginated<T> {
  docs: T[];
  totalDocs: number;
  limit: number;
  totalPages: number;
  page: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/** Common list query parameters accepted across CMS modules. */
export interface ListQuery {
  limit?: number | string;
  page?: number | string;
  sort?: string;
  order?: string;
  search?: string;
  folderId?: string;
}

/**
 * Server-enforced page ceiling: `limit` above this is a 400, not a clamp.
 * Verified against the campaign endpoints, 2026-07-28.
 */
export const MAX_PAGE_LIMIT = 100;

export abstract class BaseService {
  protected readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Build a client bound to an authenticated browser context. Reuses the
   * context's own APIRequestContext so proxy and TLS settings match the
   * browser exactly — a separate context can differ and produce failures
   * that look like API bugs.
   */
  protected static async clientFromContext(
    context: BrowserContext,
    options: HttpClientOptions = {},
  ): Promise<HttpClient> {
    return new HttpClient(context.request, { ...options, token: await tokenFromContext(context) });
  }

  /** Build a client from a bare request context and an explicit token. */
  protected static clientFromRequest(
    request: APIRequestContext,
    options: HttpClientOptions = {},
  ): HttpClient {
    return new HttpClient(request, options);
  }

  /** The underlying client, for suites that need raw access or the call log. */
  get client(): HttpClient {
    return this.http;
  }

  /**
   * Page through a list endpoint and collect every document.
   *
   * Always requests MAX_PAGE_LIMIT rather than one oversized page, because the
   * server rejects an over-limit request outright instead of clamping it —
   * a single big request would 400 rather than return everything.
   */
  protected async collect<T>(
    fetchPage: (page: number, limit: number) => Promise<Paginated<T>>,
  ): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; ; page += 1) {
      const chunk = await fetchPage(page, MAX_PAGE_LIMIT);
      all.push(...chunk.docs);
      if (!chunk.hasNextPage) return all;
      // Defensive: a server that always reports hasNextPage would loop forever.
      if (page > chunk.totalPages + 1) return all;
    }
  }
}

export default BaseService;
