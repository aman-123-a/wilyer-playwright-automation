// =============================================================================
//  MEDIA SETS — CRUD (API + UI).
//  Sets are created through the API from the account's own landscape/portrait
//  images (building one in the UI needs click-assignment of two zones and is
//  covered by the builder spec). Every set carries MEDIASET_PREFIX and is swept
//  after each test, so nothing outlives the run on the shared server.
//
//  Serial: the UI cases assert "Total - N" on a name-scoped search, and the
//  sweep must not race a sibling worker's data.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';

test.describe.configure({ mode: 'serial' });

test.describe('Media Sets — CRUD @regression', () => {
  let files: ZoneFiles;

  test.beforeEach(async ({ mediaSetsPage, mediaSetApi }) => {
    test.skip(!(await mediaSetsPage.isAvailable()), 'Media Sets module is absent from this build');
    files ??= await mediaSetApi.pickZoneFiles();
  });

  test.afterEach(async ({ mediaSetApi }) => {
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  });

  // ── Create ─────────────────────────────────────────────────────────────────

  test('CRUD-C1 · API create answers 201 with an id, and the set is listed', async ({
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('create', testInfo.workerIndex);
    const res = await mediaSetApi.createRaw(MediaSetService.payload(name, files));
    expect(res.status()).toBe(201);
    const { id } = await res.json();
    expect(id, 'create returns the new id').toBeTruthy();

    const found = await mediaSetApi.findByName(name);
    expect(found?.id).toBe(id);
    expect(found?.zones.map((z) => z.label).sort()).toEqual(['Landscape', 'Portrait']);
  });

  test('CRUD-C2 · a created set appears as a card in the UI', async ({
    mediaSetsPage,
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('ui_visible', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files, { description: 'qa desc' }));

    await mediaSetsPage.open();
    await mediaSetsPage.searchAndSettle(name, 1);
    await expect(mediaSetsPage.cardByName(name)).toBeVisible();
    await expect(mediaSetsPage.cardByName(name)).toContainText('2 files');
  });

  test('CRUD-C3 · create without a name is rejected (4xx, not 5xx) and stores nothing', async ({
    mediaSetApi,
  }) => {
    const before = (await mediaSetApi.list({ limit: 1 })).totalDocs;
    const res = await mediaSetApi.createRaw({ ...MediaSetService.payload('x', files), name: '' });
    expect(res.status(), 'empty name').toBeGreaterThanOrEqual(400);
    expect(res.status(), 'empty name must not be a 5xx').toBeLessThan(500);
    expect((await mediaSetApi.list({ limit: 1 })).totalDocs).toBe(before);
  });

  test('CRUD-C4 · anonymous callers are rejected', async ({ mediaSetApi }) => {
    const anon = mediaSetApi.asAnonymous();
    expect([401, 403]).toContain((await anon.listRaw()).status());
    expect([401, 403]).toContain(
      (await anon.createRaw(MediaSetService.payload('anon', files))).status(),
    );
  });

  // ── Read ───────────────────────────────────────────────────────────────────

  test('CRUD-R1 · search matches exact and case-insensitive names; a miss is empty', async ({
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('read', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));

    expect((await mediaSetApi.list({ search: name })).totalDocs).toBe(1);
    expect((await mediaSetApi.list({ search: name.toUpperCase() })).totalDocs).toBe(1);
    expect((await mediaSetApi.list({ search: `${name}_nomatch` })).totalDocs).toBe(0);
  });

  test('CRUD-R2 · UI shows the empty state for a search with no match', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.open();
    await mediaSetsPage.search('zzz_no_such_media_set_99999');
    await expect(mediaSetsPage.emptyState()).toBeVisible();
    await mediaSetsPage.clearSearch();
    await mediaSetsPage.expectListResolved();
  });

  // ── Update ─────────────────────────────────────────────────────────────────

  test('CRUD-U1 · API update renames the set and keeps its zones', async ({
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('upd_api', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(name, files));

    const renamed = `${name}_renamed`;
    const res = await mediaSetApi.updateRaw(id, MediaSetService.payload(renamed, files));
    expect(res.status()).toBe(200);

    expect(await mediaSetApi.findByName(name), 'old name gone').toBeUndefined();
    const found = await mediaSetApi.findByName(renamed);
    expect(found?.id, 'same record, new name').toBe(id);
    expect(found?.zones).toHaveLength(2);
  });

  test('CRUD-U2 · UI edit view loads the set; rename + Save Changes persists', async ({
    mediaSetsPage,
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('upd_ui', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(name, files));

    await mediaSetsPage.open();
    await mediaSetsPage.searchAndSettle(name, 1);
    await mediaSetsPage.openEdit(name);

    const renamed = `${name}_ed`;
    await mediaSetsPage.renameInEdit(renamed);

    await expect.poll(async () => (await mediaSetApi.findByName(renamed))?.id).toBe(id);
    expect(await mediaSetApi.findByName(name)).toBeUndefined();
  });

  test('CRUD-U3 · Cancel in the edit view discards the change', async ({
    mediaSetsPage,
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('upd_cancel', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));

    await mediaSetsPage.open();
    await mediaSetsPage.searchAndSettle(name, 1);
    await mediaSetsPage.openEdit(name);
    await mediaSetsPage.nameInput.fill(`${name}_discarded`);
    await mediaSetsPage.cancelBtn.click();

    expect(await mediaSetApi.findByName(name), 'original name kept').toBeDefined();
    expect(await mediaSetApi.findByName(`${name}_discarded`)).toBeUndefined();
  });

  // ── Delete ─────────────────────────────────────────────────────────────────

  test('CRUD-D1 · single delete asks for confirmation; Cancel keeps the set', async ({
    mediaSetsPage,
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('del_cancel', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));

    await mediaSetsPage.open();
    await mediaSetsPage.searchAndSettle(name, 1);
    await mediaSetsPage.clickDelete(name);
    await expect(mediaSetsPage.openModal).toContainText(name);
    await expect(mediaSetsPage.openModal).toContainText(/cannot be undone/i);
    await mediaSetsPage.cancelModal();

    expect(await mediaSetApi.findByName(name), 'still exists').toBeDefined();
  });

  test('CRUD-D2 · confirmed delete removes the set from the list and the API', async ({
    mediaSetsPage,
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('del_ok', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));

    await mediaSetsPage.open();
    await mediaSetsPage.searchAndSettle(name, 1);
    await mediaSetsPage.clickDelete(name);
    await mediaSetsPage.confirmDelete();

    await mediaSetsPage.expectTotal(0);
    expect(await mediaSetApi.findByName(name), 'gone from the API').toBeUndefined();
  });

  test('CRUD-D3 · API delete answers 200, a repeat delete answers 404', async ({
    mediaSetApi,
  }, testInfo) => {
    const id = await mediaSetApi.create(
      MediaSetService.payload(mediaSetName('del_api', testInfo.workerIndex), files),
    );
    expect((await mediaSetApi.deleteRaw(id)).status()).toBe(200);
    expect((await mediaSetApi.deleteRaw(id)).status()).toBe(404);
  });
});
