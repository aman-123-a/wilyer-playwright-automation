import { test, expect } from '@playwright/test';
import { MAKER, FILES, uniqueName, DUPLICATE_NAME, DEFAULT_FOLDER } from '../../utils/maker-checker/testData.js';
import { login } from '../../utils/maker-checker/helpers.js';
import { PlaylistPage } from '../../pages/maker-checker/PlaylistPage.js';

// ─── MAKER: create / upload / edit / delete / submit ─────────────────────────
test.describe('MAKER FLOW: Playlist CRUD + Upload + Submit for Approval', () => {
  let playlist;

  test.beforeEach(async ({ page }) => {
    await login(page, MAKER);
    playlist = new PlaylistPage(page);
    await playlist.open();
  });

  test('Maker-01: Create a playlist with valid data inside folder', async () => {
    const name = uniqueName('MakerCreate');
    await playlist.createPlaylist(name, 'valid data run');
    expect(await playlist.isVisible(name)).toBeTruthy();
  });

  test('Maker-02: Upload a file to a playlist (file chooser)', async () => {
    const name = uniqueName('MakerUpload');
    await playlist.createPlaylist(name);
    // After create we are already on /playlist-settings/{id}
    await playlist.uploadFile(FILES.validImage);
  });

  test('Maker-03: Edit a playlist name', async () => {
    const originalName = uniqueName('MakerEditOrig');
    const newName      = uniqueName('MakerEditNew');
    await playlist.createPlaylist(originalName);
    await playlist.editPlaylist(originalName, newName);
    expect(await playlist.isVisible(newName)).toBeTruthy();
  });

  test('Maker-04: Delete a playlist', async () => {
    const name = uniqueName('MakerDelete');
    await playlist.createPlaylist(name);
    await playlist.deletePlaylist(name);
    expect(await playlist.isVisible(name)).toBeFalsy();
  });

  test('Maker-05: Submit a playlist for approval', async () => {
    const name = uniqueName('MakerSubmit');
    await playlist.createPlaylist(name);
    await playlist.uploadFile(FILES.validImage);
    await playlist.submitForApproval(name);
  });

  // ─── Validations ────────────────────────────────────────────────────────────
  test('Maker-06: Required-field validation on empty submit', async () => {
    await playlist.openFolder(DEFAULT_FOLDER);
    await playlist.newPlaylistBtn.click();
    await expect(playlist.createModal).toBeVisible();
    // Click create without filling name → modal stays open (no save)
    await playlist.createSubmitBtn.click();
    await expect(playlist.createModal).toBeVisible();
  });

  test('Maker-07: Invalid input handled (too-long / special chars)', async () => {
    const invalid = '<<<' + 'x'.repeat(260) + '>>>';
    await playlist.openFolder(DEFAULT_FOLDER);
    await playlist.newPlaylistBtn.click();
    await expect(playlist.createModal).toBeVisible();
    await playlist.createModal.getByRole('textbox', { name: /playlist name/i }).fill(invalid);
    await playlist.createSubmitBtn.click();
    // Either a validation error fires OR the modal stays open
    const errorVisible = await playlist.errorText.first().isVisible({ timeout: 5000 }).catch(() => false);
    const modalStill   = await playlist.createModal.isVisible().catch(() => false);
    expect(errorVisible || modalStill).toBeTruthy();
  });

  test('Maker-08: Duplicate playlist name is blocked', async () => {
    // First create may succeed or may already exist — either is fine
    await playlist.createPlaylist(DUPLICATE_NAME).catch(() => {});
    await playlist.open();
    await playlist.openFolder(DEFAULT_FOLDER);
    await playlist.newPlaylistBtn.click();
    await expect(playlist.createModal).toBeVisible();
    await playlist.createModal.getByRole('textbox', { name: /playlist name/i }).fill(DUPLICATE_NAME);
    await playlist.createSubmitBtn.click();
    const errorVisible = await playlist.errorText.first().isVisible({ timeout: 5000 }).catch(() => false);
    const toastVisible = await playlist.toast.first().isVisible({ timeout: 5000 }).catch(() => false);
    const modalStill   = await playlist.createModal.isVisible().catch(() => false);
    expect(errorVisible || toastVisible || modalStill).toBeTruthy();
  });
});
