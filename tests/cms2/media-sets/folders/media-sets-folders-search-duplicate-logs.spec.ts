// =============================================================================
//  MEDIA SETS — folders, search + CRUD, duplicate handling, audit logs.
//  Target: cms2.pocsample.in (npm run cms2), signed in as the admin from .env.
//
//  Findings behind the design (probed live 2026-10-07):
//    - Folders are the MEDIA folder namespace: /folder/create | read | delete/{id}.
//    - Media sets have NO clone/duplicate action (the card offers view / edit /
//      publish / delete; /mediaSet/duplicate|clone|copy answer 404). "Duplicate"
//      here means duplicate-NAME handling plus a guard that no clone feature exists.
//    - Audit trail is GET /log/read?type=mediaSet|folder -> {docs:[{type,user,msg,createdAt}]}
//      with messages like "Media set 'X' created." / "updated." / "deleted.".
//
//  All data carries MEDIASET_PREFIX (sets) or FOLDER_PREFIX (folders) and is
//  swept after every test so nothing outlives the run on the shared server.
// =============================================================================

import type { Page } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, folderPrefix, mediaSetName } from '../../../../test-data/mediasets.data';

const FOLDER_PREFIX = folderPrefix('ZZ_QA_MS_F_');

interface Folder {
  id: string;
  name: string;
}
interface LogDoc {
  type: string;
  user: string;
  msg: string;
  createdAt: string;
}

// Default mode (not serial): a known-defect case must not skip its siblings. Run with --workers=1.

