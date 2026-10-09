// =============================================================================
//  MEDIA SETS — the "Media Sets" tab of Screens ▸ Bulk Actions ▸ Publish Media
//  follows the role's mediaSets.view grant (changelog item 5, 2026-10-09).
//
//  The bulk publish view (`MediaSequence` in the cms2 bundle) renders its tabs
//  behind validateAccess(): Media Files ← media.view, Media Sets ← mediaSets.view.
//  Reached from Group settings ▸ Bulk Actions, which routes to
//  /screens/bulk-actions.
//
//  The maker (MS_BULK_MAKER_*, else MS_MAKER_* in .env) is the only member of its own role,
//  so this spec flips mediaSets.view on THAT role and restores the exact
//  snapshot afterwards. It refuses to run if anyone else shares the role:
//  PUT /role/update replaces the whole permission object for every holder.
//  A grant reaches a sub-user only through a fresh login (it is a JWT claim),
//  so every case logs in after the toggle.
// =============================================================================

import type { Browser, Page } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { tokenFromContext, decodeJwt } from '../../../../api';
import { ENV } from '../../../../config/env';
import { loginAs, authHeaders, type Identity } from '../../../../helpers/rbac/identities';
import { msCredentials } from '../../../../helpers/rbac/mediaSetIdentities';
import {
  readTeam,
  readRole,
  readModule,
  patchModule,
  restoreRole,
  type RoleSnapshot,
} from '../../../../helpers/rbac/rolePermissions';

test.describe.configure({ mode: 'serial' });

let admin: Identity;
let snapshot: RoleSnapshot | undefined;
let skipReason = '';

/** The dedicated bulk maker when configured, otherwise the suite's usual maker (unmaker). */
const makerCreds = () => msCredentials('bulkMaker') ?? msCredentials('maker');

/** Log the maker in on a fresh context and open the bulk Publish Media view. */
async function bulkPublishAsMaker(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  const out = await loginAs(page, makerCreds()!);
  expect(out.identity, `maker login: ${out.reason}`).not.toBeNull();

  // /screens/bulk-actions renders blank when opened directly: it needs screens
  // handed over from the Screens list (tick ▸ Next) or Group settings ▸ Bulk
  // Actions. The fenced maker sees no groups, so take the Screens-list route.
  await page.goto('/screens', { waitUntil: 'domcontentloaded' });
  // Wait for real screen rows ("View Detail"), not the first paint: ticking a row
  // before the list re-renders loses the selection.
  const screenRow = page.locator('tbody tr', { has: page.getByRole('link', { name: /view detail/i }) }).first();
  const firstRow = screenRow.locator('input[type=checkbox]');
  const hasScreen = await screenRow
    .waitFor({ state: 'visible', timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!hasScreen) {
    await context.close();
    test.skip(true, 'the maker can see no screen to run Bulk Actions on');
  }
  await firstRow.check();
  const next = page.locator('a[href="/screens/bulk-actions"]').first();
  await expect(next, '"Next" appears once a screen is ticked').toBeVisible({ timeout: 15_000 });
  await next.click();
  await page.getByText('Publish Media', { exact: true }).first().click({ timeout: 20_000 });
  // "Widgets" carries no permission gate, so it proves the tab row has rendered.
  await expect(tab(page, 'Widgets')).toBeVisible({ timeout: 20_000 });
  return { page, close: () => context.close() };
}

const tab = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.beforeAll(async ({ browser, request }, testInfo) => {
  const creds = makerCreds();
  if (!creds) {
    skipReason = 'neither MS_BULK_MAKER_* nor MS_MAKER_* is set in .env';
    return;
  }
  const context = await browser.newContext({ storageState: testInfo.project.use.storageState });
  const token = await tokenFromContext(context);
  await context.close();
  admin = { token, claims: decodeJwt(token) as Record<string, unknown> };

  const team = await readTeam(request, admin);
  const maker = team.find((m) => m.email === creds.email.toLowerCase());
  if (!maker) {
    skipReason = `${creds.email} is not on the team`;
    return;
  }
  const holders = team.filter((m) => m.roleId === maker.roleId);
  if (holders.length !== 1) {
    skipReason = `role "${maker.roleName}" has ${holders.length} members; toggling it would change other users' access`;
    return;
  }
  snapshot = await readRole(request, admin, maker.roleId);
});

test.beforeEach(() => {
  test.skip(!!skipReason, skipReason);
});

test.afterAll(async ({ request }) => {
  if (!snapshot) return;
  expect(await restoreRole(request, admin, snapshot), 'role restored').toBe(200);
  expect(await readModule(request, admin, snapshot.id, 'mediaSets')).toEqual(snapshot.permissions.mediaSets ?? {});
});

test.describe('Bulk Publish Media — Media Sets tab follows mediaSets.view @regression @rbac', () => {
  test('PERM-BULK-01 · with mediaSets.view the maker sees the Media Sets tab', async ({ browser, request }) => {
    expect(await patchModule(request, admin, snapshot!, 'mediaSets', { view: true })).toBe(200);
    expect((await readModule(request, admin, snapshot!.id, 'mediaSets')).view).toBe(true);

    const { page, close } = await bulkPublishAsMaker(browser);
    try {
      await expect(tab(page, 'Media Sets')).toBeVisible();
    } finally {
      await close();
    }
  });

  test('PERM-BULK-02 · without mediaSets.view the Media Sets tab is hidden; the others stay', async ({
    browser,
    request,
  }) => {
    expect(await patchModule(request, admin, snapshot!, 'mediaSets', { view: false })).toBe(200);
    expect((await readModule(request, admin, snapshot!.id, 'mediaSets')).view).toBe(false);

    const { page, close } = await bulkPublishAsMaker(browser);
    try {
      await expect(tab(page, 'Media Sets')).toHaveCount(0);
      await expect(tab(page, 'Widgets')).toBeVisible();
      const mediaView = (snapshot!.permissions.media as Record<string, unknown> | undefined)?.view === true;
      if (mediaView) await expect(tab(page, 'Media Files')).toBeVisible();
    } finally {
      await close();
    }
  });

  test('PERM-BULK-03 · without mediaSets.view the API refuses the media-set list too', async ({
    browser,
    request,
  }) => {
    expect(await patchModule(request, admin, snapshot!, 'mediaSets', { view: false })).toBe(200);
    const context = await browser.newContext({ storageState: undefined });
    try {
      const out = await loginAs(await context.newPage(), makerCreds()!);
      expect(out.identity, out.reason).not.toBeNull();
      const res = await context.request.get(`${ENV.API_BASE_URL}/mediaSet/read?page=1&limit=5`, {
        headers: authHeaders(out.identity!),
      });
      expect([401, 403], 'hiding the tab is not enough — the list must be refused').toContain(res.status());
    } finally {
      await context.close();
    }
  });
});
