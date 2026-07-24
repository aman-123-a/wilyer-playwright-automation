// ─────────────────────────────────────────────────────────────────────────────
// LESSON 2 — driving the UI: the create form, negative validation, and search.
// Teaches: locators, negative testing, waitForResponse, and reading the DOM.
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect } from '@playwright/test';
import { MediaSetsPage } from '../pages/MediaSetsPage.js';

test.describe('Lesson 2 · Media Sets UI', () => {
  test('the create form renders its key controls', async ({ page }) => {
    const ms = new MediaSetsPage(page);
    await ms.gotoCreate();

    await expect(ms.nameInput).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
    // The form seeds two default display formats.
    await expect(page.getByText('Landscape · 16:9')).toBeVisible();
    await expect(page.getByText('Portrait · 9:16')).toBeVisible();
  });

  test('creating with an empty name is rejected (negative test)', async ({ page }) => {
    const ms = new MediaSetsPage(page);
    await ms.gotoCreate();

    // Watch the API: a valid submit would POST /mediaSet/create. An empty name
    // should be blocked client-side (400) — we assert we do NOT get a 201.
    const createResp = page
      .waitForResponse(r => r.url().includes('/mediaSet/create'), { timeout: 4000 })
      .catch(() => null);

    await ms.submitCreate.click();
    const resp = await createResp;

    // Either the request never fired (client-blocked) or it came back non-201.
    expect(resp === null || resp.status() !== 201).toBeTruthy();
    // And we're still on the create page.
    await expect(page).toHaveURL(/\/library\/mediaset\/create/);
  });

  test('search shows a clean empty state, and echoes the query SAFELY', async ({ page }) => {
    const ms = new MediaSetsPage(page);
    await ms.gotoMediaSetsTab();

    // An HTML/XSS payload — a correct app renders it as text, not markup.
    await ms.search('<b>xss</b>zzz');

    const emptyState = page.getByText(/No media sets match/);
    await expect(emptyState).toBeVisible();

    // Assert the payload was ESCAPED (no injected <b> element).
    const injected = await emptyState.locator('b').count();
    expect(injected).toBe(0);
  });
});
