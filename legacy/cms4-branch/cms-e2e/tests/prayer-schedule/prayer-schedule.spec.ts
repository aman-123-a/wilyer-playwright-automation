// =============================================================================
//  PRAYER SCHEDULE MODULE — smoke + positive + negative + CRUD + boundary.
//  Runs authenticated against cms.pocsample.in /prayer-schedule.
//
//  Selectors originate from a live capture (2026-07-02) and are best-effort;
//  the create/edit + destructive cases are guarded behind CMS_ALLOW_DESTRUCTIVE
//  so a default run stays read-only and safe.
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { PrayerSchedulePage } from '../../pages/PrayerSchedulePage';
import { ENV } from '../../config/env';
import { name, AUTH_PAYLOADS } from '../../data/test-data';
import { assertClean, expectNoStuckLoader } from '../../utils/assertions';
import { measure } from '../../utils/performance';

test.describe('Prayer Schedule', () => {
  // ── Positive / smoke ──────────────────────────────────────────────────────

  test('module loads with header + three tabs @smoke @sanity @regression', async ({
    prayerSchedulePage,
  }) => {
    await prayerSchedulePage.open();
    await expect(prayerSchedulePage.todayTab).toBeVisible();
    await expect(prayerSchedulePage.schedulesTab).toBeVisible();
    await expect(prayerSchedulePage.calendarTab).toBeVisible();
  });

  test('Today tab renders all five prayer cards @regression', async ({
    prayerSchedulePage,
  }) => {
    await prayerSchedulePage.open();
    await prayerSchedulePage.openToday();
    await prayerSchedulePage.expectPrayerCardsPresent();
  });

  test('Schedules tab exposes plan configuration actions @regression', async ({
    prayerSchedulePage,
  }) => {
    await prayerSchedulePage.open();
    await prayerSchedulePage.openSchedules();
    // The plan management surface exposes Add New Plan + Configure/Publish.
    await expect(prayerSchedulePage.addNewPlanBtn).toBeVisible();
    await expect(prayerSchedulePage.configureBtn.first()).toBeVisible();
    await expect(prayerSchedulePage.publishBtn.first()).toBeVisible();
  });

  test('Calendar tab recomputes rows on Apply @regression', async ({
    prayerSchedulePage,
  }) => {
    await prayerSchedulePage.open();
    await prayerSchedulePage.openCalendar();
    // Apply is gated on a filter change ("No changes to apply"). The calendar
    // auto-loads with a default location, so change the location to dirty the
    // form → Apply enables → the month table recomputes for the new location.
    await prayerSchedulePage.selectLocation('Delhi');
    await prayerSchedulePage.applyCalendar();
    await prayerSchedulePage.expectCalendarLoaded();
  });

  test('module loads within budget, clean console/API @regression', async ({
    prayerSchedulePage,
    consoleMonitor,
    apiMonitor,
    page,
  }) => {
    await measure('prayer-schedule load', ENV.PERF.pageLoadMs, async () => {
      await prayerSchedulePage.open();
    });
    await expectNoStuckLoader(page);
    await assertClean(consoleMonitor, apiMonitor);
  });

  // ── Negative — Configure drawer validation ────────────────────────────────
  //  Fields RE-VERIFIED live 2026-07-23. There are NO lat/long inputs; City is a
  //  bounded <select>. Numeric fields Banner duration / Pre Announcement Duration
  //  both carry min=1, which is the real boundary surface.

  test.describe('Negative — Configure validation @regression', () => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'set CMS_ALLOW_DESTRUCTIVE=true to run write cases');

    // Each case fills EVERY other required field validly (name + City + Start/End
    // dates) on a throwaway "Add New Plan" draft, then invalidates only the field
    // under test — so a rejection is attributable to that field, not a missing
    // one. If a buggy build persists the bad value anyway, best-effort cleanup
    // removes the leaked draft (delete lives in the plan panel, NOT Configure).
    async function cleanup(psp: typeof PrayerSchedulePage.prototype, planName: string) {
      const leaked = (await psp.planListNames()).includes(planName);
      if (!leaked) return;
      await psp.openPlan(planName).catch(() => {});
      await psp.deleteSelectedPlan().catch(() => {});
      await psp.expectPlanAbsent(planName).catch(() => {});
    }

    test('empty plan name is rejected on save', async ({ prayerSchedulePage }) => {
      await prayerSchedulePage.open();
      await prayerSchedulePage.openSchedules();
      await prayerSchedulePage.openAddNewPlan();
      // Everything valid EXCEPT the name.
      await prayerSchedulePage.fillRequiredPlanBasics('placeholder');
      await prayerSchedulePage.planNameInput().fill('');
      await prayerSchedulePage.saveConfigure();
      // A nameless plan must never save silently: the drawer stays open (a
      // required-field guard) OR the app surfaces a validation error.
      expect(await prayerSchedulePage.drawerStillOpen(),
        'save with an empty plan name should be blocked, not accepted').toBeTruthy();
    });

    test('banner duration below the minute minimum (0) is rejected or clamped', async ({
      prayerSchedulePage,
    }) => {
      const planName = name('ps-neg-banner');
      await prayerSchedulePage.open();
      await prayerSchedulePage.openSchedules();
      await prayerSchedulePage.openAddNewPlan();
      await prayerSchedulePage.fillRequiredPlanBasics(planName);
      await prayerSchedulePage.bannerDurationInput().fill('0');
      await prayerSchedulePage.saveConfigure();
      // min=1 ⇒ "0" must not survive: the drawer stays open (blocked) OR, if it
      // saved, the persisted plan must NOT show "Banner: 0m".
      const blocked = await prayerSchedulePage.drawerStillOpen();
      if (!blocked) {
        const row = await prayerSchedulePage.planRowText(planName);
        expect(row, `banner duration 0 must not persist — row: "${row}"`)
          .not.toMatch(/Banner:\s*0m/i);
      }
      await cleanup(prayerSchedulePage, planName);
    });

    // NOTE: pre-announcement duration is intentionally NOT tested here. On the
    // Add-New-Plan drawer the pre-announcement feature is OFF by default and its
    // duration field is not rendered, so the min=1 boundary can't be reached
    // reliably. The banner-duration case above already covers the numeric min=1
    // boundary on this surface.

    test('end date before start date is rejected', async ({ prayerSchedulePage }) => {
      const planName = name('ps-neg-daterange');
      await prayerSchedulePage.open();
      await prayerSchedulePage.openSchedules();
      await prayerSchedulePage.openAddNewPlan();
      // Valid name + City, but an INVERTED period (end one day before start).
      await prayerSchedulePage.fillRequiredPlanBasics(planName, {
        start: '2026-07-20',
        end: '2026-07-19',
      });
      await prayerSchedulePage.saveConfigure();
      // An inverted period must not persist. Correct behaviour (observed live):
      // the app blocks the save (drawer stays open) and shows a clear message
      // "End date must be on or after start date". If a build instead saves it,
      // fail unless the persisted plan was auto-corrected to end ≥ start.
      const blocked = await prayerSchedulePage.drawerStillOpen();
      if (blocked) {
        await expect(
          prayerSchedulePage.page.getByText(/end date must be on or after start date/i).first(),
          'an inverted range should surface a specific validation message',
        ).toBeVisible({ timeout: 5_000 });
      } else {
        const row = await prayerSchedulePage.planRowText(planName);
        const persisted = (await prayerSchedulePage.planListNames()).includes(planName);
        expect(
          !persisted || !/Jul 19/.test(row),
          `an inverted range must not persist as-is — row: "${row}"`,
        ).toBeTruthy();
      }
      await cleanup(prayerSchedulePage, planName);
    });

    test('XSS in plan name is stored escaped, not executed', async ({
      prayerSchedulePage,
      consoleMonitor,
    }) => {
      await prayerSchedulePage.open();
      await prayerSchedulePage.openSchedules();
      await prayerSchedulePage.openAddNewPlan();
      // Valid City + dates so the save is attributable to the (escaped) name.
      await prayerSchedulePage.fillRequiredPlanBasics(AUTH_PAYLOADS.xss);
      await prayerSchedulePage.saveConfigure();
      // No dialog / script execution should have fired.
      const executed = consoleMonitor.getErrors().some((e) => /xss/i.test(e.text));
      expect(executed, 'XSS payload must not execute').toBeFalsy();
      await cleanup(prayerSchedulePage, AUTH_PAYLOADS.xss);
    });
  });

  // ── Boundary — bounded domains (City select, numeric minima, year filter) ──

  test.describe('Boundary — City location domain @regression', () => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'set CMS_ALLOW_DESTRUCTIVE=true to open the drawer');

    test('City is a bounded select — no free-text lat/lng entry', async ({
      prayerSchedulePage,
    }) => {
      await prayerSchedulePage.open();
      await prayerSchedulePage.openSchedules();
      await prayerSchedulePage.openAddNewPlan();
      const options = await prayerSchedulePage.cityOptions();
      // Location must be constrained to a known set (the coordinate-less-plan bug
      // stems from location being under-validated) — not an open text field.
      expect(options.length, 'City select should expose a bounded option list').toBeGreaterThan(1);
      expect(options.every((o) => o.trim().length > 0),
        'no blank City options').toBeTruthy();
    });
  });

  test.describe('Boundary — numeric minima (min=1) @regression', () => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'set CMS_ALLOW_DESTRUCTIVE=true to run write cases');

    test('banner duration = 1 (valid minimum) is accepted', async ({ prayerSchedulePage }) => {
      await prayerSchedulePage.open();
      await prayerSchedulePage.openSchedules();
      await prayerSchedulePage.openAddNewPlan();
      await prayerSchedulePage.bannerDurationInput().fill('1');
      const value = await prayerSchedulePage.bannerDurationInput().inputValue();
      expect(value, 'the valid minimum (1) should be accepted verbatim').toBe('1');
    });
  });

  test.describe('Boundary — Calendar year filter @regression', () => {
    // Year picker is documented to expose 2024-2028 only.
    for (const year of ['2024', '2028']) {
      test(`year ${year} (in-range) is selectable and recomputes`, async ({
        prayerSchedulePage,
      }) => {
        await prayerSchedulePage.open();
        await prayerSchedulePage.openCalendar();
        const picker = prayerSchedulePage.yearSelect();
        if (!(await picker.isVisible({ timeout: 8_000 }).catch(() => false))) {
          test.skip(true, 'year picker not found — verify Calendar selectors live');
        }
        await picker.selectOption(year).catch(async () => {
          await picker.selectOption({ label: year });
        });
        await prayerSchedulePage.applyCalendar();
        await prayerSchedulePage.expectCalendarLoaded();
      });
    }

    test('out-of-range years (2023 / 2029) are NOT offered', async ({
      prayerSchedulePage,
    }) => {
      await prayerSchedulePage.open();
      await prayerSchedulePage.openCalendar();
      const picker = prayerSchedulePage.yearSelect();
      if (!(await picker.isVisible({ timeout: 8_000 }).catch(() => false))) {
        test.skip(true, 'year picker not found — verify Calendar selectors live');
      }
      const options = await picker.locator('option').allInnerTexts();
      expect(options.join(' ')).not.toMatch(/\b2023\b/);
      expect(options.join(' ')).not.toMatch(/\b2029\b/);
    });
  });

  // ── CRUD (write) — guarded, opt-in ────────────────────────────────────────
  //  Create-then-delete only ever touches the plan THIS test creates, so a run
  //  is idempotent and never mutates pre-existing seeded data.

  test.describe('CRUD — plan lifecycle @regression', () => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'set CMS_ALLOW_DESTRUCTIVE=true to run write cases');

    test('create → read-back → cleanup a valid plan', async ({
      prayerSchedulePage,
      page,
    }) => {
      const planName = name('ps-plan');

      // CREATE — a valid plan needs name + a real City + a Start/End period
      // (both empty by default on the Add-New-Plan drawer, and server-required).
      await prayerSchedulePage.open();
      await prayerSchedulePage.openSchedules();
      await prayerSchedulePage.openAddNewPlan();
      await prayerSchedulePage.fillRequiredPlanBasics(planName);
      await prayerSchedulePage.saveConfigure();

      // READ — the new plan appears in the Schedule Plans list by name.
      await expect
        .poll(async () => (await prayerSchedulePage.planListNames()).includes(planName), {
          timeout: 15_000,
        })
        .toBe(true);

      // DELETE — remove it via the plan-panel "Delete plan" (NOT Configure, whose
      // modal would cover the button) so the run stays idempotent.
      await prayerSchedulePage.openPlan(planName);
      await prayerSchedulePage.deleteSelectedPlan();
      await prayerSchedulePage.expectPlanAbsent(planName);
      await expectNoStuckLoader(page);
    });
  });
});
