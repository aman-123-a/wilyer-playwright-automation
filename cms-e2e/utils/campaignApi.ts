// =============================================================================
//  CampaignApi — typed client for the campaign endpoints.
//
//  Why this exists: every persistence claim in the campaign suite is settled by
//  an API read-back, never by reading a toast. Toast lifetime (~11 s) exceeds a
//  create loop, so a stale toast from the previous action reads as success for
//  the current one — this produced two false findings during manual exploration
//  (see reports/campaigns-v1-rbac/10-*.md § "Method self-correction").
//
//  Auth: the CMS stores its JWT in the `footprint` cookie and sends it as
//  `Authorization: Bearer <jwt>`. There is no token in localStorage.
//  Verified live against cms2.pocsample.in, 2026-07-28.
//
//  Endpoint facts (verified, not assumed):
//    GET    /campaign/read?limit&page&sort&order&search&folderId  → paginated
//    GET    /campaign/read/{id}                                   → single doc
//    POST   /campaign/create
//    POST   /campaign/update/{id}      ← POST, not PUT/PATCH
//    DELETE /campaign/delete/{id}      ← hard delete
//
//  `sort` and `order` are NOT optional: omitting them returns 500 (BUG-CMP-03),
//  so LIST_DEFAULTS always supplies them.
// =============================================================================

import type { APIRequestContext, APIResponse, BrowserContext } from '@playwright/test';
import { ENV } from '../config/env';

/** Media reference as the API returns it (expanded), or as create/update takes it (an id). */
export interface CampaignFileRef {
  id: string;
  thumb?: string;
  type?: 'image' | 'video' | string;
  name?: string;
}

export interface CampaignItem {
  file: CampaignFileRef;
  widget: null | Record<string, unknown>;
  duration: number;
}

export interface Campaign {
  id: string;
  name: string;
  folderId: string | null;
  /** Returned by read-one only — the list projection omits it. */
  defaultDuration?: number;
  /** Server-computed rollup. Read-one only. */
  duration?: number | string;
  data: CampaignItem[];
}

export interface CampaignList {
  docs: Campaign[];
  totalDocs: number;
  limit: number;
  totalPages: number;
  page: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/** Shape the create/update endpoints accept — `file` is a bare media id here. */
export interface CampaignPayload {
  name: string;
  data: Array<{ file: string; duration: number }>;
  defaultDuration: number;
  folderId?: string | null;
}

export interface ListQuery {
  limit?: number | string;
  page?: number | string;
  sort?: string;
  order?: string;
  search?: string;
  folderId?: string;
}

const LIST_DEFAULTS: Required<ListQuery> = {
  limit: 50,
  page: 1,
  sort: 'createdAt',
  order: '-1',
  search: '',
  folderId: '',
};

/** Server-enforced page ceiling: `limit` > 100 is a 400. Verified 2026-07-28. */
const MAX_LIMIT = 100;

export class CampaignApi {
  private constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
    private readonly base: string = ENV.API_BASE_URL,
  ) {}

  /**
   * Build a client from an authenticated browser context. Reuses the context's
   * own APIRequestContext so proxy/TLS settings match the browser exactly.
   */
  static async fromContext(context: BrowserContext): Promise<CampaignApi> {
    const cookie = (await context.cookies()).find((c) => c.name === 'footprint');
    if (!cookie) {
      throw new Error(
        'No `footprint` cookie — the browser context is not authenticated. ' +
          'Check that the `setup` project ran and .auth/admin.json is fresh.',
      );
    }
    return new CampaignApi(context.request, decodeURIComponent(cookie.value));
  }

  /** Same endpoints with a different identity — the RBAC / IDOR probe. */
  asToken(token: string): CampaignApi {
    return new CampaignApi(this.request, token, this.base);
  }

  private get headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  // ── Raw calls — return the response so tests can assert status codes ───────

  listRaw(query: ListQuery = {}): Promise<APIResponse> {
    const q = { ...LIST_DEFAULTS, ...query };
    const qs = new URLSearchParams(
      Object.entries(q).map(([k, v]) => [k, String(v)]),
    ).toString();
    return this.request.get(`${this.base}/campaign/read?${qs}`, { headers: this.headers });
  }

  /**
   * List with a raw, unmodified query string — for negative cases that must omit
   * parameters the helper would otherwise supply (e.g. API-006, missing `sort`).
   */
  listRawQuery(queryString: string): Promise<APIResponse> {
    return this.request.get(`${this.base}/campaign/read?${queryString}`, { headers: this.headers });
  }

  readRaw(id: string): Promise<APIResponse> {
    return this.request.get(`${this.base}/campaign/read/${id}`, { headers: this.headers });
  }

  createRaw(payload: Partial<CampaignPayload> | Record<string, unknown>): Promise<APIResponse> {
    return this.request.post(`${this.base}/campaign/create`, { headers: this.headers, data: payload });
  }

