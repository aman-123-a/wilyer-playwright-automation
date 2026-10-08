# cms-e2e — Architecture

> Standalone TypeScript Playwright framework targeting the Wilyer CMS
> (`cms.pocsample.in` by default). This is the most modern, cleanly layered suite
> in the repo. Run it from this directory via its own `playwright.config.ts`.

## Layout

```
cms-e2e/
├─ config/env.ts            typed ENV (precedence: process.env > .env > defaults)
├─ global-setup.ts          authenticates once -> writes .auth/admin.json
├─ global-teardown.ts
├─ playwright.config.ts     testDir=./tests, 5 browser projects, globalSetup hook
├─ fixtures/test-fixtures.ts the wiring hub — every spec imports test/expect here
├─ pages/                   9 Page Objects + BasePage (~842 lines total)
├─ utils/                   monitors + capability helpers (a11y, lighthouse, api)
├─ data/                    test-data.ts + media/ upload fixtures
├─ perf/                    k6 load test + lighthouse-audit spec
└─ tests/                   13 specs across 11 feature folders (~78 tests)
```

## How it wires together (data flow)

```
config/env.ts  ──►  playwright.config.ts  ──►  global.setup (project "setup")
   ENV.BASE_URL          5 projects                  logs in, caches session
   ENV.ADMIN          (chromium/firefox/webkit       to .auth/admin.json
                       + Mobile Chrome/Safari)              │
                              │                             ▼
                              └── each project loads storageState ──► tests start logged in
                                                                          │
fixtures/test-fixtures.ts ◄───────────────────────────────────────────────┘
   • constructs all 9 page objects per test
   • auto-attaches ConsoleMonitor + ApiMonitor
   • afterEach: on failure, attaches console-errors + api-activity
                              │
   pages/ (BasePage ◄─ all 9 module pages)
```

### Two things make this framework tick

1. **`fixtures/test-fixtures.ts` is the single entry point.** Specs import
   `{ test, expect }` from here — never from `@playwright/test`. That injection is
   what provides `libraryPage`, `apiMonitor`, etc., and gives every test free
   failure diagnostics (console + API summaries attached on failure).

2. **`BasePage` holds the app-shell behaviour** — the `ROUTES` map, sidebar
   `navTo()`, `expectShellReady()`, and the shared `confirmDestructive()` dialog
   (`Continue` / `Yes` / `Confirm` / `Delete`). The 9 module pages extend it and
   stay focused on their own surface.
   > Note: sidebar selectors are intentionally **not anchored** because nav links
   > carry a leading icon glyph in their accessible name (e.g. " Logout").

## Page Objects (9 + base)

| POM            | Lines | POM                       | Lines |
| -------------- | ----- | ------------------------- | ----- |
| **LibraryPage** | 173  | TeamPage                  | 82    |
| ScreensPage    | 84    | PlaylistsPage             | 73    |
| LoginPage      | 83    | GroupsPage                | 71    |
| BasePage       | 82    | DashboardPage             | 70    |
|                |       | BillingPage / ReportsPage | 64/60 |

`LibraryPage` is ~2x any other — the upload flow (Browse Files -> `setFiles`
auto-start, no confirm button) lives there.

## Specs (~78 tests across 13 files)

| Folder                          | Tests | Folder                            | Tests |
| ------------------------------- | ----- | --------------------------------- | ----- |
| auth                            | 12    | permissions/rbac-data-driven      | 6     |
| dashboard                       | 11    | playlists                         | 5     |
| library                         | 10    | team                              | 5     |
| permissions                     | 5     | billing / groups / reports / screens | 4 ea |
| a11y                            | 2     | playlists/playlist-not-found      | 1     |

- `auth.spec.ts` is the only suite that **clears** the cached session; everything
  else starts already authenticated.
- `playlists/playlist-not-found.spec.ts` (1 test) is the deleted-playlist 404
  crash guard.

## utils/ — capability layer (not page logic)

- `consoleMonitor.ts` / `apiMonitor.ts` — auto-attached via fixtures.
- `assertions.ts` — custom expects.
- `accessibility.ts` + `lighthouse.ts` + `performance.ts` — back the `a11y/` and
  `perf/` specs.

## Config notable points

- **Workers capped at 4 (2 in CI)** — deliberate: the live CMS stalls under
  one-worker-per-core, causing navigation timeouts.
- `retries`: 2 in CI / 1 local. `trace: on-first-retry`. Video + screenshot on
  failure.
- Reporters: list + HTML + JSON + JUnit + **Allure**.
- 5 browser projects (chromium / firefox / webkit / Mobile Chrome / Mobile Safari),
  all depending on the `setup` project.
- `testIdAttribute: 'data-testid'`, `baseURL: ENV.BASE_URL`.

## Environment (`config/env.ts`)

Import the typed `ENV` object everywhere — never read `process.env` directly from
tests/pages. Precedence: `process.env` > `.env` file > built-in defaults.

| Key                          | Default                      |
| ---------------------------- | ---------------------------- |
| `CMS_BASE_URL`               | `https://cms.pocsample.in`   |
| `CMS_ADMIN_EMAIL/PASSWORD`   | `<set in local .env>` |
| `CMS_ALLOW_DESTRUCTIVE`      | `false`                      |
| `CMS_STRICT_MONITORS`        | `false` (monitors warn only) |
| `CMS_PERF_*`, `CMS_LH_*`     | perf / lighthouse budgets    |

`ADMIN_STORAGE_STATE = .auth/admin.json` is written by `global-setup.ts`.
backlog status an