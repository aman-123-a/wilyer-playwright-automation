# Execution guide

## The two axes

Every run picks a **target** (which server) and a **selection** (which tests).

```bash
npm run <environment> -- <playwright flags>
```

```bash
npm run cms2 -- --grep @smoke
npm run cms3 -- tests/campaigns --project=firefox
npm run live -- --grep @smoke --project=chromium
```

Anything after `--` goes straight to Playwright.

## Selecting by tag

Tags are the primary selector — they survive file moves, which paths do not.

| Script               | Tag            | Purpose                            |
| -------------------- | -------------- | ---------------------------------- |
| `npm run smoke`      | `@smoke`       | fast confidence check              |
| `npm run sanity`     | `@sanity`      | slightly wider than smoke          |
| `npm run regression` | `@regression`  | the full suite                     |
| `npm run boundary`   | `@boundary`    | limits and edge values             |
| `npm run negative`   | `@negative`    | invalid input and error paths      |
| `npm run security`   | `@security`    | injection, authz, session handling |
| `npm run rbac`       | `@rbac`        | role and permission behaviour      |
| `npm run a11y`       | `@a11y`        | accessibility audits               |
| `npm run perf`       | `@performance` | performance budgets                |

Additional markers used in titles: `@critical`, `@p1`, `@ui`, `@api`, `@destructive`.

Combine them with Playwright's grep syntax:

```bash
npx playwright test --grep "@smoke.*@critical"
npx playwright test --grep-invert @destructive
```

## Selecting by path

```bash
npx playwright test tests/campaigns
npx playwright test tests/playlists/boundary
npx playwright test tests/screens/boundary/location-settings.spec.ts
```

## Projects

| Project         | What it runs                                 |
| --------------- | -------------------------------------------- |
| `setup`         | authenticates once, writes the storage state |
| `api`           | `tests/**/api/` only — no browser            |
| `chromium`      | desktop Chrome                               |
| `firefox`       | desktop Firefox                              |
| `webkit`        | desktop Safari                               |
| `Mobile Chrome` | Pixel 7 viewport                             |
| `Mobile Safari` | iPhone 14 viewport                           |

API specs live in `tests/<module>/api/` and are claimed by the `api` project, which
runs them **once**. The browser projects exclude them — running identical HTTP calls
five times produces five copies of one signal at five times the cost.

```bash
npm run api
npm run mobile
npx playwright test --project=chromium --project=webkit
```

## Destructive suites

Suites that create, update or delete real data are gated:

```bash
CMS_ALLOW_DESTRUCTIVE=true npm run cms2 -- --grep @regression
```

Without the flag they skip. On `live` they skip regardless of the flag — production
is read-only and the framework enforces that in `config/env.ts`, not by convention.

Every artefact a destructive suite creates is named through
`test-data/factories.ts` with a `QA-` prefix, so teardown can sweep by prefix without
touching real content.

## Debugging

```bash
npm run test:headed          # watch it run
npm run test:ui              # Playwright UI mode — time-travel debugging
npm run test:debug           # step through with the inspector
npm run trace reports/cms2/test-results/<test>/trace.zip
```

Useful flags:

```bash
--workers=1        # serialise; removes cross-test interference
--repeat-each=5    # flakiness hunting
--retries=0        # see the first failure rather than a retry
--timeout=0        # disable the per-test timeout while stepping
```

## Reports

Written to `reports/<env>/`:

```
reports/cms2/
├── html/            interactive HTML report
├── allure-results/  raw Allure data
├── results.json     machine-readable summary
├── junit.xml        for CI test reporting
└── test-results/    traces, screenshots, video
```

```bash
npm run report
npm run allure:serve
```

On failure the framework automatically attaches a screenshot, a video, a trace (on
first retry), the captured console errors and the API call log — enough to triage
without reproducing locally.

## Docker

```bash
npm run docker:build

docker compose -f docker/docker-compose.yml run --rm smoke
TEST_ENV=cms3 docker compose -f docker/docker-compose.yml run --rm e2e
docker compose -f docker/docker-compose.yml up report   # serves on :9323
```

Credentials come from your shell or `.env` — never from the image.
