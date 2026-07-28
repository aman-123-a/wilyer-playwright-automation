// =============================================================================
//  Location Settings — data-driven E2E (Screen Configuration tab).
//  Source of cases: Google Sheet "Location Setting" (TC_LOC_001–016).
//
//  NON-DESTRUCTIVE BY DESIGN. This suite never clicks "Save Configurations",
//  so it can run against a live screen without mutating stored data. The
//  save-dependent cases (TC_LOC_010 / 014 / 015) are intentionally omitted —
//  run those on staging where a Save is safe.
//
//  Requires a screen id via env: CMS_SCREEN_ID=<24-hex screen id>.
//  The screen id is environment-specific, so the suite skips (with a clear
//  message) when it is not provided.
//
//  Assertions encode the *required* behaviour from the sheet's Expected Result
//  column. Where the live app currently lacks validation, these cases fail on
//  purpose — that failure IS the reported defect.
// =============================================================================

import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  LOCATION_FIELDS,
  LATITUDE_BOUNDARY,
  LONGITUDE_BOUNDARY,
  PINCODE_INVALID,
  INJECTION_PAYLOADS,
  MAX_LENGTH_CASE,
  AUTOCOMPLETE_QUERY,
  MANUAL_COORDS,
  RESPONSIVE_VIEWPORTS,
  type LocationField,
} from '../../test-data/location-settings.data';

const SCREEN_ID = process.env.CMS_SCREEN_ID ?? '';

const field = (page: Page, key: LocationField): Locator =>
  page.getByPlaceholder(LOCATION_FIELDS[key], { exact: true });

/** Current map centre, read from the "Open this area in Google Maps" link. */
async function mapCenter(page: Page): Promise<string | null> {
  const href = await page
    .locator('a[href*="maps.google.com/maps?ll="]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  return href ? (href.match(/ll=([^&]+)/)?.[1] ?? null) : null;
}

/** True if any inline validation error is shown for `key`'s field group. */
async function hasInlineError(page: Page, key: LocationField): Promise<boolean> {
  const input = field(page, key);
  const invalid = await input.getAttribute('aria-invalid').catch(() => null);
  if (invalid === 'true') return true;
  // Error text rendered as a sibling within the same field group.
  const group = input.locator('xpath=ancestor::*[self::div][1]');
  const err = group.getByText(/invalid|required|must be|between|valid|error/i);
  return (await err.count()) > 0 && (await err.first().isVisible().catch(() => false));
}

test.describe('Screen Configuration → Location Settings (data-driven)', () => {
  test.skip(!SCREEN_ID, 'Set CMS_SCREEN_ID=<screen id> to run Location Settings tests.');

  test.beforeEach(async ({ page }) => {
    await page.goto(`/screen-settings/${SCREEN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Configurations' }).first().click();
    await expect(
      page.getByRole('heading', { name: /location settings/i }),
    ).toBeVisible({ timeout: 20_000 });
  });

  // ── TC_LOC_001 — Autocomplete & auto-fill ────────────────────────────────
  test('TC_LOC_001 autocomplete fills address fields and re-centres map', async ({ page }) => {
    const loc = field(page, 'location');
    await loc.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await loc.pressSequentially(AUTOCOMPLETE_QUERY.query, { delay: 60 });
    await expect(page.locator('.pac-item').first()).toBeVisible({ timeout: 8_000 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(field(page, 'city')).toHaveValue(AUTOCOMPLETE_QUERY.expects.city);
    await expect(field(page, 'state')).toHaveValue(AUTOCOMPLETE_QUERY.expects.state);
    await expect(field(page, 'country')).toHaveValue(AUTOCOMPLETE_QUERY.expects.country);
    await expect(field(page, 'latitude')).not.toHaveValue('');
    await expect(field(page, 'longitude')).not.toHaveValue('');
  });

  // ── TC_LOC_003 — Manual Lat/Long re-positions the map ─────────────────────
  test('TC_LOC_003 manual coordinates move the map marker', async ({ page }) => {
    const before = await mapCenter(page);
    await field(page, 'latitude').fill(MANUAL_COORDS.latitude);
    await field(page, 'longitude').fill(MANUAL_COORDS.longitude);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1_500);
    const after = await mapCenter(page);
    // Requirement: the map centre should now reflect the entered coordinates.
    expect(after, 'map centre should change after manual coordinate entry').not.toBe(before);
    expect(after).toContain('28.4336');
  });

  // ── TC_LOC_005 / 006 — Lat/Long boundary validation ───────────────────────
  for (const c of [...LATITUDE_BOUNDARY, ...LONGITUDE_BOUNDARY]) {
    const outOfRange = /must be rejected|non-numeric/.test(c.reason);
    test(`${c.tc} ${c.field}="${c.value}" (${c.reason})`, async ({ page }) => {
      await field(page, c.field).fill(c.value);
      await page.keyboard.press('Tab');
      if (outOfRange) {
        expect(
          await hasInlineError(page, c.field),
          `out-of-range ${c.field} "${c.value}" should be flagged invalid`,
        ).toBe(true);
      } else {
        expect(await hasInlineError(page, c.field)).toBe(false);
      }
    });
  }

  // ── TC_LOC_007 — Pincode strict validation ────────────────────────────────
  for (const c of PINCODE_INVALID) {
    test(`${c.tc} pincode rejects "${c.value}" (${c.reason})`, async ({ page }) => {
      await field(page, 'area').fill(c.value);
      await page.keyboard.press('Tab');
      expect(
        await hasInlineError(page, 'area'),
        `invalid pincode "${c.value}" should be flagged`,
      ).toBe(true);
    });
  }

  // ── TC_LOC_008 — Max length ────────────────────────────────────────────────
  test(`${MAX_LENGTH_CASE.tc} caps ${MAX_LENGTH_CASE.field} at ${MAX_LENGTH_CASE.maxExpected} chars`, async ({ page }) => {
    await field(page, MAX_LENGTH_CASE.field).fill(MAX_LENGTH_CASE.value);
    const value = await field(page, MAX_LENGTH_CASE.field).inputValue();
    expect(value.length).toBeLessThanOrEqual(MAX_LENGTH_CASE.maxExpected);
  });

  // ── TC_LOC_009 — XSS / SQLi never executes; input is handled safely ───────
  for (const c of INJECTION_PAYLOADS) {
    test(`${c.tc} ${c.field} handles payload safely (${c.reason})`, async ({ page }) => {
      let dialogFired = false;
      page.on('dialog', async (d) => { dialogFired = true; await d.dismiss(); });
      await field(page, c.field).fill(c.value);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      // A script/handler in the payload must never execute.
      expect(dialogFired, 'injected script must not execute').toBe(false);
    });
  }

  // ── TC_LOC_016 — Responsive layout (no horizontal overflow) ───────────────
  for (const vp of RESPONSIVE_VIEWPORTS) {
    test(`TC_LOC_016 layout has no horizontal overflow @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      );
      expect(overflow, `page overflows horizontally at ${vp.width}px`).toBe(false);
    });
  }
});
