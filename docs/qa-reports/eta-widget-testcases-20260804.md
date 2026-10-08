# ETA Widget (Estimated Travel Time) — Use Cases & QA Test Suite

| | |
|---|---|
| **Module** | ETA Widget — "estimated time from location A to location B" tile for Digital Signage CMS |
| **Scope of this document** | Use cases + **CRUD**, **BVA/boundary**, and **negative** test cases |
| **Author** | QA (Aman Kumar) |
| **Date** | 2026-08-04 |
| **Techniques** | Use-case analysis, ISTQB BVA + Equivalence Partitioning, negative/error-guessing, integration-failure injection |
| **Total cases** | **86** (CRUD 30 · BVA 26 · Negative 30) |
| **Import targets** | TestRail · Jira Xray · Azure DevOps · ClickUp |

> **Status:** written against the ETA widget *specification*, not against a shipped build.
> Every "Expected Result" marked **(A)** is an **assumption** to confirm with the Product
> Owner before execution — see §5.

---

## 1. Feature under test — ground truth reference

An **ETA widget** is a CMS-configured content item that renders on a screen and shows live
travel time (and optionally distance) from an **origin** to one or more **destinations**,
recomputed on an interval from a routing provider (Google Distance Matrix / HERE / Mapbox
class API).

### 1.1 Configuration fields

| Field | Type | Rules |
|---|---|---|
| Widget Name | text | required, 1–100 chars, unique per account **(A)** |
| Origin | place / address / lat-lng | required; one only |
| Destinations | list of place / address / lat-lng | required, **1–10** **(A)** |
| Destination Label | text | optional, 0–40 chars; defaults to place name |
| Travel Mode | enum | `driving` \| `walking` \| `cycling` \| `transit` |
| Traffic Model | enum | `best_guess` \| `optimistic` \| `pessimistic` (driving only) |
| Departure Time | enum + datetime | `now` \| `scheduled` (scheduled ≥ now, ≤ now + 7 days) |
| Route Preferences | multi-check | avoid tolls / highways / ferries |
| Units | enum | `km` \| `miles` |
| Refresh Interval | integer minutes | **1–60**, default 5 |
| Duration Format | enum | `Xh Ym` \| `total minutes` |
| Threshold Rules | list | e.g. ≤15 min green, 16–30 amber, >30 red; ascending, non-overlapping |
| Stale Data Behaviour | enum | `show last known + timestamp` \| `hide widget` \| `show error text` |
| Time Zone | tz id | defaults to screen time zone |
| Screens / Playlists | list | 0–N assignments |
| Status | enum | Draft / Published |

### 1.2 Runtime behaviour

- On render, widget requests ETA per destination; result cached until next refresh tick.
- Provider quota, rate limit, network loss, and "no route found" all have defined UI states.
- Widget must never render a blank/`NaN`/`undefined` cell on a live screen.

---

## 2. Use cases

### UC-ETA-01 — Create an ETA widget for a single route
**Actor:** CMS Admin · **Precondition:** logged in, routing provider key configured.
**Main flow:** Content → Widgets → Add → *ETA* → name it → pick Origin (office) →
add one Destination (airport) → mode `driving` → refresh 5 min → Save.
**Post-condition:** widget saved as Draft, listed in widget grid, `POST /widget/eta` → 201.
**Alternate:** A1 — user saves without assigning screens (allowed, stays Draft).
**Exception:** E1 — provider key missing → save blocked with actionable error **(A)**.

### UC-ETA-02 — Multi-destination departure board
**Actor:** Admin. Adds 5 destinations to one widget (Terminal 1, Terminal 2, Metro, Mall,
Highway exit); each row renders label + ETA + distance, sorted by configured order.

### UC-ETA-03 — Assign widget to screens and publish
Admin publishes the widget to a screen group; player pulls config, renders within one
heartbeat cycle; ETA updates on each refresh tick without a full playlist reload.

### UC-ETA-04 — Viewer reads live travel time (primary business value)
**Actor:** Passer-by at the screen. Reads "Airport — 34 min (28 km)" with a
"updated 2 min ago" freshness stamp; value changes as traffic changes.

### UC-ETA-05 — Traffic-aware colour thresholds
Admin defines thresholds; when live ETA crosses a band the tile changes colour/state on the
next refresh, no manual intervention.

