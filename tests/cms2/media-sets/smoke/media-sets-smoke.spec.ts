// =============================================================================
//  MEDIA SETS — Smoke. Read-only: proves the module is up and its entry points
//  respond. Nothing is created or deleted, so it is safe on any build that ships
//  Media Sets (cms2); it skips cleanly where the tab is absent.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';

test.describe('Media Sets — Smoke @smoke', () => {
  test.beforeEach(async ({ mediaSetsPage }) => {
    test.skip(
      !(await mediaSetsPage.isAvailable()),
      'Media Sets module is absent from this build (no Media Sets tab in the Library nav)',
    );
  });

  test('SMK-01 · Media Sets tab opens with search, Create button and a resolved list', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.open();
    await expect(mediaSetsPage.searchInput).toBeVisible();
    await expect(mediaSetsPage.createBtn).toBeVisible();
    await mediaSetsPage.expectListResolved();
  });

  test('SMK-02 · list API answers 200 with the documented shape', async ({ mediaSetApi }) => {
    const res = await mediaSetApi.listRaw({ limit: 5 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.mediaSets), 'mediaSets is an array').toBe(true);
    for (const key of ['page', 'totalPages', 'totalDocs']) {
      expect(typeof body[key], `${key} is a number`).toBe('number');
    }
  });

  test('SMK-03 · UI "Total - N" matches the API total', async ({ mediaSetsPage, mediaSetApi }) => {
    await mediaSetsPage.open();
    const ui = await mediaSetsPage.total();
    test.skip(ui === null, '"Total - N" counter not present on this build');
    expect(ui).toBe((await mediaSetApi.list({ limit: 1 })).totalDocs);
  });

  test('SMK-04 · Create Media Set opens the builder, Cancel closes it', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.open();
    await mediaSetsPage.openCreate();
    await expect(mediaSetsPage.landscapeZone).toBeVisible();
    await mediaSetsPage.cancelCreate();
    await expect(mediaSetsPage.searchInput).toBeVisible();
  });

  test('SMK-05 · ticking a card reveals the bulk bar; unticking hides it', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.open();
    test.skip((await mediaSetsPage.cardCount()) === 0, 'no media sets to select');
    const box = mediaSetsPage.cards().first().locator('input[type="checkbox"]');
    await box.check();
    await expect(mediaSetsPage.bulkDeleteBtn).toBeVisible();
    await expect(mediaSetsPage.bulkMoveBtn).toBeVisible();
    await box.uncheck();
    await expect(mediaSetsPage.bulkDeleteBtn).toBeHidden();
  });
});
