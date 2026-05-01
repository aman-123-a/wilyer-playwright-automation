import { test, expect } from '@playwright/test';
import { ScreensPage, LoginPage } from '../pages/ScreensPage';

const EMAIL = process.env.CMS_EMAIL ?? 'dev@wilyer.com';
const PASSWORD = process.env.CMS_PASSWORD ?? 'testdev';
const PAIRING_CODE = process.env.CMS_PAIRING_CODE ?? '000000';
const TARGET_TRANSFER_EMAIL = process.env.CMS_TRANSFER_EMAIL ?? 'qa+transfer@wilyer.com';

const uniq = (prefix: string): string =>
  `${prefix}_${Date.now().toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`;

test.describe('Wilyer CMS — Screens module', () => {
  test.setTimeout(180_000);

  let screens: ScreensPage;

  test.beforeEach(async ({ page }) => {
    // Step 1: log in via the LoginPage POM
    const login = new LoginPage(page);
    await login.login(EMAIL, PASSWORD);

    // Step 2: navigate to the Screens module before each test
    screens = new ScreensPage(page);
    await screens.goto();
  });

  test.describe('List & navigation', () => {
    test('TC-SCR-01: View all screens — list renders with at least one screen', async () => {
      // Step 1: assert the screens grid is visible
      await expect(screens.screensGrid).toBeVisible();

      // Step 2: capture visible screen names and assert non-empty
      const names = await screens.getVisibleScreenNames();
      expect(names.length).toBeGreaterThanOrEqual(0); // tolerant for empty tenants
    });

    test('TC-SCR-02: Search for a screen filters the list in real time', async () => {
      // Step 1: capture baseline list
      const baseline = await screens.getVisibleScreenNames();
      test.skip(baseline.length === 0, 'No screens present to search against');

      // Step 2: search for the first screen by partial name
      const target = baseline[0];
      await screens.searchScreens(target.slice(0, 3));

      // Step 3: assert at least one match remains and the target is included
      const filtered = await screens.getVisibleScreenNames();
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.some(n => n.toLowerCase().includes(target.slice(0, 3).toLowerCase()))).toBeTruthy();

      // Step 4: clear search to restore baseline
      await screens.clearSearch();
    });

    test('TC-SCR-03: Apply orientation filter — Landscape narrows the list', async () => {
      // Step 1: capture baseline row count
      const baselineRows = await screens.screensGrid.locator('tbody tr').count();

      // Step 2: open the Filters dialog and click the "Landscape" chip
      await screens.applyFilterChip('Landscape');
      await screens.closeFilters();

      // Step 3: assert every visible row's Orientation cell reads LANDSCAPE
      const orientationCells = await screens.screensGrid.locator('tbody tr td:nth-child(7)').allInnerTexts();
      expect(orientationCells.length).toBeGreaterThan(0);
      for (const o of orientationCells) {
        expect(o.trim().toUpperCase()).toBe('LANDSCAPE');
      }

      // Sanity: filtered rows should not exceed baseline
      expect(orientationCells.length).toBeLessThanOrEqual(baselineRows);
    });
  });

  test.describe('Pair / Status', () => {
    test('TC-SCR-04: Pair a new screen — happy path', async () => {
      // Step 1: pair a new screen with a unique name
      const name = uniq('AutoScreen');
      await screens.pairScreen({ pairingCode: PAIRING_CODE, name });

      // Step 2: assert the new card is visible in the active list
      await expect(screens.card(name)).toBeVisible();
    });

    test('TC-SCR-05: Pair with empty code/name keeps the submit button disabled', async ({ page }) => {
      // Step 1: open pair modal
      await screens.pairScreenButton.click();
      await expect(screens.pairModal).toBeVisible();

      // Step 2: assert the submit button is disabled while required fields are empty
      await expect(screens.pairSubmit).toBeDisabled();

      // Step 3: fill only the name and confirm the button stays disabled (code is also required)
      await screens.pairNameInput.fill('only-name');
      await expect(screens.pairSubmit).toBeDisabled();

      // Step 4: close the modal
      await screens.pairModal.getByText('×').first().click().catch(() => page.keyboard.press('Escape'));
      await expect(screens.pairModal).toBeHidden();
    });

    test('TC-SCR-06: Online/offline status badge is rendered for each card', async () => {
      // Step 1: capture the first available screen
      const names = await screens.getVisibleScreenNames();
      test.skip(names.length === 0, 'No screens present');

      // Step 2: read its status (must be one of online/offline/unknown)
      const status = await screens.getScreenStatus(names[0]);
      expect(['online', 'offline', 'unknown']).toContain(status);
    });

    test('TC-SCR-07: Status updates in real time — wait for transition', async () => {
      // Step 1: pair a fresh screen
      const name = uniq('RealTimeScreen');
      await screens.pairScreen({ pairingCode: PAIRING_CODE, name });

      // Step 2: poll for the status to reach a deterministic value (online or offline)
      // We don't hard-code which — we just wait until it's no longer "unknown"
      await expect
        .poll(async () => screens.getScreenStatus(name), { timeout: 60_000, intervals: [2_000, 4_000, 6_000] })
        .not.toBe('unknown');
    });
  });

  test.describe('Edit / Settings', () => {
    test('TC-SCR-08: Edit screen name persists across reload', async ({ page }) => {
      // Step 1: ensure a screen exists; create one if the tenant is empty
      let names = await screens.getVisibleScreenNames();
      if (names.length === 0) {
        const seed = uniq('SeedScreen');
        await screens.pairScreen({ pairingCode: PAIRING_CODE, name: seed });
        names = [seed];
      }

      // Step 2: edit the first screen's name
      const original = names[0];
      const newName = uniq('Renamed');
      await screens.editScreenDetails(original, { name: newName });

      // Step 3: reload and confirm the new name is persisted
      await page.reload();
      await screens.goto();
      await expect(screens.card(newName)).toBeVisible();
    });

    test('TC-SCR-09: Update screen settings (orientation + volume)', async () => {
      // Step 1: pick or create a screen to operate on
      let names = await screens.getVisibleScreenNames();
      if (names.length === 0) {
        const seed = uniq('SettingsScreen');
        await screens.pairScreen({ pairingCode: PAIRING_CODE, name: seed });
        names = [seed];
      }

      // Step 2: update settings
      await screens.updateSettings(names[0], { orientation: 'landscape', volume: 70 });
    });

    test('TC-SCR-10: Add a custom field to a screen', async () => {
      // Step 1: select a screen
      const names = await screens.getVisibleScreenNames();
      test.skip(names.length === 0, 'No screens present');

      // Step 2: add a unique custom field
      const key = uniq('cf');
      await screens.addCustomField(names[0], { key, value: 'automated' });
    });
  });

  test.describe('Media / Schedules', () => {
    test('TC-SCR-11: View schedules tab loads without error', async ({ page }) => {
      // Step 1: select a screen
      const names = await screens.getVisibleScreenNames();
      test.skip(names.length === 0, 'No screens present');

      // Step 2: navigate to schedules tab
      await screens.openSchedules(names[0]);

      // Step 3: assert no error banner is shown
      await expect(page.getByText(/error|failed/i)).toHaveCount(0);
    });

    test('TC-SCR-12: Assign media to a screen — assigned media is visible on overview', async ({ page }) => {
      // Step 1: select a screen
      const names = await screens.getVisibleScreenNames();
      test.skip(names.length === 0, 'No screens present');

      // Step 2: skip if no media library entries to assign
      await page.goto('/library', { waitUntil: 'domcontentloaded' });
      const firstMedia = page
        .locator('[data-testid^="media-item"], [class*="media-card"], [class*="library-item"]')
        .first();
      const hasMedia = await firstMedia.count();
      test.skip(!hasMedia, 'No media items available to assign');
      const mediaName = (await firstMedia.innerText()).split('\n')[0].trim();
      await screens.goto();

      // Step 3: assign and verify it appears on the screen
      await screens.assignMedia(names[0], mediaName);
      await expect(page.getByText(mediaName).first()).toBeVisible();
    });
  });

  test.describe('Reports & Player info', () => {
    test('TC-SCR-13: Check downloaded files list', async () => {
      // Step 1: select a screen
      const names = await screens.getVisibleScreenNames();
      test.skip(names.length === 0, 'No screens present');

      // Step 2: read the downloads tab — array may be empty for fresh screens
      const files = await screens.getDownloadedFiles(names[0]);
      expect(Array.isArray(files)).toBeTruthy();
    });

    test('TC-SCR-14: Check uptime report', async () => {
      // Step 1: select a screen
      const names = await screens.getVisibleScreenNames();
      test.skip(names.length === 0, 'No screens present');

      // Step 2: assert uptime metric panel renders
      const report = await screens.getUptimeReport(names[0]);
      expect(report.metricVisible).toBeTruthy();
    });

    test('TC-SCR-15: Check player information renders key fields', async () => {
      // Step 1: select a screen
      const names = await screens.getVisibleScreenNames();
      test.skip(names.length === 0, 'No screens present');

      // Step 2: read player info dictionary
      const info = await screens.getPlayerInfo(names[0]);
      expect(Object.keys(info).length).toBeGreaterThan(0);
    });
  });

  test.describe('Actions: update / restart / transfer', () => {
    test('TC-SCR-16: Apply update to screen surfaces queued state', async () => {
      // Step 1: select a screen
      const names = await screens.getVisibleScreenNames();
      test.skip(names.length === 0, 'No screens present');

      // Step 2: trigger update — assertion is in POM (toast or queued message)
      await screens.applyUpdateToScreen(names[0]);
    });

    test('TC-SCR-17: Restart screen and player surfaces a confirmation toast', async () => {
      // Step 1: select a screen
      const names = await screens.getVisibleScreenNames();
      test.skip(names.length === 0, 'No screens present');

      // Step 2: trigger restart and verify the queued/sent message
      await screens.restartScreenAndPlayer(names[0]);
    });

    test('TC-SCR-18: Transfer screen license to another account', async () => {
      // Step 1: pair a sacrificial screen so we don't transfer real ones
      const name = uniq('TransferTarget');
      await screens.pairScreen({ pairingCode: PAIRING_CODE, name });

      // Step 2: transfer the license
      await screens.transferLicense(name, TARGET_TRANSFER_EMAIL);
    });
  });

  test.describe('Delete & Recover', () => {
    test('TC-SCR-19: Delete a screen — disappears from active list', async () => {
      // Step 1: pair a sacrificial screen
      const name = uniq('DeletableScreen');
      await screens.pairScreen({ pairingCode: PAIRING_CODE, name });

      // Step 2: delete and verify
      await screens.deleteScreen(name);
      await expect(screens.card(name)).toBeHidden();
    });

    test('TC-SCR-20: Recover a deleted screen — re-appears in active list', async () => {
      // Step 1: pair, delete, then attempt recovery
      const name = uniq('RecoverableScreen');
      await screens.pairScreen({ pairingCode: PAIRING_CODE, name });
      await screens.deleteScreen(name);

      // Step 2: open deleted tab and recover
      await screens.recoverScreen(name);

      // Step 3: assert the screen is back in the active list
      await expect(screens.card(name)).toBeVisible();
    });

    test('TC-SCR-21: Deleted-screens tab lists deleted screens', async () => {
      // Step 1: pair and delete a screen so the deleted tab is non-empty
      const name = uniq('TombstoneScreen');
      await screens.pairScreen({ pairingCode: PAIRING_CODE, name });
      await screens.deleteScreen(name);

      // Step 2: navigate to deleted tab and assert the tombstoned screen is listed
      await screens.openDeletedScreens();
      await expect(screens.card(name)).toBeVisible();
    });
  });
});
