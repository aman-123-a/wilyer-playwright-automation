# CMS Search Test-Suite

Enterprise-grade, **config-driven** Playwright (TypeScript) suite that validates
the shared CMS search bar across every module: **Screens, Groups, Clusters,
Library, Playlists, Team, Members, Roles, Logs**.

One Page Object (`pages/searchPage.ts`) drives all modules — each module is a row
in `config/modules.ts`. To onboard a module or fix a drifted selector, edit that
one file.

## Layout
```
search-suite/
├─ config/
│  ├─ env.ts          # thresholds + creds + toggles (all env-overridable)
│  ├─ modules.ts      # ← module registry (routes, search APIs, row selectors)
│  └─ payloads.ts     # edge inputs, security payloads, API-failure scenarios
├─ pages/
│  ├─ basePage.ts     # nav + verifyNoWhiteScreen + shell checks
│  └─ searchPage.ts   # generic POM: search/clear/waitForResults/rowCount...
├─ utils/
│  ├─ monitors.ts     # ConsoleNetworkMonitor (console/pageerror/5xx/failed reqs)
│  └─ searchHelper.ts # search/validate*/intercept/mock*/capture* utilities
├─ fixtures/
│  └─ searchFixtures.ts  # auto console-monitor + makeSearch(module) factory
├─ tests/
│  └─ search.spec.ts  # data-driven battery (×9 modules)
├─ global-setup.ts    # logs in once → caches .auth/search-admin.json
└─ playwright.config.ts
```

## Run
```bash
# Full battery, all modules
npx playwright test --config=search-suite/playwright.config.ts

# One/few modules
SEARCH_MODULES=groups,team npx playwright test --config=search-suite/playwright.config.ts

# By category (tags: @ui @functional @edge @security @api @combined @perf)
npx playwright test --config=search-suite/playwright.config.ts -g "@security"

# Include the expensive performance bucket
SEARCH_RUN_PERF=true npx playwright test --config=search-suite/playwright.config.ts -g "@perf"
```

## Configurable thresholds (env)
| Var | Default | Meaning |
|-----|---------|---------|
| `SEARCH_API_MAX_MS` | 700 | per-call response ceiling |
| `SEARCH_PERF_AVG_MAX_MS` | 700 | avg response ceiling (@perf) |
| `SEARCH_PERF_ITERATIONS` | 50 | consecutive searches (@perf) |
| `SEARCH_DEBOUNCE_MAX_CALLS` | 1 | max requests per logical search |
| `SEARCH_STRICT_CONSOLE` | true | fail on unexpected console/5xx |
| `SEARCH_MODULES` | (all) | comma list to narrow the run |

## Notes / TODO
- **Members, Roles, Logs** are flagged `unverified` in `modules.ts` — their
  routes/APIs are best-effort and need a one-line confirmation against the live
  build.
- `.auth/` (cached session) and `report/` / `test-results/` should be gitignored.
- The suite never uses `page.waitForTimeout()` — all waits are on API responses,
  element state, or polled counts.