### UC-ETA-06 — Edit / re-point an existing widget
Admin changes Destination 2 and refresh interval on a **published** widget; change reaches
screens without unpublish/republish **(A)**; previously cached ETA is invalidated.

### UC-ETA-07 — Duplicate/clone for a second site
Admin clones a widget, changes only the Origin, saves as a new widget; source widget
untouched.

### UC-ETA-08 — Delete a widget
Admin deletes a widget that is assigned to 3 screens; system warns with the usage count and,
on confirm, removes it from those screens' content without breaking playback.

### UC-ETA-09 — Provider outage / no route
Routing API returns error, quota-exceeded, or ZERO_RESULTS. Widget applies the configured
Stale Data Behaviour instead of showing a blank or `--`; the CMS surfaces the failure in
widget health/logs.

### UC-ETA-10 — Scheduled departure planning
Admin sets Departure Time = tomorrow 08:00 for a commuter board; ETA reflects predicted
traffic for that slot, not "now".

### UC-ETA-11 — Sub-user with limited permission
A sub-user with `widget.view` only can open but not edit/delete the ETA widget; a
folder-fenced sub-user sees only widgets in their folder.

### UC-ETA-12 — Unit / locale switch
Admin flips km → miles; all destinations re-render in miles, durations respect locale and
screen time zone.

---

## 3. CRUD test cases — `ETA-CRUD`

| ID | Scenario | Preconditions | Steps | Test Data | Expected Result | Sev | Pri |
|---|---|---|---|---|---|---|---|
| ETA-CRUD-001 | Create widget with 1 origin + 1 destination, all defaults | Admin logged in | 1. Widgets → Add → ETA<br>2. Fill Name, Origin, Destination<br>3. Save | Name `ETA Airport Run`, Origin `Wilyer HQ`, Dest `T3 IGI Airport` | 201; widget appears in grid with mode `driving`, refresh 5 min, status Draft | Critical | P1 |
| ETA-CRUD-002 | Create with lat/long instead of place search | — | Enter coords in Origin & Destination | `28.6139,77.2090` → `28.5562,77.1000` | Accepted, reverse-geocoded label shown | High | P1 |
| ETA-CRUD-003 | Create with 5 destinations | — | Add 5 destination rows → Save | 5 valid places | All 5 persisted in entered order | High | P1 |
| ETA-CRUD-004 | Create with travel mode = walking | — | Mode `walking` → Save | — | Saved; traffic-model control disabled/hidden | Medium | P2 |
| ETA-CRUD-005 | Create with mode = transit | — | Mode `transit` → Save | — | Saved; ETA uses transit schedule; avoid-tolls hidden | Medium | P2 |
| ETA-CRUD-006 | Create with mode = cycling | — | Mode `cycling` | — | Saved | Low | P3 |
| ETA-CRUD-007 | Create with scheduled departure | — | Departure `scheduled`, tomorrow 08:00 | +1 day 08:00 | Saved; preview ETA differs from `now` ETA | Medium | P2 |
| ETA-CRUD-008 | Create with route preferences | — | Check avoid tolls + highways | — | Flags persisted and forwarded to provider request | Medium | P2 |
| ETA-CRUD-009 | Create with threshold rules | — | Add 3 bands 0-15 / 16-30 / 31+ | — | Bands saved, ascending, no gaps | Medium | P2 |
| ETA-CRUD-010 | Create with duplicate name | Widget `ETA A` exists | Create second `ETA A` | — | Rejected with "name already exists" **(A)** | Medium | P2 |
| ETA-CRUD-011 | Save as Draft without screens | — | Save without assignment | — | 201; status Draft; not on any screen | Medium | P2 |
| ETA-CRUD-012 | Read — widget list shows key attributes | ≥1 widget | Open widget grid | — | Name, origin, dest count, mode, refresh, status, updated-at visible | Medium | P2 |
| ETA-CRUD-013 | Read — open detail restores every saved field | Widget from 001 | Open widget | — | All fields match saved values exactly (no silent defaults) | High | P1 |
| ETA-CRUD-014 | Read — search widget by name | ≥10 widgets | Search `Airport` | — | Only matching widgets returned, case-insensitive | Medium | P2 |
| ETA-CRUD-015 | Read — live preview renders ETA | Provider key valid | Open preview | — | Numeric duration + distance + freshness stamp; no `NaN`/`--` | Critical | P1 |
| ETA-CRUD-016 | Update — rename widget | Widget exists | Change name → Save | `ETA Airport Run v2` | 200; grid + screens reflect new name | Medium | P2 |
| ETA-CRUD-017 | Update — change origin | — | Set new origin → Save | `Wilyer Gurugram` | ETA recomputes; cached value invalidated | High | P1 |
| ETA-CRUD-018 | Update — add destination to existing widget | 2 dests | Add 3rd → Save | — | 3 rows render on screen after next refresh | High | P1 |
| ETA-CRUD-019 | Update — remove middle destination | 3 dests | Delete dest #2 → Save | — | Remaining 2 retain order; no orphan row on screen | High | P1 |
| ETA-CRUD-020 | Update — reorder destinations | 3 dests | Drag row 3 to top → Save | — | Render order matches new order | Medium | P2 |
| ETA-CRUD-021 | Update — change refresh interval 5 → 1 | — | Set 1 → Save | 1 | Player polls every 60 s; provider call volume rises accordingly | Medium | P2 |
| ETA-CRUD-022 | Update — switch units km → miles | — | Units `miles` | — | All distances convert (28 km ≈ 17.4 mi), duration unchanged | Medium | P2 |
| ETA-CRUD-023 | Update a **published** widget | Published to 1 screen | Edit + Save | — | Change propagates without unpublish/republish **(A)** | High | P1 |
| ETA-CRUD-024 | Update — concurrent edit by two admins | 2 sessions | Both open, both save | — | Second save either blocked (optimistic lock) or clearly last-write-wins **(A)** | High | P2 |
| ETA-CRUD-025 | Clone / duplicate widget | Widget exists | Clone → change origin → Save | — | New widget created; source unchanged; new id | Medium | P2 |
| ETA-CRUD-026 | Assign widget to screens | ≥2 screens | Assign 2 screens → Publish | — | Both screens list the widget; player renders it | Critical | P1 |
| ETA-CRUD-027 | Unassign from one screen | Assigned to 2 | Remove screen A | — | Screen A drops widget on next sync; screen B unaffected | High | P1 |
| ETA-CRUD-028 | Delete unused widget | Draft, 0 screens | Delete → confirm | — | 200; removed from grid; GET by id → 404 | High | P1 |
| ETA-CRUD-029 | Delete widget assigned to screens | Assigned to 3 | Delete | — | Warning names/counts the 3 screens; on confirm removed everywhere, playback continues | Critical | P1 |
| ETA-CRUD-030 | Cancel delete | — | Delete → Cancel | — | Widget intact, no API call fired | Medium | P2 |

