// =============================================================================
//  CampaignService — typed client for the campaign endpoints.
//
//  Why this exists: every persistence claim in the campaign suite is settled by
//  an API read-back, never by reading a toast. Toast lifetime (~11 s) exceeds a
//  create loop, so a stale toast from the previous action reads as success for
//  the current one — this produced two false findings during manual exploration
//  (see docs/qa-reports/campaigns-v1-rbac/10-*.md § "Method self-correction").
//
//  Endpoint facts (verified live against cms2.pocsample.in, 2026-07-28 — not
//  assumed):
//    GET    /campaign/read?limit&page&sort&order&search&folderId  → paginated
//    GET    /campaign/read/{id}                                   → single doc
//    POST   /campaign/create
//    POST   /campaign/update/{id}      ← POST, not PUT/PATCH
//    POST   /campaign/duplicate/{id}   ← clone; body is {name, folderId} ONLY
//    DELETE /campaign/delete/{id}      ← hard delete
//
//  The duplicate endpoint was mapped live on 2026-07-30 by driving the picker's
//  "Clone Campaign" modal and reading the wire: it takes no item payload at all,
//  so the copy's contents are composed server-side from the source. It answers
//  200 {"message":"Campaign copied successfully."} and the id of the copy is not
//  in the response — a caller that needs it must look the name up afterwards.
//
//  `sort` and `order` are NOT optional: omitting them returns 500 (BUG-CMP-03),
//  so LIST_DEFAULTS always supplies them.
// =============================================================================

import type { APIResponse, BrowserContext } from '@playwright/test';
import { BaseService, MAX_PAGE_LIMIT, type ListQuery, type Paginated } from '../BaseService';
import type { HttpClient } from '../HttpClient';

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

export type CampaignList = Paginated<Campaign>;

/** Shape the create/update endpoints accept — `file` is a bare media id here. */
export interface CampaignPayload {
  name: string;
  data: Array<{ file: string; duration: number }>;
  defaultDuration: number;
  folderId?: string | null;
}

export type { ListQuery };

const LIST_DEFAULTS: Required<ListQuery> = {
  limit: 50,
  page: 1,
  sort: 'createdAt',
  order: '-1',
  search: '',
  folderId: '',
};

export class CampaignService extends BaseService {
  /** Build a service bound to an authenticated browser session. */
  static async fromContext(context: BrowserContext): Promise<CampaignService> {
    return new CampaignService(await BaseService.clientFromContext(context));
  }

  /** Same endpoints with a different identity — the RBAC / IDOR probe. */
  asToken(token: string): CampaignService {
    return new CampaignService(this.http.withToken(token));
  }

  /** Same endpoints with no credentials — the anonymous-access probe. */
  asAnonymous(): CampaignService {
    return new CampaignService(this.http.anonymous());
  }

  // ── Raw calls — return the response so tests can assert status codes ───────

  listRaw(query: ListQuery = {}): Promise<APIResponse> {
    return this.http.rawGet('/campaign/read', { params: { ...LIST_DEFAULTS, ...query } });
  }

  /**
   * List with a raw, unmodified query string — for negative cases that must omit
   * parameters the helper would otherwise supply (e.g. API-006, missing `sort`).
   */
  listRawQuery(queryString: string): Promise<APIResponse> {
    return this.http.rawGet(`/campaign/read?${queryString}`);
  }

  readRaw(id: string): Promise<APIResponse> {
    return this.http.rawGet(`/campaign/read/${id}`);
  }

  createRaw(payload: Partial<CampaignPayload> | Record<string, unknown>): Promise<APIResponse> {
    return this.http.rawPost('/campaign/create', { data: payload });
  }

  updateRaw(
    id: string,
    payload: Partial<CampaignPayload> | Record<string, unknown>,
  ): Promise<APIResponse> {
    return this.http.rawPost(`/campaign/update/${id}`, { data: payload });
  }

  deleteRaw(id: string): Promise<APIResponse> {
    return this.http.rawDelete(`/campaign/delete/${id}`);
  }

  /**
   * Clone a campaign. The body carries the copy's NAME and folder only — never
   * its items — so this endpoint is the one place where the server, not the
   * client, decides what the new campaign contains. `folderId` defaults to `''`
   * because that is literally what the app sends for a root-level clone.
   */
  duplicateRaw(id: string, payload: Record<string, unknown>): Promise<APIResponse> {
    return this.http.rawPost(`/campaign/duplicate/${id}`, { data: payload });
  }

  /**
   * Clone `id` under `name` and return the copy as the server now holds it.
   *
   * The response carries only a message, so the copy is resolved by a read-back
   * — which is also the assertion that the clone actually persisted rather than
   * merely being acknowledged.
   */
  async duplicate(id: string, name: string, folderId = ''): Promise<Campaign> {
    const res = await this.duplicateRaw(id, { name, folderId });
    if (!res.ok()) throw new Error(`clone to "${name}" failed: ${res.status()} ${await res.text()}`);
    const copy = await this.findByName(name);
    if (!copy) throw new Error(`clone to "${name}" reported success but is not in the list`);
    return copy;
  }

  // ── Convenience wrappers — throw on non-2xx, return parsed bodies ──────────

  list(query: ListQuery = {}): Promise<CampaignList> {
    return this.http.get<CampaignList>('/campaign/read', {
      params: { ...LIST_DEFAULTS, ...query },
    });
  }

  read(id: string): Promise<Campaign> {
    return this.http.get<Campaign>(`/campaign/read/${id}`);
  }

  async count(): Promise<number> {
    return (await this.list({ limit: 1 })).totalDocs;
  }

  /** Every campaign, paging through the list. */
  listAll(query: ListQuery = {}): Promise<Campaign[]> {
    return this.collect<Campaign>((page, limit) => this.list({ ...query, limit, page }));
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
  async sampleMediaIds(n = 1, kind?: 'image' | 'video'): Promise<string[]> {
    const docs = await this.listAll();
    const ids: string[] = [];
    for (const doc of docs) {
      for (const item of doc.data ?? []) {
        const id = item?.file?.id;
        // `kind` exists for playback suites that observe the RENDERED frame. A
        // <video> element exposes no usable src until it loads, so a video in the
        // middle of a campaign is invisible to a DOM-based frame reader and looks
        // like a skipped index — an observation artefact that reads as a product
        // bug. Ordering tests therefore ask for images only.
        if (kind && item?.file?.type !== kind) continue;
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

  /**
   * Seed a valid campaign via the API. Fast, isolated, and UI-independent.
   *
   * `kind` restricts the media type — pass 'image' from playback suites that read
   * the rendered frame, so a video item cannot masquerade as a skipped index.
   */
  async seed(
    name: string,
    itemCount = 1,
    defaultDuration = 10,
    kind?: 'image' | 'video',
  ): Promise<Campaign> {
    const files = await this.sampleMediaIds(itemCount, kind);
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

/** The page ceiling is re-exported so boundary suites can assert against it. */
export { MAX_PAGE_LIMIT };

/** Historical name kept so existing specs and fixtures keep compiling. */
export { CampaignService as CampaignApi };

export default CampaignService;

/** Explicit re-export of the client type for services composing this one. */
export type { HttpClient };
