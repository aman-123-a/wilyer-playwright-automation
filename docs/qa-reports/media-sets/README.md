# Media Sets — Test Case Suite (cms2.pocsample.in)

**Module:** Library ▸ Media Sets · **Build:** v3.5.25 · **Env:** cms2 (Pre-Production 2) · **Authored:** 2026-10-07
**File:** [`test-cases.csv`](test-cases.csv) — 215 cases, same columns as `campaigns-v1-rbac/test-cases.csv` plus `Type` and `Automation Status`.

| Type | Cases | Focus |
|---|---|---|
| Smoke | 8 | Tab loads, list API, builder opens, bulk bar, publish modal reachable |
| Basic CRUD | 12 | Plain create / read / update / delete end to end, UI and API, with exact steps and data |
| API | 32 | Contract, validation, read params, auth, and 10 confirmed defects (MS-API-D1..D10) |
| Edge Case | 32 | Name boundaries, unicode/HTML, page boundaries, deleted source files, double-click, two tabs, session/network loss, Bad Fit screens, zoom, keyboard |
| Use Case | 13 | End-to-end user stories: promo publish, maker/checker, per-ratio picks, back-to-back sets, append, cleanup, folders, unpublish, sub-user, cluster |
| Functional | 68 | Create builder, list/search/pagination, edit, delete, bulk ops, publish flow, integrations, UX |
| Regression | 9 | CRUD cycle, bulk delete, Library tabs, July-2026 defect replay, browsers |
| Performance | 17 | API p95 latency, burst create, UI load, bulk delete time, large lists, memory, 220-set volume run |
| Security | 24 | AuthN/AuthZ, IDOR, RBAC, XSS, NoSQL/regex injection, validation, data exposure, abuse, approval bypass |

## How the cases were built
From the live cms2 UI and API (card/edit/delete/bulk/publish flows and `mediaSet/*` endpoints), the ClickUp *Media Sets* list, and the 2026-07-09 CRUD report. Rows marked **Observed** record what was seen on 2026-10-07; **Not run** rows have no result yet.

## Automation (`tests/cms2/media-sets/`, run with `TEST_ENV=cms2`)
`smoke/` SMK-01..05 · `crud/` CRUD-C1..D3 · `api/` API-01..30 + API-D1..D10 (project `api`, 26 tests) · `functional/` BULK-01..08 · `load/` LOAD-01..06 and VOL-01..07 (220 sets) · existing `crud/…create-builder` and `search/`.
Run: `npx cross-env TEST_ENV=cms2 playwright test tests/cms2/media-sets --project=chromium`
Every spec creates sets with prefix `ZZ_QA_MS_` and sweeps them afterwards.

## Known gaps and findings (2026-10-07)
- **Not safe to automate on shared cms2:** publish/unpublish to real screens, approval flow, escalation mail (MS-FN-B12, P13, P14, SC-22) — need an approved test screen.
- **Observed failures:** file name truncated, no aspect-ratio text, tiny/broken row thumbnail, helper is plain text not a grey container (MS-FN-P09/P11/P12).
- **Observed oddities:** bulk delete of 20 sets blocks the modal ≈16 s (MS-PF-06); tab badge "Media Sets (4)" vs "Total - 3" (MS-FN-R09); multi-set publish uses a dropdown + arrows, not tabs (MS-FN-P08).
- **Security cases are written, not executed** (except anonymous read/create): they need a second account, a restricted role and a sub-user. Re-verify July BUG-1..5 first (MS-RG-07).
- **Load:** bounded bursts only; real load/soak belongs in k6 on an isolated environment (MS-PF-12).

## API defects found while writing the API cases (2026-10-07, all still open)
Automated as `test.fail()` in `tests/cms2/media-sets/api/media-sets-api.spec.ts` — green while broken, red once fixed (then remove the marker).

| ID | Defect |
|---|---|
| API-D1 | `name` null / number accepted (stored as "null", "12345") |
| API-D2 | No name length cap (300 chars saved) |
| API-D3 | `zones` omitted entirely accepted (only `[]` is rejected) |
| API-D4 | Orientation not enforced server-side (portrait file in Landscape zone → 201) |
| API-D5 | Orphan `folderId` accepted |
| API-D6 | Update can blank the name (create cannot) |
| API-D7 | Malformed id on update/delete → HTTP 500 |
| API-D8 | Malformed `folderId` on read → HTTP 500 |
| API-D9 | Wrong HTTP method → 404 body leaks `/var/www/v3-2/server/…` |
| API-D10 | Negative / non-numeric `limit`/`page` silently accepted; no `limit` ceiling |

Fixed since the July report: duplicate names now 409, `zones: []` now 400, malformed `folderId` on create now 400.
