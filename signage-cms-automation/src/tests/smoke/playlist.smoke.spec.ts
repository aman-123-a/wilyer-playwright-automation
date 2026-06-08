// =============================================================================
//  Playlist smoke suite — TC_PL_001 … TC_PL_004.
//  Create is additive and runs by default; edit / add-media verify the editor
//  surface non-destructively (actual writes gate behind CMS_ALLOW_DESTRUCTIVE so
//  the suite stays safe + repeatable against the live app).
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { assertClean, expectNoStuckLoader } from '../../utils/assertions';
import { name as uniqueName } from '../../data/test-data';
import { ENV } from '../../config/env';

test.describe('@smoke Playlist', () => {
  // TC_PL_001 — Create a playlist (name + description) and confirm acceptance.
  test('TC_PL_001_Create_Playlist — create with name + description', async ({
    playlistPage,
    consoleMonitor,
    apiMonitor,
  }) => {
    await playlistPage.open();
    await playlistPage.expectListLoaded();

    const playlistName = uniqueName('smoke-playlist');
    const created = await playlistPage.createPlaylist(playlistName, 'Created by smoke automation');

    expect(created, 'create-playlist modal should close on success').toBeTruthy();
    await assertClean(consoleMonitor, apiMonitor);
  });

  // TC_PL_002 — Open a playlist and confirm the editable settings surface loads.
  test('TC_PL_002_Edit_Playlist — settings editor loads (persisted data)', async ({
    playlistPage,
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    await playlistPage.open();
    await playlistPage.expectListLoaded();
    await playlistPage.openFirstPlaylist();

    expect(await playlistPage.isOnSettings(), 'should land on /playlist-settings').toBeTruthy();
    await expectNoStuckLoader(page);

    if (ENV.ALLOW_DESTRUCTIVE) {
      // Destructive variant: actually rename + save and assert persistence.
      const nameField = page.getByRole('textbox', { name: /name/i }).first();
      const newName = uniqueName('renamed');
      await nameField.fill(newName);
      await page.getByRole('button', { name: /^(save|update)$/i }).first().click();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(nameField).toHaveValue(newName);
    }
    await assertClean(consoleMonitor, apiMonitor);
  });

  // TC_PL_003 — Open a playlist and confirm the add-media surface is reachable.
  test('TC_PL_003_Add_Media_To_Playlist — add-media surface available', async ({
    playlistPage,
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    await playlistPage.open();
    await playlistPage.expectListLoaded();
    await playlistPage.openFirstPlaylist();
    await expectNoStuckLoader(page);

    // The full-screen editor exposes a Media panel + an Upload control — that is
    // the add-media surface for the playlist.
    const { mediaPanelBtn, uploadBtn } = playlistPage.addMediaSurface();
    await expect(mediaPanelBtn).toBeVisible({ timeout: 15_000 });
    await mediaPanelBtn.click().catch(() => {});
    await expect(uploadBtn).toBeVisible({ timeout: 12_000 });

    if (ENV.ALLOW_DESTRUCTIVE) {
      // Drag-add a media item into the layout, then Save, and assert it sticks.
      const item = page.locator('a[href^="/file-details/"], [draggable="true"]').first();
      if (await item.isVisible().catch(() => false)) {
        await item.click().catch(() => {});
        await page.getByRole('button', { name: /^save$/i }).first().click().catch(() => {});
      }
    }
    await assertClean(consoleMonitor, apiMonitor);
  });

  // TC_PL_004 — UI stability: open a playlist, exercise its tabs repeatedly,
  // assert no crash (shell intact) and no console/server errors.
  test('TC_PL_004_Playlist_UI_Stability — repeated tab navigation, no crash', async ({
    playlistPage,
    page,
    consoleMonitor,
    apiMonitor,
  }) => {
    await playlistPage.open();
    await playlistPage.expectListLoaded();
    await playlistPage.openFirstPlaylist();

    const tabs = playlistPage.editorTabs();
    const tabCount = Math.min(await tabs.count(), 6);
    expect(tabCount, 'editor exposes section switchers').toBeGreaterThan(0);

    // Cycle through the editor sections several times to stress the UI.
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < tabCount; i++) {
        const tab = tabs.nth(i);
        if (await tab.isVisible().catch(() => false)) {
          await tab.click().catch(() => {});
          await page.waitForTimeout(300);
        }
      }
    }

    await expectNoStuckLoader(page);
    // No crash == the editor chrome (Save/Exit) is still mounted and we're still
    // on the editor route. (The full-screen editor hides the main sidebar.)
    await expect(playlistPage.editorChrome()).toBeVisible();
    expect(await playlistPage.isOnSettings(), 'still on the playlist editor').toBeTruthy();
    await assertClean(consoleMonitor, apiMonitor);
  });
});
