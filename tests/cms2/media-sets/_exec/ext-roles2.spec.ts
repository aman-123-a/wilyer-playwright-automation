// Extended execution — follow-up on the same-account role matrix: what can the folder-fenced MAKER and the
// permission-less CHECKER really read / change on a disposable ROOT-level set owned by the admin?
import { test } from '../../../../fixtures/test-fixtures';
import { HttpClient, MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { credentialsFor, type Role } from '../../../../helpers/rbac/roles';
import { loginAs, type Identity } from '../../../../helpers/rbac/identities';
import { run, fail, blocked, observed } from './rec';

test.describe.configure({ mode: 'serial' });

test('role follow-up: maker and checker vs admin-owned root sets', async ({ browser, mediaSetApi, context }, testInfo) => {
  test.setTimeout(300_000);
  const files: ZoneFiles = await mediaSetApi.pickZoneFiles();
  const tag = mediaSetName('rl2', testInfo.workerIndex);
  const admin = mediaSetApi['http'];
  const made: string[] = [];
  const idents: Partial<Record<Role, Identity>> = {};
  for (const role of ['maker', 'checker'] as Role[]) {
    const creds = credentialsFor(role);
    if (!creds) continue;
    const ctx = await browser.newContext({ storageState: undefined });
    const out = await loginAs(await ctx.newPage(), creds);
    if (out.identity) idents[role] = out.identity;
    await ctx.close();
  }
  const as = (r: Role) => new HttpClient(context.request, { token: idents[r]!.token });
  const adminName = async (id: string) => {
    const r = await admin.rawGet(`/mediaSet/read/${id}`);
    return r.status() === 200 ? ((await r.json()).name as string) : `<${r.status()}>`;
  };

  try {
    const s1 = await mediaSetApi.create(MediaSetService.payload(`${tag}_root_a`, files)); made.push(s1);
    const s2 = await mediaSetApi.create(MediaSetService.payload(`${tag}_root_b`, files)); made.push(s2);

    if (!idents.maker) {
      await run('MS-SC-04', async () => blocked('no fenced identity could log in'));
    } else {
      const m = as('maker');
      const claims = idents.maker.claims as { isRestrictedAccess?: boolean };
      const lines: string[] = [`maker fenced=${claims.isRestrictedAccess === true}`];
      const list = await m.rawGet('/mediaSet/read', { params: { page: 1, limit: 100, search: tag } });
      const seen = list.status() === 200 ? ((await list.json()).mediaSets as Array<{ name: string }>).length : -1;
      lines.push(`maker list of the 2 root sets → ${list.status()}, sees ${seen}`);
      const rd = await m.rawGet(`/mediaSet/read/${s1}`);
      lines.push(`read-by-id of an unlisted root set → ${rd.status()}`);
      const up = await m.rawPost(`/mediaSet/update/${s1}`, { data: MediaSetService.payload(`${tag}_root_a_BY_MAKER`, files) });
      const afterUp = await adminName(s1);
      lines.push(`update → ${up.status()}, admin now sees name "${afterUp.replace(tag, '…')}"`);
      const del = await m.rawDelete(`/mediaSet/delete/${s2}`);
      const afterDel = await adminName(s2);
      lines.push(`delete → ${del.status()}, admin read afterwards ${afterDel.startsWith('<') ? afterDel : 'still exists'}`);
      const mine = await m.rawPost('/mediaSet/create', { data: MediaSetService.payload(`${tag}_by_maker`, files) });
      if (mine.status() === 201) made.push((await mine.json()).id);
      lines.push(`maker create at root → ${mine.status()}`);
      const msg = lines.join('; ');
      await run('MS-SC-04', async () => {
        const bypass = up.status() === 200 || del.status() === 200 || rd.status() === 200;
        if (bypass && seen === 0) return fail(`${msg} — a folder-fenced identity cannot LIST the set but can read/update/delete it by id: the fence is applied to the list only (broken access control)`);
        if (bypass) return observed(msg);
        return msg;
      });
    }

    await run('MS-SC-05', async () => {
      if (!idents.checker) return blocked('checker login unavailable');
      const c = as('checker');
      const res = {
        list: (await c.rawGet('/mediaSet/read', { params: { page: 1, limit: 5 } })).status(),
        readById: (await c.rawGet(`/mediaSet/read/${s1}`)).status(),
        create: (await c.rawPost('/mediaSet/create', { data: MediaSetService.payload(`${tag}_by_checker`, files) })).status(),
        update: (await c.rawPost(`/mediaSet/update/${s1}`, { data: MediaSetService.payload(`${tag}_hijack`, files) })).status(),
        delete: (await c.rawDelete(`/mediaSet/delete/${s1}`)).status(),
      };
      const still = await adminName(s1);
      const msg = `checker (role without media-set access) → ${JSON.stringify(res)}; set unchanged: ${!still.includes('hijack') && !still.startsWith('<')}`;
      const allDenied = Object.values(res).every((c2) => c2 === 403 || c2 === 401);
      if (!allDenied) return fail(msg + ' — an unauthorised role reached at least one endpoint');
      return msg + ' — all five endpoints denied with 403';
    });
    await run('MS-SC-06', async () => {
      if (!idents.checker) return blocked('checker login unavailable');
      return observed('No dedicated view-only identity exists on cms2 (no CMS_VIEWER_*). The checker is a no-access role (403 on list/read/create/update/delete) and the maker is full-write; a read-only-but-not-write case could not be exercised.');
    });
  } finally {
    for (const id of made) await mediaSetApi.deleteQuietly(id);
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  }
});