---

## 4. Boundary value & equivalence tests — `ETA-BVA`

Boundary notation: **min-1 / min / min+1 … max-1 / max / max+1**.

| ID | Field | Partition / boundary | Input | Expected Result | Sev | Pri |
|---|---|---|---|---|---|---|
| ETA-BVA-001 | Widget Name | min-1 | `""` (empty) | Blocked — "Name is required" | High | P1 |
| ETA-BVA-002 | Widget Name | min | `A` (1 char) | Accepted | Medium | P2 |
| ETA-BVA-003 | Widget Name | max | 100 chars | Accepted, stored untruncated | Medium | P2 |
| ETA-BVA-004 | Widget Name | max+1 | 101 chars | Blocked or hard-capped at 100 — never silently truncated on save | Medium | P2 |
| ETA-BVA-005 | Widget Name | whitespace only | `"   "` | Blocked; trimmed value treated as empty | Medium | P2 |
| ETA-BVA-006 | Destinations | min-1 | 0 destinations | Blocked — at least 1 required | High | P1 |
| ETA-BVA-007 | Destinations | min | 1 destination | Accepted | High | P1 |
| ETA-BVA-008 | Destinations | max | 10 destinations | Accepted; all 10 render; layout does not overflow the tile | High | P1 |
| ETA-BVA-009 | Destinations | max+1 | 11 destinations | "Add" disabled at 10 with a clear limit message; API rejects 11 | High | P1 |
| ETA-BVA-010 | Destination Label | max / max+1 | 40 / 41 chars | 40 accepted; 41 blocked or ellipsised in UI without data loss | Low | P3 |
| ETA-BVA-011 | Refresh Interval | min-1 | `0` | Blocked — min 1 minute (0 would hammer the provider) | Critical | P1 |
| ETA-BVA-012 | Refresh Interval | min | `1` | Accepted | High | P1 |
| ETA-BVA-013 | Refresh Interval | max | `60` | Accepted | Medium | P2 |
| ETA-BVA-014 | Refresh Interval | max+1 | `61` | Blocked with message | Medium | P2 |
| ETA-BVA-015 | Refresh Interval | typed vs stepper | type `0` / `999` directly into the box | Typed value must be validated too — steppers alone are not validation | High | P1 |
| ETA-BVA-016 | Refresh Interval | non-integer | `2.5`, `1e2`, `-5` | All rejected | High | P1 |
| ETA-BVA-017 | Latitude | boundary | `-90`, `90` valid; `-90.1`, `90.1` invalid | In-range accepted, out-of-range rejected | High | P1 |
| ETA-BVA-018 | Longitude | boundary | `-180`, `180` valid; `180.1` invalid | Same | High | P1 |
| ETA-BVA-019 | Coordinate precision | 8 decimals | `28.61390000` | Accepted, no rounding error in the request | Low | P3 |
| ETA-BVA-020 | Distance | very short route | Origin == Destination (same coords) | ETA ≈ 0 min / 0 km rendered sanely, not blank or `--` | High | P1 |
| ETA-BVA-021 | Distance | very long route | Delhi → Chennai (~2,180 km) | Duration formats correctly beyond 24 h (`1 d 12 h` or `2160 min`) | Medium | P2 |
| ETA-BVA-022 | Departure Time | min | exactly `now` | Accepted | Medium | P2 |
| ETA-BVA-023 | Departure Time | min-1 | `now − 1 min` (past) | Blocked — departure cannot be in the past | High | P1 |
| ETA-BVA-024 | Departure Time | max / max+1 | `now + 7 d` / `now + 7 d 1 min` | 7 d accepted; beyond rejected (provider prediction horizon) | Medium | P2 |
| ETA-BVA-025 | Threshold bands | overlap / gap | bands `0-20` and `15-30`; then `0-10` and `20-30` | Overlap rejected; gap rejected or explicitly defaulted **(A)** | Medium | P2 |
| ETA-BVA-026 | Threshold value | boundary hit | ETA exactly equals band edge (15 with band `≤15`) | Inclusive edge applies the lower band deterministically | Medium | P2 |

