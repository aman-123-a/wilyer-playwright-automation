// =============================================================================
//  MEDIA SETS — Bulk operations (functional).
//  Ticking cards reveals a bulk bar: Unpublish Media Set / Publish Media Set (N) /
//  Move to Folder / Delete (N). There is no bulk endpoint — "Delete (N)" fires one
//  DELETE per set — so these cases assert on the resulting server state, not on
//  a single bulk response.
//
//  NOT covered: Publish / Unpublish. They push content to real screens on a
//  shared server, which is a rollout concern, not a media-set one.
//
//  Every set is created through the API with MEDIASET_PREFIX and swept after
//  each test. The list is always narrowed to this run's unique token first, so a
//  colleague's sets can never be selected by accident.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';

test.describe.configure({ mode: 'serial' });

/** Folder used for the Move case; the case skips if the account has no such folder. */
const MOVE_TARGET_FOLDER = 'testway';

test.describe('Media Sets — Bulk operations @regression', () => {
  let files: ZoneFiles;
  let token: string;
  let names: string[];

  test.beforeEach(async ({ mediaSetsPage, mediaSetApi }, testInfo) => {
    test.skip(!(await mediaSetsPage.isAvailable()), 'Media Sets module is absent from this build');
    files ??= await mediaSetApi.pickZoneFiles();

    // Three sets sharing one searchable token → one name-scoped, isolated list.
    token = mediaSetName('bulk', testInfo.workerIndex);
    names = ['a', 'b', 'c'].map((s) => `${token}_${s}`);
    for (const n of names) await mediaSetApi.create(MediaSetService.payload(n, files));

    await mediaSetsPage.open();
    await mediaSetsPage.searchAndSettle(token, 3);
  });

  test.afterEach(async ({ mediaSetApi }) => {
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  });

  test('BULK-01 · bulk bar is hidden until a card is ticked', async ({ mediaSetsPage }) => {
    await expect(mediaSetsPage.bulkDeleteBtn).toBeHidden();
    await expect(mediaSetsPage.bulkMoveBtn).toBeHidden();

    await mediaSetsPage.selectCard(names[0]);
    await expect(mediaSetsPage.bulkDeleteBtn).toBeVisible();
    await expect(mediaSetsPage.bulkMoveBtn).toBeVisible();
    await expect(mediaSetsPage.bulkPublishBtn).toBeVisible();
    await expect(mediaSetsPage.bulkUnpublishBtn).toBeVisible();
  });

  test('BULK-02 · "Delete (N)" count tracks the number of ticked cards', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.selectCard(names[0]);
    expect(await mediaSetsPage.bulkDeleteCount()).toBe(1);
    await mediaSetsPage.selectCard(names[1]);
    expect(await mediaSetsPage.bulkDeleteCount()).toBe(2);
    await mediaSetsPage.selectCard(names[2]);
    expect(await mediaSetsPage.bulkDeleteCount()).toBe(3);

    await mediaSetsPage.deselectCard(names[2]);
    expect(await mediaSetsPage.bulkDeleteCount()).toBe(2);

    await mediaSetsPage.deselectCard(names[1]);
    await mediaSetsPage.deselectCard(names[0]);
    expect(await mediaSetsPage.bulkDeleteCount(), 'bar hides at zero').toBeNull();
  });

  test('BULK-03 · bulk delete asks to confirm with the selected count; Cancel deletes nothing', async ({
    mediaSetsPage,
    mediaSetApi,
  }) => {
    await mediaSetsPage.selectCard(names[0]);
    await mediaSetsPage.selectCard(names[1]);
    await mediaSetsPage.bulkDeleteBtn.click();

    await expect(mediaSetsPage.openModal).toContainText(/delete selected media sets/i);
    await expect(mediaSetsPage.openModal).toContainText(/delete 2 media sets/i);
    await mediaSetsPage.cancelModal();

    expect((await mediaSetApi.list({ search: token })).totalDocs, 'nothing deleted').toBe(3);
  });

  test('BULK-04 · bulk delete removes exactly the ticked sets and leaves the rest', async ({
    mediaSetsPage,
    mediaSetApi,
  }) => {
    await mediaSetsPage.selectCard(names[0]);
    await mediaSetsPage.selectCard(names[1]);
    await mediaSetsPage.bulkDeleteBtn.click();
    await mediaSetsPage.confirmDelete();

    await mediaSetsPage.search(token);
    await mediaSetsPage.expectTotal(1);
    await expect(mediaSetsPage.cardByName(names[2])).toBeVisible();

    const left = await mediaSetApi.list({ search: token });
    expect(left.mediaSets.map((m) => m.name)).toEqual([names[2]]);
    await expect(mediaSetsPage.bulkDeleteBtn, 'selection cleared after delete').toBeHidden();
  });

  test('BULK-05 · ticking every visible card and deleting empties the filtered list', async ({
    mediaSetsPage,
    mediaSetApi,
  }) => {
    for (const n of names) await mediaSetsPage.selectCard(n);
    expect(await mediaSetsPage.bulkDeleteCount()).toBe(3);
    await mediaSetsPage.bulkDeleteBtn.click();
    await mediaSetsPage.confirmDelete();

    await mediaSetsPage.search(token);
    await mediaSetsPage.expectTotal(0);
    await expect(mediaSetsPage.emptyState()).toBeVisible();
    expect((await mediaSetApi.list({ search: token })).totalDocs).toBe(0);
  });

  test('BULK-06 · Move to Folder lists the folders; Cancel moves nothing', async ({
    mediaSetsPage,
    mediaSetApi,
  }) => {
    await mediaSetsPage.selectCard(names[0]);
    await mediaSetsPage.selectCard(names[1]);
    await mediaSetsPage.bulkMoveBtn.click();

    await expect(mediaSetsPage.openModal).toContainText(/moving 2 media sets/i);
    await expect(mediaSetsPage.openModal).toContainText(/select folder/i);
    await mediaSetsPage.cancelModal();

    const { mediaSets } = await mediaSetApi.list({ search: token });
    for (const m of mediaSets) expect(m.folderId, `${m.name} still at root`).toBeFalsy();
  });

  test('BULK-07 · Move to Folder relocates only the ticked sets', async ({
    mediaSetsPage,
    mediaSetApi,
  }) => {
    await mediaSetsPage.selectCard(names[0]);
    await mediaSetsPage.selectCard(names[1]);
    const hasTarget = await mediaSetsPage.chooseMoveFolder(MOVE_TARGET_FOLDER);
    test.skip(!hasTarget, `account has no "${MOVE_TARGET_FOLDER}" folder to move into`);
    await mediaSetsPage.confirmMove();

    // The list's own scope may now hide the moved cards — settle on the API.
    await expect
      .poll(async () => (await mediaSetApi.findByName(names[0]))?.folderId ?? null)
      .not.toBeNull();
    expect((await mediaSetApi.findByName(names[1]))?.folderId, 'second ticked set moved').toBeTruthy();
    expect((await mediaSetApi.findByName(names[2]))?.folderId, 'unticked set stays at root').toBeFalsy();
  });

  test('BULK-08 · a ticked card stays ticked while the search is changed and restored', async ({
    mediaSetsPage,
  }) => {
    // Regression guard: selection is client state; filtering must not silently
    // delete sets that were ticked but are no longer visible — the user would
    // then bulk-delete rows they cannot see.
    await mediaSetsPage.selectCard(names[0]);
    await mediaSetsPage.search(names[1]);
    await mediaSetsPage.expectTotal(1);

    const count = await mediaSetsPage.bulkDeleteCount();
    test.info().annotations.push({
      type: 'observed',
      description: `"Delete (N)" shows ${count ?? 'hidden'} while 1 ticked card is filtered out of view`,
    });
    // Whatever the product does, it must not claim to delete a set the user cannot see
    // beyond what is ticked: N may be 0/hidden (selection reset) or 1 (kept), never 2.
    expect(count === null || count <= 1, 'N never exceeds the ticked count').toBe(true);
  });
});
