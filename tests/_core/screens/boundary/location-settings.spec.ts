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
//
//  All selectors and page mechanics live in pages/LocationSettingsPage.ts; this
//  file is cases and expectations only.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import {
  LATITUDE_BOUNDARY,
  LONGITUDE_BOUNDARY,
  PINCODE_INVALID,
  INJECTION_PAYLOADS,
  MAX_LENGTH_CASE,
  AUTOCOMPLETE_QUERY,
  MANUAL_COORDS,
  RESPONSIVE_VIEWPORTS,
} from '../../../../test-data/location-settings.data';

const SCREEN_ID = process.env.CMS_SCREEN_ID ?? '';

test.describe('Screen Configuration → Location Settings (data-driven)', () => {
  test.skip(!SCREEN_ID, 'Set CMS_SCREEN_ID=<screen id> to run Location Settings tests.');

  test.beforeEach(async ({ locationSettingsPage }) => {
    await locationSettingsPage.open(SCREEN_ID);
  });

  // ── TC_LOC_001 — Autocomplete & auto-fill ────────────────────────────────
  test('TC_LOC_001 autocomplete fills address fields and re-centres map', async ({
    locationSettingsPage,
  }) => {
    await locationSettingsPage.chooseFirstSuggestion(AUTOCOMPLETE_QUERY.query);

    await expect(locationSettingsPage.field('city')).toHaveValue(AUTOCOMPLETE_QUERY.expects.city);
    await expect(locationSettingsPage.field('state')).toHaveValue(AUTOCOMPLETE_QUERY.expects.state);
    await expect(locationSettingsPage.field('country')).toHaveValue(
      AUTOCOMPLETE_QUERY.expects.country,
    );
    await expect(locationSettingsPage.field('latitude')).not.toHaveValue('');
    await expect(locationSettingsPage.field('longitude')).not.toHaveValue('');
  });

  // ── TC_LOC_003 — Manual Lat/Long re-positions the map ─────────────────────
  test('TC_LOC_003 manual coordinates move the map marker', async ({ locationSettingsPage }) => {
    const before = await locationSettingsPage.mapCenter();
    await locationSettingsPage.setCoordinates(MANUAL_COORDS.latitude, MANUAL_COORDS.longitude);
    const after = await locationSettingsPage.mapCenter();
    // Requirement: the map centre should now reflect the entered coordinates.
    expect(after, 'map centre should change after manual coordinate entry').not.toBe(before);
    expect(after).toContain('28.4336');
  });

  // ── TC_LOC_005 / 006 — Lat/Long boundary validation ───────────────────────
  for (const c of [...LATITUDE_BOUNDARY, ...LONGITUDE_BOUNDARY]) {
    const outOfRange = /must be rejected|non-numeric/.test(c.reason);

    test(`${c.tc} ${c.field}="${c.value}" (${c.reason})`, async ({ locationSettingsPage }) => {
      await locationSettingsPage.fillAndBlur(c.field, c.value);
      if (outOfRange) {
        expect(
          await locationSettingsPage.hasInlineError(c.field),
          `out-of-range ${c.field} "${c.value}" should be flagged invalid`,
        ).toBe(true);
      } else {
        expect(await locationSettingsPage.hasInlineError(c.field)).toBe(false);
      }
    });
  }

  // ── TC_LOC_007 — Pincode strict validation ────────────────────────────────
  for (const c of PINCODE_INVALID) {
    test(`${c.tc} pincode rejects "${c.value}" (${c.reason})`, async ({ locationSettingsPage }) => {
      await locationSettingsPage.fillAndBlur('area', c.value);
      expect(
        await locationSettingsPage.hasInlineError('area'),
        `invalid pincode "${c.value}" should be flagged`,
      ).toBe(true);
    });
  }

  // ── TC_LOC_008 — Max length ────────────────────────────────────────────────
  test(`${MAX_LENGTH_CASE.tc} caps ${MAX_LENGTH_CASE.field} at ${MAX_LENGTH_CASE.maxExpected} chars`, async ({
    locationSettingsPage,
  }) => {
    await locationSettingsPage.fillField(MAX_LENGTH_CASE.field, MAX_LENGTH_CASE.value);
    const value = await locationSettingsPage.fieldValue(MAX_LENGTH_CASE.field);
    expect(value.length).toBeLessThanOrEqual(MAX_LENGTH_CASE.maxExpected);
  });

  // ── TC_LOC_009 — XSS / SQLi never executes; input is handled safely ───────
  for (const c of INJECTION_PAYLOADS) {
    test(`${c.tc} ${c.field} handles payload safely (${c.reason})`, async ({
      locationSettingsPage,
    }) => {
      const executed = await locationSettingsPage.payloadExecutes(c.field, c.value);
      expect(executed, 'injected script must not execute').toBe(false);
    });
  }

  // ── TC_LOC_016 — Responsive layout (no horizontal overflow) ───────────────
  for (const vp of RESPONSIVE_VIEWPORTS) {
    test(`TC_LOC_016 layout has no horizontal overflow @ ${vp.name}`, async ({
      locationSettingsPage,
    }) => {
      const overflow = await locationSettingsPage.overflowsAt(vp.width, vp.height);
      expect(overflow, `page overflows horizontally at ${vp.width}px`).toBe(false);
    });
  }
});