---

## 5. Negative & failure-path tests — `ETA-NEG`

### 5.1 Input validation

| ID | Scenario | Input | Expected Result | Sev | Pri |
|---|---|---|---|---|---|
| ETA-NEG-001 | Save with no Origin | Origin blank | Blocked, field-level error, no API call | High | P1 |
| ETA-NEG-002 | Save with no Destination | Destinations empty | Blocked | High | P1 |
| ETA-NEG-003 | Unresolvable address | `asdkjhasd qwe123` | "No matching location" — widget not saved with an unresolved place | High | P1 |
| ETA-NEG-004 | Origin identical to Destination | same place both sides | Warn or accept-with-0 ETA — must not error out or render blank **(A)** | Medium | P2 |
| ETA-NEG-005 | Unreachable pair for mode | Mumbai → Colombo, mode `driving` | "No route available for driving" state, not a crash or empty tile | High | P1 |
| ETA-NEG-006 | Transit mode where no transit exists | rural origin, mode `transit` | Graceful "no transit route" message | Medium | P2 |
| ETA-NEG-007 | Malformed coordinates | `28.61, abc` / `999,999` | Rejected with a coordinate-format error | High | P1 |
| ETA-NEG-008 | Swapped lat/long | `77.2090,28.6139` (lat>90) | Rejected as out-of-range latitude | Medium | P2 |
| ETA-NEG-009 | XSS in widget name | `<script>alert(1)</script>` | Stored/rendered escaped as literal text on CMS **and** on the player | Critical | P1 |
| ETA-NEG-010 | XSS in destination label | `<img src=x onerror=alert(1)>` | Escaped, no script execution | Critical | P1 |
| ETA-NEG-011 | SQLi in search / name | `' OR 1=1 --` | Treated as literal string; no data leak, no 500 | Critical | P1 |
| ETA-NEG-012 | Unicode / RTL / emoji in label | `مطار 🛫 دبي` | Stored and rendered correctly, no mojibake, no layout break | Medium | P2 |
| ETA-NEG-013 | Leading/trailing whitespace name | `"  ETA  "` | Trimmed before uniqueness check | Low | P3 |
| ETA-NEG-014 | Negative / zero refresh via API | `{"refreshInterval": -1}` | 400 — server-side validation independent of the UI | Critical | P1 |

