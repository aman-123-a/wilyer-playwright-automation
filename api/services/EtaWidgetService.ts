// =============================================================================
//  EtaWidgetService — typed REST client for the Live ETA widget endpoints.
//
//  Why this exists: every persistence claim in the ETA suite is settled by an
//  API read-back, never by reading a toast.  Toast lifetime (~11 s) exceeds a
//  create loop, so a leftover toast from the previous action reads as success
//  for the current one.
//
//  ── Endpoints, verified live on cms.wilyersignage.com 2026-08-04 ────────────
//    GET    /widget/readTypes                → widget type catalogue
//    GET    /widget/read?type=liveEta&…      → paginated list
//    GET    /widget/read/{id}                → single document
//    POST   /widget/create                   → create   (200 + {message})
//    POST   /widget/update/{id}              → update   (POST, not PUT/PATCH)
//    DELETE /widget/delete/{id}              → hard delete
//    GET    /widget/readPublic/{id}          → renderer config, NO AUTH
//
//  Note on `create`: the response body is only `{ "message": "..." }` — it does
//  NOT return the new id.  Callers that need the id must read the list back.
//  That is a product limitation, not an oversight here.
// =============================================================================

import type { APIResponse, BrowserContext } from '@playwright/test';
import { BaseService, MAX_PAGE_LIMIT, type ListQuery, type Paginated } from '../BaseService';
import {
  ETA_WIDGET_TYPE,
  type EtaPlace,
  type EtaWidgetPayload,
  validEtaPayload,
} from '../../test-data/eta-widget.data';

/** A widget as returned by GET /widget/read. */
export interface EtaWidget {
  id: string;
  name: string;
  type: string;
  faceUrl: string;
  /** Public renderer URL the player loads, e.g. https://widgets.…/widget/{id} */
  path: string;
  data: {
    pickup: EtaPlace;
    destinations: EtaPlace[];
  };
  folderId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** The shape GET /widget/readPublic/{id} returns — note `_id`, not `id`. */
export interface EtaWidgetPublic {
  _id: string;
  type: string;
  faceId: string | number;
  path: string;
  data: EtaWidget['data'];
  folderId: string | null;
}

export type EtaWidgetList = Paginated<EtaWidget>;

export { type EtaWidgetPayload };

const LIST_DEFAULTS: Required<ListQuery> = {
  limit: 50,
  page: 1,
  sort: 'createdAt',
  order: '-1',
  search: '',
  folderId: '',
};

const BASE = '/widget';

export class EtaWidgetService extends BaseService {
  /** Build a service bound to an authenticated browser session. */
  static async fromContext(context: BrowserContext): Promise<EtaWidgetService> {
    return new EtaWidgetService(await BaseService.clientFromContext(context));
  }

  /** Same endpoints with a different identity — RBAC / IDOR probe. */
  asToken(token: string): EtaWidgetService {
    return new EtaWidgetService(this.http.withToken(token));
  }

  /** Same endpoints with no credentials — anonymous-access probe. */
  asAnonymous(): EtaWidgetService {
    return new EtaWidgetService(this.http.anonymous());
  }

  // ── Raw calls — return the raw response so tests can assert status codes ───

  typesRaw(): Promise<APIResponse> {
    return this.http.rawGet(`${BASE}/readTypes`);
  }

  listRaw(query: ListQuery = {}): Promise<APIResponse> {
    return this.http.rawGet(`${BASE}/read`, {
      params: { ...LIST_DEFAULTS, type: ETA_WIDGET_TYPE, ...query },
    });
  }

  listRawQuery(queryString: string): Promise<APIResponse> {
    return this.http.rawGet(`${BASE}/read?${queryString}`);
  }

  readRaw(id: string): Promise<APIResponse> {
    return this.http.rawGet(`${BASE}/read/${id}`);
  }

  /** Renderer endpoint — deliberately called WITHOUT credentials. */
  readPublicRaw(id: string): Promise<APIResponse> {
    return this.http.anonymous().rawGet(`${BASE}/readPublic/${id}`);
  }

  createRaw(payload: Partial<EtaWidgetPayload> | Record<string, unknown>): Promise<APIResponse> {
    return this.http.rawPost(`${BASE}/create`, { data: payload });
  }

  updateRaw(
    id: string,
    payload: Partial<EtaWidgetPayload> | Record<string, unknown>,
  ): Promise<APIResponse> {
    return this.http.rawPost(`${BASE}/update/${id}`, { data: payload });
  }

  deleteRaw(id: string): Promise<APIResponse> {
    return this.http.rawDelete(`${BASE}/delete/${id}`);
  }

  // ── Convenience wrappers — throw on non-2xx, return parsed bodies ──────────

  list(query: ListQuery = {}): Promise<EtaWidgetList> {
    return this.http.get<EtaWidgetList>(`${BASE}/read`, {
      params: { ...LIST_DEFAULTS, type: ETA_WIDGET_TYPE, ...query },
    });
  }

  read(id: string): Promise<EtaWidget> {
    return this.http.get<EtaWidget>(`${BASE}/read/${id}`);
  }

  async count(): Promise<number> {
    return (await this.list({ limit: 1 })).totalDocs;
  }

  listAll(query: ListQuery = {}): Promise<EtaWidget[]> {
    return this.collect<EtaWidget>((page, limit) => this.list({ ...query, limit, page }));
  }

  async findByName(name: string): Promise<EtaWidget | undefined> {
    return (await this.listAll()).find((w) => w.name === name);
  }

  async findByPrefix(prefix: string): Promise<EtaWidget[]> {
    const needle = prefix.toLowerCase();
    return (await this.listAll()).filter((w) => w.name.toLowerCase().startsWith(needle));
  }

  /** Idempotent delete — never throws, so safe in teardown hooks. */
  async deleteQuietly(id: string): Promise<void> {
    await this.deleteRaw(id).catch(() => undefined);
  }

  async cleanupByPrefix(prefix: string): Promise<number> {
    const stale = await this.findByPrefix(prefix);
    for (const w of stale) await this.deleteQuietly(w.id);
    return stale.length;
  }

  /**
   * Seed a valid ETA widget via the API and return the persisted document.
   *
   * `create` does not echo the new id, so this reads the list back by name —
   * which doubles as the persistence proof.
   */
  async seed(name: string, overrides: Partial<EtaWidgetPayload> = {}): Promise<EtaWidget> {
    const payload = { ...validEtaPayload(name), ...overrides };
    const res = await this.createRaw(payload);
    if (!res.ok()) throw new Error(`seed "${name}" failed: ${res.status()} ${await res.text()}`);

    const created = await this.findByName(name);
    if (!created) throw new Error(`seed "${name}" reported success but is not in the list`);
    return created;
  }

  /** Seed with an explicit pickup/destination set. */
  seedRoute(name: string, pickup: EtaPlace, destinations: EtaPlace[]): Promise<EtaWidget> {
    return this.seed(name, { data: { pickup, destinations } });
  }
}

export { MAX_PAGE_LIMIT, ETA_WIDGET_TYPE };
export default EtaWidgetService;
