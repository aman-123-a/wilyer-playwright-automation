// =============================================================================
//  MEDIA SETS — REST API contract, validation, auth and defect probes.
//  Pure HTTP (the `api` project claims anything under /api/), so no browser cost.
//
//  Behaviour recorded live against cms2.pocsample.in on 2026-10-07 (v3.5.25).
//  Cases that assert CORRECT behaviour pass today. Confirmed DEFECTS assert the
//  correct behaviour too, but are marked test.fail(): they stay green while the
//  bug exists and turn red the moment it is fixed — at which point delete the
//  marker. Each one carries its API-D<n> id for the report.
//
//  Every record the suite creates — including ones the server wrongly accepts
//  with a non-prefixed name (null, 12345, "") — is tracked by id and deleted, so
//  nothing outlives a run on the shared server.
// =============================================================================

import type { APIResponse } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';

test.describe.configure({ mode: 'serial' });

test.describe('Media Sets — API @api @regression', () => {
  let files: ZoneFiles;
  const created: string[] = [];

  /** Create and remember the id, whatever the name ends up as. */
  async function create(api: MediaSetService, payload: unknown): Promise<APIResponse> {
    const res = await api.createRaw(payload);
    if (res.status() === 201) created.push((await res.json()).id);
    return res;
  }

  const body = async (res: APIResponse): Promise<{ message?: string; [k: string]: unknown }> =>
    res.json().catch(() => ({}));

  test.beforeAll(async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: testInfo.project.use.storageState });
    files = await (await MediaSetService.fromContext(context)).pickZoneFiles();
    await context.close();
  });

  test.afterEach(async ({ mediaSetApi }) => {
    for (const id of created.splice(0)) await mediaSetApi.deleteQuietly(id);
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  });

  // ── Contract ───────────────────────────────────────────────────────────────

  test('API-01 · create answers 201 {message,id}; read-by-id returns the full document', async ({
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('api01', testInfo.workerIndex);
    const res = await create(mediaSetApi, MediaSetService.payload(name, files, { description: 'd' }));
    expect(res.status()).toBe(201);
    const { id, message } = (await res.json()) as { id: string; message: string };
    expect(message).toMatch(/created/i);
    expect(id).toMatch(/^[0-9a-f]{24}$/);

    const doc = await (await mediaSetApi['http'].rawGet(`/mediaSet/read/${id}`)).json();
    expect(doc).toMatchObject({ id, name, description: 'd', type: 'orientation' });
    expect(doc.zones).toHaveLength(2);
    expect(doc.zones.map((z: { label: string }) => z.label).sort()).toEqual(['Landscape', 'Portrait']);
  });

  test('API-02 · update returns {message, mediaSet} and persists the change', async ({
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('api02', testInfo.workerIndex);
    const id = (await (await create(mediaSetApi, MediaSetService.payload(name, files))).json()).id;
    const res = await mediaSetApi.updateRaw(id, MediaSetService.payload(`${name}_u`, files));
    expect(res.status()).toBe(200);
    const out = await body(res);
    expect(out.message).toMatch(/updated/i);
    expect((out.mediaSet as { name: string }).name).toBe(`${name}_u`);
  });

  test('API-03 · list response shape and paging fields', async ({ mediaSetApi }) => {
    const res = await mediaSetApi.listRaw({ limit: 2 });
    expect(res.status()).toBe(200);
    const out = await res.json();
    expect(out.mediaSets.length).toBeLessThanOrEqual(2);
    expect(out).toMatchObject({ page: 1 });
    expect(typeof out.totalDocs).toBe('number');
    expect(typeof out.totalPages).toBe('number');
  });

  test('API-04 · unknown ids answer 404 {message}', async ({ mediaSetApi }) => {
    const ghost = '000000000000000000000003';
    for (const res of [
      await mediaSetApi.updateRaw(ghost, MediaSetService.payload('x', files)),
      await mediaSetApi.deleteRaw(ghost),
    ]) {
      expect(res.status()).toBe(404);
      expect((await body(res)).message).toMatch(/not found/i);
    }
  });

  // ── Validation (correct today) ─────────────────────────────────────────────

  test('API-10 · empty body and whitespace-only name are rejected with 400 and a message', async ({
    mediaSetApi,
  }) => {
    for (const payload of [{}, { ...MediaSetService.payload('x', files), name: '   ' }]) {
      const res = await create(mediaSetApi, payload);
      expect(res.status()).toBe(400);
      expect((await body(res)).message).toMatch(/name is required/i);
    }
  });

  test('API-11 · fewer than 2 display formats is rejected (400)', async ({ mediaSetApi }, testInfo) => {
    const name = mediaSetName('api11', testInfo.workerIndex);
    const res = await create(mediaSetApi, MediaSetService.payload(name, files, { zones: [] }));
    expect(res.status()).toBe(400);
    expect((await body(res)).message).toMatch(/at least 2 display formats/i);
  });

  test('API-12 · unknown or malformed zone file ids are rejected (400)', async ({ mediaSetApi }, testInfo) => {
    const name = mediaSetName('api12', testInfo.workerIndex);
    for (const bad of ['nope', '000000000000000000000000']) {
      const res = await create(
        mediaSetApi,
        MediaSetService.payload(name, files, {
          zones: [{ ratio: '16:9', w: 16, h: 9, label: 'Landscape', file: bad }],
        }),
      );
      expect(res.status(), `file "${bad}"`).toBe(400);
    }
  });

  test("API-13 · type must be 'orientation' or 'automatic'", async ({ mediaSetApi }, testInfo) => {
    const name = mediaSetName('api13', testInfo.workerIndex);
    const res = await create(mediaSetApi, { ...MediaSetService.payload(name, files), type: 'bogus' });
    expect(res.status()).toBe(400);
    expect((await body(res)).message).toMatch(/orientation.*automatic/i);
  });

  test('API-14 · malformed folderId on create is a 400, not a 500', async ({ mediaSetApi }, testInfo) => {
    const name = mediaSetName('api14', testInfo.workerIndex);
    const res = await create(mediaSetApi, MediaSetService.payload(name, files, { folderId: 'not-an-objectid' }));
    expect(res.status()).toBe(400);
    expect((await body(res)).message).toMatch(/invalid folderId/i);
  });

  test('API-15 · duplicate name in the same folder is refused with 409', async ({ mediaSetApi }, testInfo) => {
    const name = mediaSetName('api15', testInfo.workerIndex);
    expect((await create(mediaSetApi, MediaSetService.payload(name, files))).status()).toBe(201);
    const dup = await create(mediaSetApi, MediaSetService.payload(name, files));
    expect(dup.status()).toBe(409);
    expect((await body(dup)).message).toMatch(/already exists/i);
  });

  test('API-16 · a non-JSON body is a 400, never a 5xx', async ({ mediaSetApi }) => {
    const res = await mediaSetApi['http'].rawPost('/mediaSet/create', {
      data: 'hello',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('API-17 · owner fields in the body are ignored (no mass assignment)', async ({
    mediaSetApi,
  }, testInfo) => {
    const mine = await mediaSetApi.list({ limit: 1 });
    const ownerId = mine.mediaSets[0]
      ? (mine.mediaSets[0] as unknown as { user: string }).user
      : undefined;
    test.skip(!ownerId, 'account has no set to learn its own user id from');

    const name = mediaSetName('api17', testInfo.workerIndex);
    const res = await create(mediaSetApi, {
      ...MediaSetService.payload(name, files),
      user: '000000000000000000000002',
      subuser: '000000000000000000000002',
    });
    expect(res.status()).toBe(201);
    const id = (await res.json()).id;
    const doc = await (await mediaSetApi['http'].rawGet(`/mediaSet/read/${id}`)).json();
    expect(doc.user, 'owner stays the caller').toBe(ownerId);
    expect(doc.subuser ?? null).toBeNull();
  });

  // ── Read parameters ────────────────────────────────────────────────────────

  test('API-20 · regex metacharacters in search are matched literally — no 5xx, no wildcard', async ({
    mediaSetApi,
  }) => {
    for (const search of ['(', '[', '.*', '(a+)+$', '\\']) {
      const res = await mediaSetApi.listRaw({ search });
      expect(res.status(), `search=${search}`).toBe(200);
      expect((await res.json()).totalDocs, `"${search}" must not act as a wildcard`).toBe(0);
    }
  });

  test('API-21 · a page beyond the last returns an empty list, not an error', async ({ mediaSetApi }) => {
    const res = await mediaSetApi.listRaw({ page: 9999, limit: 20 });
    expect(res.status()).toBe(200);
    expect((await res.json()).mediaSets).toEqual([]);
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  test('API-30 · anonymous and bad-token callers get 401 on every endpoint', async ({ mediaSetApi }) => {
    const id = '000000000000000000000003';
    const payload = MediaSetService.payload('anon', files);
    const bad = new MediaSetService(mediaSetApi['http'].withToken('abc.def.ghi'));
    for (const [who, svc] of [
      ['anonymous', mediaSetApi.asAnonymous()],
      ['bad token', bad],
    ] as const) {
      for (const [op, res] of [
        ['read', await svc.listRaw()],
        ['create', await svc.createRaw(payload)],
        ['update', await svc.updateRaw(id, payload)],
        ['delete', await svc.deleteRaw(id)],
      ] as const) {
        expect(res.status(), `${who} ${op}`).toBe(401);
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  CONFIRMED DEFECTS — assert the correct behaviour; test.fail() while broken.
  // ══════════════════════════════════════════════════════════════════════════

  test('API-D1 · name must be a string — null and numbers are accepted today', async ({ mediaSetApi }, testInfo) => {
    test.fail(true, 'API-D1: name null/number accepted (stored as "null"/"12345")');
    const base = MediaSetService.payload(mediaSetName('d1', testInfo.workerIndex), files);
    for (const name of [null, 12345]) {
      const res = await create(mediaSetApi, { ...base, name });
      expect(res.status(), `name=${String(name)}`).toBe(400);
    }
  });

  test('API-D2 · a name has a length cap — 300 characters is accepted today', async ({ mediaSetApi }, testInfo) => {
    test.fail(true, 'API-D2: no name length limit (300 chars saved)');
    const name = mediaSetName('d2', testInfo.workerIndex) + 'L'.repeat(300);
    expect((await create(mediaSetApi, MediaSetService.payload(name, files))).status()).toBe(400);
  });

  test('API-D3 · zones are mandatory — omitting them is accepted today', async ({ mediaSetApi }, testInfo) => {
    test.fail(true, 'API-D3: zones missing → 201 (only zones:[] is rejected)');
    const name = mediaSetName('d3', testInfo.workerIndex);
    const res = await create(mediaSetApi, { ...MediaSetService.payload(name, files), zones: undefined });
    expect(res.status()).toBe(400);
  });

  test('API-D4 · orientation is enforced — a portrait file in the Landscape zone is accepted today', async ({
    mediaSetApi,
  }, testInfo) => {
    test.fail(true, 'API-D4: swapped landscape/portrait files → 201');
    const name = mediaSetName('d4', testInfo.workerIndex);
    const res = await create(
      mediaSetApi,
      MediaSetService.payload(name, files, {
        zones: [
          { ratio: '16:9', w: 16, h: 9, label: 'Landscape', file: files.portrait.id },
          { ratio: '9:16', w: 9, h: 16, label: 'Portrait', file: files.landscape.id },
        ],
      }),
    );
    expect(res.status()).toBe(400);
  });

  test('API-D5 · folderId must exist — an orphan folder id is accepted today', async ({ mediaSetApi }, testInfo) => {
    test.fail(true, 'API-D5: non-existent folderId → 201 (orphan set)');
    const name = mediaSetName('d5', testInfo.workerIndex);
    const res = await create(
      mediaSetApi,
      MediaSetService.payload(name, files, { folderId: '000000000000000000000001' }),
    );
    expect(res.status()).toBe(400);
  });

  test('API-D6 · update cannot blank the name — it is accepted today', async ({ mediaSetApi }, testInfo) => {
    test.fail(true, 'API-D6: update name:"" → 200 (create requires a name, update does not)');
    const name = mediaSetName('d6', testInfo.workerIndex);
    const id = (await (await create(mediaSetApi, MediaSetService.payload(name, files))).json()).id;
    const res = await mediaSetApi.updateRaw(id, { ...MediaSetService.payload(name, files), name: '' });
    expect(res.status()).toBe(400);
  });

  test('API-D7 · malformed ids answer 400/404, not 500 (update, delete)', async ({ mediaSetApi }) => {
    test.fail(true, 'API-D7: malformed id → 500 {"status":500} (uncaught CastError)');
    for (const res of [
      await mediaSetApi.updateRaw('not-an-id', MediaSetService.payload('x', files)),
      await mediaSetApi.deleteRaw('not-an-id'),
    ]) {
      expect(res.status()).toBeLessThan(500);
    }
  });

  test('API-D8 · malformed folderId on read answers 400, not 500', async ({ mediaSetApi }) => {
    test.fail(true, 'API-D8: read?folderId=zz → 500');
    expect((await mediaSetApi.listRaw({ folderId: 'zz' })).status()).toBeLessThan(500);
  });

  test('API-D9 · a wrong HTTP method does not leak the server filesystem path', async ({ mediaSetApi }) => {
    test.fail(true, 'API-D9: GET /mediaSet/create → 404 body exposes /var/www/v3-2/server/…');
    const res = await mediaSetApi['http'].rawGet('/mediaSet/create');
    expect(await res.text()).not.toMatch(/\/var\/www|ENOENT/);
  });

  test('API-D10 · invalid paging values are rejected — negative/non-numeric are accepted today', async ({
    mediaSetApi,
  }) => {
    test.fail(true, 'API-D10: limit=-5, limit=abc, page=-1 → 200 (silently ignored; campaigns answer 400)');
    for (const q of [{ limit: -5 }, { limit: 'abc' as unknown as number }, { page: -1 }]) {
      const res = await mediaSetApi.listRaw(q);
      expect(res.status(), JSON.stringify(q)).toBe(400);
    }
  });
});
