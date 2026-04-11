import { test, expect } from '@playwright/test';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL       = 'https://cms.pocsample.in/';
const LOGIN_EMAIL    = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';

// Unique widget name so reruns don't clash
const STAMP          = Date.now();
const WIDGET_NAME    = `AutoText_${STAMP}`;
const WIDGET_NAME_UPDATED = `${WIDGET_NAME}_edited`;
const WIDGET_TEXT    = 'Hello from Playwright';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /email|phone/i }).fill(LOGIN_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(LOGIN_PASSWORD);
  const loginBtn = page.getByRole('button', { name: /log in/i });
  await loginBtn.click();
  await expect(loginBtn).toBeHidden({ timeout: 20_000 });
}

async function openWidgetsTextType(page) {
  await page.goto(`${BASE_URL}library`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: /^widgets$/i }).click();
  // Click the Text widget type card (heading "Text (N)")
  await page.getByRole('heading', { name: /^Text \(\d+\)$/ }).click();
  await expect(page.getByRole('button', { name: /add new/i })).toBeVisible({ timeout: 15_000 });
}

// Locator for the inner row container of a widget by its exact name.
// The row is structured as: <div>[id-text, <p>NAME</p>, <div>[edit-btn, delete-btn]]</div>
// so the paragraph's parent is the row-inner containing both icon buttons.
function widgetRowInner(page, name) {
  return page
    .locator('p', { hasText: new RegExp(`^${name}$`) })
    .locator('xpath=..');
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Library → Widgets — CRUD', () => {

  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
    await openWidgetsTextType(page);
  });

  // ── CREATE ──────────────────────────────────────────────────────────────────
  test('Create: add a new Text widget', async ({ page }) => {
    await page.getByRole('button', { name: /add new/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('heading', { name: /^text$/i })).toBeVisible();

    // Widget Name + Text fields (order: name is first textbox, body is second)
    const textboxes = dialog.getByRole('textbox');
    await textboxes.nth(0).fill(WIDGET_NAME);
    await textboxes.nth(1).fill(WIDGET_TEXT);

    await dialog.getByRole('button', { name: /^save$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // Verify the new widget name is visible in the list
    await expect(
      page.locator('p', { hasText: new RegExp(`^${WIDGET_NAME}$`) }).first()
    ).toBeVisible({ timeout: 15_000 });

    console.log(`✅ Created widget: ${WIDGET_NAME}`);
  });

  // ── READ ────────────────────────────────────────────────────────────────────
  test('Read: search finds the created widget', async ({ page }) => {
    const search = page.getByRole('textbox', { name: /^search/i }).last();
    await search.fill(WIDGET_NAME);
    await page.waitForTimeout(1000);

    await expect(
      page.locator('p', { hasText: new RegExp(`^${WIDGET_NAME}$`) }).first()
    ).toBeVisible({ timeout: 10_000 });

    console.log(`✅ Found widget via search: ${WIDGET_NAME}`);
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  test('Update: rename the created widget', async ({ page }) => {
    const search = page.getByRole('textbox', { name: /^search/i }).last();
    await search.fill(WIDGET_NAME);
    await page.waitForTimeout(1000);

    // Click edit (first icon button) within the row of our widget
    const row = widgetRow(page, WIDGET_NAME);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const nameBox = dialog.getByRole('textbox').nth(0);
    await nameBox.fill(WIDGET_NAME_UPDATED);
    await dialog.getByRole('button', { name: /^save$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // Confirm updated name shows in list
    await search.fill(WIDGET_NAME_UPDATED);
    await page.waitForTimeout(1000);
    await expect(
      page.locator('p', { hasText: new RegExp(`^${WIDGET_NAME_UPDATED}$`) }).first()
    ).toBeVisible({ timeout: 10_000 });

    console.log(`✅ Renamed widget → ${WIDGET_NAME_UPDATED}`);
  });

  // ── DELETE ──────────────────────────────────────────────────────────────────
  test('Delete: remove the created widget', async ({ page }) => {
    // Auto-accept any native confirm() dialog that may appear on delete
    page.on('dialog', (d) => d.accept().catch(() => {}));

    const search = page.getByRole('textbox', { name: /^search/i }).last();
    await search.fill(WIDGET_NAME_UPDATED);
    await page.waitForTimeout(1000);

    const row = widgetRow(page, WIDGET_NAME_UPDATED);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Delete is the second icon button in the row
    await row.getByRole('button').nth(1).click();

    // Best-effort: click any in-page confirm button if one appears
    const confirmBtn = page.getByRole('button', { name: /^(yes|delete|confirm|ok)$/i });
    if (await confirmBtn.first().isVisible().catch(() => false)) {
      await confirmBtn.first().click();
    }

    await page.waitForTimeout(2000);

    // Re-search and assert the widget is gone
    await search.fill(WIDGET_NAME_UPDATED);
    await page.waitForTimeout(1000);
    await expect(
      page.locator('p', { hasText: new RegExp(`^${WIDGET_NAME_UPDATED}$`) })
    ).toHaveCount(0, { timeout: 10_000 });

    console.log(`✅ Deleted widget: ${WIDGET_NAME_UPDATED}`);
  });

});
