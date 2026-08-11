import { test } from '@playwright/test';

// Seed for live exploratory testing of the playlist layout editor
// (Widgets + Sequences tabs). Reuses the cached admin session.
test.use({ storageState: '.auth/admin.json' });

test.describe('seed', () => {
  test('open playlist editor', async ({ page }) => {
    await page.goto('https://cms.wilyersignage.com/playlist-settings/6a16829f2298182018d2754b');
    await page.waitForLoadState('domcontentloaded');
  });
});
