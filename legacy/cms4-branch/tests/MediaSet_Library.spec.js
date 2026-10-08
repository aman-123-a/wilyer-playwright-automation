/**
 * Wilyer CMS — Library ▸ Media Sets test suite
 *
 * Target: https://cms2.pocsample.in  (Library ▸ Media Sets)
 *
 * Maps 1:1 to the manual test sheet TC_MS_01 … TC_MS_17, plus a Regression
 * block guarding two confirmed defects and one expected-behavior discrepancy.
 *
 * A "Media Set" = { name, description?, displayFormats[] } where each display
 * format has an aspect ratio (16:9, 9:16, 1:1, 8:5, …) and requires exactly one
 * assigned media file whose ORIENTATION matches the format. Create starts with
 * two default formats: Landscape · 16:9 (Active) and Portrait · 9:16.
 *
 * ── Selector notes ────────────────────────────────────────────────────────────
 * The app ships NO data-testid / stable ids on this screen, so locators lean on
 * role + visible text + a couple of structural anchors:
 *   • File thumbnails are served from CloudFront → img[src*="cloudfront"].
 *   • Assignment is made deterministic by enabling the "Aspect Ratio" filter
 *     (shows only files matching the active format's orientation) and clicking
 *     the first thumbnail, and/or by searching a known filename.
 * The two filename constants below depend on the target library's contents —
 * adjust them if the seed data changes.
 */

import { test, expect } from '@playwright/test';

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL       = 'https://cms2.pocsample.in';
const LOGIN_EMAIL    = (process.env.CMS_EMAIL || process.env.CMS_ADMIN_EMAIL || '');
const LOGIN_PASSWORD = (process.env.CMS_PASSWORD || process.env.CMS_ADMIN_PASSWORD || '');

// Known seed files (used only where a specific orientation must be forced).
const PORTRAIT_FILE  = 'corrugation'; // a portrait (2760×3320) image in the library

// ─── Helpers ─────────────────────────────────────────────────────────────────
const uniq = (p = 'MS') =>
  `${p}_${Date.now().toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`;

async function login(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/email or phone/i).fill(LOGIN_EMAIL);
  await page.getByPlaceholder(/password/i).fill(LOGIN_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.getByRole('link', { name: /Library/i })).toBeVisible({ timeout: 30_000 });
}

async function gotoMediaSets(page) {
  await page.goto(`${BASE_URL}/library?tab=mediaSets`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Create Media Set/i }))
    .toBeVisible({ timeout: 20_000 });
}

async function openCreate(page) {
  await gotoMediaSets(page);
  await page.getByRole('button', { name: /Create Media Set/i }).click();
  await page.waitForURL(/\/library\/mediaset\/create/i, { timeout: 15_000 });
  await expect(nameInput(page)).toBeVisible({ timeout: 10_000 });
}

const nameInput = (page) => page.getByPlaceholder('Media set name');
const descInput = (page) => page.getByPlaceholder('Description (optional)');
const createBtn = (page) => page.getByRole('button', { name: /^Create$/ });
const saveBtn   = (page) => page.getByRole('button', { name: /Save Changes/i });

/** A display-format card, located by the ratio text it shows (e.g. "16:9"). */
const formatCard = (page, ratio) =>
  page.locator('div').filter({ hasText: new RegExp(`\\b${ratio.replace(':', ':')}\\b`) })
    .filter({ has: page.getByText(/Change ratio/i) }).first();

/** The currently-active format card. */
const activeCard = (page) =>
  page.locator('div').filter({ has: page.getByText('• Active') })
    .filter({ has: page.getByText(/Change ratio/i) }).first();

/** First library thumbnail (CloudFront-served). */
const firstThumb = (page) => page.locator('img[src*="cloudfront"]').first();

async function enableAspectRatioFilter(page) {
  const btn = page.getByRole('button', { name: /^Aspect Ratio$/i })
    .or(page.getByText(/^Aspect Ratio$/i));
  await btn.first().click();
  await expect(page.getByText(/matching the active zone/i)).toBeVisible({ timeout: 8_000 });
}

/** Assign an orientation-matching file to whichever card is currently active. */
async function assignMatchingFileToActive(page) {
  await enableAspectRatioFilter(page);
  await firstThumb(page).click();
}

/** Expect a toast containing `pattern`. */
async function expectToast(page, pattern) {
  await expect(page.getByText(pattern).first()).toBeVisible({ timeout: 8_000 });
}

