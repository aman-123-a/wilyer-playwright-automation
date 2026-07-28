# Bug Report — PS-N01: Coordinate-less prayer plan stays active, shows stuck error + stale times

| | |
|---|---|
| **ID** | PS-N01 |
| **Title** | A prayer plan with no resolvable location ("TEST") stays selectable/ACTIVE, shows a persistent "Location is required" toast, and displays stale prayer times from the previously-viewed plan |
| **Module** | Prayer Schedule (`/prayer-schedule`), CMS v3.5.20 |
| **Environment** | cms.pocsample.in · Chromium · admin <admin — see local .env> |
| **Date** | 2026-07-14 |
| **Severity** | High (a live, ACTIVE prayer-interrupt plan can never fire correctly, yet no blocking state) |
| **Priority** | High |
| **Status** | Open — reproduced (originally observed 2026-07-02) |
| **Reported by** | Aman Kumar (QA) |

---

## Description

The plan named **`TEST`** has no valid location (no lat/lng, address, or
city+country). When it is selected on the **Today** tab:

1. The location label renders as **`—`** (unresolved).
2. A red toast **"Location is required (lat/lng, address, or city+country)"**
   appears and **does not auto-dismiss** (persistent).
3. The five prayer cards **still display times** — but they are **stale**,
   carried over from the previously-selected plan (`erf` / Abu Dhabi:
   Fajr 4:15 AM, Dhuhr 12:28 PM, Asr 5:09 PM, Maghrib 7:13 PM, Isha 8:34 PM).
   These are **not** valid times for the `TEST` plan; they are misleading.
4. The plan remains **selectable and ACTIVE** (header shows `3 / 5 Active Plans`;
   the broken plan is still enabled on the Schedules tab) — an active
   prayer-interrupt plan that can never resolve a real prayer time.

## Steps to reproduce

1. Log in and open **Prayer Schedule** (`/prayer-schedule`).
2. On the **Today** tab, open the plan/location dropdown (default `erf`).
3. Select the **`TEST`** plan.
4. Observe the location field, the toast, and the prayer-card times.

## Expected result

A plan with no resolvable location must **not** be presented as a working/active
plan. The app should either:
- block saving such a plan, or
- mark it clearly **inactive/needs-configuration** (not ACTIVE), and
- **clear** the prayer-card times (show "—" or an explicit "location required"
  empty state) instead of showing stale times from another plan, and
- use a **dismissible / transient** error, not a permanently stuck toast.

## Actual result

- Location = `—`; persistent non-dismissing "Location is required" toast.
- Prayer cards show **stale** times inherited from the previous plan.
- Plan stays selectable and ACTIVE/enabled.

## Evidence

- Screenshot: `reports/prayer-schedule-bug-images/PS-N01-coordinateless-TEST-plan-20260714.png`
- Automated repro confirmed `toastVisible = true` on selecting the `TEST` plan.

## Additional observations (found while reproducing)

- **Stray hidden country-code `<select>`** on the Prayer Schedule page (options
  `Afghanistan, Aland Islands, …`) — unrelated to prayer locations; likely a
  leaked phone/country picker. It sits before the real plan picker in the DOM
  (only the plan picker is visible). Worth a separate ticket / cleanup.
- Switching between plans does **not** reset the prayer-card times, so any
  transition into a broken/loading plan shows the prior plan's data — a
  general stale-state issue beyond just `TEST`.

## Regression coverage

`cms-e2e/tests/prayer-schedule/prayer-schedule-coordinateless.spec.ts` guards
this. It fails while the bug is present and is pointed at the broken plan via
`CMS_PS_BROKEN_PLAN`. (Note: the guard currently selects the plan on the
Schedules tab by name; since two plans share the name `TEST`, prefer driving it
via the Today-tab visible `<select>` — see the repro method used here.)
