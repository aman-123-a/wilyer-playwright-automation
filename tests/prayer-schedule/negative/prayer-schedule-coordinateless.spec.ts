// =============================================================================
//  PRAYER SCHEDULE — negative path: a plan with no resolvable location.
//
//  Regression guard for the coordinate-less-plan bug (confirmed 2026-07-02):
//    A saved plan with no city / lat-lng (e.g. "TEST", id
//    6a44dc5bbaafc77bf2737115) renders every Today-tab prayer time as "—" and
//    raises a persistent red toast "Location is required (lat/lng, address, or
//    city+country)" that never auto-dismisses — yet the SAME plan stays ACTIVE
//    and toggle-enabled on Schedules. An active prayer-interrupt plan that can
//    never fire.
//
//  Expected (post-fix): the app must NOT keep a location-less plan ACTIVE —
//  it should block save, deactivate the plan, or surface a blocking (not
//  silently-active) state. This test fails until that happens.
//
//  To exercise it, point CMS_PS_BROKEN_PLAN at the broken plan's visible name.
//  Skips cleanly when no broken plan is configured.
// =============================================================================

import { test, expect } from '../../../fixtures/test-fixtures';

const BROKEN_PLAN = process.env.CMS_PS_BROKEN_PLAN ?? '';

test.describe('Prayer Schedule — coordinate-less plan (negative) @regression', () => {
  // Regression guard for an open bug — never let a retry mask it.
  test.describe.configure({ retries: 0 });

  test.skip(!BROKEN_PLAN, 'set CMS_PS_BROKEN_PLAN=<plan name> to run this guard');

  test('a location-less plan must not stay ACTIVE with a stuck error toast', async ({
    prayerSchedulePage,
    page,
  }) => {
    await prayerSchedulePage.open();
    await prayerSchedulePage.openSchedules();
    await prayerSchedulePage.openPlan(BROKEN_PLAN);

    // Symptom 1: the persistent "Location is required" toast is showing.
    const toastVisible = await prayerSchedulePage
      .locationRequiredToast()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    // Symptom 2: every prayer time renders as an unresolved "—".
    await prayerSchedulePage.openToday().catch(() => {});
    const unresolved = await prayerSchedulePage.allTimesUnresolved();

    // The bug is "broken AND still active". If the plan is broken, it must not
    // also be presented as a live, enabled plan. Assert the app has surfaced a
    // blocking state rather than silently keeping it active.
    const brokenState = toastVisible || unresolved;
    expect(
      brokenState,
      'a location-less plan should be blocked/deactivated, not silently active ' +
        `(toast=${toastVisible}, allTimesUnresolved=${unresolved})`,
    ).toBeFalsy();

    // Give the toast a moment; a well-behaved error toast auto-dismisses.
    await page.waitForTimeout(6_000);
    await expect(prayerSchedulePage.locationRequiredToast()).toBeHidden({ timeout: 4_000 });
  });
});
