// =============================================================================
//  PlaylistService — typed client for the playlist endpoints.
//
//  Why the SCHEDULING suite needs this: a schedule is NOT stored on the campaign.
//  It lives in the playlist document, at three different depths (verified live
//  against cms2.pocsample.in, 2026-07-29 — read back from the server, not assumed):
//
//    layout.schedule                    → a whole layout            (Case E)
//    layout.zones[].schedule            → a zone
//    layout.zones[].array.data[].schedule → one item in a zone      (Cases A–D)
//
//  A zone item is EITHER `{file, duration, schedule}` OR `{campaign, duration}`.
//  Both kinds sit side by side in one `array.data`, which is what makes
//  "a scheduled file next to a campaign" expressible at all.
//
//  Endpoint facts (observed on the wire, from the app's own requests):
//    GET  /playlist/read?page&limit&search&sort&order&isNotFolder → paginated
//    GET  /playlist/read/{id}                                     → single doc
//    POST /playlist/create      { name, description }
//    POST /playlist/update/{id} { name, layouts }   ← POST, and it is a FULL
//                                                     replace of `layouts`
//    DELETE /playlist/delete/{id}
//
//  The update is a whole-document overwrite: to change one item's schedule you
//  read the document, mutate that node, and send the entire `layouts` array
//  back. Sending a partial tree silently drops everything you left out, so
//  every mutator here is built on read-modify-write.
// =============================================================================

import type { APIResponse, BrowserContext } from '@playwright/test';
import { BaseService, type ListQuery, type Paginated } from '../BaseService';

/** Weekday flags, exactly as the server names and orders them. */
export interface ScheduleDays {
  sunday: boolean;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
}

/**
 * A schedule node. `null` means "no schedule" — always on, which is how an
 * unscheduled item is stored. The empty-string / null distinction matters:
 * the server stores unset date and time parts as null, never as "".
 */
export interface Schedule {
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  isRoutineEnabled: boolean;
  days: ScheduleDays;
}

export interface ZoneFileRef {
  id: string;
  name?: string;
  thumb?: string;
  type?: string;
  duration?: number;
}

export interface ZoneCampaignRef {
  id: string;
  name?: string;
  thumb?: string;
  totalFiles?: number;
}

/**
 * One entry in a zone's playback array. A file entry carries `file`; a campaign
 * entry carries `campaign`. `schedule` is present on both in the READ model —
 * whether the writer accepts it on a campaign entry is exactly what the
 * scheduling suite has to establish, so nothing here assumes it does.
 */
export interface ZoneItem {
  file?: ZoneFileRef | null;
  campaign?: ZoneCampaignRef | null;
  widget?: unknown;
  duration: number;
  schedule?: Schedule | null;
}

export interface Zone {
  id: string;
  config: Record<string, number>;
  ratioConfig?: Record<string, number>;
  fitContent?: boolean;
  mute?: boolean;
  duration?: number;
  schedule?: Schedule | null;
  sequenceTriggers?: unknown[];
  array?: { data: ZoneItem[]; defaultDuration?: number; transition?: string };
  file?: unknown;
  widget?: unknown;
  sequence?: unknown;
}

export interface Layout {
  id: string;
  name: string;
  config: { width: number; height: number };
  renderConfig?: { width: number; height: number };
  orientation?: string;
  schedule?: Schedule | null;
  duration?: number;
  isCustomDuration?: boolean;
  layoutTriggers?: unknown[];
  zones: Zone[];
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  layouts: Layout[];
  playlistFolder?: string | null;
}

export type PlaylistList = Paginated<Playlist>;

const LIST_DEFAULTS = {
  page: 1,
  limit: 50,
  search: '',
  sort: 'createdAt',
  order: '-1',
  isNotFolder: 'false',
};

/** Every day off — the shape the UI sends before any day button is pressed. */
export const NO_DAYS: ScheduleDays = {
  sunday: false,
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
};

export const ALL_DAYS: ScheduleDays = {
  sunday: true,
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: true,
};

export type DayName = keyof ScheduleDays;

/** Build a `days` map from a list of day names — `days('monday','friday')`. */
export function days(...on: DayName[]): ScheduleDays {
  const map = { ...NO_DAYS };
  for (const d of on) map[d] = true;
  return map;
}

export const WEEKDAYS = days('monday', 'tuesday', 'wednesday', 'thursday', 'friday');
export const WEEKENDS = days('saturday', 'sunday');

/** A schedule with sensible nulls, so tests only state what they care about. */
export function schedule(partial: Partial<Schedule> = {}): Schedule {
  return {
    startDate: null,
    endDate: null,
    startTime: null,
    endTime: null,
    isRoutineEnabled: false,
    days: { ...NO_DAYS },
    ...partial,
  };
}

export class PlaylistService extends BaseService {
  static async fromContext(context: BrowserContext): Promise<PlaylistService> {
    return new PlaylistService(await BaseService.clientFromContext(context));
  }

  // ── Raw calls — status codes are the assertion in negative cases ──────────

  readRaw(id: string): Promise<APIResponse> {
    return this.http.rawGet(`/playlist/read/${id}`);
  }

  createRaw(payload: Record<string, unknown>): Promise<APIResponse> {
    return this.http.rawPost('/playlist/create', { data: payload });
  }

  updateRaw(id: string, payload: Record<string, unknown>): Promise<APIResponse> {
    return this.http.rawPost(`/playlist/update/${id}`, { data: payload });
  }

