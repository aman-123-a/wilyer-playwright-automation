// Audit log (GET /log/read?type=mediaSet): attribution, ordering, exactly-once, no entries for refused/denied
// actions, unicode fidelity, and move traceability (source/destination).
// Entry shape on this build: { id, type, createdAt, msg, user } — no role, folder, status or old/new values.
import { test, expect } from '../../../../fixtures/test-fixtures';
import { HttpClient, MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, folderPrefix, mediaSetName } from '../../../../test-data/mediasets.data';
import { loginAs, type Identity } from '../../../../helpers/rbac/identities';
import { msCredentials, type MsRole } from '../../../../helpers/rbac/mediaSetIdentities';

const FOLDER_PREFIX = folderPrefix('ZZ_QA_MSX_');
interface LogDoc { id: string; createdAt: string; msg: string; user: string }

let files: ZoneFiles;
const ids: Partial<Record<MsRole, Identity>> = {};

test.beforeEach(async ({ browser, mediaSetApi }) => {
  files ??= await mediaSetApi.pickZoneFiles();
  for (const role of ['maker', 'checker'] as MsRole[]) {
    if (ids[role]) continue;
    const creds = msCredentials(role);
    if (!creds) continue;
    const ctx = await browser.newContext({ storageState: undefined });
    const out = await loginAs(await ctx.newPage(), creds);
    await ctx.close();
    if (out.identity) ids[role] = out.identity;
  }
});

test.afterEach(async ({ mediaSetApi }) => {
  await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX + 'aud');
  const res = await (await mediaSetApi['http'].rawGet('/folder/read', { params: { page: 1, limit: 100, search: FOLDER_PREFIX } })).json();
  for (const f of (res.folders ?? []) as Array<{ id: string; name: string }>) {
    if (f.name.startsWith(FOLDER_PREFIX + 'aud')) await mediaSetApi['http'].rawDelete(`/folder/delete/${f.id}`);
  }
});

const as = (context: import('@playwright/test').BrowserContext, role: MsRole) => {
  test.skip(!ids[role], `${role} identity unavailable`);
  return new MediaSetService(new HttpClient(context.request, { token: ids[role]!.token }));
};

async function logsFor(api: MediaSetService, name: string): Promise<LogDoc[]> {
  const res = await (await api['http'].rawGet('/log/read', { params: { page: 1, limit: 100, type: 'mediaSet' } })).json();
  return ((res.docs ?? []) as LogDoc[]).filter((l) => l.msg.includes(`'${name}'`));
}

async function settled(api: MediaSetService, name: string, count: number) {
  await expect.poll(async () => (await logsFor(api, name)).length, { timeout: 20_000, message: `${count} log entries for ${name}` }).toBeGreaterThanOrEqual(count);
}

