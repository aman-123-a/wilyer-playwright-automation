g# Prayer Schedule — Retest of "In Development" ClickUp Tickets

- **List:** ClickUp → Prayer Schedule (`901615652519`)
- **Scope:** the **11 tickets currently in `in development` status**
- **Target:** https://cms.pocsample.in v3.5.20 · dev@wilyer.com (admin) · **2026-07-16 (PM)**
- **Note:** a deploy occurred earlier today — several items fixed since the AM retest.

## Result summary
**8 fixed · 1 partial · 1 display-added · 1 NOT fixed**

| Ticket | Bug | Verdict | Evidence |
|--------|-----|---------|----------|
| 86d3j5q7x | Duplicate prayer plan can be created | ✅ **Fixed** | Save name "test" → `create` **400** "Prayer schedule name already exists" |
| 86d3q15uz | Required field indicator `*` missing | ✅ **Fixed** | Configure labels now show `*` (Plan name/City/method/Madhab/dates) |
| 86d3q19gd | Plan card lacks scrollbar | ✅ **Fixed** | Plan list container now `overflow-y:auto` + `max-height:740px` (was `visible`/`none`) |
| 86d3q1cwf | Unused Duration field displayed | ✅ **Fixed** | Plan editor headers now `Prayer Name / Time Range / Pre-Announcement / Files / Actions` — **Duration column removed** |
| 86d3q9zmc | Active plan without location → 400 | ✅ **Fixed** | Saving Custom/no-location plan → **rejected**, `create` 400 + friendly toast "Location is required to calculate prayer timings"; no plan saved |
| 86d3q9zmg | Today: no friendly error when location missing | ✅ **Fixed at source** | Friendly toast now shown; location-less plans can no longer be created, and none remain (not reproducible) |
| 86d3q9zmn | Calendar shows Riyadh for no-location plan | ✅ **Not reproducible** | Location-less plans blocked at source → scenario prevented |
| 86d3qbp5k | Popup stuck after saving without changes | ✅ **Fixed** | Configure → Save (no changes) → "Plan saved", drawer **closes cleanly** |
| 86d3qbwqm | Missing "Prayer Schedule" content under Media | ✅ **Display added** | Screen → Media tab now has a **"PRAYER SCHEDULED PLAYLISTS (30)"** section listing all prayer-schedule playlists (see `reports/screen-content-tabs.png`). Surfaced as a section, not a separate tab — confirm if a distinct tab was required |
| 86d3qakxg | Screen card click doesn't redirect to config | ⚠️ **Partial** | Live Screen Status card now has a **"View Detail"** link → `/screen-settings/{id}`. But the card **body itself is still not clickable** (`cursor:auto`) — if full-card click was required, still open |
| 86d3qbxx1 | Multiple API requests on repeated Apply | ❌ **NOT fixed** | 5 rapid Apply clicks → **5** identical `api.aladhan.com/calendarByCity` requests. Still no debounce/in-flight guard |

## The one still broken
**86d3qbxx1 — Calendar Apply has no debounce.** Rapid clicks each fire a separate request straight to the third-party Aladhan API (rate-limit / 429 exposure). Fix: disable Apply while a request is in flight, or coalesce identical queries.

## Items to confirm with the reporter (interpretation)
- **86d3qbwqm** — prayer-schedule playlists now show as a **section** under the screen's Media tab. If the ticket required a *distinct tab* (alongside Library/Playlists), that specific tab is not present.
- **86d3qakxg** — redirect now works via the **"View Detail"** link; clicking the card body still does nothing. Confirm whether full-card click was the requirement.

## Not in this batch (status changed)
- `86d3q1c26` (Dashboard summary cards not clickable) → now **cancelled** in ClickUp (not retested).

## Regression / environment note
On fresh load the Prayer Schedule page logged **17 console errors** — all Razorpay checkout-SDK chunks failing with `ERR_INSUFFICIENT_RESOURCES` (the SDK spawns ~100 parallel chunk loads and exhausts browser resources), plus one `capi.pocsample.in` WebSocket failure. Global/billing, not Prayer Schedule — but it has escalated from warnings to hard errors and buries real errors during QA. Worth a separate ticket.
