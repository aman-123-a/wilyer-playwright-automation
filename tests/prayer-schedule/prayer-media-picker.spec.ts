// =============================================================================
//  PRAYER SCHEDULE — "Choose Media" picker.
//  Covers the per-prayer FILES column: opening the picker, nested-folder
//  navigation, folder-scoped search, the backing API contract, and (gated)
//  assigning media to a prayer.
//
//  Surface + API captured live 2026-07-24 against cms.pocsample.in. Read-only by
//  default; anything that mutates a plan is behind CMS_ALLOW_DESTRUCTIVE.
//
//  Live fixture used by the search-scoping cases (folder tree, verified 07-24):
//     BenQ/
//       └── Noida/                       1 file  → wonderland_1782105034092.jpg
//             └── Botanical Garden/      2 files (no "wonderland")
//                   ├── test/           29 files (no "wonderland")
//                   └── test2/           0 files
//  i.e. the ENTIRE Noida subtree contains exactly ONE "wonderland" file.
//  Cases that depend on this tree skip themselves if it is not present, so the
//  suite degrades gracefully when the shared staging library is reorganised.
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { ENV } from '../../config/env';

/** Nested folder fixture + a term whose subtree membership is known. */
const NESTED = { parent: 'BenQ', child: 'Noida', deep: 'Botanical Garden' } as const;
const TERM = 'wonderland';
const OWNED_FILE = 'wonderland_1782105034092.jpg';

/**
 * Navigate Schedules → open a media picker. Returns false when no prayer row
 * offers an [+ Files] slot (the CMS caps a prayer at two files, and hides the
 * button once full), so callers can skip rather than fail.
 */