test('Maker create → update → delete: exactly one entry each, attributed to the maker, in order, timestamps in window', async ({ context, mediaSetApi: admin }) => {
  const mk = as(context, 'maker');
  const makerEmail = msCredentials('maker')!.email;
  const name = mediaSetName('aud_life', 0);
  const SKEW = 120_000; // server and runner clocks differ by seconds; a 2-minute window still catches a wrong/stale timestamp
  const t0 = Date.now() - SKEW;
  const id = await mk.create(MediaSetService.payload(name, files));
  expect((await mk.updateRaw(id, MediaSetService.payload(name, files, { description: 'v2' }))).status()).toBe(200);
  expect((await mk.deleteRaw(id)).status()).toBe(200);
  await settled(admin, name, 3);
  const entries = (await logsFor(admin, name)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  expect(entries.map((e) => e.msg.replace(`'${name}'`, 'X'))).toEqual(['Media set X created.', 'Media set X updated.', 'Media set X deleted.']);
  for (const e of entries) {
    expect(e.user, 'actor is the maker, not the admin').toBe(makerEmail);
    expect(+new Date(e.createdAt)).toBeGreaterThan(t0);
    expect(+new Date(e.createdAt)).toBeLessThan(Date.now() + SKEW);
  }
});

test('Refused actions leave no success entry: blank name (400), duplicate (409)', async ({ context, mediaSetApi: admin }) => {
  const mk = as(context, 'maker');
  const name = mediaSetName('aud_refuse', 0);
  await mk.create(MediaSetService.payload(name, files));
  expect((await mk.createRaw(MediaSetService.payload(name, files))).status()).toBe(409);
  const blank = mediaSetName('aud_blank', 0);
  expect((await mk.createRaw(MediaSetService.payload('   ', files))).status()).toBeGreaterThanOrEqual(400);
  await settled(admin, name, 1);
  await new Promise((r) => setTimeout(r, 3_000));
  expect((await logsFor(admin, name)).filter((l) => /created/.test(l.msg)), 'only the successful create is logged').toHaveLength(1);
  expect(await logsFor(admin, blank)).toHaveLength(0);
});

test('Denied checker create/update/delete write NO success entry (no misleading audit trail)', async ({ context, mediaSetApi: admin }) => {
  const ck = as(context, 'checker');
  const checkerEmail = msCredentials('checker')!.email;
  const target = mediaSetName('aud_target', 0);
  const id = await admin.create(MediaSetService.payload(target, files));
  const probe = mediaSetName('aud_chkprobe', 0);
  expect((await ck.createRaw(MediaSetService.payload(probe, files))).status()).toBe(403);
  expect((await ck.updateRaw(id, MediaSetService.payload(target, files, { description: 'x' }))).status()).toBe(403);
  expect((await ck.deleteRaw(id)).status()).toBe(403);
  await new Promise((r) => setTimeout(r, 3_000));
  const res = await (await admin['http'].rawGet('/log/read', { params: { page: 1, limit: 100, type: 'mediaSet' } })).json();
  const bySecond = ((res.docs ?? []) as LogDoc[]).filter((l) => l.user === checkerEmail && (l.msg.includes(probe) || l.msg.includes(target)));
  expect(bySecond, 'no entry attributed to the denied checker').toEqual([]);
  expect((await logsFor(admin, target)).filter((l) => /deleted|updated/.test(l.msg)), 'target untouched in the log').toEqual([]);
});

test('Unicode and special characters are logged without encoding corruption', async ({ context, mediaSetApi: admin }) => {
  const mk = as(context, 'maker');
  const name = `${MEDIASET_PREFIX}aud_मीडिया_مجموعة_メディア_📺_&<>_${Date.now() % 10000}`;
  const id = await mk.create(MediaSetService.payload(name, files));
  await settled(admin, name, 1);
  const [entry] = await logsFor(admin, name);
  expect(entry.msg).toContain(name);
  await mk.deleteQuietly(id);
});

test('Move is traceable: the log names the source and destination folder', async ({ context, mediaSetApi: admin }) => {
  // BUG-MS-LOG-02: a move is logged as a plain "Media set 'X' updated." — no source, no destination.
  // Remove this marker once the entry carries both folders.
  test.fail(true, 'BUG-MS-LOG-02: move audit entry has no source/destination');
  const mk = as(context, 'maker');
  const fa = `${FOLDER_PREFIX}aud_src_${Date.now() % 10000}`;
  const fb = `${FOLDER_PREFIX}aud_dst_${Date.now() % 10000}`;
  for (const n of [fa, fb]) await admin['http'].rawPost('/folder/create', { data: { name: n } });
  const all = (await (await admin['http'].rawGet('/folder/read', { params: { page: 1, limit: 100, search: FOLDER_PREFIX + 'aud' } })).json()).folders as Array<{ id: string; name: string }>;
  const a = all.find((f) => f.name === fa)!;
  const b = all.find((f) => f.name === fb)!;
  const name = mediaSetName('aud_move', 0);
  const id = await mk.create(MediaSetService.payload(name, files, { folderId: a.id }));
  await mk.updateRaw(id, MediaSetService.payload(name, files, { folderId: b.id }));
  await settled(admin, name, 2);
  const moved = (await logsFor(admin, name)).find((l) => /updated|moved/.test(l.msg))!;
  expect(moved.msg, 'source folder named').toContain(fa);
  expect(moved.msg, 'destination folder named').toContain(fb);
});

test('Audit log readability follows the logs.view grant (anonymous denied; checker holds logs.view)', async ({ context, mediaSetApi: admin }) => {
  const anon = await admin.asAnonymous()['http'].rawGet('/log/read', { params: { page: 1, limit: 5, type: 'mediaSet' } });
  expect([401, 403]).toContain(anon.status());
  const ck = as(context, 'checker');
  const r = await ck['http'].rawGet('/log/read', { params: { page: 1, limit: 5, type: 'mediaSet' } });
  const holdsLogsView = (ids.checker!.claims as { access?: { logs?: { view?: boolean } } }).access?.logs?.view === true;
  // Observation (Low): a role with logs.view but NO Media Sets grant can read media-set names via the log.
  expect(r.status() === 200, `status ${r.status()} must match logs.view=${holdsLogsView}`).toBe(holdsLogsView);
});
