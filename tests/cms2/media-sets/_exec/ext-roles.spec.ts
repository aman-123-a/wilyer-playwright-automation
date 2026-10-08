// Extended execution — what each identity can do to Media Sets over the API. Records verdicts via rec.ts.
// Identities (from the gitignored .env): restricted = folder-fenced sub-user; unrestricted = account-wide
// sub-user; maker / checker = approval-flow roles. All belong to the SAME account as the admin.
import { test, expect } from '../../../../fixtures/test-fixtures';
import { HttpClient, MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { credentialsFor, type Role } from '../../../../helpers/rbac/roles';
import { loginAs, type Identity } from '../../../../helpers/rbac/identities';
import { run, observed, fail, blocked, record } from './rec';

test.describe.configure({ mode: 'serial' });

const ROLES: Role[] = ['restricted', 'unrestricted', 'maker', 'checker'];

test('extended role/access execution', async ({ browser, mediaSetApi, context }, testInfo) => {
  test.setTimeout(600_000);
  const files: ZoneFiles = await mediaSetApi.pickZoneFiles();
  const tag = mediaSetName('role', testInfo.workerIndex);
  const adminHttp = mediaSetApi['http'];
  const made: string[] = [];

  // A set owned by the admin identity that every role will try to touch.
  const target = await mediaSetApi.create(MediaSetService.payload(`${tag}_target`, files));
  made.push(target);

  const ids: Partial<Record<Role, Identity>> = {};
  const why: Partial<Record<Role, string>> = {};
  for (const role of ROLES) {
    const creds = credentialsFor(role);
    if (!creds) { why[role] = 'no credentials in .env'; continue; }
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    const out = await loginAs(page, creds);
    if (out.identity) ids[role] = out.identity; else why[role] = out.reason;
    await ctx.close();
  }

  const svc = (role: Role) => new MediaSetService(new HttpClient(context.request, { token: ids[role]!.token }));
  const claims = (role: Role) => ids[role]!.claims as { isRestrictedAccess?: boolean; access?: Record<string, unknown> };

  try {
    // Per-role matrix → one record per case, evidence carries the whole matrix.
    const matrix: Record<string, string> = {};
    for (const role of ROLES) {
      if (!ids[role]) { matrix[role] = `login unavailable (${why[role]})`; continue; }
      const s = svc(role);
      const list = await s.listRaw({ limit: 100 });
      const listed = list.status() === 200 ? (await list.json()).mediaSets.map((m: { id: string }) => m.id) : [];
      const sees = listed.includes(target);
      const cr = await s.createRaw(MediaSetService.payload(`${tag}_by_${role}`, files));
      if (cr.status() === 201) made.push((await cr.json()).id);
      const up = await s.updateRaw(target, MediaSetService.payload(`${tag}_target`, files));
      const del = await s.deleteRaw(target === '' ? 'x' : '000000000000000000000005'); // harmless id: proves delete route is reachable/denied without touching the target
      matrix[role] = `fenced=${claims(role).isRestrictedAccess === true}; list ${list.status()} (sees admin's set: ${sees}, ${listed.length} sets); create ${cr.status()}; update admin's set ${up.status()}; delete(unknown id) ${del.status()}`;
    }
    const summary = Object.entries(matrix).map(([r, v]) => `${r}: ${v}`).join(' | ');

    await run('MS-SC-04', async () => {
      if (!ids.restricted) return blocked(`restricted login unavailable: ${why.restricted}`);
      const fenced = claims('restricted').isRestrictedAccess === true;
      if (!fenced) return blocked('"restricted" identity is not folder-fenced on this build');
      const s = svc('restricted');
      const list = await (await s.listRaw({ limit: 100 })).json();
      const sees = (list.mediaSets as Array<{ id: string }>).some((m) => m.id === target);
      const upd = await s.updateRaw(target, MediaSetService.payload(`${tag}_target_hijack`, files));
      const after = (await (await adminHttp.rawGet(`/mediaSet/read/${target}`)).json()).name;
      const msg = `fenced sub-user: sees root-level admin set=${sees}; update of it → ${upd.status()}; name afterwards "${after.replace(tag, '…')}"`;
      if (sees || upd.status() === 200) return fail(msg + ' — fence not enforced on media sets');
      return msg;
    });
    await run('MS-SC-05', async () => observed(`media-set permission per role is not separately configurable in the role matrix probed here; observed matrix → ${summary}`));
    await run('MS-SC-06', async () => observed(`view-only role not available on cms2 (no CMS_VIEWER_*). Matrix for the roles that exist → ${summary}`));
    await run('MS-API-32', async () => {
      const lines = Object.entries(matrix).map(([r, v]) => `${r}: ${v}`);
      const anyAuthFail = ROLES.some((r) => ids[r] && /list 40[13]/.test(matrix[r]));
      return (anyAuthFail ? observed : (m: string) => m)(lines.join(' | '));
    });
    await run('MS-UC-10', async () => {
      if (!ids.restricted) return blocked(`restricted login unavailable: ${why.restricted}`);
      const s = svc('restricted');
      const folders = (await (await adminHttp.rawGet('/folder/read', { params: { page: 1, limit: 100 } })).json()).folders as Array<{ id: string; name: string }>;
      const mine = await new HttpClient(context.request, { token: ids.restricted.token }).get<{ folders: Array<{ id: string; name: string }> }>('/folder/read', { params: { page: 1, limit: 100 } });
      const own = mine.folders[0];
      if (!own) return blocked('restricted user has no assigned folder');
      const c = await s.createRaw(MediaSetService.payload(`${tag}_fenced_own`, files, { folderId: own.id }));
      const out = await s.createRaw(MediaSetService.payload(`${tag}_fenced_out`, files, { folderId: folders.find((f) => !mine.folders.some((m) => m.id === f.id))?.id ?? '' }));
      for (const r of [c, out]) if (r.status() === 201) made.push((await r.json()).id);
      const msg = `restricted: create in own folder "${own.name}" → ${c.status()}; create outside its folder → ${out.status()}`;
      expect(c.status()).toBe(201);
      if (out.status() === 201) return fail(msg + ' — fenced sub-user can create outside its assigned folders');
      return msg;
    });
    record('MS-SC-03', 'Blocked', 'IDOR across tenants needs a second independent account; every identity in .env belongs to the same account (CMS_OLD_* is another server). Same-account role matrix recorded under MS-SC-04/05.');
    void expect;
  } finally {
    for (const id of made) await mediaSetApi.deleteQuietly(id);
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  }
});
