# Wilyer QA Automation Platform

Enterprise Playwright + TypeScript automation for the **Wilyer Digital Signage CMS**.

One framework, five environments, every module. Not a collection of test scripts —
a maintained platform with a page-object layer, a typed API client, an RBAC helper,
data factories, containerised execution and CI pipelines.

---

## Quick start

```bash
npm ci                      # install dependencies
npm run install:browsers    # download Playwright browsers
cp .env.example .env        # then fill in CMS_ADMIN_EMAIL / CMS_ADMIN_PASSWORD

npm run cms2 -- --grep @smoke
```

Credentials are **never** committed. `.env` is gitignored; CI supplies secrets.

---

## Choosing an environment

The target is selected by `TEST_ENV`, which the npm scripts set for you. URLs live in
version control at `config/environments.ts`, so changing a target shows up in a diff
rather than hiding in someone's local `.env`.

| Command        | Environment      | Application                     |
| -------------- | ---------------- | ------------------------------- |
| `npm run cms`  | Pre-Production 1 | <https://cms.pocsample.in>      |
| `npm run cms2` | Pre-Production 2 | <https://cms2.pocsample.in>     |
| `npm run cms3` | Pre-Production 3 | <https://cms3.pocsample.in>     |
| `npm run cms4` | Pre-Production 4 | <https://cms4.pocsample.in>     |
| `npm run live` | Production       | <https://cms.wilyersignage.com> |

Pass any Playwright flag through with `--`:

```bash
npm run cms3 -- --grep @regression --project=firefox
npm run cms2 -- tests/campaigns --headed
```

### Two safety properties worth knowing

- **Production is read-only.** On `live`, destructive suites are hard-disabled — the
  `CMS_ALLOW_DESTRUCTIVE` flag is ignored, not merely defaulted off. A misconfigured
  CI variable cannot delete customer data.
- **Sessions are namespaced per environment** (`storage/<env>/`), so switching targets
  can never reuse another server's cookies.

> **API hosts on cms3, cms4 and live are unconfirmed.** Only `cms` and `cms2` have
> API base URLs verified against the real servers. The others follow the
> `cmsN → v3-5apiN` naming convention and are flagged at startup. If API suites fail
> there, confirm the host and set `CMS_API_BASE_URL`. See [docs/known-gaps.md](docs/known-gaps.md).

---

## Running suites

```bash
npm run smoke         # @smoke      — fast confidence check
npm run regression    # @regression — the full suite
npm run api           # REST suites only, no browser
npm run rbac          # role / permission suites
npm run security      # injection, authz, session handling
npm run a11y          # accessibility audits
npm run perf          # performance budgets + Lighthouse
```

Combine with an environment:

```bash
npm run cms2 -- --grep @smoke
```

## Reports

Every run writes to `reports/<env>/`:

```bash
npm run report          # open the HTML report
npm run allure:serve    # Allure with trends
```

HTML, JSON, JUnit and Allure are produced together. Failures automatically attach a
screenshot, video, trace, the console log and the API call log.

## Docker

```bash
npm run docker:build
CMS_ADMIN_EMAIL=… CMS_ADMIN_PASSWORD=… npm run docker:run
```

---

## Layout

```
api/          Generic HTTP client + per-module API services
components/   Reusable UI component wrappers
config/       Environment registry and typed config
docker/       Image and compose definitions
docs/         Documentation and authored QA reports
fixtures/     Playwright fixtures (page objects, monitors, clients)
helpers/      Domain helpers — RBAC, permissions
legacy/       Archived pre-2.0 suites, kept for reference
pages/        Page objects
scripts/      Tooling and k6 load scripts
storage/      Cached sessions, per environment (gitignored)
test-data/    Factories and static fixture data
tests/        Specs, organised <module>/<type>/
utils/        Generic tooling — monitors, assertions, a11y, perf
```

Tests are organised by module and then by test type:

```
tests/campaigns/crud/       tests/campaigns/api/
tests/playlists/boundary/   tests/playlists/negative/
tests/screens/boundary/     tests/media-sets/search/
tests/platform/a11y/        tests/platform/performance/
```

---

## Contributing

```bash
npm run verify    # typecheck + lint + format check — run before pushing
```

See [docs/contributing.md](docs/contributing.md) for conventions, and
[docs/known-gaps.md](docs/known-gaps.md) for the honest list of what is not yet
verified.

## Documentation

| Document                             | Contents                                 |
| ------------------------------------ | ---------------------------------------- |
| [Architecture](docs/architecture.md) | Layer design and the reasoning behind it |
| [Setup](docs/setup.md)               | First-time installation                  |
| [Execution](docs/execution.md)       | Running and filtering suites             |
| [CI/CD](docs/ci-cd.md)               | Pipelines, secrets and reporting         |
| [Contributing](docs/contributing.md) | Conventions for adding coverage          |
| [Known gaps](docs/known-gaps.md)     | Unverified assumptions and test debt     |
| [QA reports](docs/qa-reports/)       | Authored test reports and bug packs      |

## MCP server

The repository also hosts a Model Context Protocol server exposing Playwright
automation (`npm run mcp-server`), wired up in `.mcp.json`.
