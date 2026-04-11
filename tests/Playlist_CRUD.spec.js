import { test, expect } from '@playwright/test';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL       = 'https://cms.pocsample.in/';
const LOGIN_EMAIL    = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';

const RUN_ID          = Date.now();
const PLAYLIST_NAME   = `E2E_Playlist_${RUN_ID}`;
const PLAYLIST_DESC   = 'Created by Playlist_CRUD.spec.js';
const PLAYLIST_RENAME = `E2E_Playlist_${RUN_ID}_Renamed`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /email|phone/i }).fill(LOGIN_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(LOGIN_PASSWORD);
  const loginBtn = page.getByRole('button', { name: /log in/i });
  await loginBtn.click();
  await expect(loginBtn).toBeHidden({ timeout: 20_000 });
  console.log(`✅ Logged in as ${LOGIN_EMAIL}`);
}

async function gotoPlaylists(page) {
  await page.goto(`${BASE_URL}playlists`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /\+?\s*new playlist/i })).toBeVisible({ timeout: 20_000 });
}

// Locate the card that represents a given playlist name.
// The playlist name is rendered inside a <span> in a `.card-body` container
// that also holds the action buttons (Duplicate / Update / Delete / Publish).
function playlistCard(page, name) {
  return page
    .locator('div.card-body')
    .filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) });
}

// Open Bootstrap modal that contains the given heading text.
function openModal(page, headingRegex) {
  return page.locator('.modal.show').filter({ hasText: headingRegex });
}

// Best-effort teardown: if the playlist still exists at the end of a run,
// delete it so subsequent runs stay clean.
async function tryDeletePlaylist(page, name) {
  try {
    await gotoPlaylists(page);
    const card = playlistCard(page, name);
    if (await card.count() === 0) return;
    await card.first().getByRole('button', { name: /delete playlist/i }).click();
    const modal = openModal(page, /delete playlist/i);
    await modal.getByRole('button', { name: /continue/i }).click();
    await expect(card).toHaveCount(0, { timeout: 15_000 });
  } catch (err) {
    console.warn(`⚠️  Cleanup failed: ${err.message}`);
  }
}

// ─── Test ─────────────────────────────────────────────────────────────────────

test.describe('Playlists — Full CRUD', () => {

  test.setTimeout(180_000);

  test('Create → Read → Update → Delete a playlist', async ({ page }) => {

    // 1. Login
    await login(page);

    // 2. Go to Playlists
    await gotoPlaylists(page);
    console.log('📂 On Playlists page');

    // ─── CREATE ──────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: /\+?\s*new playlist/i }).click();

    const createModal = openModal(page, /create new playlist/i);
    await expect(createModal).toBeVisible({ timeout: 10_000 });

    await createModal.locator('#name').fill(PLAYLIST_NAME);
    await createModal.locator('#description').fill(PLAYLIST_DESC);
    await createModal.getByRole('button', { name: /create playlist/i }).click();

    // Creating a playlist redirects to /playlist-settings/{id}
    await page.waitForURL(/\/playlist-settings\//, { timeout: 20_000 });
    console.log(`✅ CREATE — playlist "${PLAYLIST_NAME}" created, now on ${page.url()}`);

    // ─── READ ────────────────────────────────────────────────────────────────
    await gotoPlaylists(page);
    const createdCard = playlistCard(page, PLAYLIST_NAME);
    await expect(createdCard).toHaveCount(1, { timeout: 20_000 });
    console.log(`✅ READ — playlist "${PLAYLIST_NAME}" visible in list`);

    // ─── UPDATE ──────────────────────────────────────────────────────────────
    await createdCard.getByRole('button', { name: /update playlist/i }).click();

    const updateModal = openModal(page, /update playlist/i);
    await expect(updateModal).toBeVisible({ timeout: 10_000 });

    const nameField = updateModal.locator('#name');
    await expect(nameField).toHaveValue(PLAYLIST_NAME);
    await nameField.fill(PLAYLIST_RENAME);
    await updateModal.getByRole('button', { name: /update playlist/i }).click();

    // Modal closes on success
    await expect(updateModal).toBeHidden({ timeout: 15_000 });

    // Verify rename took effect
    const renamedCard = playlistCard(page, PLAYLIST_RENAME);
    await expect(renamedCard).toHaveCount(1, { timeout: 20_000 });
    await expect(playlistCard(page, PLAYLIST_NAME)).toHaveCount(0);
    console.log(`✅ UPDATE — renamed to "${PLAYLIST_RENAME}"`);

    // ─── DELETE ──────────────────────────────────────────────────────────────
    await renamedCard.getByRole('button', { name: /delete playlist/i }).click();

    const deleteModal = openModal(page, /delete playlist/i);
    await expect(deleteModal).toBeVisible({ timeout: 10_000 });
    await deleteModal.getByRole('button', { name: /continue/i }).click();

    await expect(deleteModal).toBeHidden({ timeout: 15_000 });
    await expect(playlistCard(page, PLAYLIST_RENAME)).toHaveCount(0, { timeout: 20_000 });
    console.log(`✅ DELETE — "${PLAYLIST_RENAME}" removed from list`);
  });

  // Best-effort cleanup in case the test failed between create and delete.
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await tryDeletePlaylist(page, PLAYLIST_RENAME);
      await tryDeletePlaylist(page, PLAYLIST_NAME);
    }
  });

});
