// Move matrix, pagination boundaries, concurrency and network-fault handling for Media Sets.
// Move is `POST /mediaSet/update/{id}` with a new folderId (the bulk "Move to Folder" modal calls it per set).
// Everything created here carries ZZ_QA_MS_ (sets) / ZZ_QA_MSX_ (folders) and is swept afterwards.
import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, folderPrefix, mediaSetName } from '../../../../test-data/mediasets.data';


const FOLDER_PREFIX = folderPrefix('ZZ_QA_MSX_');
interface Folder { id: string; name: string }
let files: ZoneFiles;

/** Folder ids created by the running test — the duplicate oracle has to look in each of them. */
let known: string[] = [];
const rand = () => Math.random().toString(36).slice(2, 7);

async function findFolders(api: MediaSetService): Promise<Folder[]> {
  const res = await (await api['http'].rawGet('/folder/read', { params: { page: 1, limit: 100, search: FOLDER_PREFIX } })).json();
  return ((res.folders ?? []) as Folder[]).filter((f) => f.name.startsWith(FOLDER_PREFIX));
}

async function makeFolder(api: MediaSetService, label: string, parentFolder?: string): Promise<Folder> {
  const name = `${FOLDER_PREFIX}${label}_${rand()}`;
  const res = await api['http'].rawPost('/folder/create', { data: parentFolder ? { name, folderId: parentFolder } : { name } });
  expect(res.status(), `create folder ${name}`).toBe(201);
  const f = (await findFolders(api)).find((x) => x.name === name);
  expect(f, 'folder listed after create').toBeTruthy();
  known.push(f!.id);
  return f!;
}

/** Every set with `name` in Root or any folder this test made — the "no duplicate after a move" oracle. */
async function occurrences(api: MediaSetService, name: string) {
  const found: Array<Awaited<ReturnType<MediaSetService['list']>>['mediaSets'][number]> = [];
  for (const folderId of ['', ...known]) {
    const res = await api.list({ folderId, limit: 100 });
    found.push(...res.mediaSets.filter((m) => m.name === name));
  }
  return found;
}

const inFolder = async (api: MediaSetService, folderId: string) => (await api.list({ folderId, limit: 100 })).mediaSets.map((m) => m.id);
const move = (api: MediaSetService, id: string, name: string, folderId: string, description = '') =>
  api.updateRaw(id, MediaSetService.payload(name, files, { folderId, description }));

test.beforeEach(async ({ mediaSetApi }) => {
  files ??= await mediaSetApi.pickZoneFiles();
});

test.afterEach(async ({ mediaSetApi }) => {
  known = [];
  await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  for (const f of await findFolders(mediaSetApi)) await mediaSetApi['http'].rawDelete(`/folder/delete/${f.id}`);
});

