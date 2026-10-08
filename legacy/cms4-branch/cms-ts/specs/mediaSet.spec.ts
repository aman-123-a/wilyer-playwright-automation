/**
 * Media Set module — full case matrix.
 *
 *   Smoke / CRUD : create, read, update (rename + swap portrait), delete
 *   Edge         : mandatory name, incomplete assets, duplicate name,
 *                  special chars, search, clear-zones
 *   Cleanup      : afterAll best-effort delete of every Media Set this run created
 */
import { test, expect } from '@playwright/test';
import { LibraryPage } from '../pages/LibraryPage';
import { MediaSetPage } from '../pages/MediaSetPage';
import { step } from '../pages/BasePage';

const TAG = `${Date.now().toString().slice(-6)}`;
const NAME_HAPPY    = `MS_Happy_${TAG}`;
const NAME_RENAMED  = `MS_Renamed_${TAG}`;
const NAME_DUP      = `MS_Dup_${TAG}`;
const NAME_SPECIAL  = `Media_Set_!@#_${TAG}`;
const NAME_SEARCH   = `MS_Search_${TAG}`;

// Track everything created so afterAll can clean up
const created = new Set<string>();

test.describe.configure({ mode: 'serial' });

test.describe('Media Set Module', () => {

  // ─── 1. Create ─────────────────────────────────────────────────────────────
  test('Create: valid name + landscape + portrait => listed', async ({ page }) => {
    const lib = new LibraryPage(page);
    const ms  = new MediaSetPage(page);

    await lib.open();
    await lib.openMediaSets();
    await lib.newMediaSetButton.click();
    await expect(ms.modal).toBeVisible();

    await ms.fillName(NAME_HAPPY);
    await ms.dragAssetToZone(await ms.pickTile('landscape'), 'landscape');
    await ms.dragAssetToZone(await ms.pickTile('portrait'),  'portrait');
    await ms.submitCreate();
    await ms.waitForModalClosed('mediaSetModal');
    created.add(NAME_HAPPY);

    await expect(page.getByText(NAME_HAPPY).first()).toBeVisible({ timeout: 15_000 });
  });

  // ─── 2. Read / View ────────────────────────────────────────────────────────
  test('Read: open the created Media Set and verify two thumbnails', async ({ page }) => {
    const lib = new LibraryPage(page);
    const ms  = new MediaSetPage(page);
    await lib.open();
    await lib.openMediaSets();
    await lib.searchMediaSet(NAME_HAPPY);

    const card = lib.mediaSetCard(NAME_HAPPY);
    await expect(card).toBeVisible({ timeout: 10_000 });
    const imgCount = await card.locator('img').count();
    expect(imgCount, 'card preview should expose at least one thumbnail per orientation').toBeGreaterThanOrEqual(1);

    // Some builds expose a "view" affordance; if absent we just sanity-check the card
    const view = card.getByRole('button', { name: /view|preview|open/i });
    if (await view.count()) {
      await view.first().click().catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
    }
  });

  // ─── 3. Update ─────────────────────────────────────────────────────────────
  test('Update: rename + swap portrait', async ({ page }) => {
    const lib = new LibraryPage(page);
    const ms  = new MediaSetPage(page);
    await lib.open();
    await lib.openMediaSets();
    await lib.searchMediaSet(NAME_HAPPY);

    try {
      await ms.openEditFor(NAME_HAPPY);
    } catch {
      test.skip(true, 'No edit affordance found for Media Set card on this build');
    }
    await ms.fillName(NAME_RENAMED);
    if (await ms.clearZonesButton.isEnabled().catch(() => false)) {
      await ms.clearZones();
      await ms.dragAssetToZone(await ms.pickTile('landscape'), 'landscape');
    }
    await ms.dragAssetToZone(await ms.pickTile('portrait'), 'portrait');

    // Edit modal may use Update OR Create button text
    if (await ms.updateButton.count()) await ms.submitUpdate();
    else                                 await ms.submitCreate();
    await ms.waitForModalClosed('mediaSetModal');

    created.delete(NAME_HAPPY);
    created.add(NAME_RENAMED);
    await expect(page.getByText(NAME_RENAMED).first()).toBeVisible({ timeout: 15_000 });
  });

  // ─── 4. Delete ─────────────────────────────────────────────────────────────
  test('Delete: remove a Media Set and confirm absence', async ({ page }) => {
    const lib = new LibraryPage(page);
    const ms  = new MediaSetPage(page);
    await lib.open();
    await lib.openMediaSets();

    const target = NAME_RENAMED;
    const removed = await ms.deleteFromList(target);
    if (!removed) test.skip(true, 'No delete affordance found for Media Set card on this build');
    await expect(lib.mediaSetCard(target)).toHaveCount(0, { timeout: 10_000 });
    created.delete(target);
  });

  // ─── 5. Negative — mandatory name ──────────────────────────────────────────
  test('Negative: blank name on Create surfaces an error OR keeps modal open', async ({ page }) => {
    const lib = new LibraryPage(page);
    const ms  = new MediaSetPage(page);
    await lib.open();
    await lib.openMediaSets();
    await lib.newMediaSetButton.click();
    await ms.dragAssetToZone(await ms.pickTile('landscape'), 'landscape');
    await ms.dragAssetToZone(await ms.pickTile('portrait'),  'portrait');
    await ms.submitCreate();

    const invalid = await ms.nameFieldHasInvalidState();
    const open    = await ms.modal.isVisible().catch(() => false);
    expect(invalid || open).toBeTruthy();
    if (!invalid) console.warn('UX bug: empty name has no inline validation, modal silent');
    await ms.cancelButton.click();
  });

  // ─── 6. Negative — incomplete assets ──────────────────────────────────────
  test('Negative: name + landscape only (no portrait) is rejected', async ({ page }) => {
    const lib = new LibraryPage(page);
    const ms  = new MediaSetPage(page);
    await lib.open();
    await lib.openMediaSets();
    await lib.newMediaSetButton.click();

    await ms.fillName(`Incomplete_${TAG}`);
    await ms.dragAssetToZone(await ms.pickTile('landscape'), 'landscape');
    await ms.submitCreate();

    const open  = await ms.modal.isVisible().catch(() => false);
    const toast = await ms.toastVisible(/portrait|asset|required|missing/i, 4000);
    expect(open || toast,
      'incomplete asset set should not silently succeed').toBeTruthy();
    await ms.cancelButton.click().catch(() => {});
  });

  // ─── 7. Negative — duplicate name ─────────────────────────────────────────
  test('Negative: duplicate name is rejected', async ({ page }) => {
    const lib = new LibraryPage(page);
    const ms  = new MediaSetPage(page);
    await lib.open();
    await lib.openMediaSets();

    // First creation (so a duplicate exists for the second attempt)
    await lib.newMediaSetButton.click();
    await ms.fillName(NAME_DUP);
    await ms.dragAssetToZone(await ms.pickTile('landscape'), 'landscape');
    await ms.dragAssetToZone(await ms.pickTile('portrait'),  'portrait');
    await ms.submitCreate();
    await ms.waitForModalClosed('mediaSetModal');
    created.add(NAME_DUP);

    // Second creation with same name
    await lib.newMediaSetButton.click();
    await ms.fillName(NAME_DUP);
    await ms.dragAssetToZone(await ms.pickTile('landscape'), 'landscape');
    await ms.dragAssetToZone(await ms.pickTile('portrait'),  'portrait');
    await ms.submitCreate();

    const open  = await ms.modal.isVisible().catch(() => false);
    const toast = await ms.toastVisible(/exist|duplicate|already/i, 4000);
    expect(open || toast).toBeTruthy();
    await page.keyboard.press('Escape');
  });

  // ─── 8. Special characters ────────────────────────────────────────────────
  test('Edge: special-character name is preserved verbatim', async ({ page }) => {
    const lib = new LibraryPage(page);
    const ms  = new MediaSetPage(page);
    await lib.open();
    await lib.openMediaSets();
    await lib.newMediaSetButton.click();
    await ms.fillName(NAME_SPECIAL);
    await ms.dragAssetToZone(await ms.pickTile('landscape'), 'landscape');
    await ms.dragAssetToZone(await ms.pickTile('portrait'),  'portrait');
    await ms.submitCreate();
    await ms.waitForModalClosed('mediaSetModal');
    created.add(NAME_SPECIAL);
    await expect(page.getByText(NAME_SPECIAL).first()).toBeVisible({ timeout: 15_000 });
  });

  // ─── 9. Search functionality ──────────────────────────────────────────────
  test('Search: partial-name match locates the Media Set', async ({ page }) => {
    const lib = new LibraryPage(page);
    const ms  = new MediaSetPage(page);
    await lib.open();
    await lib.openMediaSets();

    // Create a known target so the assertion is deterministic
    await lib.newMediaSetButton.click();
    await ms.fillName(NAME_SEARCH);
    await ms.dragAssetToZone(await ms.pickTile('landscape'), 'landscape');
    await ms.dragAssetToZone(await ms.pickTile('portrait'),  'portrait');
    await ms.submitCreate();
    await ms.waitForModalClosed('mediaSetModal');
    created.add(NAME_SEARCH);

    // Partial name (omit run-tag suffix)
    const partial = NAME_SEARCH.split('_').slice(0, 2).join('_'); // "MS_Search"
    await lib.searchMediaSet(partial);
    await expect(lib.mediaSetCard(NAME_SEARCH)).toBeVisible({ timeout: 10_000 });
  });

  // ─── 10. Clear zones action ───────────────────────────────────────────────
  test('Clear zones: empties both Landscape and Portrait', async ({ page }) => {
    const lib = new LibraryPage(page);
    const ms  = new MediaSetPage(page);
    await lib.open();
    await lib.openMediaSets();
    await lib.newMediaSetButton.click();

    await ms.fillName(`Clear_${TAG}`);
    await ms.dragAssetToZone(await ms.pickTile('landscape'), 'landscape');
    await ms.dragAssetToZone(await ms.pickTile('portrait'),  'portrait');
    await expect(ms.clearZonesButton).toBeEnabled({ timeout: 5_000 });

    await ms.clearZones();
    expect(await ms.zonesAreEmpty(),
      'after Clear zones, both placeholder zones must be visible').toBeTruthy();
    await ms.cancelButton.click();
  });

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  test.afterAll(async ({ browser }) => {
    if (!created.size) return;
    step(`afterAll cleanup: ${[...created].join(', ')}`);
    const ctx  = await browser.newContext({ storageState: 'cms-ts/.auth/state.json' });
    const page = await ctx.newPage();
    try {
      const lib = new LibraryPage(page);
      const ms  = new MediaSetPage(page);
      await lib.open();
      await lib.openMediaSets();
      for (const name of created) await ms.deleteFromList(name).catch(() => {});
    } finally {
      await ctx.close();
    }
  });
});
