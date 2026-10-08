/**
 * Wilyer CMS — Media Sets UI/UX & Accessibility regression suite
 *
 * Target: https://cms2.pocsample.in  (login via .env credentials)
 *
 * These tests encode the usability/accessibility findings from
 * reports/mediaset-ux-report-20260709.md so regressions are caught
 * automatically. Each test maps to a UX finding ID.
 *
 * NOTE: several assertions describe the *desired* behaviour and will
 * FAIL against the current build — that is intentional. They are the
 * executable spec for the fixes. Grep for `EXPECT-FIX` to find them.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'https://cms2.pocsample.in';
const EMAIL    = (process.env.CMS_EMAIL || process.env.CMS_ADMIN_EMAIL || '');
const PASSWORD = (process.env.CMS_PASSWORD || process.env.CMS_ADMIN_PASSWORD || '');

const uniq = (p = 'UX') => `${p}_${Date.now().toString().slice(-6)}`;

async function login(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /email or phone/i }).fill(EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  // Sidebar Library link confirms auth
  await expect(page.getByRole('link', { name: /^Library$/i }))
    .toBeVisible({ timeout: 30_000 });
}

async function gotoMediaSets(page) {
  await page.goto(`${BASE_URL}/library?tab=mediaSets`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/ALL MEDIA SETS/i)).toBeVisible({ timeout: 20_000 });
}

async function gotoCreate(page) {
  await page.goto(`${BASE_URL}/library/mediaset/create`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/Display Formats/i)).toBeVisible({ timeout: 20_000 });
}

test.describe('Media Sets — UI/UX & Accessibility', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ── UX-01: card action icons must have accessible names ──────────────────
  test('UX-01: card action icons expose an accessible name (aria-label/title/text) [EXPECT-FIX]', async ({ page }) => {
    await gotoMediaSets(page);
    // Locate the first card by its Delete button, then inspect the sibling icon buttons.
    const del = page.getByRole('button', { name: /^Delete$/ }).first();
    await expect(del).toBeVisible({ timeout: 15_000 });

    const unnamed = await page.evaluate(() => {
      const del = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Delete');
      let card = del;
      for (let i = 0; i < 6; i++) { card = card.parentElement; if (card.querySelector('img, canvas, video') || /No files/.test(card.textContent)) break; }
      const btns = [...card.querySelectorAll('button')].filter(b => b.innerText.trim() === '');
      return btns.filter(b => !b.getAttribute('aria-label') && !b.title).length;
    });

    // Every icon-only action button should carry a name. Currently they don't.
    expect(unnamed, 'icon-only action buttons must have aria-label or title').toBe(0);
  });

  // ── UX-02: empty-name submit must anchor the error to the field ──────────
  test('UX-02: empty-name Create marks the field invalid & focuses it [EXPECT-FIX]', async ({ page }) => {
    await gotoCreate(page);
    await page.getByRole('button', { name: /^Create$/ }).click();

    // A toast is acceptable as a secondary cue, but the field itself must signal the error.
    const nameInput = page.locator('input[placeholder="Media set name"]');
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true', { timeout: 5_000 });
    await expect(nameInput).toBeFocused();
  });

  // Baseline (passes today): the error is at least surfaced somewhere.
  test('UX-02b: empty-name Create surfaces a "name is required" message', async ({ page }) => {
    await gotoCreate(page);
    await page.getByRole('button', { name: /^Create$/ }).click();
    await expect(page.getByText(/name is required/i)).toBeVisible({ timeout: 5_000 });
    // And it must NOT have navigated / created anything.
    await expect(page).toHaveURL(/\/library\/mediaset\/create/);
  });

  // ── UX-04: required indicator on the Name field ──────────────────────────
  test('UX-04: Name field is marked required (aria-required or visible *) [EXPECT-FIX]', async ({ page }) => {
    await gotoCreate(page);
    const nameInput = page.locator('input[placeholder="Media set name"]');
    const ariaRequired = await nameInput.getAttribute('aria-required');
    const requiredAttr = await nameInput.getAttribute('required');
    // Or a visible asterisk near the Name label:
    const asterisk = await page.getByText(/name/i).first()
      .evaluate(el => /\*/.test(el.closest('div,label,section')?.textContent || '')).catch(() => false);
    expect(ariaRequired === 'true' || requiredAttr !== null || asterisk,
      'Name field should be marked required for users & assistive tech').toBeTruthy();
  });

  // ── UX-08: Name field should have a sane max length ──────────────────────
  test('UX-08: Name input enforces a max length [EXPECT-FIX]', async ({ page }) => {
    await gotoCreate(page);
    const maxLen = await page.locator('input[placeholder="Media set name"]').evaluate(i => i.maxLength);
    // Currently -1 (no cap). A sane cap is 100–255.
    expect(maxLen, 'Name should have a maxlength cap (100–255)').toBeGreaterThan(0);
    expect(maxLen).toBeLessThanOrEqual(255);
  });

  // ── UX-03: format header should not visually overlap at laptop widths ────
  test('UX-03: format-card header labels do not overlap at 1024px [EXPECT-FIX]', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await gotoCreate(page);

    const overlap = await page.evaluate(() => {
      const change = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /Change ratio/.test(e.textContent));
      if (!change) return false;
      let header = change;
      for (let i = 0; i < 4; i++) { header = header.parentElement; if (/Landscape/.test(header.textContent) && /Change ratio/.test(header.textContent)) break; }
      const kids = [...header.children].map(c => c.getBoundingClientRect());
      // any two siblings horizontally overlapping = layout collision
      for (let a = 0; a < kids.length; a++) for (let b = a + 1; b < kids.length; b++) {
        const A = kids[a], B = kids[b];
        if (A.left < B.right && B.left < A.right) return true;
      }
      return false;
    });
    expect(overlap, 'format header children should not overlap at 1024px').toBe(false);
  });
});
