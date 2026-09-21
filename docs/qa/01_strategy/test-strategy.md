# Test Strategy

## Scope

**In scope**

- <!-- e.g. CMS campaigns, playlists, media, RBAC, publish -->

**Out of scope**

- <!-- e.g. billing, third-party player firmware -->

## Environments

| Env | Selected by | API base | Confidence |
|---|---|---|---|
| cms | `npm run cms` | `v3-5api.pocsample.in/v3/cms` | verified |
| cms2 | `npm run cms2` | `v3-5api2.pocsample.in/v3/cms` | verified |
| cms3 | `npm run cms3` | `v3-5api3.pocsample.in/v3/cms` | convention |
| cms4 | `npm run cms4` | `v3-5api4.pocsample.in/v3/cms` | convention |
| live | `npm run live` | `v3-5api.wilyersignage.com/v3/cms` | verified |

Source of truth is `config/environments.ts`. A `convention` host was inferred, never
observed — a 404 there is a bad guess, not a defect. See `../03_testdata/hosts.md`.

## Test levels and tools

| Level | Tool | Where |
|---|---|---|
| E2E / UI | Playwright | `tests/_core/`, `tests/<env>/` |
| API | Playwright request fixtures | `tests/<env>/<module>/api/` |
| Mobile / player | Appium (`helpers/android/AppiumDriver.ts`) | `tests/_core/player/` |
| Accessibility | Playwright | `tests/_core/platform/a11y/` |
| Performance | Lighthouse / k6 | `tests/_core/platform/performance/` |

Layout: `tests/_core/` holds features common to every environment; `tests/cms/`,
`tests/cms2/`, `tests/cms3/`, `tests/cms4/` hold features owned by that server.
See `tests/README.md` and `config/features.ts`.

## Tagging convention

Type is a tag, not a folder. Run with `--grep`.

`@smoke` `@regression` `@rbac` `@api` `@ui` `@negative` `@security` `@perf` `@integration`

## Entry criteria

- Build deployed to the target env and reachable
- Test identities seeded (`../03_testdata/identities.md`)
- Smoke suite green

## Exit criteria

- Smoke and regression green, or every failure triaged to a ticket
- No open Critical or High defect without an accepted risk note
- Release file written in `../05_releases/`

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| <!-- --> | | |
