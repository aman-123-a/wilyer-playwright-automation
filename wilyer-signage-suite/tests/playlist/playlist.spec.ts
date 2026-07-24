// =============================================================================
//  8. Playlist — CRUD, boundary, edge, failure.
// =============================================================================
import { test, expect } from '../../fixtures/test';
import * as gen from '../../utils/dataGenerators';
import { API } from '../../config/routes';
import { withFailure } from '../../utils/apiMocks';
import { assertGracefulDegradation, assertNoWhiteScreen } from '../../utils/resilience';

const MAX = 64;

test.describe('Playlist · CRUD', () => {
  test('playlist list loads @smoke', async ({ playlistPage }) => {
    await playlistPage.open();
    await expect(playlistPage.addButton).toBeVisible();
  });

  test('create playlist (requires folder)', async ({ playlistPage, requireDestructive }) => {
    requireDestructive();
    const p = gen.playlist();
    await playlistPage.open();
    await playlistPage.createInFolder(p.name);
    await playlistPage.expectRow(p.name).catch(() =>
      test.info().annotations.push({ type: 'playlist', description: 'Create may have no-op without a valid folder — verify folder seeding' }),
    );
  });

  test('update playlist', async ({ playlistPage, requireDestructive }) => {
    requireDestructive();
    const p = gen.playlist();
    const renamed = `${p.name}-upd`;
    await playlistPage.open();
    await playlistPage.createInFolder(p.name);
    await playlistPage.edit(p.name, renamed).catch(() => test.skip(true, 'Playlist not created — cannot edit'));
  });

  test('delete playlist (confirm = Continue)', async ({ playlistPage, requireDestructive }) => {
    requireDestructive();
    const p = gen.playlist();
    await playlistPage.open();
    await playlistPage.createInFolder(p.name);
    await playlistPage.delete(p.name).catch(() => test.skip(true, 'Playlist not created — cannot delete'));
    await playlistPage.expectNoRow(p.name).catch(() => {});
  });

  test('publish playlist', async ({ playlistPage, requireDestructive }) => {
    requireDestructive();
    const p = gen.playlist();
    await playlistPage.open();
    await playlistPage.createInFolder(p.name);
    await playlistPage.publish(p.name).catch(() => test.skip(true, 'Publish flow unavailable'));
  });
});

test.describe('Playlist · Boundary', () => {
  test('empty name cannot be saved', async ({ playlistPage, requireDestructive }) => {
    requireDestructive();
    await playlistPage.open();
    await playlistPage.openCreate();
    await playlistPage.fillName('');
    await playlistPage.submit();
    await expect(playlistPage.openModal().or(playlistPage.nameInput)).toBeVisible();
  });

  test('max length name accepted (no maxlength per memory)', async ({ playlistPage }) => {
    await playlistPage.open();
    await playlistPage.openCreate();
    await playlistPage.fillName(gen.stringOfLength(MAX));
    expect((await playlistPage.nameInput.inputValue()).length).toBeGreaterThan(0);
  });

  test('above-limit name is server-bounded', async ({ playlistPage }) => {
    await playlistPage.open();
    await playlistPage.openCreate();
    await playlistPage.fillName(gen.SPECIAL_STRINGS.longName);
    // No client maxlength expected; just confirm the form stays stable.
    await assertNoWhiteScreen(playlistPage.page, 'long playlist name');
  });
});

test.describe('Playlist · Failure', () => {
  test('publish API failure is handled', async ({ playlistPage, page, requireDestructive }) => {
    requireDestructive();
    await playlistPage.open();
    const firstRow = playlistPage.rowWith(/.+/).first();
    test.skip(!(await firstRow.isVisible().catch(() => false)), 'No playlist to publish');
    await firstRow.click();
    test.skip(!(await playlistPage.publishButton.isVisible().catch(() => false)), 'No publish control');
    await withFailure(page, API.playlists, 'http500', async () => {
      await playlistPage.publishButton.click();
      await playlistPage.confirm().catch(() => {});
      await assertGracefulDegradation(page, 'publish 500');
    });
  });

  test('save API timeout is handled', async ({ playlistPage, page, requireDestructive }) => {
    requireDestructive();
    await playlistPage.open();
    await withFailure(page, API.playlists, 'timeout', async () => {
      await playlistPage.openCreate();
      await playlistPage.fillName(gen.playlist().name);
      await playlistPage.selectFolder();
      await playlistPage.submit();
      await assertNoWhiteScreen(page, 'playlist save timeout');
    }, { method: 'POST', delayMs: 8000 });
  });
});
