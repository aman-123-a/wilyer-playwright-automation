# AQI & Weather Widgets — Test Cases (post API change)

Scope: CMS widget create/edit/list/preview + widget player page + data API.
Old stack: `v3-5api.wilyersignage.com` / `widgets.signagecloud.in` · New stack: `v3-5api.pocsample.in` / `widget-test.signagecloud.in` (CMS `cms.pocsample.in`).
Evidence from the comparison run lives in `reports/aqi-weather-api-comparison/` (scripts in `scripts/aqi-weather-compare/`).

Suites: **S** = Smoke (every build, <5 min) · **F** = Functional · **R** = Regression (old-vs-new parity + known defects).
Legend for Last result: ✅ pass · ❌ fail (defect) · ⚠️ review · — not yet run.
Test data prefix: `QA_` (delete after run). Default cities: Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Dubai.

---

## 1. Smoke (S)

| ID | Title | Steps | Expected | Last |
|---|---|---|---|---|
| SM-01 | Login + dashboard loads | Log in as admin | Dashboard renders, no blank page | ✅ |
| SM-02 | AQI widget list opens | Library → Widgets → AQI | List renders, read call 200 | ✅ |
| SM-03 | Weather widget list opens | Library → Widgets → Weather | List renders, read call 200 | ✅ |
| SM-04 | Create AQI (Mumbai) | New AQI → name, pick Mumbai from autocomplete → Save | 200, appears in list | ✅ |
| SM-05 | Create Weather (Mumbai) | New Weather → name, pick Mumbai → Save | 200, appears in list | ✅ |
| SM-06 | AQI player page shows data | Open `widget-test…/widget/<aqiId>` | AQI value, category label, city, pollutants visible within 5 s | ✅ |
| SM-07 | Weather player page shows data | Open `widget-test…/widget/<weatherId>` | Temp, city, condition, humidity/wind visible within 5 s | ✅ |
| SM-08 | CMS Preview renders (AQI + Weather) | Open saved widget → Preview | Preview populated, `readPublicWidgetPreview` 200 | ✅ |
| SM-09 | Widget in playlist plays | Add AQI + Weather to a playlist, publish, view on a test player | Both render, no black/blank zone | — |

---

## 2. Functional (F)

### 2.1 AQI — CMS

| ID | Title | Steps | Expected | Last |
|---|---|---|---|---|
| F-AQI-01 | Create form fields | Open New AQI | Name, font family, face, "AQI for" (pollutant), city inputs (up to 4), checkbox present | ✅ |
| F-AQI-02 | Empty name blocked | Leave name empty → Save | Validation message, **no** create call | ❌ DEF-01 |
| F-AQI-03 | Empty location blocked | Name only → Save | 400 / inline error, widget not created | ✅ (400) |
| F-AQI-04 | Autocomplete suggestions | Type "Mum" in city | ≥1 suggestion list (observed 5) | ✅ |
| F-AQI-05 | Coordinates stored | Save with Mumbai | Payload has `cities[]` and matching `coordinates[{lat,lng}]` | ✅ |
| F-AQI-06 | Multiple cities | Add 2–4 cities (Delhi, Gurugram…) | All saved; player lists each; `cityIds` populated | — |
| F-AQI-07 | Invalid free-text city | Type "zzzxxx", no suggestion pick → Save | Rejected (400) | ✅ |
| F-AQI-08 | Pollutant selector | Set "AQI for" = pm25 / pm10 / o3 / no2 / so2 / co | Saved value reflected in player | — |
| F-AQI-09 | Edit + reopen | Open saved widget | Name and city prefilled | ✅ |
| F-AQI-10 | Edit city, save | Change Mumbai → Delhi | Update 200; player shows Delhi | — |
| F-AQI-11 | Font / colour options | Change font, primary/secondary/bg/text colour | Applied in preview and player | — |
| F-AQI-12 | Search/filter in list | Search by name | Row found | ✅ |
| F-AQI-13 | Duplicate widget | Duplicate action | Copy created, independent id | — |
| F-AQI-14 | Delete widget | Delete → confirm | Removed from list; player URL no longer serves data | — |
| F-AQI-15 | Delete widget used in playlist | Delete while in playlist | Blocked or warned; playlist not corrupted | — |
| F-AQI-16 | Name length | 600-char name | Limited/handled (UI blocks input) | ✅ |
| F-AQI-17 | XSS in name | `<img src=x onerror=…>` | Stored as text, not executed | ✅ |

### 2.2 Weather — CMS

| ID | Title | Steps | Expected | Last |
|---|---|---|---|---|
| F-WX-01 | Create form fields | Open New Weather | Name, up to 4 city inputs, font, checkboxes (bgImage, animation, bold, forecast) | ✅ |
| F-WX-02 | Empty name blocked | Empty name → Save | Validation, no create call | ❌ DEF-01 |
| F-WX-03 | Empty location blocked | Name only → Save | Rejected | ❌ DEF-02 (200, widget saved with `city:[]`) |
| F-WX-04 | Autocomplete | Type "Mum" | Suggestions shown (5) | ✅ |
| F-WX-05 | Multi-city | Mumbai + Delhi + Dubai | All saved in order; player rotates through all | — |
| F-WX-06 | Forecast toggle | `isForecast` on/off | Player shows forecast strip only when on | — |
| F-WX-07 | Background image toggle | `bgImage` on/off | Applied in player | — |
| F-WX-08 | Animation toggle | `animation` on/off | Animation only when on | — |
| F-WX-09 | Font family + bold | Change font, bold | Applied in player | — |
| F-WX-10 | Invalid free-text city | "zzzxxx" no pick → Save | Rejected | ❌ DEF-02 (200, `city:[]`) |
| F-WX-11 | Edit + reopen | Open saved widget | Name/city prefilled | ✅ |
| F-WX-12 | List search | Search by name | Row found | ✅ |
| F-WX-13 | Delete widget | Delete → confirm | Removed; player URL no longer serves | — |
| F-WX-14 | Name length | 600-char name | Limited/handled | ⚠️ DEF-03 (accepted, no limit) |
| F-WX-15 | XSS in name | Script payload | Not executed | ✅ |

