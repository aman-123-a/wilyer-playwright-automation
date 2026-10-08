// Media Sets RBAC — UI route + server authorization + data visibility, per identity.
//   maker   (unmaker)   : mediaSets view/create/update/delete, NO publish, folder-fenced
//   checker (unchecker) : NO mediaSets permission at all
// The admin session (fixture) owns the target set; each identity then tries to reach it.
import type { APIResponse, Browser, BrowserContext } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { HttpClient, MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { loginAs, type Identity } from '../../../../helpers/rbac/identities';
import { msCredentials, type MsRole } from '../../../../helpers/rbac/mediaSetIdentities';

test.describe.configure({ mode: 'serial' });

const DENIED = [401, 403];
const ids: Partial<Record<MsRole, Identity>> = {};
let files: ZoneFiles;
let targetId: string;
let targetName: string;

async function login(browser: Browser, role: MsRole) {
  const creds = msCredentials(role);
  if (!creds) return;
  const ctx = await browser.newContext({ storageState: undefined });
  const out = await loginAs(await ctx.newPage(), creds);
  await ctx.close();
  if (out.identity) ids[role] = out.identity;
}

test.beforeEach(async ({ browser, mediaSetApi }, testInfo) => {
  if (targetId) return;
  await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX + 'rbac'); // sweep leftovers of an aborted run
  files = await mediaSetApi.pickZoneFiles();
  targetName = mediaSetName('rbac', testInfo.workerIndex);
  targetId = await mediaSetApi.create(MediaSetService.payload(targetName, files));
  await login(browser, 'maker');
  await login(browser, 'checker');
});

const svc = (context: BrowserContext, role: MsRole) => {
  const id = ids[role];
  test.skip(!id, `${role} identity unavailable`);
  return new MediaSetService(new HttpClient(context.request, { token: id!.token }));
};

const statusOf = async (r: APIResponse) => r.status();

test.describe('checker — no Media Sets permission', () => {
  test('TC-B05 checker: list / create / update / delete all denied at the API', async ({ context, mediaSetApi }) => {
    const s = svc(context, 'checker');
    const probe = mediaSetName('rbac_chk', 0);
    expect(DENIED, 'list').toContain(await statusOf(await s.listRaw({ limit: 5 })));
    expect(DENIED, 'create').toContain(await statusOf(await s.createRaw(MediaSetService.payload(probe, files))));
    expect(DENIED, 'update').toContain(await statusOf(await s.updateRaw(targetId, MediaSetService.payload(targetName + '_x', files))));
    expect(DENIED, 'delete').toContain(await statusOf(await s.deleteRaw(targetId)));
    expect(await mediaSetApi.findByName(probe), 'denied create made nothing').toBeUndefined();
    expect(await mediaSetApi.findByName(targetName), 'target survived').toBeDefined();
  });

  test('TC-B05 checker: read-by-id (IDOR on an admin set) is denied and leaks nothing', async ({ context }) => {
    const s = svc(context, 'checker');
    const r = await s['http'].rawGet(`/mediaSet/read/${targetId}`);
    expect(DENIED).toContain(r.status());
    expect(await r.text()).not.toContain(targetName);
  });

  test('TC-B03/B04 checker: Media Sets tab/route gives no access and shows no data', async ({ browser }) => {
    const creds = msCredentials('checker');
    test.skip(!creds, 'checker not configured');
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    const out = await loginAs(page, creds!);
    expect(out.identity, out.reason).not.toBeNull();
    await page.goto('/library');
    await page.waitForLoadState('networkidle');
    expect(await page.locator('body').innerText(), 'admin set must never render without mediaSets.view').not.toContain(targetName);
    const tab = page.getByRole('link', { name: /^media sets/i });
    if (await tab.count()) {
      await tab.first().click();
      await page.waitForLoadState('networkidle');
      expect(await page.locator('body').innerText()).not.toContain(targetName);
    }
    await ctx.close();
  });
});

