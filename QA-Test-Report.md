# QA Test Report — Wilyer Signage CMS (Live)

**Application:** cms.wilyersignage.com
**Build version:** v3.5.20
**API backend:** `https://v3-5api.wilyersignage.com/v3/cms/*`
**Environment:** Production / Live
**Account used:** <admin — see local .env> (role `user`, full access)
**Report date:** 2026-06-25
**Tester / QA:** Aman Kumar
**Tooling:** Playwright (TypeScript/JS), manual exploratory smoke, API request-context tests

---

## 1. Executive summary

Testing was performed against the **live** Wilyer Signage CMS across three layers:
UI smoke (functional load/search/render), API read-path + auth + input validation,
and an automated Playwright regression suite. **Overall verdict: PASS — the live build
is healthy and usable.**

- All 9 navigation modules load and search works on every module that has it.
- **0 console errors** session-wide post-login.
- API read endpoints all return 200 with consistent shapes; auth and input validation are solid.
- **1 real server bug** (500 on param-less list endpoints) and a few minor/cosmetic issues found.
- No production data was created, modified, or deleted — all live testing was non-destructive (read-only).

---

## 2. Testing performed (what was done)

| Layer | Type | Scope | Result |
| --- | --- | --- | --- |
| UI | Functional smoke | 9 modules + screen detail: load, search, render | PASS |
| API | Read-path / auth / validation | 21 endpoints, auth scheme, Joi validation, injection/XSS | PASS (1 bug) |
| Automated | Regression suite (Playwright) | Auth, dashboard, library, playlists, screens, groups, RBAC, etc. | See §5 |

**Live runs were non-destructive.** Not executed against production: CRUD create/edit/delete,
media upload, role/permission changes, scheduling and publish-approval workflows.

---

## 3. UI smoke results (manual, prod-safe)

| Module | Loads | Search | Notes |
| --- | --- | --- | --- |
| Dashboard | PASS | n/a | 69 screens, 1538 media files, 66.38 GB, last-5 table, location map |
| Screens | PASS | PASS | `bhavy` → 6 correct results; filters, tags, pagination |
| Library | PASS | PASS | `test` filtered 1208 → 44 files; All/Videos/Photos tabs |
| Playlists | PASS | PASS | 135 playlists, folder tree, matched cards |
| Groups | PASS | PASS | 50 groups |
| Clusters | PASS | PASS | 43 clusters |
| Team | PASS | PASS | Members/Roles tabs |
| Reports | PASS | PASS | Analytics / Previous Reports; screen search-select |
| Account | PASS | n/a | Profile / Adaptive Content / Device Profile tabs |
| Screen detail | PASS | n/a | Active Playlist, Schedule/Settings, Assign Playlist |

- **Console errors:** 0 (post-login). Login/auth PASS (reCAPTCHA-protected).

---

## 4. API results (read-only, prod-safe)

- **Endpoint health:** all 21 module read endpoints → **200**, latency ~300–490 ms, consistent paginated shapes.
- **Authorization (PASS):** only `Authorization: Bearer <jwt>` accepted; missing/wrong-scheme tokens cleanly **401** — no bypass.
- **Input validation (PASS):** `limit=-5` → 400, `limit=999999` → 400 (cap 1000), `page=abc` → 400;
  SQL-ish `sort` injection ignored safely; `<script>` search treated as literal (0 matches, not executed); malformed ObjectId → 404.

---

## 5. Automated suite results

Latest recorded Playwright runs (per-suite `results.json`):

| Suite | Passed | Failed | Skipped | Flaky | Notes |
| --- | --- | --- | --- | --- | --- |
| `wilyer-signage-suite` | 9 | 0 | 0 | 0 | Production-targeted suite — all green |
| `signage-cms-automation` | 18 | 0 | 0 | 0 | Smoke + navigation regression |
| `cms-e2e` | 64 | 8 | 10 | 1 | Broad e2e; failures to triage (see §7) |
| `reports/cms` | 1 | 0 | 0 | 0 | — |
| `search-suite` | 0 | 0 | 351 | 0 | All skipped — suite not executed/configured |

The repository contains **106 spec files** across 8 frameworks (cms-e2e, cms-ts, rbac,
wilyer-signage-suite, signage-cms-automation, wilyer-upload-framework, search-suite, tests/).

---

## 6. Issues found

| # | Severity | Area | Description |
| --- | --- | --- | --- |
| 1 | Low/Medium (real bug) | API | `GET /screen/read` and `/playlist/read` with **no query params** return **500** instead of 400; validation path bypassed → unhandled exception. UI unaffected (always sends params). Fix: schema defaults / `.required()`. |
| 2 | Low | Front-end | Razorpay checkout script requested as `.../build/undefined` (version var resolves to `"undefined"`) → `ERR_BLOCKED_BY_ORB`. |
| 3 | Minor | Front-end | `/screen/read` fires twice on load; one aborted (React effect double-invoke). |
| 4 | Minor / cosmetic | Account > Profile | Heading reads **"Organziation Name"** — typo, should be "Organization Name". |
| 5 | Triage | cms-e2e suite | 8 failing + 1 flaky test in the broad e2e run; need triage to separate real defects from app-slowness/selector flakiness. |

---

## 7. Scope, risks & recommended next steps

**Not tested against live (intentionally, to stay prod-safe):**
CRUD create/edit/delete, media upload, RBAC of a restricted sub-user, scheduling /
publish-approval, IDOR / cross-tenant access.

**Recommended next:**
1. Fix API bug #1 (500 → 400 on param-less list endpoints).
2. Triage the 8 `cms-e2e` failures + 1 flaky; classify real defects vs. flakiness.
3. Configure/run `search-suite` (currently 351 skipped).
4. Run CRUD flows with cleanup on a staging/sandbox account (not live).
5. Codify the smoke + API sweep as repeatable Playwright specs in `wilyer-signage-suite/`.

---

*Non-destructive testing only on the live environment. No production data was altered.*
