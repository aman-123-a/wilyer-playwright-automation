# Prayer Schedule — Automated Test Report

- **Application:** cms.pocsample.in `/prayer-schedule` (v3.5.20)
- **Framework:** `cms-e2e` (TypeScript + Playwright)
- **Date:** 2026-07-14
- **Author:** Aman Kumar (QA)
- **Account:** <admin — see local .env> (admin)
- **Browser executed:** Chromium (Firefox/WebKit projects available, not run here)

---

## 1. Executive summary

A new Prayer Schedule suite (POM + 2 spec files) was authored and executed live.
After correcting selector drift, **all 9 read-only cases pass** (41.5s, no retries).
The 5 write/destructive cases are implemented but **gated behind
`CMS_ALLOW_DESTRUCTIVE=true`** and were not executed in this run.

| Result | Count |
|--------|-------|
| ✅ Passed (read-only) | 9 |
| ⏭️ Skipped (destructive-gated) | 5 |
| ❌ Failed | 0 |
| **Total (excl. setup)** | **14** |

---

## 2. Coverage matrix

| Type | Case | Status |
|------|------|--------|
| Smoke | Module loads: header + 3 tabs (Today/Schedules/Calendar) | ✅ Pass |
| Positive | Today tab renders all 5 prayer cards (Fajr…Isha) | ✅ Pass |
| Positive | Schedules tab exposes Add New Plan / Configure / Publish | ✅ Pass |
| Positive | Calendar tab recomputes month table on Apply | ✅ Pass |
| Perf/Health | Loads within budget; clean console + API | ✅ Pass |
| Boundary | Year filter 2024 (in-range) selectable + recomputes | ✅ Pass |
| Boundary | Year filter 2028 (in-range) selectable + recomputes | ✅ Pass |
| Boundary | Years 2023 / 2029 (out-of-range) NOT offered | ✅ Pass |
| Negative | Empty plan name rejected on save | ⏭️ Gated |
| Negative | Latitude > +90 rejected/clamped | ⏭️ Gated |
| Negative | Longitude > +180 rejected/clamped | ⏭️ Gated |
| Negative | XSS in plan name stored escaped, not executed | ⏭️ Gated |
| CRUD | Create → read-back (Delhi) → delete cleanup | ⏭️ Gated |
| Negative | Coordinate-less plan must not stay ACTIVE (bug guard) | ⏭️ Needs `CMS_PS_BROKEN_PLAN` |

---

## 3. Live-DOM observations (captured this run)

- **Tabs** render as `<button>` with a **leading icon glyph** in the accessible
  name (`" Today"`, `" Schedules"`, `" Calendar"`) — anchored `^…$` selectors
  do not match. Same glyph applies to Configure / Publish / Apply / Add New Plan
  / Delete plan. (Consistent with the known sidebar icon-glyph quirk.)
- **Header stat cards** confirmed: Total Screens `1`, Daily Prayers `5`,
  Locations `2`, Active Plans `3 / 5`.
- **Today** default plan `erf` resolved to **Abu Dhabi**, all 5 times populated
  (Fajr 4:15 AM … Isha 8:34 PM), "0 screens assigned" empty-state shown.
- **Schedules** exposes: `Add New Plan`, per-plan `Configure` / `Save Changes` /
  `Publish` / `Delete plan`, and a per-prayer table (toggle, time range,
  `Add Pre-Announcement`, `Files`, preview).
- **Calendar** table renders correctly (Date / Hijri / Fajr / Dhuhr / Asr /
  Maghrib / Isha) with location (15 cities + Custom), method (~24 options),
  Shafi/Hanafi, month, and **year 2024–2028** filters + Apply. Hijri dates and
  day-to-day drift both present.
- **No console errors / no failed or slow API requests** observed on load.

---

## 4. Known open bug (regression guard shipped, not yet triggered here)

**Coordinate-less plan stays ACTIVE** (confirmed 2026-07-02): a plan saved with
no city/lat-lng shows all Today times as "—" plus a persistent, non-dismissing
"Location is required" toast, yet remains ACTIVE + enabled on Schedules — an
active prayer-interrupt plan that can never fire.

A dedicated guard (`prayer-schedule-coordinateless.spec.ts`) ships with the
suite. It stays skipped until pointed at the broken plan via
`CMS_PS_BROKEN_PLAN=<plan name>`, so it never silently green-passes.

---

## 5. Selector corrections applied during this run

| Symptom | Fix |
|---------|-----|
| All tab clicks timed out (`^today$` etc.) | Unanchored role-button matchers to tolerate the leading icon glyph |
| `Apply` / `Publish` not found | Removed `^…$` anchors |
| Schedules assertion flaky | Wait for "Schedule Plans" panel, then assert Add New Plan + Configure + Publish |
| Delete flow was stubbed | Wired real `Delete plan` button + shared destructive-confirm |

---

## 6. How to run

```bash
# Read-only (safe) — chromium
npx playwright test tests/prayer-schedule/prayer-schedule.spec.ts --project=chromium

# Include write/CRUD cases (creates & deletes a real plan)
CMS_ALLOW_DESTRUCTIVE=true npx playwright test tests/prayer-schedule --project=chromium

# Exercise the coordinate-less bug guard
CMS_PS_BROKEN_PLAN="TEST" npx playwright test tests/prayer-schedule/prayer-schedule-coordinateless.spec.ts
```

---

## 7. Files delivered

- `cms-e2e/pages/PrayerSchedulePage.ts` — page object
- `cms-e2e/fixtures/test-fixtures.ts` — registered `prayerSchedulePage` fixture
- `cms-e2e/tests/prayer-schedule/prayer-schedule.spec.ts` — main suite
- `cms-e2e/tests/prayer-schedule/prayer-schedule-coordinateless.spec.ts` — bug guard

---

## 8. Recommended next steps

1. Run the gated write/CRUD + Negative cases with `CMS_ALLOW_DESTRUCTIVE=true`
   to validate the Configure-drawer field selectors (not yet exercised live).
2. Point the bug guard at the live broken plan to confirm PS-N01 still reproduces.
3. Extend to Firefox/WebKit projects once selectors are stable.
