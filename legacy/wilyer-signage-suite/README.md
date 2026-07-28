# Wilyer Signage CMS — Playwright TypeScript Suite

Production-grade, self-contained E2E suite covering CRUD, boundary-value
analysis, edge cases, negative scenarios, API-failure injection, RBAC security,
and a post-deploy smoke gate.

> Self-contained: it resolves `@playwright/test` from the repo-root
> `node_modules`, so no separate install is needed inside this folder.

## Layout

```
wilyer-signage-suite/
├─ playwright.config.ts      # reporters, projects (setup/smoke/regression/edge/no-auth)
├─ config/
│  ├─ env.ts                 # env config (no dotenv dep) + safety toggles
│  └─ routes.ts              # UI routes + API globs for failure injection
├─ fixtures/test.ts          # custom fixtures: all POMs + monitors + guards
├─ pages/                    # Page Object Model (one class per module)
├─ utils/
│  ├─ dataGenerators.ts      # entities, boundary strings, special/unicode, emails, numerics
│  ├─ files.ts               # on-the-fly upload files (sizes, bad ext, corrupt, tricky names)
│  ├─ apiMocks.ts            # page.route() failure-injection toolkit
│  ├─ resilience.ts          # no-white-screen / no-crash / error-shown assertions
│  └─ monitors.ts            # passive console-error + 5xx collectors
└─ tests/                    # 15 categories, tagged @smoke / @edge
```

## Run

```bash
# from repo root
SUITE=wilyer-signage-suite/playwright.config.ts

# everything (auth + regression + edge), Chromium
npx playwright test --config=$SUITE

# fast post-deploy gate
npx playwright test --config=$SUITE --project=smoke

# full regression (excludes @edge heavy cases)
npx playwright test --config=$SUITE --project=regression

# heavy edge/scale cases only
npx playwright test --config=$SUITE --project=edge

# logged-out tests (auth + API security)
npx playwright test --config=$SUITE --project=no-auth

# API failure-injection matrix only (no module selectors needed — most robust)
npx playwright test --config=$SUITE tests/api-failure

# open the HTML report
npx playwright show-report wilyer-signage-suite/playwright-report
```

### Safety toggles

- `CMS_ALLOW_DESTRUCTIVE=false` (default) — create/delete/upload tests **soft-skip**,
  so the suite is safe to point at production. Set `true` against staging to run mutations.
- `CMS_STRICT_MONITORS=true` — console errors / 5xx responses **fail** the test
  instead of just annotating the report.
- `CMS_MANUAL_AUTH=true` + a captured `.auth/admin.json` — reuse a hand-made
  session for OTP/2FA logins.

## Reporters

HTML (`playwright-report/`), JSON (`reports/results.json`), and JUnit
(`reports/junit.xml`) are all wired. Trace on first retry, screenshot + video on failure.

## Test categories

1. Authentication · 2. Dashboard · 3. Screens (CRUD/boundary/edge/failure) ·
4. Screen Detail · 5. Groups · 6. Clusters · 7. Library (uploads) ·
8. Playlist · 9. Rollouts · 10. Team & Roles · 11. Reports · 12. Account ·
13. Security (RBAC + token) · 14. API failure injection · 15. Production smoke.

## Selector strategy

`data-testid` first, then `getByRole`/label, then text — chained with `.or()`
so a missing test-id never hard-breaks a test. Where a module's live markup is
unconfirmed, the affected test **soft-skips** with a clear annotation rather than
producing a false failure. Replace the `.or(...)` fallbacks with the real
`data-testid` as the app exposes them to make the suite maximally stable.