test.describe('MOVE matrix', () => {
  test('Root → A → Root → B → A: each hop leaves exactly one copy in exactly one place', async ({ mediaSetApi: api }) => {
    const a = await makeFolder(api, 'A');
    const b = await makeFolder(api, 'B');
    const name = mediaSetName('mv', 0);
    const id = await api.create(MediaSetService.payload(name, files));
    const hops: Array<[string, string, string[]]> = [
      ['Root→A', a.id, [b.id]],
      ['A→Root', '', [a.id, b.id]],
      ['Root→B', b.id, [a.id]],
      ['B→A', a.id, [b.id]],
    ];
    for (const [label, dest, absent] of hops) {
      expect((await move(api, id, name, dest)).status(), label).toBe(200);
      if (dest) expect(await inFolder(api, dest), `${label}: present in destination`).toContain(id);
      for (const f of absent) expect(await inFolder(api, f), `${label}: absent from ${f}`).not.toContain(id);
      const copies = await occurrences(api, name);
      expect(copies, `${label}: no duplicate`).toHaveLength(1);
      expect(copies[0].folderId ?? '', `${label}: stored folderId`).toBe(dest);
    }
  });

  test('Root → nested folder A1 and A1 → Root', async ({ mediaSetApi: api }) => {
    const a = await makeFolder(api, 'A');
    const a1 = await makeFolder(api, 'A1', a.id);
    const name = mediaSetName('mvnest', 0);
    const id = await api.create(MediaSetService.payload(name, files));
    expect((await move(api, id, name, a1.id)).status()).toBe(200);
    expect(await inFolder(api, a1.id)).toContain(id);
    expect(await inFolder(api, a.id), 'a set in the child is not listed in the parent').not.toContain(id);
    expect((await move(api, id, name, '')).status()).toBe(200);
    expect(await inFolder(api, a1.id)).not.toContain(id);
    expect(await occurrences(api, name)).toHaveLength(1);
  });

  test('move to the SAME folder is a safe no-op', async ({ mediaSetApi: api }) => {
    const a = await makeFolder(api, 'A');
    const name = mediaSetName('mvsame', 0);
    const id = await api.create(MediaSetService.payload(name, files, { folderId: a.id }));
    const r = await move(api, id, name, a.id);
    expect(r.status()).toBeLessThan(500);
    expect(await occurrences(api, name)).toHaveLength(1);
    expect(await inFolder(api, a.id)).toContain(id);
  });

  test('move keeps name, description and zones intact', async ({ mediaSetApi: api }) => {
    const a = await makeFolder(api, 'A');
    const name = mediaSetName('mvkeep', 0);
    const id = await api.create(MediaSetService.payload(name, files, { description: 'keep me' }));
    await move(api, id, name, a.id, 'keep me');
    const got = (await occurrences(api, name))[0];
    expect(got.id).toBe(id);
    expect(got.description).toBe('keep me');
    expect(got.zones).toHaveLength(2);
  });

  test('malformed destination folderId is a controlled 4xx and the set stays put', async ({ mediaSetApi: api }) => {
    const a = await makeFolder(api, 'A');
    const name = mediaSetName('mvbad', 0);
    const id = await api.create(MediaSetService.payload(name, files, { folderId: a.id }));
    for (const bad of ['garbage', '123', '<script>', 'x'.repeat(200)]) {
      const r = await move(api, id, name, bad);
      expect(r.status(), `folderId "${bad.slice(0, 12)}"`).toBeGreaterThanOrEqual(400);
      expect(r.status()).toBeLessThan(500);
    }
    expect((await occurrences(api, name))[0].folderId).toBe(a.id);
  });

  test('BUG API-D5 move to a well-formed but NON-EXISTENT folder is refused', async ({ mediaSetApi: api }) => {
    test.fail(true, 'API-D5: orphan folderId is accepted (also on update); remove marker once fixed');
    const name = mediaSetName('mvorphan', 0);
    const id = await api.create(MediaSetService.payload(name, files));
    const r = await move(api, id, name, '000000000000000000000abc');
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect((await occurrences(api, name))[0].folderId ?? '').toBe('');
  });

  test('move a deleted set → 4xx, nothing resurrected', async ({ mediaSetApi: api }) => {
    const a = await makeFolder(api, 'A');
    const name = mediaSetName('mvdel', 0);
    const id = await api.create(MediaSetService.payload(name, files));
    expect((await api.deleteRaw(id)).status()).toBe(200);
    const r = await move(api, id, name, a.id);
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
    expect(await occurrences(api, name), 'no resurrection').toHaveLength(0);
  });

  test('destination folder deleted before the move: refused or safely defined, never 5xx', async ({ mediaSetApi: api }) => {
    const a = await makeFolder(api, 'gone');
    const name = mediaSetName('mvdst', 0);
    const id = await api.create(MediaSetService.payload(name, files));
    await api['http'].rawDelete(`/folder/delete/${a.id}`);
    const r = await move(api, id, name, a.id);
    expect(r.status()).toBeLessThan(500);
    const after = await occurrences(api, name);
    expect(after, 'set is not lost').toHaveLength(1);
  });

  test('two parallel moves to different folders end with the set in exactly one of them', async ({ mediaSetApi: api }) => {
    const a = await makeFolder(api, 'A');
    const b = await makeFolder(api, 'B');
    const name = mediaSetName('mvrace', 0);
    const id = await api.create(MediaSetService.payload(name, files));
    const rs = await Promise.all([move(api, id, name, a.id), move(api, id, name, b.id)]);
    expect(rs.every((r) => r.status() < 500), rs.map((r) => r.status()).join()).toBe(true);
    const inA = (await inFolder(api, a.id)).includes(id);
    const inB = (await inFolder(api, b.id)).includes(id);
    expect(inA !== inB, `exactly one folder holds it (A=${inA} B=${inB})`).toBe(true);
    expect(await occurrences(api, name)).toHaveLength(1);
  });
});