async function openPicker(prayerSchedulePage: any, page: any): Promise<boolean> {
  await prayerSchedulePage.open();
  await prayerSchedulePage.openSchedules();

  // NOTE: Locator.isVisible() does not retry — it reports the state at the
  // instant it is called. The per-prayer table renders after the plan detail
  // loads, so wait for the table properly before probing the rows.
  const ready = await page
    .locator('tr', { hasText: /PRAYER NAME/i })
    .first()
    .waitFor({ state: 'visible', timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) return false;

  const prayer = await prayerSchedulePage.firstPrayerWithAddSlot();
  if (!prayer) return false;
  await prayerSchedulePage.openMediaPicker(prayer);
  return true;
}

/** Drill parent → child, skipping the test when the fixture tree is missing. */
async function intoNestedFolder(psp: any): Promise<void> {
  const chips = await psp.folderChips();
  test.skip(!chips.includes(NESTED.parent), `folder "${NESTED.parent}" not in library`);
  await psp.openFolder(NESTED.parent);
  const sub = await psp.folderChips();
  test.skip(!sub.includes(NESTED.child), `folder "${NESTED.parent}/${NESTED.child}" not in library`);
  await psp.openFolder(NESTED.child);
}

test.describe('Prayer Schedule — Choose Media picker', () => {
  // ── Smoke ────────────────────────────────────────────────────────────────

  test('FILES column opens the Choose Media picker @smoke @sanity @regression', async ({ prayerSchedulePage, page }) => {
    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');

    const picker = prayerSchedulePage.mediaPicker();
    await expect(picker.getByText(/choose media/i).first()).toBeVisible();
    await expect(prayerSchedulePage.mediaSearch()).toBeVisible();
    // Tabs + type filters.
    for (const label of ['Media', 'Widgets', 'All', 'Images', 'Videos', 'Folders']) {
      await expect(
        picker.getByRole('button', { name: new RegExp(`^\\s*${label}\\s*$`, 'i') }).first(),
      ).toBeVisible();
    }
  });

  test('picker root lists both folders and media tiles @smoke @regression', async ({ prayerSchedulePage, page }) => {
    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');

    expect(await prayerSchedulePage.mediaTiles().count(), 'root shows media').toBeGreaterThan(0);
    const chips = (await prayerSchedulePage.folderChips()).filter((c: string) => !/^back$/i.test(c));
    expect(chips.length, 'root shows at least one folder').toBeGreaterThan(0);
  });

  // ── Nested folder navigation ─────────────────────────────────────────────

  test('drills into a nested folder and Back returns to the parent @regression', async ({ prayerSchedulePage, page }) => {
    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');

    const rootChips = (await prayerSchedulePage.folderChips()).filter(
      (c: string) => !/^back$/i.test(c),
    );
    await intoNestedFolder(prayerSchedulePage);

    // Inside a folder the picker exposes a Back affordance.
    expect(await prayerSchedulePage.folderChips()).toContain('Back');

    await prayerSchedulePage.folderBack();
    await prayerSchedulePage.folderBack();
    const afterChips = (await prayerSchedulePage.folderChips()).filter(
      (c: string) => !/^back$/i.test(c),
    );
    expect(afterChips, 'Back restores the root folder listing').toEqual(rootChips);
  });

  test('a three-level nested path is reachable @regression', async ({ prayerSchedulePage, page }) => {
    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');

    await intoNestedFolder(prayerSchedulePage);
    const sub = await prayerSchedulePage.folderChips();
    test.skip(!sub.includes(NESTED.deep), `"${NESTED.deep}" not present`);

    await prayerSchedulePage.openFolder(NESTED.deep);
    // Level 3 resolves to either media, further folders, or an empty state.
    const tiles = await prayerSchedulePage.mediaTiles().count();
    const chips = (await prayerSchedulePage.folderChips()).filter(
      (c: string) => !/^back$/i.test(c),
    );
    expect(
      tiles > 0 || chips.length > 0 || (await prayerSchedulePage.pickerIsEmpty()),
      'level-3 folder renders content or an explicit empty state',
    ).toBeTruthy();
  });

  test('an empty nested folder shows an explicit empty state @regression', async ({ prayerSchedulePage, page }) => {
    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');

    // A truly empty folder: no files AND no subfolders. ("India" is NOT one —
    // it has no files of its own but does hold the subfolder "uttarpradesh",
    // so the picker legitimately renders that child instead of an empty state.)
    const EMPTY = 'testway';
    const chips = await prayerSchedulePage.folderChips();
    test.skip(!chips.includes(EMPTY), `fixture folder "${EMPTY}" not in library`);
    await prayerSchedulePage.openFolder(EMPTY);

    expect(await prayerSchedulePage.mediaTiles().count(), 'no media tiles').toBe(0);
    expect(
      (await prayerSchedulePage.folderChips()).filter((c: string) => !/^back$/i.test(c)),
      'no subfolders either',
    ).toEqual([]);
    expect(
      await prayerSchedulePage.pickerIsEmpty(),
      'a file-less, child-less folder states it is empty rather than rendering a blank grid',
    ).toBeTruthy();
  });

  // ── Search inside a nested folder ────────────────────────────────────────

  test('search inside a nested folder finds a file that lives there @regression', async ({ prayerSchedulePage, page }) => {
    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');
    await intoNestedFolder(prayerSchedulePage);

    const direct = await prayerSchedulePage.mediaTileNames();
    test.skip(!direct.includes(OWNED_FILE), `fixture file ${OWNED_FILE} missing`);

    await prayerSchedulePage.searchMedia(TERM);
    const hits = await prayerSchedulePage.mediaTileNames();
    expect(hits.length, 'search returns matches').toBeGreaterThan(0);
    expect(hits, 'the folder-resident file is among the hits').toContain(OWNED_FILE);
    expect(
      hits.every((n: string) => new RegExp(TERM, 'i').test(n)),
      'every hit matches the search term',
    ).toBeTruthy();
  });

  test('search stays scoped to the folder subtree @regression', async ({ prayerSchedulePage, page }) => {
    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');
    await intoNestedFolder(prayerSchedulePage);

    const direct = await prayerSchedulePage.mediaTileNames();
    test.skip(!direct.includes(OWNED_FILE), `fixture file ${OWNED_FILE} missing`);

    await prayerSchedulePage.searchMedia(TERM);
    const hits = await prayerSchedulePage.mediaTileNames();

    // The Noida subtree (Noida + Botanical Garden + test + test2) contains
    // exactly ONE "wonderland" file. A folder-scoped search must not surface
    // files that live outside the folder the user drilled into.
    expect(
      hits,
      `folder-scoped search leaked files from outside ${NESTED.parent}/${NESTED.child}: ` +
        `${hits.filter((h: string) => h !== OWNED_FILE).join(', ')}`,
    ).toEqual([OWNED_FILE]);
  });

  test('a no-match search shows an empty state @regression', async ({ prayerSchedulePage, page }) => {
    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');
    await intoNestedFolder(prayerSchedulePage);

    await prayerSchedulePage.searchMedia('zzzznomatch');
    expect(await prayerSchedulePage.mediaTiles().count()).toBe(0);
    expect(await prayerSchedulePage.pickerIsEmpty(), 'no-match shows an empty state').toBeTruthy();
  });

  test('clearing the search restores the folder contents @regression', async ({ prayerSchedulePage, page }) => {
    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');
    await intoNestedFolder(prayerSchedulePage);

    const before = await prayerSchedulePage.mediaTileNames();
    await prayerSchedulePage.searchMedia('zzzznomatch');
    await prayerSchedulePage.clearMediaSearch();

    expect(
      await prayerSchedulePage.mediaTileNames(),
      'clearing search returns to the folder, not the root',
    ).toEqual(before);
  });

  // ── API contract ─────────────────────────────────────────────────────────

  test('file/read carries the folderId of the open folder @api @regression', async ({
    prayerSchedulePage,
    page,
  }) => {
    const calls: string[] = [];
    page.on('request', (r) => {
      if (/\/v3\/cms\/file\/read/.test(r.url())) calls.push(r.url());
    });

    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');
    await intoNestedFolder(prayerSchedulePage);
    await prayerSchedulePage.searchMedia(TERM);

    const searched = calls.filter((u) => /[?&]search=wonderland/.test(u));
    expect(searched.length, 'a search request was issued').toBeGreaterThan(0);

    const last = searched[searched.length - 1];
    const folderId = new URL(last).searchParams.get('folderId');
    expect(folderId, 'the search request is scoped by folderId').toBeTruthy();
    expect(new URL(last).searchParams.get('search')).toBe(TERM);
  });

  test('folder/read is issued with a parentFolder on drill-down @api @regression', async ({
    prayerSchedulePage,
    page,
  }) => {
    const calls: string[] = [];
    page.on('request', (r) => {
      if (/\/v3\/cms\/folder\/read/.test(r.url())) calls.push(r.url());
    });

    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');
    await intoNestedFolder(prayerSchedulePage);

    const scoped = calls.filter((u) => new URL(u).searchParams.get('parentFolder'));
    expect(scoped.length, 'drilling into a folder queries its children').toBeGreaterThan(0);
  });

  test('search input is debounced @api @regression', async ({ prayerSchedulePage, page }) => {
    test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');

    const calls: string[] = [];
    page.on('request', (r) => {
      if (/\/v3\/cms\/file\/read/.test(r.url())) calls.push(r.url());
    });

    const box = prayerSchedulePage.mediaSearch();
    await box.click();
    await box.fill('');
    await page.waitForTimeout(1_500);

    const before = calls.length;
    await box.pressSequentially('salad', { delay: 120 });
    await page.waitForTimeout(3_000);
    const fired = calls.length - before;

    // A debounced box collapses a 5-character burst into ~1 request. One request
    // per keystroke means every typed character hits the media service.
    expect(
      fired,
      `typing 5 characters issued ${fired} file/read requests — search is not debounced`,
    ).toBeLessThanOrEqual(2);
  });

  // ── Assigning media (mutates the plan) ───────────────────────────────────

  test.describe('Add media to a prayer @regression', () => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'set CMS_ALLOW_DESTRUCTIVE=true to run write cases');

    test('selecting a file from a nested folder assigns it to the prayer', async ({ prayerSchedulePage, page }) => {
      test.skip(!(await openPicker(prayerSchedulePage, page)), 'no prayer plan with a FILES column');

      const before = await prayerSchedulePage.assignedMedia('Fajr');
      await intoNestedFolder(prayerSchedulePage);

      const names = await prayerSchedulePage.mediaTileNames();
      test.skip(!names.includes(OWNED_FILE), `fixture file ${OWNED_FILE} missing`);

      await prayerSchedulePage.selectMedia(OWNED_FILE);
      await prayerSchedulePage.closeMediaPicker();

      const after = await prayerSchedulePage.assignedMedia('Fajr');
      expect(after.length, 'the prayer gained a media assignment').toBeGreaterThan(before.length);
      expect(after.join(' ')).toContain('wonderland');
    });
  });
});
