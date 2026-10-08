# CI/CD guide

## Pipelines

| Workflow         | Trigger                           | What it does                                                |
| ---------------- | --------------------------------- | ----------------------------------------------------------- |
| `ci.yml`         | every push and PR                 | typecheck, lint, format, suite enumeration, credential scan |
| `smoke.yml`      | push to `main`, manual            | `@smoke` on Chromium                                        |
| `regression.yml` | PR to `main`, manual              | `@regression`, 3 browsers × 4 shards                        |
| `api.yml`        | changes under `api/` or `**/api/` | the `api` project only                                      |
| `nightly.yml`    | 02:00 UTC daily                   | full regression across cms–cms4, 5 projects × 4 shards      |
| `release.yml`    | `v*` tag, manual                  | certifies pre-production, then read-only smoke on live      |

All five suite pipelines call one reusable workflow, `_run-suite.yml`. The execution
recipe — checkout, dependency cache, browser cache, sharding, artifact upload, Allure
publication, Slack notification — exists exactly once.

**When you need a new pipeline, add an input to `_run-suite.yml`. Do not copy its
steps into a new file.** Duplicated CI drifts, and the copy that drifts is always the
one nobody is watching.

## Required secrets

Set these under **Settings → Secrets and variables → Actions**.

| Secret                 | Required | Purpose               |
| ---------------------- | -------- | --------------------- |
| `CMS_ADMIN_EMAIL`      | yes      | primary account       |
| `CMS_ADMIN_PASSWORD`   | yes      | primary account       |
| `CMS_SUBUSER_EMAIL`    | no       | RBAC suites           |
| `CMS_SUBUSER_PASSWORD` | no       | RBAC suites           |
| `SLACK_WEBHOOK_URL`    | no       | failure notifications |

Callers pass `secrets: inherit`, so a secret added once is available to every
pipeline. When `SLACK_WEBHOOK_URL` is unset the notification step skips quietly
rather than failing and masking the real failure.

## The CI gate

`ci.yml` runs on every branch and blocks nothing else until it passes:

1. **Typecheck** — `tsc --noEmit`.
2. **Lint** — errors fail the build; warnings are reported. See
   [known-gaps.md](known-gaps.md#5-lint-debt-89-warnings-0-errors) for why the gate is
   set at errors today.
3. **Format** — `prettier --check`.
4. **Suite enumeration** — `playwright test --list`. Catches a broken config, a bad
   import or a duplicate title in seconds instead of forty minutes into a run.
5. **Credential scan** — fails the build on a hardcoded password. This repository has
   previously shipped real logins as "fallback" values in committed specs; this makes
   that a build failure rather than something found in review months later.

## Sharding

GitHub Actions has no `range()` function, so the shard matrix cannot be derived from
a count. Callers pass both the list and the total, and the two must agree:

```yaml
shard-list: '[1,2,3,4]'
shard-total: 4
```

## Reporting

Each shard uploads its HTML report, Allure results, JUnit XML and — on failure —
traces, screenshots and video.

The `publish` job merges every shard's Allure results, restores history from the
`gh-pages` branch so the trend graph survives across runs, and republishes. It is
enabled for nightly and release runs (`publish-report: true`); PR runs upload
artifacts without publishing.

Reports land under `gh-pages/<environment>/`, so environments do not overwrite each
other.

## Production safety in CI

- `nightly.yml` deliberately excludes `live`. A nightly cron against customer
  infrastructure is traffic nobody asked for.
- `release.yml` runs `@smoke` against `live` read-only.
- Destructive suites cannot run on `live` at all — `config/env.ts` ignores
  `CMS_ALLOW_DESTRUCTIVE` there, so a misconfigured workflow input cannot mutate
  customer data.

## Jenkins

`ci/Jenkinsfile` is retained for teams on Jenkins. GitHub Actions is the primary
path and gets new features first.

## Local reproduction of a CI failure

```bash
CI=true TEST_ENV=cms2 CMS_STRICT_MONITORS=true \
  npx playwright test --project=chromium --grep @regression --shard=2/4
```

`CI=true` matters: it raises retries to 2 and drops workers to 2, matching the
runner's concurrency and timing.
