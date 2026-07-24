# Wilyer Signage CMS — Test Suite Report

**Target:** `https://cms.wilyersignage.com` (live) · **Browser:** Chromium ·
**Runner:** Playwright 1.59 / TypeScript · **Account:** `<admin — see local .env>` (admin)

---

## 1. What was delivered

A self-contained, production-grade Playwright + TypeScript suite under
`wilyer-signage-suite/` covering all 15 requested categories.

| Area | Files |
| --- | --- |
| Page Object Model | `pages/` — 13 page objects (Login, Dashboard, Screens, ScreenDetail, Groups, Clusters, Library, Playlist, Rollouts, Team, Reports, Account, + `BasePage`/`CrudModule`) |
| Fixtures | `fixtures/test.ts` — all POMs + passive monitors + a `requireDestructive` guard |
| Data generators | `utils/dataGenerators.ts` — entities, boundary strings, special/unicode/XSS/SQLi, emails, passwords, numeric boundaries |
| Upload files | `utils/files.ts` — sized images/videos, disallowed `exe/bat/php`, corrupt, tricky names |
| API mocking | `utils/apiMocks.ts` — `inject()` / `withFailure()` / `stubJson()` for 500/404/401/403/timeout/empty/null/malformed/networkError |
| Resilience | `utils/resilience.ts` — no-white-screen / no-react-crash / error-shown / can-recover |
| Monitors | `utils/monitors.ts` — console-error + 5xx collectors (strict or annotate) |
| Config | `playwright.config.ts` — projects: `setup`, `smoke`, `regression`, `edge`, `no-auth`; HTML + JSON + JUnit reporters; trace/screenshot/video on failure |

**Total: 241 tests across 19 spec files** (`npx playwright test --config=wilyer-signage-suite/playwright.config.ts --list`).

---

## 2. Live execution results

Executed against the live CMS (read-only + API-failure-injection paths; destructive
CRUD is gated off by default — see §4). **All executed tests pass.**

| Suite | Result |
| --- | --- |
| **Authentication** (`no-auth`) | **9 / 9 passed** |
| **Dashboard** | **9 / 9 passed** |
| **API Failure Injection** (8 modules × 8 scenarios) | **64 / 64 passed** |
| Setup / auth bootstrap | 1 / 1 passed |
| **Total verified green** | **82 / 82** |

API-failure matrix = `dashboard, screens, groups, clusters, library, playlists,
rollouts, reports` × `http500, http404, http401, timeout, emptyArray, nullBody,
malformedJson, networkError`.

### Headline: graceful-degradation contract held

Under every injected failure across all eight modules, the app showed **no white
screen, no React crash**, and the navigation shell stayed interactive (user can
recover). This is a **positive result against the known "blank white-screen on
API failure" regression** — for these read paths it did not reproduce.

---

## 3. Findings surfaced during the run

These were caught by the suite while bringing it to green; the first three were
**test-harness robustness fixes**, the rest are **real app observations**.

1. **Slow SPA bootstrap (≈3–5 s).** Pages report "blank" if asserted right after
   `domcontentloaded`. Fixed with a content-aware `waitForAppSettled()` instead
   of fixed delays — important for any future tests on this app.
2. **Single-account rate-limiting (HTTP 429).** Driving `<admin — see local .env>` with 3
   parallel workers caused the app shell itself to fail to bootstrap → false
   "white screen". The API-failure suite is now documented to run `--workers=1`.
3. **`.first()` on selector unions can resolve to a hidden element** (the page
   has dozens of hidden nav-icon SVGs and a hidden `<header>`). Fixed with
   `.filter({ visible: true })` in the recover/charts checks.
4. **Auth-guard renders login in-place, keeps the URL.** Deep-linking to
   `/screens` unauthenticated does **not** change the URL to `/login`; it renders
   the login form at the same path after ~5 s. Tests now wait for the login
   control rather than a URL change.
5. **License banners present & correct** on the dashboard: "14 screens have
   expired" (expired) and "2 screens will expire within 30 days" (expiring).
6. **Dashboard stats confirmed:** Online/Offline/Total Screens, Total Media,
   Storage Used, Available Licences, Licenses Expiring Soon, plus the
   Screens/Players data table.

---

## 4. What is gated (not yet executed) and why

| Category | Status | To enable |
| --- | --- | --- |
| Screens / Groups / Clusters / Library / Playlist / Rollouts / Team / Account **CRUD + boundary mutations** | **Soft-skipped** | Set `CMS_ALLOW_DESTRUCTIVE=true` (point at **staging**, not prod) and confirm each module's `data-testid`s — the POMs use resilient `.or()` fallbacks but real test-ids make them deterministic |
| **Security · RBAC** (viewer/editor cannot edit/delete/billing) | **Soft-skipped** | Provision `CMS_VIEWER_EMAIL` / `CMS_EDITOR_EMAIL` accounts |
| **Reports exports** (PDF/CSV/Excel) | Runs; skips if no export control is exposed to this account | Account with export entitlement |

Soft-skip = the test is reported as *skipped* with a reason, never a false
failure. This keeps the suite safe to point at production.

---

## 5. How to run

```bash
SUITE=wilyer-signage-suite/playwright.config.ts

npx playwright test --config=$SUITE --project=smoke           # post-deploy gate
npx playwright test --config=$SUITE --project=no-auth         # auth + API security
npx playwright test --config=$SUITE tests/api-failure --workers=1   # resilience matrix
npx playwright test --config=$SUITE --project=regression      # full (mutations need CMS_ALLOW_DESTRUCTIVE=true)
npx playwright show-report wilyer-signage-suite/playwright-report
```

Reporters emit HTML (`playwright-report/`), JSON (`reports/results.json`), and
JUnit (`reports/junit.xml`) on every run.