### 2.3 Player output (data correctness, new API)

| ID | Title | Expected | Last |
|---|---|---|---|
| F-PL-01 | AQI response shape | `aqiData[].{city,aqi,iaqi.{co,no2,o3,pm10,pm25,so2,nh3}.v}`; `data.cities` and `aqiData` same length/order | ✅ |
| F-PL-02 | Weather response shape | `weather[].{city.{name,sunrise,sunset}, todayData.{dt,weather[0].main,main.{temp,humidity,pressure},wind.speed}, forecast[]}` | ✅ |
| F-PL-03 | AQI category bands | 0–50 Good/Healthy, 51–100 Moderate, 101–150 Unhealthy for sensitive, 151–200 Unhealthy, 201–300 Very Unhealthy, 300+ Hazardous — verify label + colour at every boundary (0,1,50,51,100,101,150,151,200,201,300,301) | — (old-stack boundary data captured; re-run on new) |
| F-PL-04 | Units | Temp °C, wind speed, pressure hPa, humidity %, sunrise/sunset `HH:mm` local to city | — |
| F-PL-05 | Forecast length/order | 9 daily entries ascending `dt`, `dt` in the future | — |
| F-PL-06 | Multi-city rotation | Each city shown in turn, loop restarts | — |
| F-PL-07 | Missing/null pollutant | Missing `aqi`, `null`, `"abc"`, `-1` | No blank screen, no JS error, graceful placeholder | — (re-run on new) |
| F-PL-08 | Live data change | Data differs across two fetches minutes apart | Player updates without reload | — |
| F-PL-09 | Auto-refresh cadence | Observe 3 min | AQI ≈ every 10 s, weather not polling (observed: new ≈ 18 / 2 requests per 180 s) — confirm intended cadence | ⚠️ |
| F-PL-10 | Cache / offline | Network off after first load | Last data stays on screen, recovers when network returns | — |

---

## 3. Regression (R)

### 3.1 Old-vs-new parity (run the same widget config on both stacks)

| ID | Title | Expected | Last |
|---|---|---|---|
| R-01 | Same city → same display fields | Same labels/fields; values within tolerance (AQI ±15 %, temp ±2 °C) | ✅ (captured) |
| R-02 | Migrated widget opens | Widgets created before the change open and edit without error | — |
| R-03 | Old payload accepted | Create with legacy payload shape (`city` string / `city1`) still works | — |
| R-04 | Response latency | p95 first call ≤ old stack ×1.5 (observed: new first call 2.7 s vs old 1.0 s cold; warm comparable) | ⚠️ |
| R-05 | Payload size | New response ≤ old (new weather 1.1 KB vs old 4.5 KB) | ✅ |
| R-06 | Time to data visible | ≤ 3 s cold on player page (observed ≈ 2.5 s both) | ✅ |
| R-07 | Repeat load | Warm reload ≤ 500 ms | ✅ |
| R-08 | Browser errors | No uncaught JS errors on player or CMS widget flows (CMS 401 noise on `requestStorageAccess` to triage) | ⚠️ |
| R-09 | Secrets in bundle | No API keys in player JS (old bundle has an `AIza…` Google key hit — confirm new bundle clean) | ⚠️ |

### 3.2 Error handling (mock API status on player)

| ID | Title | Expected | Last |
|---|---|---|---|
| R-10 | API 400 / 401 / 404 / 500 / timeout | Visible fallback ("data unavailable"), not a blank page; no endless spinner; retries sensibly | ❌ DEF-04 (blank page on 400/401 on old; verify on new) |
| R-11 | Malformed JSON / empty array | No crash | — |
| R-12 | City not found by backend | Widget shows message, other cities still rotate | — |

### 3.3 Cross-feature

| ID | Title | Expected | Last |
|---|---|---|---|
| R-13 | Playlist + layouts | AQI/weather in every layout zone (existing `Playlist_AQI_Layouts.spec.js`) still passes | — |
| R-14 | Publish → player | Screen receives playlist containing widgets; zone not black | — |
| R-15 | Role permissions | Sub-users with/without widget permission see/hide create/edit/delete | — |
| R-16 | Approval flow | Widget in approval-required playlist follows maker/checker | — |
| R-17 | Widget list performance | List with 100+ widgets loads < 3 s; weather list issued 30 read calls (observed) — confirm no N+1 | ⚠️ |
| R-18 | Responsive / orientation | Portrait, landscape, 1080p, 720×480 zone render without clipping | — |

---

## 4. Known defects driving regression cases

| ID | Defect | Evidence |
|---|---|---|
| DEF-01 | Save with empty name is not blocked (AQI + Weather): create call sent, dialog stays open | cms-ui-results UI-04 |
| DEF-02 | Weather saves with empty/invalid location (200, `city:[]`); AQI correctly returns 400 | UI-05, UI-10 |
| DEF-03 | Weather name has no length limit (600 chars accepted) | UI-12 |
| DEF-04 | Player shows blank page when data API returns 400/401 | ui-results `errors` |

## 5. Suggested run plan
- **Every deploy:** SM-01 → SM-09 (≈5 min).
- **Nightly:** all F cases.
- **Release gate:** F + R, plus parity run (`scripts/aqi-weather-compare/`).
