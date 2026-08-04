# Live ETA Widget — Execution Report & Bug List

| | |
|---|---|
| **Module** | Live ETA widget (`Library → Widgets → Live ETA`) |
| **Environment** | **Production** — `https://cms.wilyersignage.com`, CMS **v3.5.25** |
| **API** | `https://v3-5api.wilyersignage.com/v3/cms` (verified; the repo previously had `api.wilyersignage.com`, which was a guess — corrected) |
| **Renderer** | `https://widgets.signagecloud.in/widget/{id}` |
| **Account** | `dev@wilyer.com` |
| **Suite** | `tests/_core/widgets/eta/eta-widget.spec.ts` — 73 cases, Chromium, 2 workers |
| **Date** | 2026-08-04 |

## Runs

| # | Mode | Result | Notes |
|---|---|---|---|
| 1 | Full, writes enabled | **41 passed · 23 failed · 10 blocked** | Produced the bug list below |
| 2 | **Read-only on live** | **17 passed · 1 failed · 56 skipped** | Writes gated off; confirms the one UI defect reachable without writing |

All test artefacts (`QA_ETA_*`) were swept from production after each run and the
account verified clean — **7** removed after run 1, **22** after run 2's first
attempt (see §5.2).

---

## 1. Executive summary

The ETA widget's **happy path works**: the route computes correctly in the CMS
(Delhi CP → IGI Airport = *45 mins · 18.7 KM*), the widget persists, and the
public renderer paints an ETA on the player. Every renderer resilience case
passed — provider 500, provider timeout, unknown id, no API-key leak, no
polling stampede.

**The failures are almost entirely one root cause: `POST /widget/create` performs
essentially no server-side validation.** It returns `200` for payloads that are
physically impossible (latitude 999), structurally incomplete (no pickup, no
destinations), or nonsensical (`lat: {"$gt": 0}`). The UI is the only thing
stopping bad data, and the UI is bypassable by anyone with the session cookie.

Secondary theme: **the form gives the operator no feedback** — no inline error on
an invalid submit, and no message when a route genuinely does not exist.

Security posture is otherwise good: injections stored inert, anonymous and
forged-token reads refused, HSTS + nosniff present, no `X-Powered-By`, no
account data on the public endpoint.

---

## 2. Bug list

Severity: **S1** blocks/corrupts · **S2** major · **S3** moderate · **S4** minor.

### BUG-ETA-01 · S1 · `POST /widget/create` accepts out-of-range coordinates

`lat`/`lng` are stored verbatim with no range check.

| Probe | Sent | Expected | **Actual** |
|---|---|---|---|
| ETA-035-lat-over | `lat: 90.000001` | 400 | **200 — stored** |
| ETA-035-lat-under | `lat: -90.000001` | 400 | **200 — stored** |
| ETA-035-lat-absurd | `lat: 999` | 400 | **200 — stored** |
| ETA-035-lng-over | `lng: 180.000001` | 400 | **200 — stored** |
| ETA-035-lng-under | `lng: -180.000001` | 400 | **200 — stored** |
| ETA-035-lng-absurd | `lng: 99999` | 400 | **200 — stored** |

Valid edges (`±90`, `±180`) are correctly accepted, so the field is simply unbounded.

**Impact:** a widget with impossible coordinates reaches a screen and can only fail
at render time, on-site, in front of an audience.
**Fix:** validate `-90 ≤ lat ≤ 90`, `-180 ≤ lng ≤ 180` server-side.

---

### BUG-ETA-02 · S1 · `POST /widget/create` accepts non-numeric coordinates

Every malformed coordinate type was stored with a `200`:

| Probe | Sent | **Actual** |
|---|---|---|
| ETA-055-string-coords | `lat: "abc", lng: "xyz"` | **200 — stored** |
| ETA-055-numeric-strings | `lat: "28.6"` (string) | **200 — stored** |
| ETA-055-null-coords | `lat: null, lng: null` | **200 — stored** |
| ETA-055-nan-coords | `lat: NaN` | **200 — stored** |
| ETA-055-infinity-coords | `lat: Infinity` | **200 — stored** |
| ETA-055-object-coords | `lat: {"$gt": 0}` | **200 — stored** |

