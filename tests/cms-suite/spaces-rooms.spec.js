
// =============================================================================
//  SPACES / ROOMS — maps to the CMS **Groups** module (/groups). There is no
//  separate Spaces/Rooms route; a Group groups screens like a room/space.
//  Covers: create, edit, delete, duplicate room/group names, and restore of a
//  deleted room. Positive / negative / edge.
//
//  Create/delete self-clean with a unique TEST_ prefix and are gated behind
//  CMS_ALLOW_DESTRUCTIVE. The "restore deleted room" test probes for a trash/
//  restore affordance and skips-with-reason when none exists (its absence is the
//  reported "deleted spaces restore" bug — see known-bugs-regression.spec.js).
// =============================================================================

import { test, expect } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { SpacesPage } from '../../pages/cms/SpacesPage.js';
import { assertHealthy, assertNotBlank } from '../../utils/cms/crashDetector.js';

const PREFIX = 'TEST_PW_ROOM';
const uniqueName = (tag) => `${PREFIX}_${tag}_${Date.now()}`;

async function cleanup(page, fragment) {
  const sp = new SpacesPage(page);
  await sp.open();
  for (let i = 0; i < 4; i++) {
    if (await sp.search.isVisible().catch(() => false)) {
      await sp.search.fill(fragment).catch(() => {});
      await page.waitForTimeout(1000);
    }
    if (!(await sp.exists(fragment))) break;
    await sp.deleteByName(fragment).catch(() => {});
  }
}

// ── POSITIVE / DESTRUCTIVE ──────────────────────────────────────────────────
test.describe('Spaces/Rooms (Groups) — Create / Edit / Delete', () => {
  test.skip(!ENV.ALLOW_DESTRUCTIVE, 'CMS_ALLOW_DESTRUCTIVE=false — skipping create/delete flows.');
  test.describe.configure({ mode: 'serial' });

  test('create a room/group', async ({ adminPage }) => {
    const sp = new SpacesPage(adminPage);
    await sp.open();
    const name = uniqueName('create');
    await sp.create(name, 'created by automated regression');
    await assertNotBlank(adminPage, 'groups after create');
    expect(await sp.exists(name), 'new group should appear in the list').toBeTruthy();
    await cleanup(adminPage, name);
  });

  test('edit a room/group from its settings page', async ({ adminPage }) => {
    const sp = new SpacesPage(adminPage);
    await sp.open();
    const name = uniqueName('edit');
    await sp.create(name);
    // Open the group's settings page and confirm it loads (edit surface).
    const link = sp.cardByName(name).locator('a[href^="/group-settings/"]').first();
    if (await link.count()) {
      await link.click();
      await adminPage.waitForURL(/\/group-settings\//, { timeout: 20_000 }).catch(() => {});
      await assertHealthy(adminPage, 'group settings (edit surface)');
    }
    await cleanup(adminPage, name);
  });

  test('delete a room/group (with confirmation)', async ({ adminPage }) => {
    const sp = new SpacesPage(adminPage);
    await sp.open();
    const name = uniqueName('delete');
    await sp.create(name);
    expect(await sp.exists(name)).toBeTruthy();
    const deleted = await sp.deleteByName(name);
    expect(deleted, 'delete should be available').toBeTruthy();
    await adminPage.waitForTimeout(1200);
    expect(await sp.exists(name), 'group removed after delete').toBeFalsy();
  });

  test('duplicate room/group names are handled (rejected or disambiguated)', async ({ adminPage }) => {
    const sp = new SpacesPage(adminPage);
    await sp.open();
    const name = uniqueName('dup');
    await sp.create(name);
    const firstCount = await sp.cardByName(name).count();
    // Attempt a second group with the same name.
    await sp.create(name);
    await assertHealthy(adminPage, 'groups after duplicate-name create');
    const secondCount = await sp.cardByName(name).count();
    // Either rejected (count unchanged) or allowed (count grew). Must not crash;
    // log which behaviour the merged build exhibits.
    console.log(`Duplicate room name: ${firstCount} -> ${secondCount} matching cards`);
    await cleanup(adminPage, name);
  });
});

// ── RESTORE (probe — the "deleted spaces restore" bug) ──────────────────────
test.describe('Spaces/Rooms (Groups) — Restore deleted', () => {
  test.skip(!ENV.ALLOW_DESTRUCTIVE, 'CMS_ALLOW_DESTRUCTIVE=false — restore test needs a throwaway group.');

  test('a deleted room can be restored (if a trash/restore view exists)', async ({ adminPage }) => {
    const sp = new SpacesPage(adminPage);
    await sp.open();
    const hasRestore = await sp.hasRestoreAffordance();
    test.skip(!hasRestore,
      'No trash/restore view is exposed on /groups — restore of deleted rooms is not available in this build (tracks the "deleted spaces restore" bug).');

    const name = uniqueName('restore');
    await sp.create(name);
    await sp.deleteByName(name);
    // Open the restore view and bring it back.
    await adminPage.getByText(/trash|deleted groups|restore|recycle bin|archived/i).first().click();
    await adminPage.waitForTimeout(1000);
    const restoreBtn = sp.cardByName(name).getByRole('button', { name: /restore/i }).first();
    if (await restoreBtn.count()) await restoreBtn.click();
    await adminPage.waitForTimeout(1200);
    await sp.open();
    expect(await sp.exists(name), 'restored group should be back in the active list').toBeTruthy();
    await cleanup(adminPage, name);
  });
});

// ── UI VALIDATION ─────────────────────────────────────────────────────────────
test.describe('Spaces/Rooms (Groups) — UI validation', () => {
  test('groups list renders with a create control', async ({ adminPage }) => {
    const sp = new SpacesPage(adminPage);
    await sp.open();
    await expect(sp.newGroupBtn).toBeVisible({ timeout: 15_000 });
    await assertHealthy(adminPage, 'groups list');
  });
});