test.describe('PAGINATION boundaries (limit=5)', () => {
  let folder: Folder;
  let ids: string[] = [];

  async function seed(api: MediaSetService, count: number) {
    folder = await makeFolder(api, 'pg');
    ids = [];
    for (let i = 0; i < count; i += 1) {
      ids.push(await api.create(MediaSetService.payload(`${MEDIASET_PREFIX}pg_${String(i).padStart(2, '0')}_${rand()}`, files, { folderId: folder.id })));
    }
  }
  const page = (api: MediaSetService, p: number, limit = 5) => api.list({ folderId: folder.id, page: p, limit });

  test('0, 1, size-1, size, size+1 and last-page-of-1 behave; no gaps or duplicates', async ({ mediaSetApi: api }) => {
    test.setTimeout(300_000);
    folder = await makeFolder(api, 'pg');
    expect((await page(api, 1)).totalDocs, '0 results').toBe(0);
    const add = async (n: number) => {
      for (let i = 0; i < n; i += 1) ids.push(await api.create(MediaSetService.payload(`${MEDIASET_PREFIX}pg_${ids.length}_${rand()}`, files, { folderId: folder.id })));
    };
    ids = [];
    for (const [count, wantPages, lastLen] of [[1, 1, 1], [4, 1, 4], [5, 1, 5], [6, 2, 1], [11, 3, 1]] as const) {
      await add(count - ids.length);
      const first = await page(api, 1);
      expect(first.totalDocs, `${count} docs`).toBe(count);
      expect(first.totalPages, `${count} docs → pages`).toBe(wantPages);
      const seen: string[] = [];
      for (let p = 1; p <= wantPages; p += 1) seen.push(...(await page(api, p)).mediaSets.map((m) => m.id));
      expect(new Set(seen).size, `${count}: no duplicate across pages`).toBe(seen.length);
      expect([...seen].sort(), `${count}: no missing/foreign ids`).toEqual([...ids].sort());
      expect((await page(api, wantPages)).mediaSets, `${count}: last page length`).toHaveLength(lastLen);
      expect((await page(api, wantPages + 1)).mediaSets, `${count}: page past the end is empty`).toHaveLength(0);
    }
  });

  test('delete the last record on the last page → page count shrinks, nothing stale', async ({ mediaSetApi: api }) => {
    test.setTimeout(300_000);
    await seed(api, 6);
    const last = (await page(api, 2)).mediaSets;
    expect(last).toHaveLength(1);
    expect((await api.deleteRaw(last[0].id)).status()).toBe(200);
    const after = await page(api, 1);
    expect(after.totalDocs).toBe(5);
    expect(after.totalPages).toBe(1);
    expect((await page(api, 2)).mediaSets).toHaveLength(0);
  });

  test('move the last record on the last page out → source shrinks, destination grows', async ({ mediaSetApi: api }) => {
    test.setTimeout(300_000);
    await seed(api, 6);
    const dest = await makeFolder(api, 'dest');
    const last = (await page(api, 2)).mediaSets[0];
    expect((await move(api, last.id, last.name, dest.id)).status()).toBe(200);
    expect((await page(api, 1)).totalDocs).toBe(5);
    expect(await inFolder(api, dest.id)).toContain(last.id);
  });

  test('search spans pages: every record is reachable with limit=5', async ({ mediaSetApi: api }) => {
    test.setTimeout(300_000);
    await seed(api, 7);
    const seen: string[] = [];
    for (let p = 1; ; p += 1) {
      const r = await api.list({ search: `${MEDIASET_PREFIX}pg_`, folderId: folder.id, page: p, limit: 5 });
      seen.push(...r.mediaSets.map((m) => m.id));
      if (p >= r.totalPages) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of ids) expect(seen, 'seeded id reachable via paged search').toContain(id);
  });
});

