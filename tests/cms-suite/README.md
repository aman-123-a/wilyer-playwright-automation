# CMS Regression Suite

Enterprise-grade Playwright suite for **https://cms.pocsample.in** — Page Object
Model, network-level failure injection, automatic crash/console/API monitoring,
HTML + JSON + JUnit reporting, trace/video/screenshots on failure, parallel
execution, and a CI workflow.

It is **fully isolated** from the repo's pre-existing tests via its own config
(`playwright.cms.config.js`) and test dir (`tests/cms-suite/`). Running it does
not affect, and is not affected by, the other suites.

## Quick start

```bash
# 1. (optional) point the suite at a different env / creds
cp .env.cms.example .env.cms      # then edit; or just use the built-in defaults

# 2. install browsers (first time only)
npm run playwright:install

# 3. run the 

npm run cms

# 4. open the HTML report (with trace viewer + videos)
npm run cms:report
```

Useful scoped runs:

| Command | What it runs |
|---------|--------------|
| `npm run cms:smoke` | Just the `Positive` happy-path tests |
| `npm run cms:auth`  | Authentication suite only |
| `npm run cms:headed`| Whole suite with a visible browser |
| `npm run cms:ui`    | Playwright UI mode (time-travel debugging) |
| `npx playwright test --config=playwright.cms.config.js --grep "Performance"` | Any tag/title filter |

## Layout

```
playwright.cms.config.js        # dedicated config (reporters, trace, retries, parallel)
global-setup.cms.js             # app-reachable check + cached admin session
.env.cms.example                # env template (creds, thresholds, toggles)
.github/workflows/cms-regression.yml  # CI pipeline (push/PR/nightly/manual)

helpers/
  loginHelper.js                # reusable login / logout / role helpers

fixtures/
  cms-fixtures.js               # extends `test`: authed pages + auto monitors
  cms-media/                    # tiny media fixtures for upload tests (png + unsupported txt)

pages/cms/                      # Page Object Model
  BasePage.js  LoginPage.js  DashboardPage.js
  LibraryPage.js  FileDetailsPage.js  PlaylistsPage.js
  SpacesPage.js  ReportsPage.js

utils/cms/
  env.js            # env loader (process.env > .env.cms > defaults)
  consoleMonitor.js # console errors + uncaught exceptions, noise-filtered
  apiMonitor.js     # status codes, failed/slow/transport failures, summary
  crashDetector.js  # white screen / crash text / infinite spinner probes
  performance.js    # load timing, paint timing, heap growth, request counting
  mocks.js          # page.route() failure injection (500/slow/corrupt/schema)
  assertions.js     # schema validation, status/timing assertions

tests/cms-suite/
  auth.spec.js                # positive / negative / edge
  dashboard-analytics.spec.js # positive / negative(mock) / edge / performance
  subuser-scoping.spec.js     # positive / negative / edge / security
  playback-analytics.spec.js  # positive / negative(mock) / edge(mock)
  athena-export.spec.js       # positive / negative(mock) / edge / performance
  playlist-screens.spec.js    # screens-field contract change (.map/.length crash)
  notification-cron.spec.js   # observable inputs + documented backend-only skips
  global-frontend.spec.js     # per-route health + rapid-nav crash detection
  api-validation.spec.js      # status/schema/timing + unauthorized access
  library-crud.spec.js        # Library: list/search/upload/delete/pagination/preview/unsupported
  playlist-crud.spec.js       # Playlist: create/edit/delete/duplicate/empty + triggers
  spaces-rooms.spec.js        # Spaces/Rooms == Groups: create/edit/delete/duplicate/restore
  known-bugs-regression.spec.js # the 11 post-merge bugs, each tagged [BUG:n]
  comparison.spec.js          # cms.pocsample.in (staging) vs cms.wilyersignage.com (prod)
```

> **Spaces / Rooms == Groups.** The CMS has no separate Spaces/Rooms route; the
> `/groups` module groups screens like rooms/spaces, so `spaces-rooms.spec.js`
> targets `/groups`. The "duplicate room" and "deleted room restore" bugs live there.

> **Destructive flows are self-cleaning and gated.** `library-crud`,
> `playlist-crud` and `spaces-rooms` create then delete their own data (unique
> `TEST_PW_*` / `pwtest_*` names) and only run when `CMS_ALLOW_DESTRUCTIVE=true`
> (the default). Uploads use a uniquely-named in-memory payload so cleanup finds
> exactly what was created. Scoped runs: `npm run cms:library` / `cms:playlist` /
> `cms:spaces` / `cms:bugs` / `cms:compare`.

## How backend-only failures are tested

Many requirements describe **server-side** failure modes — Athena query
failures, S3 upload errors, SMTP/cron failures, API 500s, corrupted payloads,
"millions of records". A browser cannot trigger these against a live server.

The suite reproduces them deterministically at the **network boundary** with
`page.route()` (see `utils/cms/mocks.js`) and asserts the **frontend's**
reaction: no crash, no white screen, the loader clears, totals stay consistent.
These tests are labelled `(injected)` and run with `strictMonitors: false` so the
injected errors don't trip the auto health-check.

Genuinely un-observable cases (SMTP delivery, cron scheduling) are **explicitly
skipped with a documented reason** rather than faked. Wire a cron-trigger
endpoint + mail-catcher and set `CMS_CRON_TRIGGER_URL` / `CMS_MAILCATCHER_URL`
to turn those into real assertions (see `notification-cron.spec.js`).

## Automatic, suite-wide guarantees

Every test using the fixtures gets, for free:

- **Console-error capture** (`pageerror` + console `error`), third-party noise filtered.
- **API monitoring** — status codes, 5xx, transport failures, slow calls.
- **Post-test health check** — fails (strict) or warns (default) on console errors / unexpected 5xx.
- **On failure**: screenshot + video + trace (open via `npm run cms:report`).

Flip `CMS_STRICT_MONITORS=true` once the app is clean to make console errors and
unexpected 500s hard failures everywhere.

## Configuration

All config is env-driven (`utils/cms/env.js`), resolved as
`process.env` → `.env.cms` → defaults:

| Var | Default | Meaning |
|-----|---------|---------|
| `CMS_BASE_URL` | `https://cms.pocsample.in` | target app (merged/staging) |
| `CMS_PROD_URL` | `https://cms.wilyersignage.com` | production reference (comparison spec) |
| `CMS_ADMIN_EMAIL` / `CMS_ADMIN_PASSWORD` | `dev@wilyer.com` / `testdev` | admin account |
| `CMS_SUBUSER_EMAIL` / `CMS_SUBUSER_PASSWORD` | `subuser@wilyer.com` / `12345` | scoped account |
| `CMS_PERF_PAGE_LOAD_MS` | `5000` | target page-load budget |
| `CMS_PERF_RELAXED_LOAD_MS` | `10000` | network-idle load budget |
| `CMS_API_SLOW_MS` | `3000` | slow-request threshold |
| `CMS_ALLOW_DESTRUCTIVE` | `true` | allow create/delete flows |
| `CMS_STRICT_MONITORS` | `false` | fail vs warn on console/5xx |

## CI

`.github/workflows/cms-regression.yml` runs on push to `main`, PRs, a nightly
cron, and manual dispatch (with an optional `--grep` filter). It uploads the
HTML report, machine-readable JSON/JUnit, and failure traces/videos as
artifacts. Provide creds via repo secrets (`CMS_ADMIN_EMAIL`, etc.).
