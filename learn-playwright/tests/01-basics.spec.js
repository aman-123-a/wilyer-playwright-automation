// ─────────────────────────────────────────────────────────────────────────────
// LESSON 1 — the fundamentals: navigation, locators, and web-first assertions.
// These tests start ALREADY logged in (thanks to auth.setup.js + storageState).
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect } from '@playwright/test';

test.describe('Lesson 1 · basics', () => {
  test('the session is authenticated and the Library loads', async ({ page }) => {
    await page.goto('/library');

    // getByRole is the preferred locator — stable and accessible.
    await expect(page.getByRole('link', { name: /Library/ })).toBeVisible();

    // A web-first assertion auto-retries until it passes or times out.
    await expect(page.getByText('dev@wilyer.com')).toBeVisible();
  });

  test('the main nav exposes the expected sections', async ({ page }) => {
    await page.goto('/library');
    for (const section of ['Dashboard', 'Screens', 'Library', 'Playlists']) {
      await expect(page.getByRole('link', { name: new RegExp(section) })).toBeVisible();
    }
  });
});
