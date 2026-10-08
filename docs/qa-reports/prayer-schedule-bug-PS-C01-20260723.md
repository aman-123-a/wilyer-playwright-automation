# Bug Report — PS-C01: Prayer banner duration has no upper bound; absurd values are accepted and produce all-day, overlapping screen takeovers

| | |
|---|---|
| **ID** | PS-C01 |
| **Title** | "Banner duration" (and "Pre Announcement Duration") enforce a minimum (`min=1`) but **no maximum** — a value like `99999` minutes is accepted and persisted on an **ACTIVE** plan, making the prayer banner occupy the screen for hours and overlap across prayers |
| **Module** | Prayer Schedule → Schedules → Configure / Add New Plan, CMS **v3.5.20** |
| **Environment** | **testdev** · `https://cms.pocsample.in` · Chromium · admin `<admin — see local .env>` |
| **API** | `POST/PUT https://v3-5api.pocsample.in/v3/cms/prayer-schedule/*` |
| **Date** | 2026-07-23 |
| **Severity** | **Critical** — an ACTIVE, publishable prayer-interrupt plan can black out all signage content for hours/all-day; trivially reachable by a single mistyped field |
| **Priority** | High |
| **Status** | Open — **reproduced** 2026-07-23 |
| **Reported by** | Aman Kumar (QA) |

---

## Description

The **Banner duration** field (minutes the prayer banner interrupts screen content)
is validated with a **lower** bound only:

```
<input type="number" min="1" max="">   →  min=1, max=null
```

There is **no maximum** — neither an HTML `max`, nor client-side, nor server-side
validation. An operator can enter an arbitrarily large value; it is **accepted and
saved**, and the resulting plan is created **ACTIVE** and publishable to screens.

Reproduced by creating a plan with **Banner duration = `99999`** (~69 days). The plan
saved successfully ("Plan created"), shows **`Banner: 99999m`**, and the per-prayer
**Time Range** column expands to multi-hour windows that **overlap every other prayer**:

- Fajr **03:51 – 14:30**  (~10.5 h)
- Dhuhr **11:59 – 22:38**
- Asr **15:24 – 02:03**

With overlapping multi-hour banners at all five daily prayers, the screen would show a
prayer banner **essentially 24/7**, blacking out all other signage content — the exact
opposite of the module's purpose ("interrupt screen content *at prayer times*").

**This is not theoretical.** Live testdev already contains an operator-created plan
**"lal kurti"** with **`Banner: 350m | Pre: 200m`** (a ~6-hour banner + ~3.3-hour
pre-announcement), showing the guardrail is missing in real use.

The sibling field **Pre Announcement Duration** carries the identical `min=1`, no-`max`
pattern and is subject to the same defect.

## Steps to reproduce

1. Log in and open **Prayer Schedule** → **Schedules** tab.
2. Click **Add New Plan**.
3. Enter a Plan name, pick a City, set Start/End dates.
4. In **Banner & announcement**, set **Banner duration** to `99999`.
5. Click **Save Changes**.

## Actual result

- Save succeeds — toast **"Plan created"**.
- Plan card shows **`Banner: 99999m`** and header badge **`Banner 99999m`**.
- Plan is created **ACTIVE** (green ACTIVE badge) and offers **Publish**.
- Per-prayer Time Ranges balloon into overlapping multi-hour windows (see evidence).
- No validation error, no warning, no confirmation.

## Expected result

The banner duration must be bounded to a sane operational range. At minimum:

1. **Hard maximum** on the field (HTML `max` + server validation) — e.g. ≤ 60 minutes,
   or ≤ the gap to the next prayer.
2. **Cross-field guard**: banner duration must not exceed the interval to the next
   prayer, so banners cannot overlap.
3. **Confirmation** above a soft threshold (e.g. > 15 min) explaining the on-screen
   impact.
4. Apply the same bounds to **Pre Announcement Duration**.

Invalid/absurd values should be rejected the same way the app already (correctly)
rejects an empty name, `min=1` underflow, and an inverted date range.

## Evidence

- **Screenshot:** `reports/prayer-schedule-crud-images/bug-ps-ui-02-banner-99999.png`
  — created plan `ps-bannermax-*`, **ACTIVE**, `Banner: 99999m`, overlapping multi-hour
  prayer Time Ranges, "Plan created" toast.
- **Field attributes (live):** `min=1`, `max=null` on the Banner duration `<input type=number>`.
- **Persisted:** create request accepted; plan listed with `Banner: 99999m`.
- **Corroborating live data:** existing plan **"lal kurti"** = `Banner: 350m | Pre: 200m`.

> Reproduced non-destructively via a self-cleaning Playwright check (create → assert →
> delete). No test data was left on testdev.

## Impact

| Dimension | Assessment |
|---|---|
| **Functional** | Banner can cover the screen for hours; overlapping across prayers ⇒ effectively permanent takeover — signage shows nothing but the prayer banner |
| **Reach** | Any Configure / Add New Plan flow; a single mistyped field (e.g. `350` for `3.5`) triggers it |
| **State** | Bad plan is created **ACTIVE** and **publishable** — reaches real screens |
| **Detectability** | Silent — no error/warning; operators may not notice until screens are affected |
| **Data** | Already present in live data (`lal kurti`) |

## Suggested fix

- Add `max` (and `min`) to the numeric inputs; validate server-side on create/update.
- Add cross-field validation: `bannerDuration ≤ minutesUntilNextPrayer`.
- Confirmation dialog above a soft threshold; mirror bounds on Pre Announcement Duration.
- Backfill-check existing plans (e.g. `lal kurti`) and clamp/flag out-of-range values.

## Automated coverage

A regression guard should assert an extreme banner duration is rejected (mirroring the
existing `min=1` and date-range negative cases). The current suite
(`cms-e2e/tests/prayer-schedule/prayer-schedule.spec.ts`) covers the `min=1` lower
bound; add an **upper-bound** negative case once the fix defines the max, so this cannot
regress.