  updateRaw(id: string, payload: Partial<CampaignPayload> | Record<string, unknown>): Promise<APIResponse> {
    return this.request.post(`${this.base}/campaign/update/${id}`, { headers: this.headers, data: payload });
  }

  deleteRaw(id: string): Promise<APIResponse> {
    return this.request.delete(`${this.base}/campaign/delete/${id}`, { headers: this.headers });
  }

  // ── Convenience wrappers — throw on non-2xx, return parsed bodies ──────────

  async list(query: ListQuery = {}): Promise<CampaignList> {
    const res = await this.listRaw(query);
    if (!res.ok()) throw new Error(`campaign list failed: ${res.status()} ${await res.text()}`);
    return res.json() as Promise<CampaignList>;
  }

  async read(id: string): Promise<Campaign> {
    const res = await this.readRaw(id);
    if (!res.ok()) throw new Error(`campaign read ${id} failed: ${res.status()} ${await res.text()}`);
    return res.json() as Promise<Campaign>;
  }

  async count(): Promise<number> {
    return (await this.list({ limit: 1 })).totalDocs;
  }

  /**
   * Every campaign, paging through the list. `limit` is capped at 100 server-side,
   * so a single oversized request is a 400 rather than a full result set — this
   * keeps name lookups and the teardown sweep correct past 100 campaigns.
   */
  async listAll(query: ListQuery = {}): Promise<Campaign[]> {
    const docs: Campaign[] = [];
    for (let page = 1; ; page += 1) {
      const chunk = await this.list({ ...query, limit: MAX_LIMIT, page });
      docs.push(...chunk.docs);
      if (!chunk.hasNextPage) return docs;
    }
  }

  /**
   * Find by exact name. Searches server-side to narrow, then matches exactly in
   * the client — the `search` parameter is an unescaped regex (BUG-CMP-02) and
   * does not trim (BUG-CMP-11), so it cannot be trusted for an equality check.
   */
  async findByName(name: string): Promise<Campaign | undefined> {
    return (await this.listAll()).find((d) => d.name === name);
  }

  /**
   * All campaigns whose name starts with a prefix — the teardown sweep.
   *
   * Case-INSENSITIVE deliberately. The case-duplicate test creates a lowercased
   * variant of its own name, so a case-sensitive sweep silently leaves it
   * behind; the residue then collides with the next run, which answers "already
   * exists" and makes that run pass for the wrong reason.
   */
  async findByPrefix(prefix: string): Promise<Campaign[]> {
    const needle = prefix.toLowerCase();
    return (await this.listAll()).filter((d) => d.name.toLowerCase().startsWith(needle));
  }

  /** Idempotent delete — never throws, so it is safe in teardown. */
  async deleteQuietly(id: string): Promise<void> {
    await this.deleteRaw(id).catch(() => undefined);
  }

  /** Remove every campaign this suite created. Returns how many were deleted. */
  async cleanupByPrefix(prefix: string): Promise<number> {
    const stale = await this.findByPrefix(prefix);
    for (const c of stale) await this.deleteQuietly(c.id);
    return stale.length;
  }

  /**
   * Real media ids from the account, harvested from existing campaigns. The
   * media library has no confirmed public list endpoint, and campaign items must
   * reference genuine ids — inventing one yields a campaign the player cannot
   * resolve. Throws a clear message when the account has no usable media.
   */
  async sampleMediaIds(n = 1): Promise<string[]> {
    const docs = await this.listAll();
    const ids: string[] = [];
    for (const doc of docs) {
      for (const item of doc.data ?? []) {
        const id = item?.file?.id;
        if (id && !ids.includes(id)) ids.push(id);
        if (ids.length >= n) return ids;
      }
    }
    if (ids.length === 0) {
      throw new Error('No media ids available on this account — cannot seed a campaign.');
    }
    // Fewer distinct ids than requested: repeat, which is legal (an item may recur).
    const distinct = [...ids];
    while (ids.length < n) ids.push(distinct[ids.length % distinct.length]);
    return ids.slice(0, n);
  }

  /** Seed a valid campaign via the API. Fast, isolated, and UI-independent. */
  async seed(name: string, itemCount = 1, defaultDuration = 10): Promise<Campaign> {
    const files = await this.sampleMediaIds(itemCount);
    const res = await this.createRaw({
      name,
      data: files.map((file) => ({ file, duration: defaultDuration })),
      defaultDuration,
      folderId: null,
    });
    if (!res.ok()) throw new Error(`seed "${name}" failed: ${res.status()} ${await res.text()}`);
    const created = await this.findByName(name);
    if (!created) throw new Error(`seed "${name}" reported success but is not in the list`);
    return created;
  }
}

export default CampaignApi;