test.describe('Media Sets — folders, search, duplicates, logs @regression', () => {
  let files: ZoneFiles;

  const findFolders = async (api: MediaSetService, search = FOLDER_PREFIX): Promise<Folder[]> => {
    const res = await (
      await api['http'].rawGet('/folder/read', { params: { page: 1, limit: 100, search } })
    ).json();
    return ((res.folders ?? []) as Folder[]).filter((f) => f.name.startsWith(FOLDER_PREFIX));
  };

  const makeFolder = async (api: MediaSetService, label: string): Promise<Folder> => {
    const name = `${FOLDER_PREFIX}${label}_${Math.random().toString(36).slice(2, 7)}`;
    const res = await api['http'].rawPost('/folder/create', { data: { name } });
    expect(res.status(), `create folder ${name}`).toBe(201);
    const folder = (await findFolders(api, name)).find((f) => f.name === name);
    expect(folder, 'folder is listed after create').toBeTruthy();
    return folder as Folder;
  };

  const logs = async (api: MediaSetService, type: 'mediaSet' | 'folder'): Promise<LogDoc[]> => {
    const res = await (
      await api['http'].rawGet('/log/read', { params: { page: 1, limit: 50, type } })
    ).json();
    return (res.docs ?? []) as LogDoc[];
  };

  /** Poll the audit log until an entry matching `pattern` shows up (writes can lag). */
  const expectLog = async (api: MediaSetService, type: 'mediaSet' | 'folder', pattern: RegExp) => {
    await expect
      .poll(async () => (await logs(api, type)).some((l) => pattern.test(l.msg)), {
        timeout: 15_000,
        message: `audit log (${type}) should contain ${pattern}`,
      })
      .toBe(true);
  };

  const tiles = (p: Page) => p.locator('[draggable="true"]:visible');
  const assign = async (p: Page, kind: 'landscape' | 'portrait') => {
    const meta = await tiles(p).evaluateAll((e) =>
      e.map((x) => x.querySelector('.msce-hover-meta')?.textContent ?? ''),
    );
    const idx = meta
      .map((t, i) => ({ i, r: t.match(/(\d+)×(\d+)/) }))
      .find((x) => x.r && (kind === 'landscape' ? +x.r[1] > +x.r[2] : +x.r[2] > +x.r[1]))?.i;
    if (idx === undefined) throw new Error(`no ${kind} tile in the picker`);
    await p
      .getByText(kind === 'landscape' ? /landscape · 16:9/i : /portrait · 9:16/i)
      .first()
      .click();
    await tiles(p).nth(idx).click();
    await p.waitForTimeout(400);
  };

  /** Fill and submit the builder for `name` (landscape + portrait images). */
  const uiCreate = async (
    page: Page,
    ms: { open(): Promise<unknown>; openCreate(): Promise<unknown>; filterFiles(k: 'images'): Promise<unknown>; nameInput: { fill(v: string): Promise<void> } },
    name: string,
  ) => {
    await ms.open();
    await ms.openCreate();
    await ms.filterFiles('images');
    await ms.nameInput.fill(name);
    await assign(page, 'landscape');
    await assign(page, 'portrait');
    await page.getByRole('button', { name: /^create$/i }).click();
  };

  test.beforeEach(async ({ mediaSetsPage, mediaSetApi }) => {
    test.skip(!(await mediaSetsPage.isAvailable()), 'Media Sets module is absent from this build');
    files ??= await mediaSetApi.pickZoneFiles();
  });

  test.afterEach(async ({ mediaSetApi }) => {
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
    for (const f of await findFolders(mediaSetApi)) {
      await mediaSetApi['http'].rawDelete(`/folder/delete/${f.id}`);
    }
  });

  // ── Folders ────────────────────────────────────────────────────────────────

  test('FLD-01 · a set created inside a folder is listed under that folder', async ({
    mediaSetApi,
  }, testInfo) => {
    const folder = await makeFolder(mediaSetApi, 'in');
    const name = mediaSetName('fld01', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(name, files, { folderId: folder.id }));

    const inFolder = await mediaSetApi.list({ folderId: folder.id, limit: 100 });
    expect(inFolder.mediaSets.map((m) => m.id)).toContain(id);
    expect(inFolder.mediaSets.find((m) => m.id === id)?.folderId).toBe(folder.id);

    const root = await mediaSetApi.list({ search: name, limit: 100 });
    // Whether the unfiltered list includes folder children is a product choice; record it.
    console.log(`[FLD-01] visible in unfiltered list: ${root.mediaSets.some((m) => m.id === id)}`);
  });

  test('FLD-02 · same name: allowed in a different folder, 409 in the same one', async ({
    mediaSetApi,
  }, testInfo) => {
    const a = await makeFolder(mediaSetApi, 'a');
    const b = await makeFolder(mediaSetApi, 'b');
    const name = mediaSetName('fld02', testInfo.workerIndex);
    const p = (folderId: string) => MediaSetService.payload(name, files, { folderId });
    expect((await mediaSetApi.createRaw(p(a.id))).status()).toBe(201);
    expect((await mediaSetApi.createRaw(p(b.id))).status(), 'other folder').toBe(201);
    const dup = await mediaSetApi.createRaw(p(a.id));
    expect(dup.status(), 'same folder').toBe(409);
    expect((await dup.json()).message).toMatch(/already exists in this folder/i);
  });

  test('FLD-03 · moving a set via update: folder filters follow it', async ({
    mediaSetApi,
  }, testInfo) => {
    const a = await makeFolder(mediaSetApi, 'src');
    const b = await makeFolder(mediaSetApi, 'dst');
    const name = mediaSetName('fld03', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(name, files, { folderId: a.id }));

    const res = await mediaSetApi.updateRaw(id, MediaSetService.payload(name, files, { folderId: b.id }));
    expect(res.status()).toBe(200);
    const inA = await mediaSetApi.list({ folderId: a.id, limit: 100 });
    const inB = await mediaSetApi.list({ folderId: b.id, limit: 100 });
    expect(inA.mediaSets.map((m) => m.id)).not.toContain(id);
    expect(inB.mediaSets.map((m) => m.id)).toContain(id);
  });

  test('FLD-04 · UI bulk "Move to Folder" relocates the selected set', async ({
    mediaSetsPage,
    mediaSetApi,
  }, testInfo) => {
    const dest = await makeFolder(mediaSetApi, 'uimove');
    const name = mediaSetName('fld04', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(name, files));

    await mediaSetsPage.open();
    await mediaSetsPage.searchAndSettle(name, 1);
    await mediaSetsPage.selectCard(name);
    expect(await mediaSetsPage.chooseMoveFolder(dest.name), 'folder offered in the Move modal').toBe(true);
    await mediaSetsPage.confirmMove();

    await expect
      .poll(async () => (await mediaSetApi.list({ folderId: dest.id, limit: 100 })).mediaSets.map((m) => m.id))
      .toContain(id);
  });

  test('FLD-05 · malformed and unknown folderId never produce a 5xx', async ({
    mediaSetApi,
  }, testInfo) => {
    // BUG-MS-FLD-01: GET /mediaSet/read?folderId=<malformed> answers 500 (create answers a clean 400).
    test.fail(true, 'GET /mediaSet/read with a malformed folderId returns 500');
    const name = mediaSetName('fld05', testInfo.workerIndex);
    const bad = await mediaSetApi.createRaw(MediaSetService.payload(name, files, { folderId: 'not-an-objectid' }));
    expect(bad.status()).toBe(400);
    const ghost = await mediaSetApi.createRaw(
      MediaSetService.payload(name, files, { folderId: '000000000000000000000001' }),
    );
    expect(ghost.status(), 'unknown folder id').toBeLessThan(500);
    expect((await mediaSetApi.listRaw({ folderId: 'zzz' })).status(), 'list, malformed folderId').toBeLessThan(500);
  });

  test('FLD-06 · deleting a folder that holds a set has a defined outcome', async ({
    mediaSetApi,
  }, testInfo) => {
    const folder = await makeFolder(mediaSetApi, 'del');
    const name = mediaSetName('fld06', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(name, files, { folderId: folder.id }));

    const del = await mediaSetApi['http'].rawDelete(`/folder/delete/${folder.id}`);
    expect(del.status(), 'folder delete must not 5xx').toBeLessThan(500);
    const survives = (await mediaSetApi.list({ search: name, limit: 100 })).mediaSets.some((m) => m.id === id);
    console.log(`[FLD-06] folder delete=${del.status()}; set survives=${survives}`);
    if (del.status() === 200) {
      expect((await findFolders(mediaSetApi, folder.name)).find((f) => f.id === folder.id)).toBeUndefined();
    }
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  test('SRCH-01 · API search: exact, shared prefix, case-insensitive, partial, no match', async ({
    mediaSetApi,
  }, testInfo) => {
    const token = mediaSetName('srch01', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(`${token}_Alpha`, files));
    await mediaSetApi.create(MediaSetService.payload(`${token}_beta`, files));

    expect((await mediaSetApi.list({ search: `${token}_Alpha` })).totalDocs, 'exact').toBe(1);
    expect((await mediaSetApi.list({ search: token })).totalDocs, 'shared prefix').toBe(2);
    expect((await mediaSetApi.list({ search: token.toUpperCase() })).totalDocs, 'upper-cased').toBe(2);
    expect((await mediaSetApi.list({ search: token.slice(0, -2) })).totalDocs, 'partial').toBeGreaterThanOrEqual(2);
    expect((await mediaSetApi.list({ search: `${token}_nothing_here` })).totalDocs, 'no match').toBe(0);
  });

  test('SRCH-02 · metacharacters never 5xx and ".*" is literal text', async ({ mediaSetApi }) => {
    for (const term of ['.*', '(', '[', '\\', '%', '$ne', '<script>', "' OR '1'='1", ' ']) {
      expect((await mediaSetApi.listRaw({ search: term })).status(), `search "${term}"`).toBeLessThan(500);
    }
    const total = (await mediaSetApi.list({ limit: 1 })).totalDocs;
    const star = await mediaSetApi.list({ search: '.*', limit: 1 });
    expect(star.totalDocs, '".*" must not be a match-all regex').toBeLessThan(total);
  });

  test('SRCH-03 · search combined with folderId is scoped to that folder', async ({
    mediaSetApi,
  }, testInfo) => {
    const a = await makeFolder(mediaSetApi, 'sa');
    const b = await makeFolder(mediaSetApi, 'sb');
    const token = mediaSetName('srch03', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(`${token}_x`, files, { folderId: a.id }));
    await mediaSetApi.create(MediaSetService.payload(`${token}_y`, files, { folderId: b.id }));

    const inA = await mediaSetApi.list({ search: token, folderId: a.id });
    expect(inA.mediaSets.map((m) => m.name)).toEqual([`${token}_x`]);
    const inB = await mediaSetApi.list({ search: token, folderId: b.id });
    expect(inB.mediaSets.map((m) => m.name)).toEqual([`${token}_y`]);
  });

  test('SRCH-04 · UI search narrows cards, shows the total, and clearing restores the list', async ({
    mediaSetsPage,
    mediaSetApi,
  }, testInfo) => {
    const token = mediaSetName('srch04', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(`${token}_one`, files));
    await mediaSetApi.create(MediaSetService.payload(`${token}_two`, files));

    await mediaSetsPage.open();
    const all = await mediaSetsPage.total();
    await mediaSetsPage.searchAndSettle(token, 2);
    await expect(mediaSetsPage.cardByName(`${token}_one`)).toBeVisible();
    await mediaSetsPage.searchAndSettle(`${token}_two`, 1);
    await expect(mediaSetsPage.cardByName(`${token}_one`)).toHaveCount(0);
    await mediaSetsPage.searchAndSettle(`${token}_zzz`, 0);
    await mediaSetsPage.clearSearch();
    await mediaSetsPage.expectTotal(all as number);
  });

  test('SRCH-05 · a renamed set is found by its new name only', async ({ mediaSetApi }, testInfo) => {
    const token = mediaSetName('srch05', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(`${token}_old`, files));
    expect((await mediaSetApi.updateRaw(id, MediaSetService.payload(`${token}_new`, files))).status()).toBe(200);
    expect((await mediaSetApi.list({ search: `${token}_old` })).totalDocs).toBe(0);
    expect((await mediaSetApi.list({ search: `${token}_new` })).totalDocs).toBe(1);
  });

  // ── CRUD ───────────────────────────────────────────────────────────────────

  test('CRUD-01 · create → read → update → delete lifecycle', async ({ mediaSetApi }, testInfo) => {
    const name = mediaSetName('crud01', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(name, files, { description: 'first' }));
    expect((await mediaSetApi.findByName(name))?.description).toBe('first');

    const upd = await mediaSetApi.updateRaw(id, MediaSetService.payload(name, files, { description: 'second' }));
    expect(upd.status()).toBe(200);
    expect((await mediaSetApi.findByName(name))?.description).toBe('second');

    expect((await mediaSetApi.deleteRaw(id)).status()).toBe(200);
    expect(await mediaSetApi.findByName(name)).toBeUndefined();
    expect((await mediaSetApi.deleteRaw(id)).status(), 'second delete must not 5xx').toBeLessThan(500);
  });

  test('CRUD-02 · UI create through the builder lands in the list with two zones', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('crud02', testInfo.workerIndex);
    await uiCreate(page, mediaSetsPage, name);
    await expect(mediaSetsPage.searchInput).toBeVisible({ timeout: 20_000 });
    expect((await mediaSetApi.findByName(name))?.zones).toHaveLength(2);
  });

  test('CRUD-03 · UI rename via Edit persists', async ({ mediaSetsPage, mediaSetApi }, testInfo) => {
    const name = mediaSetName('crud03', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    await mediaSetsPage.open();
    await mediaSetsPage.searchAndSettle(name, 1);
    await mediaSetsPage.openEdit(name);
    await mediaSetsPage.renameInEdit(`${name}_ed`);
    await expect.poll(async () => Boolean(await mediaSetApi.findByName(`${name}_ed`))).toBe(true);
    expect(await mediaSetApi.findByName(name)).toBeUndefined();
  });

  test('CRUD-04 · UI delete removes the set; cancel keeps it', async ({
    mediaSetsPage,
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('crud04', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    await mediaSetsPage.open();
    await mediaSetsPage.searchAndSettle(name, 1);
    await mediaSetsPage.clickDelete(name);
    await mediaSetsPage.cancelModal();
    expect(await mediaSetApi.findByName(name), 'cancel keeps it').toBeTruthy();
    await mediaSetsPage.clickDelete(name);
    await mediaSetsPage.confirmDelete();
    await expect.poll(async () => mediaSetApi.findByName(name)).toBeUndefined();
  });

  // ── Duplicates ─────────────────────────────────────────────────────────────

  test('DUP-01 · create with an existing name → 409 and nothing extra is stored', async ({
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('dup01', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    const dup = await mediaSetApi.createRaw(MediaSetService.payload(name, files));
    expect(dup.status()).toBe(409);
    expect((await mediaSetApi.list({ search: name })).totalDocs).toBe(1);
  });

  test("DUP-02 · renaming onto another set's name is refused with 409", async ({
    mediaSetApi,
  }, testInfo) => {
    const token = mediaSetName('dup02', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(`${token}_A`, files));
    const idB = await mediaSetApi.create(MediaSetService.payload(`${token}_B`, files));
    const res = await mediaSetApi.updateRaw(idB, MediaSetService.payload(`${token}_A`, files));
    expect(res.status(), 'update to a taken name').toBe(409);
    expect((await mediaSetApi.list({ search: `${token}_A` })).totalDocs).toBe(1);
  });

  test('DUP-03 · case-only and whitespace-padded variants count as duplicates', async ({
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('dup03', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    const upper = await mediaSetApi.createRaw(MediaSetService.payload(name.toUpperCase(), files));
    const padded = await mediaSetApi.createRaw(MediaSetService.payload(`  ${name}  `, files));
    expect(upper.status(), 'case variant').toBe(409);
    expect(padded.status(), 'padded variant').toBe(409);
  });

  test('DUP-04 · parallel identical creates (double-submit) store exactly one set', async ({
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('dup04', testInfo.workerIndex);
    const results = await Promise.all(
      [1, 2, 3].map(() => mediaSetApi.createRaw(MediaSetService.payload(name, files))),
    );
    const statuses = results.map((r) => r.status());
    expect(statuses.filter((s) => s === 201), `statuses ${statuses}`).toHaveLength(1);
    expect((await mediaSetApi.list({ search: name })).totalDocs).toBe(1);
  });

  test('DUP-05 · UI builder refuses a duplicate name and stays open', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('dup05', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    await uiCreate(page, mediaSetsPage, name);
    await expect(page.getByText(/already exists/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(mediaSetsPage.nameInput).toBeVisible();
    expect((await mediaSetApi.list({ search: name })).totalDocs).toBe(1);
  });

  test('DUP-06 · there is no clone/duplicate feature: no card action, no endpoint', async ({
    mediaSetsPage,
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('dup06', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(name, files));
    await mediaSetsPage.open();
    await mediaSetsPage.searchAndSettle(name, 1);
    const tips = await mediaSetsPage
      .cardByName(name)
      .locator('button')
      .evaluateAll((b) => b.map((x) => x.getAttribute('data-tooltip-content') ?? x.textContent ?? ''));
    expect(tips.join('|'), 'card actions').not.toMatch(/duplicate|clone|copy/i);
    for (const verb of ['duplicate', 'clone', 'copy']) {
      const res = await mediaSetApi['http'].rawPost(`/mediaSet/${verb}/${id}`, { data: {} });
      expect(res.status(), verb).toBe(404);
    }
  });

  // ── Logs ───────────────────────────────────────────────────────────────────

  test('LOG-01 · create, update and delete each write an audit entry attributed to the admin', async ({
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('log01', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(name, files));
    await expectLog(mediaSetApi, 'mediaSet', new RegExp(`Media set '${name}' created`));
    await mediaSetApi.updateRaw(id, MediaSetService.payload(name, files, { description: 'x' }));
    await expectLog(mediaSetApi, 'mediaSet', new RegExp(`Media set '${name}' updated`));
    await mediaSetApi.deleteRaw(id);
    await expectLog(mediaSetApi, 'mediaSet', new RegExp(`Media set '${name}' deleted`));

    const mine = (await logs(mediaSetApi, 'mediaSet')).filter((l) => l.msg.includes(name));
    expect(mine.every((l) => l.user === 'dev@wilyer.com'), 'entries attributed to the acting user').toBe(true);
  });

  test('LOG-02 · a refused duplicate create writes no second "created" entry', async ({
    mediaSetApi,
  }, testInfo) => {
    const name = mediaSetName('log02', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    await mediaSetApi.createRaw(MediaSetService.payload(name, files));
    await expectLog(mediaSetApi, 'mediaSet', new RegExp(`Media set '${name}' created`));
    const created = (await logs(mediaSetApi, 'mediaSet')).filter((l) => l.msg.includes(`'${name}' created`));
    expect(created, 'only the successful create is logged').toHaveLength(1);
  });

  test('LOG-03 · a move between folders is traceable', async ({ mediaSetApi }, testInfo) => {
    const a = await makeFolder(mediaSetApi, 'la');
    const b = await makeFolder(mediaSetApi, 'lb');
    const name = mediaSetName('log03', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(name, files, { folderId: a.id }));
    await mediaSetApi.updateRaw(id, MediaSetService.payload(name, files, { folderId: b.id }));
    await expectLog(mediaSetApi, 'mediaSet', new RegExp(`'${name}'.*(moved|updated)`));
  });

  test('LOG-04 · folder create and delete are logged', async ({ mediaSetApi }) => {
    const folder = await makeFolder(mediaSetApi, 'lg');
    await expectLog(mediaSetApi, 'folder', new RegExp(`Folder '${folder.name}' created`));
    await mediaSetApi['http'].rawDelete(`/folder/delete/${folder.id}`);
    await expectLog(mediaSetApi, 'folder', new RegExp(`Folder '${folder.name}' deleted`));
  });

  test('LOG-05 · a set created through the UI builder is also logged', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('log05', testInfo.workerIndex);
    await uiCreate(page, mediaSetsPage, name);
    await expect(mediaSetsPage.searchInput).toBeVisible({ timeout: 20_000 });
    await expectLog(mediaSetApi, 'mediaSet', new RegExp(`Media set '${name}' created`));
  });

  test('LOG-06 · anonymous callers cannot read the log', async ({ mediaSetApi }) => {
    const anon = mediaSetApi.asAnonymous();
    const res = await anon['http'].rawGet('/log/read', { params: { page: 1, limit: 5, type: 'mediaSet' } });
    expect([401, 403]).toContain(res.status());
  });
});