test.describe('anonymous', () => {
  test('TC-B05 anonymous: every Media Sets endpoint rejects', async ({ mediaSetApi }) => {
    const a = mediaSetApi.asAnonymous();
    expect(DENIED).toContain(await statusOf(await a.listRaw({ limit: 1 })));
    expect(DENIED).toContain(await statusOf(await a.createRaw(MediaSetService.payload(mediaSetName('rbac_anon', 0), files))));
    expect(DENIED).toContain(await statusOf(await a.updateRaw(targetId, MediaSetService.payload(targetName, files))));
    expect(DENIED).toContain(await statusOf(await a.deleteRaw(targetId)));
  });

  test('TC-A10 garbage / malformed bearer token is rejected, not 500', async ({ context }) => {
    for (const token of ['garbage', 'a.b.c', '']) {
      const s = new MediaSetService(new HttpClient(context.request, { token }));
      expect(DENIED, `token "${token}"`).toContain((await s.listRaw({ limit: 1 })).status());
    }
  });
});

test.describe('maker — view/create/update/delete, folder-fenced', () => {
  test('TC-B01 maker: full CRUD on its own set', async ({ context }) => {
    const s = svc(context, 'maker');
    const name = mediaSetName('rbac_mk', 0);
    const cr = await s.createRaw(MediaSetService.payload(name, files, { description: 'maker-made' }));
    expect(cr.status()).toBe(201);
    const id = (await cr.json()).id as string;
    expect((await s.updateRaw(id, MediaSetService.payload(name, files, { description: 'edited' }))).status()).toBe(200);
    expect((await s.findByName(name))?.description).toBe('edited');
    expect((await s.deleteRaw(id)).status()).toBe(200);
    expect(await s.findByName(name), 'gone after delete').toBeUndefined();
  });

  test('RBAC maker (fenced): cannot see, change or delete an admin-owned root set', async ({ context, mediaSetApi }) => {
    // BUG-MS-FENCE-01 (MS-SC-04, reconfirmed with unmaker 2026-10-08): the fence filters the LIST only;
    // update/delete by id succeed. Remove this marker once the server enforces the fence.
    test.fail(true, 'BUG-MS-FENCE-01: fence applied to list only — update by id returns 200');
    const s = svc(context, 'maker');
    const list = await s.list({ limit: 100, search: targetName });
    expect(list.mediaSets.some((m) => m.id === targetId), 'fenced maker sees admin set').toBe(false);
    const up = await s.updateRaw(targetId, MediaSetService.payload(targetName + '_hijack', files));
    expect(DENIED.concat(404)).toContain(up.status());
    const del = await s.deleteRaw(targetId);
    expect(DENIED.concat(404)).toContain(del.status());
    expect((await mediaSetApi.findByName(targetName))?.id, 'target unchanged').toBe(targetId);
  });

  test('Security maker: spoofed owner/role/permission fields in the payload are ignored', async ({ context }) => {
    const s = svc(context, 'maker');
    const name = mediaSetName('tamper', 0);
    const body = {
      ...MediaSetService.payload(name, files),
      createdBy: '000000000000000000000001',
      userId: '000000000000000000000001',
      role: 'owner',
      access: { mediaSets: { publish: true } },
      isApproved: true,
      status: 'approved',
    };
    const cr = await s.createRaw(body);
    expect([201, 400, 422], 'controlled outcome, never 500').toContain(cr.status());
    if (cr.status() === 201) {
      const id = (await cr.json()).id as string;
      const stored = await (await s['http'].rawGet(`/mediaSet/read/${id}`)).json();
      expect(JSON.stringify(stored), 'owner spoof persisted').not.toContain('000000000000000000000001');
      expect(stored.role, 'role spoof persisted').toBeUndefined();
      await s.deleteQuietly(id);
    }
  });
});

test('cleanup: remove every set this spec created', async ({ mediaSetApi }) => {
  await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX + 'rbac');
  await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX + 'tamper');
});