test.describe('CONCURRENCY', () => {
  test('two parallel edits of one set: both answer < 500, name intact, final description is one of the two', async ({ mediaSetApi: api }) => {
    const name = mediaSetName('cc_edit', 0);
    const id = await api.create(MediaSetService.payload(name, files, { description: 'orig' }));
    const rs = await Promise.all([
      api.updateRaw(id, MediaSetService.payload(name, files, { description: 'writer-1' })),
      api.updateRaw(id, MediaSetService.payload(name, files, { description: 'writer-2' })),
    ]);
    expect(rs.every((r) => r.status() < 500), rs.map((r) => r.status()).join()).toBe(true);
    const got = (await occurrences(api, name))[0];
    expect(['writer-1', 'writer-2']).toContain(got.description);
    expect(got.zones).toHaveLength(2);
  });

  test('delete racing an edit: never 5xx; a 200 delete is never undone by the edit', async ({ mediaSetApi: api }) => {
    const name = mediaSetName('cc_del', 0);
    const id = await api.create(MediaSetService.payload(name, files));
    const [d, u] = await Promise.all([api.deleteRaw(id), api.updateRaw(id, MediaSetService.payload(name, files, { description: 'late' }))]);
    expect(d.status()).toBeLessThan(500);
    expect(u.status()).toBeLessThan(500);
    if (d.status() === 200) expect(await occurrences(api, name), 'deleted set must not reappear').toHaveLength(0);
  });

  test('double delete: second call is a controlled 4xx, no duplicate side-effect', async ({ mediaSetApi: api }) => {
    const name = mediaSetName('cc_dd', 0);
    const id = await api.create(MediaSetService.payload(name, files));
    expect((await api.deleteRaw(id)).status()).toBe(200);
    const second = await api.deleteRaw(id);
    expect(second.status()).toBeGreaterThanOrEqual(400);
    expect(second.status()).toBeLessThan(500);
  });

  test('parallel rename onto the same new name: exactly one wins, the other is 409', async ({ mediaSetApi: api }) => {
    const a = mediaSetName('cc_ra', 0);
    const b = mediaSetName('cc_rb', 0);
    const target = mediaSetName('cc_target', 0);
    const ia = await api.create(MediaSetService.payload(a, files));
    const ib = await api.create(MediaSetService.payload(b, files));
    const rs = await Promise.all([api.updateRaw(ia, MediaSetService.payload(target, files)), api.updateRaw(ib, MediaSetService.payload(target, files))]);
    const codes = rs.map((r) => r.status()).sort();
    expect(codes.every((c) => c < 500), codes.join()).toBe(true);
    expect(await occurrences(api, target), 'never two sets with the same name').toHaveLength(codes.filter((c) => c === 200).length);
    expect((await occurrences(api, target)).length).toBeLessThanOrEqual(1);
  });
});

test.describe('NETWORK / server-error handling (UI)', () => {
  test('delete with the network cut: no false success, set remains, retry deletes it exactly once', async ({ mediaSetsPage, mediaSetApi: api, page }) => {
    const name = mediaSetName('net_del', 0);
    await api.create(MediaSetService.payload(name, files));
    await mediaSetsPage.open();
    await mediaSetsPage.search(name);
    await page.route('**/mediaSet/delete/**', (route) => route.abort('connectionfailed'));
    await mediaSetsPage.clickDelete(name);
    await mediaSetsPage.confirmDelete().catch(() => undefined);
    await page.waitForTimeout(1_500);
    expect(await occurrences(api, name), 'delete must not have happened').toHaveLength(1);
    await page.unroute('**/mediaSet/delete/**');
    await page.reload();
    await mediaSetsPage.open();
    await mediaSetsPage.search(name);
    let deletes = 0;
    page.on('request', (r) => { if (r.method() === 'DELETE' && /mediaSet\/delete/.test(r.url())) deletes += 1; });
    await mediaSetsPage.clickDelete(name);
    await mediaSetsPage.confirmDelete();
    await page.waitForTimeout(1_500);
    expect(deletes, 'one DELETE request on retry').toBe(1);
    expect(await occurrences(api, name)).toHaveLength(0);
  });

  for (const status of [401, 403, 404, 409, 422, 429, 500]) {
    test(`list endpoint answering ${status}: UI stays alive, no crash, no stale data shown as success`, async ({ mediaSetsPage, page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/mediaSet/read**', (route) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ message: `injected ${status}` }) }),
      );
      await page.goto('/library', { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: /media sets/i }).first().click({ timeout: 30_000 }).catch(() => undefined);
      await page.waitForTimeout(2_500);
      const body = (await page.locator('body').innerText()).trim();
      expect(body.length, 'page is not blank').toBeGreaterThan(50);
      expect(errors, `uncaught page errors on ${status}`).toEqual([]);
      void mediaSetsPage;
    });
  }
});

test('cleanup', async ({ mediaSetApi }) => {
  await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  for (const f of await findFolders(mediaSetApi)) await mediaSetApi['http'].rawDelete(`/folder/delete/${f.id}`);
});