### 5.2 Provider / integration failures

| ID | Scenario | Injection | Expected Result | Sev | Pri |
|---|---|---|---|---|---|
| ETA-NEG-015 | Routing provider 500 | mock provider → 500 | Configured Stale Data Behaviour applied; error logged; no blank tile | Critical | P1 |
| ETA-NEG-016 | Provider timeout | delay > client timeout | Request aborted, last known value + "updated Xm ago"; retry with backoff | Critical | P1 |
| ETA-NEG-017 | Quota / rate limit exceeded | provider → 429 | Backoff, no request storm, admin-visible warning in widget health | Critical | P1 |
| ETA-NEG-018 | Invalid / revoked API key | provider → 403 | Clear "routing key invalid" surfaced to admin, not a silent empty widget | High | P1 |
| ETA-NEG-019 | ZERO_RESULTS response | provider → no route | "Route unavailable" state per configuration | High | P1 |
| ETA-NEG-020 | Malformed provider payload | truncated/garbage JSON | Handled without an unhandled exception; widget falls back, player keeps playing | Critical | P1 |
| ETA-NEG-021 | Provider returns `duration = null` | patched response | No `NaN`/`undefined`/`0 min` shown; fallback state instead | Critical | P1 |
| ETA-NEG-022 | Partial multi-destination failure | 1 of 5 destinations errors | 4 render normally, the 1 shows its own error state — whole widget must not fail | High | P1 |
| ETA-NEG-023 | Player offline at refresh tick | drop network on device | Last known ETA + explicit staleness indicator; recovers on reconnect | Critical | P1 |
| ETA-NEG-024 | Long outage (> 1 h stale) | keep provider down | Widget stops presenting stale data as current (hides or marks clearly) | High | P1 |

### 5.3 Permissions, state & data integrity

| ID | Scenario | Steps | Expected Result | Sev | Pri |
|---|---|---|---|---|---|
| ETA-NEG-025 | View-only sub-user attempts edit | login as `widget.view` user → open widget | Edit/Delete hidden **and** `PUT /widget/eta/{id}` → 403 (UI hiding alone is not enough) | Critical | P1 |
| ETA-NEG-026 | Folder-fenced sub-user IDOR | call GET/PUT on another folder's widget id | 403/404 — no cross-tenant read or write | Critical | P1 |
| ETA-NEG-027 | Delete already-deleted widget | delete twice (second via API) | 404, idempotent, no 500 | Medium | P2 |
| ETA-NEG-028 | Edit widget deleted in another session | session A edits, session B deleted it | Clear "no longer exists" message, no phantom save | Medium | P2 |
| ETA-NEG-029 | Session expiry mid-edit | let token expire → Save | Re-auth prompt; unsaved config not silently lost | High | P2 |
| ETA-NEG-030 | Browser refresh / back during create | navigate away mid-form | No half-created widget row persisted | Medium | P2 |

---

## 6. Assumptions to confirm with Product Owner

1. Widget-name uniqueness scope — per account or global (ETA-CRUD-010, ETA-BVA-005).
2. Maximum destinations per widget — assumed 10 (ETA-BVA-008/009).
3. Refresh-interval range — assumed 1–60 min, and whether it is provider-cost gated (ETA-BVA-011–016).
4. Departure-time prediction horizon — assumed 7 days (ETA-BVA-024).
5. Whether edits to a published widget propagate live or need republish (ETA-CRUD-023).
6. Concurrency model — optimistic lock vs last-write-wins (ETA-CRUD-024).
7. Origin == Destination policy (ETA-NEG-004).
8. Threshold-band gap/overlap policy and edge inclusivity (ETA-BVA-025/026).
9. Staleness cut-off after which last-known ETA must stop being shown (ETA-NEG-024).
10. Which routing provider and quota tier — drives 429/quota expectations (ETA-NEG-017).

## 7. Execution notes

- Provider-failure cases (§5.2) need a mockable routing layer or Playwright `page.route()`
  interception — do not test them against the live provider.
- BVA cases apply to **both** the UI form and the API; run the API variant separately, since
  client-side limits are routinely bypassable (ETA-NEG-014).
- Priority for a first regression pass: all **P1 Critical** — CRUD-001/013/015/026/029,
  BVA-011/015, NEG-009/011/015/020/021/023/025/026.
