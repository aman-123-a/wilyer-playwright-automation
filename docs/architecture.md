# Architecture

One framework, five environments, fourteen modules. This page explains the layering
and — more usefully — the reasoning behind the decisions that are not obvious.

## Layers

```
config/          environment registry + typed ENV       (knows: which server)
  │
  ├──► api/      HttpClient → BaseService → services    (knows: endpoints)
  │
  ├──► pages/    BasePage → module page objects         (knows: selectors)
  │      └──► components/  reusable UI wrappers
  │
  ├──► helpers/  RBAC, permissions                      (knows: roles, modules)
  ├──► utils/    monitors, assertions, a11y, perf       (knows: nothing product-specific)
  └──► test-data/ factories                             (knows: naming rules)
              │
              ▼
        fixtures/  ── the wiring hub ──►  tests/
```

Dependencies point one way. `utils/` never imports `pages/`; `api/` never imports a
page object. A spec imports `test` and `expect` from `fixtures/test-fixtures.ts`,
never from `@playwright/test` directly, so every test gets the page objects and
monitors without repeating the wiring.

## Execution flow

```
TEST_ENV=cms2
   │
   ▼
config/environments.ts ──► resolves the target (URLs, confidence, isProduction)
   │
   ▼
config/env.ts ──► layers .env.cms2, then .env, then process.env on top
   │
   ▼
global-setup.ts ──► prints the banner, verifies credentials + reachability,
   │                creates storage/cms2/ and reports/
   ▼
project "setup" ──► logs in once, writes storage/cms2/admin.json
   │
   ├──► project "api"       ─┐
   ├──► project "chromium"   │ all reuse that storage state,
   ├──► project "firefox"    │ so specs start authenticated
   ├──► project "webkit"     │
   └──► project "Mobile *"  ─┘
              │
              ▼
   fixtures/test-fixtures.ts constructs page objects + attaches monitors per test
              │
              ▼
   reports/cms2/{html,allure-results,results.json,junit.xml,test-results}
```

---

## Decisions worth explaining

### URLs are in version control; only secrets are in `.env`

The obvious design puts each environment's URL in its own `.env` file. We do not,
because a gitignored file is invisible: nobody reviews a change to it, and "which
server did that run hit?" becomes unanswerable after the fact.
`config/environments.ts` is checked in, so re-targeting an environment shows up in a
diff. `.env` carries credentials and nothing else.

### API-host confidence is a first-class field

`cms` and `cms2` have API hosts observed against the real servers. `cms3`, `cms4` and
`live` do not — they follow the `cmsN → v3-5apiN` naming convention. Rather than
encoding a guess as fact, each environment records `apiConfidence`, and global setup
warns loudly before running against an inferred host. Otherwise a wrong host produces
404s that read exactly like product defects.

### Production safety is enforced, not configured

`ENV.ALLOW_DESTRUCTIVE` is computed as `isProduction ? false : flag`. On `live` the
flag is ignored entirely. A safety property that depends on someone setting a
variable correctly is not a safety property — it is a convention with good intentions.

### Storage state is namespaced per environment

`storage/<env>/<role>.json`. Sharing one path across environments means switching
targets can silently reuse the previous server's cookies, producing authentication
results that belong to a different system.

### Retries cover 5xx, never 4xx

`HttpClient` retries transport errors and 408/429/5xx. A 400, 403 or 404 is a
determinate answer from the server. Retrying it would slow every negative-path test
and — worse — obscure the exact behaviour the validation and RBAC suites exist to
prove.

### Every denial assertion checks the server

`helpers/rbac/permissions.ts` treats a hidden button as a UX affordance, not an
access control. A suite that only verifies the UI passes happily against a product
that left the endpoint wide open. `expectDenied` always asserts the API response and
treats UI fencing as a supporting signal.

### The permission matrix records its own confidence

Each cell in `PermissionMatrix.ts` is `confirmed` (observed, with dated evidence —
asserted) or `expected` (believed — reported, never asserted). A matrix populated
from assumption yields a green suite that proves only that the code agrees with an
invented specification. Today five cells are confirmed; see
[known-gaps.md](known-gaps.md#2-the-permission-matrix-is-almost-entirely-unpopulated).

### API specs live in `tests/<module>/api/`

The `api` project claims that path; the browser projects exclude it. Running
browser-free HTTP calls once per browser produced five identical result sets for one
set of signal — 20 redundant tests in the campaigns suite alone.

### Persistence is verified by read-back, never by toast

Toast lifetime on this CMS (~11 s) exceeds a create loop, so a stale toast from the
previous action reads as success for the current one. This produced two false
findings during manual exploration. Every persistence claim goes through an API
read-back.

### Test artefacts are named by factory

`uniqueName()` combines a timestamp, the worker index and a counter. Timestamps alone
collide: parallel workers start in the same millisecond, and a fast loop creates
several records within one. The shared `QA-` prefix lets teardown sweep safely
without touching real content.

---

## Configuration reference

Import the typed `ENV` object everywhere — never read `process.env` directly from a
test, page object or helper.

| Variable                     | Default                            | Purpose                        |
| ---------------------------- | ---------------------------------- | ------------------------------ |
| `TEST_ENV`                   | `cms`                              | selects the target environment |
| `CMS_ADMIN_EMAIL/PASSWORD`   | _(none — required)_                | primary account                |
| `CMS_SUBUSER_EMAIL/PASSWORD` | _(none)_                           | RBAC suites                    |
| `CMS_<ROLE>_EMAIL/PASSWORD`  | _(none)_                           | per-role accounts              |
| `CMS_BASE_URL`               | from the environment registry      | override the application URL   |
| `CMS_API_BASE_URL`           | from the environment registry      | override the API URL           |
| `CMS_ALLOW_DESTRUCTIVE`      | `false` (forced `false` on `live`) | permit write suites            |
| `CMS_STRICT_MONITORS`        | `false`                            | monitors fail vs warn          |
| `CMS_PERF_*`, `CMS_LH_*`     | see `.env.example`                 | performance budgets            |

## Reporting

HTML, JSON, JUnit and Allure are produced on every run, under `reports/<env>/`. On
failure the framework attaches a screenshot, video, trace (first retry), the captured
console errors and the full API call log — with credentials redacted — so a CI
failure can be triaged without reproducing it locally.

The environment, both URLs and the API confidence level are written into the report
metadata, so an archived report can always be traced back to the server it ran
against.

## Further reading

- [Setup](setup.md) · [Execution](execution.md) · [CI/CD](ci-cd.md)
- [Contributing](contributing.md) — conventions for adding coverage
- [Known gaps](known-gaps.md) — what is not yet verified