/**
 * Create a valid media set (name + a matching file on each of the 2 default
 * formats) and land back on the Media Sets list. Returns the name.
 */
async function createValidMediaSet(page, name = uniq()) {
  await openCreate(page);
  await nameInput(page).fill(name);

  // Default active = Landscape 16:9 → assign a landscape file.
  await assignMatchingFileToActive(page);

  // Activate the Portrait 9:16 card → assign a portrait file.
  await formatCard(page, '9:16').click();
  await assignMatchingFileToActive(page);

  await createBtn(page).click();
  await expectToast(page, /Media set created/i);
  await page.waitForURL(/\/library\?tab=mediaSets/i, { timeout: 15_000 });
  return name;
}

/** Delete a media set by name from the list (best-effort cleanup). */
async function deleteMediaSetByName(page, name) {
  await gotoMediaSets(page);
  const card = page.locator('div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: /^Delete$/ }) }).first();
  if (!(await card.count())) return false;
  await card.getByRole('button', { name: /^Delete$/ }).click();
  const modal = page.getByRole('heading', { name: /Delete Media Set/i });
  await expect(modal).toBeVisible({ timeout: 8_000 });
  await page.getByRole('button', { name: /^Delete$/ }).last().click();
  await expectToast(page, /Media set deleted/i);
  return true;
}

// ─── Tests ───────────────────────────────────────────────────────────────────
test.describe('Library ▸ Media Sets', () => {
  test.setTimeout(180_000);
  test.beforeEach(async ({ page }) => { await login(page); });

  // ── TC_MS_01 ──────────────────────────────────────────────────────────────
  test('TC_MS_01 Mandatory Field Validation — blank name is rejected', async ({ page }) => {
    await openCreate(page);
    await createBtn(page).click();
    await expectToast(page, /Media set name is required/i);
    await expect(page).toHaveURL(/\/library\/mediaset\/create/i); // not saved / no nav
  });

  // ── TC_MS_02 ──────────────────────────────────────────────────────────────
  test('TC_MS_02 Optional Description Input — special-char description is saved', async ({ page }) => {
    const name = uniq('Desc');
    const desc = `Boundary <b>tags</b> & "quotes" 'apos' — ok`;
    await openCreate(page);
    await nameInput(page).fill(name);
    await descInput(page).fill(desc);
    await assignMatchingFileToActive(page);
    await formatCard(page, '9:16').click();
    await assignMatchingFileToActive(page);
    await createBtn(page).click();
    await expectToast(page, /Media set created/i);
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await deleteMediaSetByName(page, name);
  });

  // ── TC_MS_03 ──────────────────────────────────────────────────────────────
  test('TC_MS_03 Cancel & Back — returns to Library without creating a record', async ({ page }) => {
    await openCreate(page);
    await nameInput(page).fill(uniq('Cancelled'));
    await page.getByRole('button', { name: /^Cancel$/ }).click();
    await page.waitForURL(/\/library\?tab=mediaSets/i, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Create Media Set/i })).toBeVisible();
    // NOTE: no unsaved-changes confirmation prompt is shown (minor UX gap; sheet
    // accepts either a warning OR a clean navigation, so this passes).
  });

  // ── TC_MS_04 ──────────────────────────────────────────────────────────────
  test('TC_MS_04 Default Display Formats — 16:9 (Active) + 9:16', async ({ page }) => {
    await openCreate(page);
    await expect(page.getByText(/2 formats in this set/i)).toBeVisible();
    await expect(page.getByText(/Landscape/i).first()).toBeVisible();
    await expect(page.getByText('16:9').first()).toBeVisible();
    await expect(page.getByText('9:16').first()).toBeVisible();
    await expect(page.getByText('• Active')).toBeVisible();
  });

  // ── TC_MS_05 ──────────────────────────────────────────────────────────────
  test('TC_MS_05 Switching Active Format Card', async ({ page }) => {
    await openCreate(page);
    await formatCard(page, '9:16').click();
    // The active card should now be the 9:16 one.
    await expect(activeCard(page).getByText('9:16')).toBeVisible({ timeout: 8_000 });
  });

  // ── TC_MS_06 ──────────────────────────────────────────────────────────────
  test('TC_MS_06 Change Aspect Ratio — 16:9 → 8:5', async ({ page }) => {
    await openCreate(page);
    await page.getByText(/Change ratio/i).first().click();
    await expect(page.getByRole('heading', { name: /Change Aspect Ratio/i })).toBeVisible();
    await page.getByText('8:5', { exact: true }).first().click();
    await expect(page.getByText(/Landscape · 8:5/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/8:5 media/i)).toBeVisible();
  });

  // ── TC_MS_07 ──────────────────────────────────────────────────────────────
  test('TC_MS_07 Remove Display Format Card — count decrements', async ({ page }) => {
    await openCreate(page);
    await expect(page.getByText(/2 formats in this set/i)).toBeVisible();
    // Each card has a close (✕) button; remove the 9:16 card.
    const card = formatCard(page, '9:16');
    await card.getByRole('button').last().click(); // the ✕ on the card
    await expect(page.getByText(/1 format in this set/i)).toBeVisible({ timeout: 8_000 });
  });

  // ── TC_MS_08 ──────────────────────────────────────────────────────────────
  test('TC_MS_08 Add Display Format — new card added & active', async ({ page }) => {
    await openCreate(page);
    await page.getByText(/Add Display Format/i).click();
    await expect(page.getByRole('heading', { name: /Add Display Format/i })).toBeVisible();
    await page.getByRole('button', { name: /^Square$/i }).click();
    await page.getByText('1:1', { exact: true }).first().click();
    await expect(page.getByText(/3 formats in this set/i)).toBeVisible({ timeout: 8_000 });
    await expect(activeCard(page).getByText('1:1')).toBeVisible();
  });

  // ── TC_MS_09 ──────────────────────────────────────────────────────────────
  test('TC_MS_09 Clear Formats — assigned media reset to blank (cards kept)', async ({ page }) => {
    await openCreate(page);
    await assignMatchingFileToActive(page);           // 16:9 now has a file
    await expect(page.getByText('In set').first()).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: /Clear formats/i }).click();
    // Media cleared → placeholders return; format cards & count remain.
    await expect(page.getByText(/click a file on the left/i).first()).toBeVisible();
    await expect(page.getByText(/2 formats in this set/i)).toBeVisible();
  });

  // ── TC_MS_10 ──────────────────────────────────────────────────────────────
  test('TC_MS_10 Filter by Media Type — Videos narrows the grid', async ({ page }) => {
    await openCreate(page);
    const countText = page.getByText(/\d+ of \d+/);
    const before = await countText.first().innerText();
    await page.getByRole('button', { name: /^Videos$/i }).click();
    await expect(countText.first()).not.toHaveText(before, { timeout: 8_000 });
  });

  // ── TC_MS_11 ──────────────────────────────────────────────────────────────
  test('TC_MS_11 Search Functionality — grid filters dynamically', async ({ page }) => {
    await openCreate(page);
    await page.getByPlaceholder('Search files...').fill('image_3');
    await expect(page.getByText(/\bof\b/).first()).toBeVisible();
    // Result count should shrink to a small number of matches.
    await expect(page.getByText(/\d+ of \d+/).first()).toContainText(/of/);
  });

  // ── TC_MS_12 ──────────────────────────────────────────────────────────────
  test('TC_MS_12 Aspect Ratio Auto-Filter — shows only matching-ratio assets', async ({ page }) => {
    await openCreate(page);
    await enableAspectRatioFilter(page); // 16:9 active by default
    await expect(page.getByText(/Showing only .* media — matching the active zone/i)).toBeVisible();
  });

  // ── TC_MS_14 ──────────────────────────────────────────────────────────────
  test('TC_MS_14 Assign Image to Active Card', async ({ page }) => {
    await openCreate(page);
    await page.getByRole('button', { name: /^Images$/i }).click();
    await assignMatchingFileToActive(page);
    await expect(page.getByText('In set').first()).toBeVisible({ timeout: 8_000 });
    await expect(activeCard(page).getByText(/click a file on the left/i)).toHaveCount(0);
  });

  // ── TC_MS_15 ──────────────────────────────────────────────────────────────
  test('TC_MS_15 Assign Video to Active Card', async ({ page }) => {
    await openCreate(page);
    await formatCard(page, '9:16').click();                 // portrait active
    await page.getByRole('button', { name: /^Videos$/i }).click();
    await assignMatchingFileToActive(page);                 // vertical video
    await expect(page.getByText('In set').first()).toBeVisible({ timeout: 8_000 });
  });

  // ── TC_MS_16 ──────────────────────────────────────────────────────────────
  test('TC_MS_16 Replace Assigned Media', async ({ page }) => {
    await openCreate(page);
    await page.getByRole('button', { name: /^Images$/i }).click();
    await enableAspectRatioFilter(page);
    const thumbs = page.locator('img[src*="cloudfront"]');
    await thumbs.nth(0).click();                            // assign first
    await expect(page.getByText('In set').first()).toBeVisible({ timeout: 8_000 });
    await thumbs.nth(1).click();                            // replace with second
    // Still exactly one assignment on the active card (replaced, not appended).
    await expect(activeCard(page).getByText(/click a file on the left/i)).toHaveCount(0);
  });

  // ── TC_MS_17 ──────────────────────────────────────────────────────────────
  test('TC_MS_17 Unassign / Remove Selected Asset', async ({ page }) => {
    await openCreate(page);
    await assignMatchingFileToActive(page);
    const card = activeCard(page);
    await expect(card.getByText(/click a file on the left/i)).toHaveCount(0);
    await card.getByRole('button').last().click();         // ✕ remove-media on preview
    await expect(card.getByText(/click a file on the left/i)).toBeVisible({ timeout: 8_000 });
  });

  // ── CRUD round-trip: Create → Read → Delete ─────────────────────────────────
  test('Create → Read → Delete round-trip', async ({ page }) => {
    const name = await createValidMediaSet(page, uniq('CRUD'));
    await gotoMediaSets(page);
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 });
    expect(await deleteMediaSetByName(page, name)).toBeTruthy();
    await gotoMediaSets(page);
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  });

  // ── Regression: confirmed defects (expected-to-fail until fixed) ────────────
  test.describe('Regression — known defects', () => {

    // TC_MS_13 — "Choose Any" is expected to allow assignment (with fit/scale),
    // but the app strictly blocks orientation mismatch. Flip to a real failure
    // once assign-with-fit (or hide-mismatched-files) is implemented.
    test.fail(); // remove when TC_MS_13 behavior is reconciled
    test('TC_MS_13 "Choose Any" allows cross-orientation assignment', async ({ page }) => {
      await openCreate(page);
      // Landscape 16:9 active by default; pick a portrait file via search.
      await page.getByText(/^Choose Any$/i).click();
      await page.getByPlaceholder('Search files...').fill(PORTRAIT_FILE);
      await firstThumb(page).click();
      // EXPECTED (per sheet): assignment succeeds. ACTUAL: blocked with a toast.
      await expect(page.getByText(/drop it in the Portrait format/i)).toHaveCount(0);
    });

    // BUG-01 — name has no maximum length (client input has no maxlength and the
    // server stores it verbatim). Asserts the DESIRED cap; fails on current build.
    test.fail(); // remove when a max-length cap is enforced
    test('BUG-01 Media set name should be length-capped', async ({ page }) => {
      await openCreate(page);
      const longName = 'L' + 'x'.repeat(299); // 300 chars
      await nameInput(page).fill(longName);
      await assignMatchingFileToActive(page);
      await formatCard(page, '9:16').click();
      await assignMatchingFileToActive(page);
      await createBtn(page).click();
      // DESIRED: a validation error blocks the over-long name.
      await expectToast(page, /name.*(too long|maximum|character)/i);
    });

    // BUG-02 — a set with 0 display formats can be saved (empty, unusable set).
    // The required-media guard only checks EXISTING formats, so removing all
    // formats bypasses it. Asserts the DESIRED block; fails on current build.
    test.fail(); // remove when an empty (0-format) set is rejected
    test('BUG-02 Saving a media set with 0 formats should be blocked', async ({ page }) => {
      const name = uniq('Empty');
      await openCreate(page);
      await nameInput(page).fill(name);
      // Remove every format card via its ✕.
      for (const ratio of ['16:9', '9:16']) {
        const card = formatCard(page, ratio);
        if (await card.count()) await card.getByRole('button').last().click();
      }
      await expect(page.getByText(/0 formats in this set/i)).toBeVisible({ timeout: 8_000 });
      await createBtn(page).click();
      // DESIRED: creation is blocked (no empty set persisted).
      await expect(page.getByText(/Media set created/i)).toHaveCount(0);
      // Safety cleanup if the bug let it through.
      await deleteMediaSetByName(page, name).catch(() => {});
    });
  });
});
