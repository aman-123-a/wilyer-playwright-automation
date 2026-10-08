# Prayer Schedule — API & Console Error Audit

- **Target:** https://cms.pocsample.in/prayer-schedule · build **v3.5.20**
- **Account:** <admin — see local .env> (admin) · **Date:** 2026-07-16
- **Method:** Playwright network + console capture across Today / Schedules / Calendar tabs

## API call inventory

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/v3/cms/auth/checkAccess` | POST | 200 | Session/auth check |
| `/v3/cms/announcement/read` | GET | 200 | Global |
| `/v3/cms/prayer-schedule/read` | GET | 200 | Returns **7 plans** |
| `/v3/cms/prayer-schedule/screens/{id}` | GET | 200 | Live screen status for selected plan |
| `/v3/cms/prayer-schedule/timings/{id}` | GET | **200 / 400** | **400 when the plan's location is empty** (see bug) |
| `/v3/cms/prayer-schedule/create` | POST | 400 | Duplicate-name guard — *expected* rejection ("Prayer schedule name already exists") |
| `api.aladhan.com/v1/calendarByCity/{yyyy}/{m}` | GET | 200 | **Third-party**, called directly from browser by the Calendar tab |

### timings status matrix (verified)
| Plan | Location data | `timings/{id}` |
|------|---------------|----------------|
| Rest (`6a587311…`) | city:"" country:"" lat:null lng:null | ❌ **400** |
| Rest (`6a5872e7…`) | empty | ❌ **400** (same) |
| erf (`6a4dee2f…`) | Abu Dhabi / UAE, no lat/lng | ✅ 200 |
| lal kurti (`6a574cda…`) | meerut/india + lat/lng | ✅ 200 |

→ The endpoint accepts **city+country**; it only 400s when location is **entirely blank**.

## Console findings

| # | Level | Message | Scope | Verdict |
|---|-------|---------|-------|---------|
| 1 | **ERROR** | `Failed to load resource: 400` on `prayer-schedule/timings/6a587311…` → body `{"message":"Location is required (lat/lng, address, or city+country)"}` | **Prayer Schedule** | ❌ **Real bug** |
| 2 | FAILED | `GET .../razorpay.com/build/undefined` → `net::ERR_BLOCKED_BY_ORB` | Global (billing SDK) | ⚠️ Minor — Razorpay SDK requests an `undefined` chunk URL |
| 3 | WARNING ×186 | `The resource …razorpay.com/build/chunks/v2-entry-* was preloaded … but not used…` | Global (billing SDK) | ➖ Noise — Razorpay preloads ~100 unused chunks; not Prayer-Schedule related |

**Net:** exactly **1 real error** attributable to Prayer Schedule (the 400 timings). All other console output is Razorpay checkout-SDK noise present app-wide.

## Root-cause bug — location-less plan

**A prayer plan can be saved and left `active: true` with no location at all** (`city:"", country:"", lat:null, lng:null`). Two such plans ("Rest") exist. Consequences:

1. **Today tab defaults to a location-less plan** → `timings/{id}` returns **400** → console error on every page load.
2. The Today card then renders **all prayer times as "—"** (Fajr/Dhuhr/Asr/Maghrib/Isha) with **no user-facing error** — a silent failure (only the unrelated "Complete your profile" toast shows).
3. **Calendar tab silently falls back to Riyadh** for the location-less plan → shows **misleading Riyadh times** for a plan that has no location.
4. Selecting any located plan (erf, lal kurti) immediately clears the error and populates times — confirming the 400 is exclusive to the empty-location plan.

## Recommendations
1. **Server:** reject `create`/`update` when location is empty, or refuse to mark such a plan `active`.
2. **Client:** guard the `timings` call — if the plan has no location, show a clear "Add a location to this plan" empty-state instead of firing a request that 400s and rendering "—".
3. **Don't default** the Today selector to a location-less plan (or exclude it from the active count — dashboard currently shows "5/7 Active Plans" including the broken ones).
4. **Calendar:** don't silently substitute Riyadh; surface that the plan has no location.
5. (Separate, low priority) Fix the Razorpay `build/undefined` request and the preload-not-used flood — pure console noise, but it drowns real errors during QA.

## Screenshots
- **Configure Schedule Plan (Banner & Announcement):**
  ![Configure Schedule Plan](file:///C:/Users/User/.gemini/antigravity-ide/brain/33541b76-a734-44dd-b5cc-e3042c62321b/media__1784197185209.png)

