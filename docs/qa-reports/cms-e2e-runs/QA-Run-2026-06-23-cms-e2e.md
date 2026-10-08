# CMS E2E — Test Execution Report

| | |
| --- | --- |
| **Suite** | `cms-e2e` (TypeScript Playwright) |
| **Target** | https://cms.pocsample.in |
| **Project** | chromium (Desktop Chrome, 1440×900) |
| **Mode** | Headless · 4 workers · non-destructive (`CMS_ALLOW_DESTRUCTIVE=false`) |
| **Date** | 2026-06-23 |
| **Duration** | 11.2 min |
| **Branch** | fix/cms-e2e-library-tabs-and-playlist-404-guard |

## 1. Summary

| Outcome | Count |
| --- | --- |
| ✅ Passed | 64 |
| ❌ Failed | 8 |
| ⚠️ Flaky (passed on retry) | 1 |
| ⏭️ Skipped (destructive gated) | 4 |
| ⏸️ Did not run | 6 |
| **Total** | **83** |

Every CMS module loaded and passed its core checks. Of the 8 failures, **1 is a
confirmed product bug**, **4 point to a client-side authorization/UX gap that
needs product triage**, and **3 are test-side issues** (selector / data drift /
infra flake) — not application defects.

## 2. Defects (real product issues)

### BUG-1 — Deleted playlist throws an uncaught exception  ·  Severity: High
- **Test:** `tests/playlists/playlist-not-found.spec.ts:27`
- **Steps:** Navigate directly to a deleted/non-existent playlist URL.
- **Expected:** "Playlist not found" message, no uncaught exceptions.
- **Actual:** The "Playlist not found" alert renders **and** the page throws:
  ```
  [pageerror] TypeError: Cannot read properties of undefined (reading 'forEach')
  ```
- **Assessment:** Graceful on the surface, but a component still iterates
  `undefined`. The 404-guard test correctly caught a live crash. Reproducible.
- **Action:** File a ticket; attach console trace + `test-results/.../trace.zip`.

## 3. Needs product triage (authorization / UX)

### TRIAGE-1 — Direct-URL access to restricted routes is not redirected/denied
- **Tests:** `tests/permissions/permissions.spec.ts:104` for `/team`, `/billing`,
  `/admin`, `/management` (4 failures).
- **Observed:** Restricted role user (`amankumarbsrbsr@gmail.com`) authenticates;
  sidebar is correctly trimmed (no Team / Billing / Reports links — UI fencing
  works). The API-403 graceful-handling test **passed**, so data appears
  protected server-side. However, typing a restricted URL keeps the user on the
  route with **no redirect and no "Access Denied"** surface.
- **Assessment:** Likely a **client-side routing gap**, not a confirmed data
  leak. Caveat: `/admin` and `/management` are *guessed* routes that may not
  exist — that portion is a test-design weakness. `/team` and `/billing` are real
  routes and warrant a product look.
- **Action:** Verify `/team` & `/billing` direct-URL behaviour live before
  escalating; tighten the test to drop guessed routes.

## 4. Test-side issues (not application bugs)

| ID | Test | Root cause | Fix |
| --- | --- | --- | --- |
| TEST-1 | `tests/billing/billing.spec.ts:12` & `:31` (`expectPlansLoaded`) | Page + all tabs load fine; admin account has **no active licenses** and the empty-state regex `/no (plan\|purchase\|data)/` does not match the live copy → false failure. | Update empty-state matcher to the actual billing copy. |
| TEST-2 | `tests/permissions/rbac-data-driven.spec.ts:256` (REVOKED → /reports) | Expects a role card literally named **"un"** to pre-exist in Team → Roles; it no longer exists (data drift). Likely cascaded the **6 "did not run"** in the serial block. | Seed/repair the role fixture. |
| FLAKY-1 | `tests/library/library.spec.ts:93` (clean console/API) | `page.goto /library` hit the 30s nav timeout once, **passed on retry**. Known slow-app flakiness. | None — monitor; retries absorb it. |

## 5. Coverage notes

- **Not exercised this run (gated):** create / upload / delete paths — 4
  destructive tests skipped by design. Re-run with `CMS_ALLOW_DESTRUCTIVE=true`
  to cover them.
- **Fixed earlier this session:** Library upload trigger selector
  (`Upload Files` → `Upload Media`) and the upload wait (fixed sleep → upload
  response listener). Validated headed: 2 passed.

## 6. Modules verified (passing)

Auth · Dashboard · Library (load/search/filter/pagination/detail/perf) ·
Groups · Screens · Playlists (happy path) · Team · Reports · Billing (nav +
tabs) · Permissions (positive entitlement, hidden-control, API-403 handling) ·
Accessibility (a11y) smoke.

## 7. Recommended next steps

1. File **BUG-1** (playlist `forEach` crash).
2. Triage **TRIAGE-1** (`/team`, `/billing` direct-URL guard) with the product team.
3. Fix **TEST-1** and **TEST-2** so the suite reflects true status.
4. Re-run with destructive enabled for full CRUD coverage.

---
*Generated from the chromium run on 2026-06-23. Artifacts: `playwright-report/`,
`test-results/`, `allure-results/`.*