**`{"$gt": 0}` is the notable one** — a Mongo operator object is being written into
a coordinate field. It did not escalate in this probe, but an operator object
accepted into persisted data is exactly the shape NoSQL-injection bugs take.

**Fix:** type-check coordinates as finite numbers before persisting; reject objects outright.

---

### BUG-ETA-03 · S1 · Widgets can be created with no pickup and/or no destinations

| Probe | Sent | Expected | **Actual** |
|---|---|---|---|
| ETA-052 | `data` with `destinations` only, no `pickup` | 400 | **200 — stored** |
| ETA-036 | `destinations: []` | 400 | **200 — stored** |

Both fields are marked required (`*`) in the UI. `data: {}` entirely and a missing
`name` **are** correctly rejected (ETA-053, ETA-054 passed) — so validation exists,
it just does not descend into `data`.

**Knock-on, and it is the important part:** these malformed documents then break
the list contract for every consumer. During run 1, `GET /widget/read` returned a
`liveEta` document whose `data` had **no `pickup` key at all**:

```json
{"destinations":[{"location":{"address":"Indira Gandhi International Airport…"}}]}
```

ETA-070 (list schema) failed on exactly this. After the malformed documents were
swept, **ETA-070 passed in run 2** — confirming the list endpoint itself is
sound and that this bug is what corrupts it.

**Fix:** require `data.pickup.location` and `data.destinations.length ≥ 1`.

---

### BUG-ETA-04 · S2 · No cap on destination count (ETA-038)

A widget with **500 destinations** was accepted (`200`) and persisted. Ten
destinations also persist correctly (ETA-037 passed), so there is no ceiling
anywhere between.

**Impact:** every refresh cycle fans out one routing-provider call per
destination. A single widget can therefore multiply the account's Maps API spend
by 500× and will never render legibly on a screen.
**Fix:** cap destinations (10 is a sensible product limit) and enforce it server-side.

---

### BUG-ETA-05 · S2 · No cap on widget name length (ETA-034)

A **5 000-character** name was accepted and stored. 255 characters round-trips
untruncated (ETA-033 passed), so nothing bounds this field.

**Fix:** cap the name (255) and reject beyond it rather than truncating silently.

---

### BUG-ETA-06 · S2 · `type` is not validated (ETA-056)

`POST /widget/create` with `type: "notAWidgetType"` returned **200** and created a
widget of that type. It then becomes invisible to the type-filtered list the UI
uses, so it can only be removed via the API — which is how three of them survived
run 1's teardown and needed a manual sweep.

**Fix:** validate `type` against the catalogue that `GET /widget/readTypes` serves.

---

### BUG-ETA-07 · S2 · Invalid submit is rejected silently (ETA-051)

Clicking **Save** on an empty create form does nothing: the modal stays open, no
inline error appears on any required field, and no toast is shown. The operator
gets no indication of what is wrong.

Reproduced in **both runs** and by hand. `aria-invalid` is not set, and no message
element renders. This is the one defect that reproduces without writing anything,
so it is the single failure in the read-only run.

**Fix:** surface per-field validation messages on submit.

---

### BUG-ETA-08 · S2 · No route ⇒ blank panel, no message (ETA-058)

A widget configured Delhi → Reykjavik (no road route exists) opens in the edit
modal with the ETA line simply **absent**. Full modal text captured at failure:

```
QA_ETA_unroutable_… × Widget Name * Pickup Location * Destination 1 *
+ Add destination  A  Keyboard shortcuts Map data ©2026 Terms Cancel Save
```

Where a valid pair renders `45 mins · 18.7 KM`, an unroutable pair renders a bare
marker letter and nothing else. The operator cannot tell "still loading" from
"this route is impossible".

**Fix:** render an explicit "No route available" state.

---

### BUG-ETA-09 · S3 · Delete confirmation shows a stale widget name

Observed manually: after renaming a widget to `QA ETA HQ to Airport EDITED` and
saving (the grid updated correctly), the delete dialog still read:

> Are you sure you want to delete **QA ETA HQ to Airport**?

The confirmation prompt reads from a cached copy, so the operator confirms against
a name that no longer exists. Low blast radius, but a delete confirmation is
exactly the dialog that must not lie.

---

### BUG-ETA-10 · S3 · `POST /widget/create` does not return the created id (ETA-073)

