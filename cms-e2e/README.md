# CMS E2E — Enterprise Playwright + TypeScript Framework

End-to-end test framework for the Wilyer CMS (**https://cms.pocsample.in**).
Page Object Model, cross-browser + mobile, session reuse, console/API/perf
monitoring, accessibility, Lighthouse, k6 load testing, HTML + Allure reporting,
and CI/CD ready.

> Built as a clean, isolated framework under `cms-e2e/`. It does **not** touch
> the repo's existing JS suites (`tests/`, `tests/cms-suite/`, `cms-ts/`, `rbac/`).

---

## Quick start

```bash
cd cms-e2e
npm install
npm run install:browsers        # downloads browser binaries + OS deps
cp .env.example .env            # adjust credentials/thresholds as needed

npm run smoke                   # fast confidence check
npm test                        # full suite (all projects)
npm run report                  # open the HTML report
```

Selectors for the **Auth**, **Dashboard**, and **Library** modules were
validated live against the running CMS, so those suites pass out of the box.

---

## Architecture

```
cms-e2e/
├── playwright.config.ts        # projects, reporters, retries, parallelism
├── global-setup.ts             # app reachability check + artifact dirs
├── global-teardown.ts          # cross-run cleanup hook
├── config/env.ts               # typed env config (.env + defaults)
├── fixtures/test-fixtures.ts   # POM + console/API monitors injected per test
├── pages/                      # Page Object Model
│   ├── BasePage.ts             #   shared shell: nav routes, confirm dialog
│   ├── LoginPage.ts
│   ├── DashboardPage.ts
│   └── LibraryPage.ts
├── utils/
│   ├── consoleMonitor.ts       # records app console errors (filters 3rd-party)
│   ├── apiMonitor.ts           # records failed + slow same-origin APIs
│   ├── performance.ts          # navigation timing, heap, load-budget asserts
│   ├── assertions.ts           # broken-image / stuck-loader / monitor verdict
│   ├── accessibility.ts        # axe-core WCAG scan
│   └── lighthouse.ts           # Lighthouse audit + threshold gate
├── data/
│   ├── test-data.ts            # static payloads + unique-name generators
│   └── media/                  # sample upload files (gitignored)
├── tests/
│   ├── global.setup.ts         # `setup` project — logs in, caches session
│   ├── auth/auth.spec.ts
│   ├── dashboard/dashboard.spec.ts
│   ├── library/library.spec.ts
│   └── a11y/accessibility.spec.ts
├── perf/
│   ├── lighthouse-audit.spec.ts
│   └── k6/load-test.js
├── ci/
│   ├── github-actions.yml      # → copy to .github/workflows/
│   └── Jenkinsfile
└── Dockerfile
```

### Key design choices

- **Session reuse** — a dedicated `setup` project logs in once and saves
  `.auth/admin.json`; every browser project depends on it and reuses the
  storage state, so specs start authenticated. `auth.spec.ts` opts out with a
  clean context to test the login screen itself.
- **Monitors as fixtures** — `consoleMonitor` and `apiMonitor` attach to the
  page automatically. On failure their summaries are attached to the report.
  `assertClean()` enforces them (fail vs. warn via `CMS_STRICT_MONITORS`).
- **Destructive gating** — create/upload/delete tests run only when
  `CMS_ALLOW_DESTRUCTIVE=true`, so the default suite is read-only and safe.
- **Tag-based suites** — `@smoke`, `@sanity`, `@regression` select scope via
  `--grep`.

---

## Commands

| Command | What it runs |
| --- | --- |
| `npm test` | Full suite, all projects |
| `npm run smoke` / `sanity` / `regression` | Tag-filtered suites |
| `npm run chromium` / `firefox` / `webkit` | Single desktop browser |
| `npm run mobile` | Pixel 7 + iPhone 14 viewports |
| `npm run auth` / `dashboard` / `library` / `a11y` | Single module |
| `npm run perf:lighthouse` | Lighthouse audit + thresholds |
| `npm run perf:k6` | k6 load/stress test (requires k6 installed) |
| `npm run test:ui` / `test:debug` / `codegen` | Interactive tooling |
| `npm run report` | Open HTML report |
| `npm run allure:serve` | Build + open Allure report |
| `npm run lint` | TypeScript type-check (`tsc --noEmit`) |

---

## Reporting

- **HTML** → `playwright-report/` (`npm run report`)
- **Allure** → `allure-results/` → `npm run allure:serve`
- **JSON / JUnit** → `reports/` (CI consumption)
- **Screenshots / video / trace** → `test-results/` (captured on failure)
- **Lighthouse** → `lighthouse-reports/*.html`
- Console-error & failed-API logs are attached to each failing test.

---

## Configuration

All config flows through `config/env.ts` from `.env` (or CI env/secrets). See
`.env.example` for every key — base URL, credentials, performance budgets,
Lighthouse thresholds, and the `ALLOW_DESTRUCTIVE` / `STRICT_MONITORS` toggles.

---

## CI/CD

- **GitHub Actions** — `ci/github-actions.yml`: cross-browser matrix on
  push/PR, nightly cron, manual `workflow_dispatch` with a tag filter; uploads
  HTML + Allure artifacts. Store creds as `CMS_ADMIN_EMAIL` / `CMS_ADMIN_PASSWORD`
  repo secrets.
- **Jenkins** — `ci/Jenkinsfile`: runs in the Playwright Docker image,
  publishes HTML + JUnit, archives failure artifacts.
- **Docker** — `Dockerfile`: reproducible headless runner.

---

## Extending to the remaining modules

Auth, Dashboard, and Library are the proven template. To add Screens, Groups,
Clusters, Rollouts, Playlists, Team, Reports, Help, Feedback, and Account:

1. Add a page object under `pages/` (extend `BasePage`; routes are in
   `BasePage.ROUTES`).
2. Expose it as a fixture in `fixtures/test-fixtures.ts`.
3. Add `tests/<module>/<module>.spec.ts` following the existing structure
   (core flows tagged `@smoke`/`@sanity`, edge cases `@regression`).
4. Reuse `assertClean`, `measure`, `checkA11y`, and the monitors — no new
   plumbing required.

The repo's existing `pages/cms/*.js` page objects (Screens, Spaces/Groups,
Playlists, Reports, FileDetails) contain live-verified selectors worth porting.
```