  deleteRaw(id: string): Promise<APIResponse> {
    return this.http.rawDelete(`/playlist/delete/${id}`);
  }

  // ── Convenience wrappers ──────────────────────────────────────────────────

  list(query: ListQuery = {}): Promise<PlaylistList> {
    return this.http.get<PlaylistList>('/playlist/read', {
      params: { ...LIST_DEFAULTS, ...query },
    });
  }

  read(id: string): Promise<Playlist> {
    return this.http.get<Playlist>(`/playlist/read/${id}`);
  }

  async create(name: string, description = 'e2e scheduling suite'): Promise<string> {
    const res = await this.createRaw({ name, description });
    if (!res.ok()) throw new Error(`playlist create failed: ${res.status()} ${await res.text()}`);
    const body = (await res.json()) as { id?: string; data?: { id?: string } };
    const id = body.id ?? body.data?.id;
    if (id) return id;
    // Some builds answer with a bare success message; fall back to a lookup.
    const found = (await this.list({ limit: 50 })).docs.find((p) => p.name === name);
    if (!found) throw new Error(`playlist "${name}" created but not found in the list`);
    return found.id;
  }

  /** Idempotent delete — safe in teardown. */
  async deleteQuietly(id: string): Promise<void> {
    await this.deleteRaw(id).catch(() => undefined);
  }

  /** Remove every playlist this suite created. Returns how many went. */
  async cleanupByPrefix(prefix: string): Promise<number> {
    const needle = prefix.toLowerCase();
    const stale = (await this.list({ limit: 100 })).docs.filter((p) =>
      p.name.toLowerCase().startsWith(needle),
    );
    for (const p of stale) await this.deleteQuietly(p.id);
    return stale.length;
  }

  // ── Read-modify-write helpers ─────────────────────────────────────────────

  /**
   * Apply `mutate` to the live document and save it whole.
   *
   * `/playlist/update` replaces `layouts` outright, so the only safe way to
   * change one nested node is to send back everything that was read. Returns
   * the raw response: negative cases assert on its status, and a caller that
   * wants the saved state re-reads afterwards rather than trusting the echo.
   */
  async mutate(id: string, mutate: (doc: Playlist) => void): Promise<APIResponse> {
    const doc = await this.read(id);
    mutate(doc);
    return this.updateRaw(id, {
      name: doc.name,
      layouts: PlaylistService.normaliseForWrite(doc).layouts,
    });
  }

  /**
   * Same as `mutate`, but sends the document back EXACTLY as it was read.
   *
   * This is what proves the read/write asymmetry in `zone.schedule`: the reader
   * emits `null`, the writer's schema demands an array, so a faithful
   * round-trip is rejected. Tests use this to assert the defect; everything
   * else uses `mutate`, which normalises.
   */
  async mutateVerbatim(id: string, mutate: (doc: Playlist) => void): Promise<APIResponse> {
    const doc = await this.read(id);
    mutate(doc);
    return this.updateRaw(id, { name: doc.name, layouts: doc.layouts });
  }

  /**
   * Bend a document that was READ into the shape the WRITER will accept.
   *
   * The read model and the write model of a playlist disagree in three places
   * (all observed on cms2, 2026-07-29):
   *
   *   zone.schedule        read: `null` / object   write: MUST be an array
   *   item.file            read: expanded object   write: MUST be the id string
   *   item.campaign        read: expanded object   write: MUST be the id string
   *
   * The editor never trips over this because it holds its own client-side model
   * and sends the collapsed shape; only a read-modify-write API client hits it.
   * See BUG-SCHED-05.
   *
   * Deliberately narrow: it collapses references and coerces the one field
   * whose read shape the writer rejects, and touches no schedule payload — so a
   * test asserting on a schedule it set is still asserting on its own data.
   */
  static normaliseForWrite(doc: Playlist): Playlist {
    const clone = JSON.parse(JSON.stringify(doc)) as Playlist;
    for (const layout of clone.layouts ?? []) {
      for (const zone of layout.zones ?? []) {
        if (!Array.isArray(zone.schedule)) {
          (zone as { schedule: unknown }).schedule = [];
        }
        for (const item of zone.array?.data ?? []) {
          if (item.file && typeof item.file === 'object') {
            (item as { file: unknown }).file = item.file.id;
          }
          if (item.campaign && typeof item.campaign === 'object') {
            (item as { campaign: unknown }).campaign = item.campaign.id;
          }
        }
      }
    }
    return clone;
  }

  /** The playback array of a zone, defaulting to the first layout / first zone. */
  static itemsOf(doc: Playlist, layout = 0, zone = 0): ZoneItem[] {
    return doc.layouts[layout]?.zones[zone]?.array?.data ?? [];
  }

  /** Item order as stable labels — the invariant that scheduling must not disturb. */
  static orderOf(doc: Playlist, layout = 0, zone = 0): string[] {
    return PlaylistService.itemsOf(doc, layout, zone).map(
      (i) => i.campaign?.name ?? i.file?.name ?? 'widget',
    );
  }

  /** Index of the first zone item that is a campaign, or -1. */
  static campaignIndex(doc: Playlist, layout = 0, zone = 0): number {
    return PlaylistService.itemsOf(doc, layout, zone).findIndex((i) => Boolean(i.campaign));
  }
}

export default PlaylistService;
