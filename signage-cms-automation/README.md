# Signage CMS — Playwright Automation Framework

Production-ready **Playwright + TypeScript** automation for the Wilyer Digital
Signage CMS (`https://cms.pocsample.in/`). Page Object Model, reusable login
fixture, console/API monitoring, HTML + Allure reports, screenshots/video/trace
on failure, parallel execution, and a GitHub Actions pipeline.

## Project structure

```
signage-cms-automation/
├── src/
│   ├── pages/        # Page Objects: Login, Dashboard, Playlist, Media, Screen, Account, Base
│   ├── tests/
│   │   ├── smoke/        # @smoke — TC_AC_/TC_PL_/TC_MD_/TC_SC_/TC_APP_
│   │   └── regression/   # @regression — deeper cross-module coverage
│   ├── utils/        # consoleMonitor, apiMonitor, assertions, logger
│   ├── fixtures/     # test-fixtures.ts (page objects + monitors + auto screenshots)
│   ├── data/         # test-data.ts + data/media/ sample upload files
│   ├── helpers/      # global-setup, global-teardown, auth.setup, screenshot
│   └── config/       # env.ts (typed .env loader)
├── playwright.config.ts
├── .env.example
└── .github/workflows/playwright.yml
```

## Setup

```bash
cd signage-cms-automation
npm install
npx playwright install --with-deps
cp .env.example .env        # adjust credentials if needed
```

## Running

```bash
npm test                 # full suite, all projects
npm run smoke            # @smoke only
npm run regression       # @regression only
npm run smoke:auth       # a single smoke spec
npm run chromium         # one browser project
npm run test:headed      # watch it run
npm run test:ui          # Playwright UI mode
```

### Reports

```bash
npm run report           # open the Playwright HTML report
npm run allure:serve     # generate + open the Allure report
```

Artifacts: `playwright-report/` (HTML), `allure-results/` → `allure-report/`,
`reports/results.json`, `reports/junit.xml`, `test-results/` (traces/videos).

## Authentication

`src/helpers/global-setup.ts` logs in **once** as admin and caches the session
to `.auth/admin.json`. Every browser project reuses that `storageState`, so all
smoke tests start already authenticated. Doing this in `globalSetup` (rather than
a `setup` project) makes it **filter-proof** — running a single spec, a `--grep`,
or one test from the IDE still gets an authenticated session. `TC_AC_001` /
`TC_AC_002` re-verify the real login/logout from a clean, unauthenticated context.

## Monitoring & fail policy

Each test attaches `page.on('console')`, `page.on('pageerror')`,
`page.on('requestfailed')`, and `page.on('response')` listeners via the fixtures.

| Signal                              | Behaviour                                   |
| ----------------------------------- | ------------------------------------------- |
| Uncaught page exception             | **Always fails** the test                   |
| API response `>= 500`               | **Always fails** (`CMS_FAIL_ON_SERVER_ERROR`) |
| Console error / non-2xx (`4xx`) API | Warns + attaches; fails only if `CMS_STRICT_MONITORS=true` |

This keeps the genuine smoke-exit signals hard while staying green against a
noisy live build that emits benign analytics/4xx console noise.

## Configuration (`.env`)

| Variable                  | Default                     | Purpose                                  |
| ------------------------- | --------------------------- | ---------------------------------------- |
| `CMS_BASE_URL`            | `https://cms.pocsample.in`  | Target application                       |
| `CMS_ADMIN_EMAIL/PASSWORD`| `<set in local .env>`| Admin credentials                        |
| `CMS_ALLOW_DESTRUCTIVE`   | `false`                     | Allow live edit/delete writes            |
| `CMS_STRICT_MONITORS`     | `false`                     | Console/4xx errors fail the test         |
| `CMS_FAIL_ON_SERVER_ERROR`| `true`                      | 5xx always fails                         |

> Destructive operations (rename, delete, settings writes) are **gated** behind
> `CMS_ALLOW_DESTRUCTIVE`. By default those tests verify the affordance + UI
> non-destructively so the suite is safe and repeatable against live data.

## Smoke coverage

| Module          | Cases                                                            |
| --------------- | --------------------------------------------------------------- |
| Authentication  | `TC_AC_001` Login · `TC_AC_002` Logout · `TC_AC_003` Account     |
| Playlist        | `TC_PL_001`-`004` Create / Edit / Add-media / UI stability       |
| Media Library   | `TC_MD_001`-`003` Upload / File info / Delete                    |
| Screens         | `TC_SC_001`-`004` Open / Details / Update / All tabs             |
| Application     | `TC_APP_001`-`004` Hard refresh / Cache clear / Console / API    |

## CI/CD

`.github/workflows/playwright.yml` runs the `@smoke` suite on push/PR and
nightly, installs Chromium, and uploads the HTML report, Allure results, and
failure traces/videos as artifacts. Override credentials via repository secrets
(`CMS_ADMIN_EMAIL`, `CMS_ADMIN_PASSWORD`, `CMS_BASE_URL`).