The response body is only `{"message":"Widget created successfully."}`. Every
caller that needs the new id must re-read the paginated list and match by name —
unreliable, since nothing enforces name uniqueness.

**Fix:** return the created document, or at least its `id`.

---

## 3. What passed — worth stating explicitly

| Area | Result |
|---|---|
| Renderer paints a real ETA on the player (ETA-020) | **PASS** — ~6–8 s to first paint |
| Renderer never shows `NaN` / `undefined` / `null` (ETA-021) | PASS |
| Renderer survives provider `500` (ETA-022) and provider timeout (ETA-023) | PASS |
| Renderer on an unknown id fails safely (ETA-024) | PASS — both runs |
| No Maps API key rendered as visible text (ETA-025) | PASS |
| Config polling is not a stampede (ETA-026) | PASS — ≤6 calls / 30 s |
| XSS, `<img onerror>`, SQLi, NoSQL, template, traversal, Unicode payloads in name (ETA-060 ×7) | PASS — stored literally, rendered inert |
| Anonymous read refused (ETA-061); forged token refused (ETA-062) | PASS — both runs |
| `readPublic` exposes render config only — no token/email/account (ETA-063) | PASS |
| IDOR probe on a foreign id refused (ETA-065) | PASS — both runs |
| HSTS + `X-Content-Type-Options: nosniff` (ETA-066); no `X-Powered-By` (ETA-067) | PASS — both runs |
| Empty and whitespace-only names rejected (ETA-030/031) | PASS |
| Pagination: `limit` above ceiling is a 400; page past the end returns `[]` (ETA-039/040) | PASS — both runs |
| List schema contract (ETA-070) | PASS **once the malformed docs from BUG-ETA-03 were removed** |
| List latency (ETA-072) | PASS — ~0.5 s for 50 records |
| Cancel discards the form (ETA-007); unconfirmed free-text location not stored (ETA-057) | PASS |

---

## 4. Not tested — the feature does not have these

The original test plan covered transport mode (driving/walking/transit/cycling),
refresh interval, units, traffic model, thresholds and scheduled departure.
**None of these exist in the product.** The create/edit modal has exactly four
inputs: Widget Name, Pickup Location, Destination 1..N, and an optional custom
name per destination. Cases for absent fields were dropped rather than written
against an imagined UI; they are listed in `test-data/eta-widget.data.ts` under
`NOT_IMPLEMENTED` so the gap stays visible.

Also not covered, and worth a follow-up: multi-browser (Firefox / WebKit), player-
device playback via a playlist, visual regression baselines, and accessibility —
the modals carry no `role="dialog"` and the icon buttons have no accessible names,
so an a11y pass would likely find real findings.

---

## 5. Corrections to the automation itself

All three were framework faults, not product bugs, and are fixed.

**5.1 `ETA-002` (UI create) failed with a correctly filled form.** Name, both
locations, route drawn, *47 mins · 19.4 KM* — and the modal still open. Manual
reproduction **saved successfully**, so this is a timing fault: route resolution
re-renders the form, and a `Save` click landing mid-render is dropped without
error. `createWidget()` now waits for the computed ETA line before clicking. The
10 blocked cases in run 1 were the rest of the serial CRUD block.

**5.2 The suite wrote to production.** Twice, for two different reasons:

- Run 1: the spec read `process.env.CMS_ALLOW_DESTRUCTIVE` directly, bypassing
  `ENV.ALLOW_DESTRUCTIVE`, which the framework forces off on production.
- Run 2 (first attempt): even after that fix, the **negative** create-probes were
  ungated — they were treated as read-only on the assumption the API would reject
  them. It does not; it returns `200`. Twenty-two widgets were created on
  production by a run that was supposed to write nothing.

Both are fixed: the gate reads the framework flag, and every test that can issue a
`POST` is now behind it. The re-run confirmed it — 56 skipped, zero writes.

The lesson is worth keeping: **on an API with weak validation, a negative write
probe is still a write.**

---

## 6. Recommended fix order

1. **BUG-ETA-01, 02, 03** — server-side validation of `data` (coordinates, required fields). One change closes all three and the list-contract corruption.
2. **BUG-ETA-04** — destination cap; this one has a direct cost impact.
3. **BUG-ETA-07, 08** — operator feedback on invalid input and on no-route.
4. **BUG-ETA-05, 06, 09, 10** — hardening and polish.
