// =============================================================================
//  MediaSetService — typed client for the Library ▸ Media Sets endpoints.
//
//  Endpoints (observed on the wire against cms2.pocsample.in, 2026-10-07):
//    GET    /mediaSet/read?page&limit&search&folderId&type
//                                   → { mediaSets, page, totalPages, totalDocs }
//    POST   /mediaSet/create        → 201 { message, id }
//    POST   /mediaSet/update/{id}   → 200 { message, mediaSet }   (POST, full body)
//    DELETE /mediaSet/delete/{id}   → 200
//
//  There is NO bulk endpoint. The list's bulk "Delete (N)" fires one
//  DELETE per selected set; "Move to Folder" and (Un)Publish likewise act per set.
//
//  Zone files are sent as bare media ids. Each zone needs an orientation-matched
//  file (landscape zone ← w>h, portrait zone ← h>w), so `pickZoneFiles` harvests
//  one of each from the account's own library rather than hard-coding ids that
//  differ per environment.
// =============================================================================

import type { APIResponse, BrowserContext } from '@playwright/test';
import { BaseService } from '../BaseService';

export interface MediaSetFile {
  id: string;
  name: string;
  type: 'image' | 'video' | string;
  w: number;
  h: number;
}

export interface MediaSetZone {
  ratio: string;
  w: number;
  h: number;
  label: string;
  file: MediaSetFile | string;
}

export interface MediaSet {
  id: string;
  name: string;
  description: string;
  type: string;
  folderId: string | null;
  portraitFile?: MediaSetFile;
  landscapeFile?: MediaSetFile;
  zones: MediaSetZone[];
  screens: unknown[];
  createdAt?: string;
}

export interface MediaSetList {
  mediaSets: MediaSet[];
  page: number;
  totalPages: number;
  totalDocs: number;
}

export interface MediaSetListQuery {
  page?: number;
  limit?: number;
  search?: string;
  folderId?: string;
  type?: string;
}

/** What create / update accept. Files are media ids. */
export interface MediaSetPayload {
  name: string;
  description: string;
  type: 'orientation';
  portraitFile: string;
  landscapeFile: string;
  zones: Array<{ ratio: string; w: number; h: number; label: string; file: string }>;
  folderId: string;
}

export interface ZoneFiles {
  landscape: MediaSetFile;
  portrait: MediaSetFile;
}

export class MediaSetService extends BaseService {
  static async fromContext(context: BrowserContext): Promise<MediaSetService> {
    return new MediaSetService(await BaseService.clientFromContext(context));
  }

  /** Same endpoints with no credentials — the anonymous-access probe. */
  asAnonymous(): MediaSetService {
    return new MediaSetService(this.http.anonymous());
  }

  // ── Raw calls — tests assert the status themselves ─────────────────────────

  listRaw(query: MediaSetListQuery = {}): Promise<APIResponse> {
    return this.http.rawGet('/mediaSet/read', {
      params: { page: 1, limit: 20, search: '', folderId: '', type: '', ...query },
    });
  }

  createRaw(payload: unknown): Promise<APIResponse> {
    return this.http.rawPost('/mediaSet/create', { data: payload });
  }

  updateRaw(id: string, payload: unknown): Promise<APIResponse> {
    return this.http.rawPost(`/mediaSet/update/${id}`, { data: payload });
  }

  deleteRaw(id: string): Promise<APIResponse> {
    return this.http.rawDelete(`/mediaSet/delete/${id}`);
  }

  // ── Convenience wrappers — throw on non-2xx ────────────────────────────────

  list(query: MediaSetListQuery = {}): Promise<MediaSetList> {
    return this.http.get<MediaSetList>('/mediaSet/read', {
      params: { page: 1, limit: 20, search: '', folderId: '', type: '', ...query },
    });
  }

  /** Create and return the new id. */
  async create(payload: MediaSetPayload): Promise<string> {
    const body = await this.http.post<{ id: string }>('/mediaSet/create', { data: payload });
    return body.id;
  }

  /** Read one set back through the list (there is no read-by-id endpoint). */
  async findByName(name: string): Promise<MediaSet | undefined> {
    const { mediaSets } = await this.list({ search: name, limit: 100 });
    return mediaSets.find((m) => m.name === name);
  }

  /** Every set whose name starts with `prefix` — the teardown sweep. */
  async findByPrefix(prefix: string): Promise<MediaSet[]> {
    const needle = prefix.toLowerCase();
    const found: MediaSet[] = [];
    for (let page = 1; ; page += 1) {
      const res = await this.list({ search: prefix, limit: 100, page });
      found.push(...res.mediaSets);
      if (page >= res.totalPages) break;
    }
    return found.filter((m) => m.name.toLowerCase().startsWith(needle));
  }

  /** Idempotent delete — never throws, safe in teardown. */
  async deleteQuietly(id: string): Promise<void> {
    await this.deleteRaw(id).catch(() => undefined);
  }

  /** Remove every set this suite created. Returns how many were deleted. */
  async cleanupByPrefix(prefix: string): Promise<number> {
    const stale = await this.findByPrefix(prefix);
    for (const m of stale) await this.deleteQuietly(m.id);
    return stale.length;
  }

  /**
   * One landscape and one portrait IMAGE from the account's library. Images
   * rather than video: they are small, and a set built from them never waits on
   * transcoding. Throws a clear message when the account has no usable pair.
   */
  async pickZoneFiles(): Promise<ZoneFiles> {
    const res = await this.http.get<{ docs?: MediaSetFile[] }>('/file/read', {
      params: { limit: 100, page: 1, type: 'image', sort: 'createdAt', order: -1 },
    });
    const images = (res.docs ?? []).filter((f) => f.type === 'image');
    const landscape = images.find((f) => f.w > f.h);
    const portrait = images.find((f) => f.h > f.w);
    if (!landscape || !portrait) {
      throw new Error(
        'The account has no landscape+portrait image pair in its first 100 library files — ' +
          'upload one of each so media-set specs can build a valid set.',
      );
    }
    return { landscape, portrait };
  }

  /** A valid two-zone payload (Landscape 16:9 + Portrait 9:16). */
  static payload(name: string, files: ZoneFiles, extra: Partial<MediaSetPayload> = {}): MediaSetPayload {
    return {
      name,
      description: '',
      type: 'orientation',
      portraitFile: files.portrait.id,
      landscapeFile: files.landscape.id,
      zones: [
        { ratio: '16:9', w: 16, h: 9, label: 'Landscape', file: files.landscape.id },
        { ratio: '9:16', w: 9, h: 16, label: 'Portrait', file: files.portrait.id },
      ],
      folderId: '',
      ...extra,
    };
  }
}

export default MediaSetService;
