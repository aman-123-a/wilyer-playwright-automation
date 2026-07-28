# Setup guide

## Prerequisites

| Requirement | Version  | Notes                                   |
| ----------- | -------- | --------------------------------------- |
| Node.js     | ≥ 20     | `engines` in package.json enforces this |
| npm         | ≥ 10     | ships with Node 20                      |
| Git         | any      |                                         |
| Docker      | optional | only for containerised runs             |
| Allure CLI  | optional | only for local `allure:open`            |

## 1. Install

```bash
git clone <repository-url>
cd wilyer-playwright
npm ci
npm run install:browsers
```

`npm ci` installs from the lockfile exactly. Use it rather than `npm install` so
everyone — and CI — resolves the same dependency tree. The Playwright version in
`package.json` must stay in step with the base image tag in `docker/Dockerfile`.

## 2. Configure credentials

```bash
cp .env.example .env
```

Fill in at minimum:

```
CMS_ADMIN_EMAIL=your.account@example.com
CMS_ADMIN_PASSWORD=…
```

Nothing else is required to start. Role accounts are optional — suites that need a
role you have not configured skip themselves with a message naming the variables to
set, rather than failing.

### Credential rules

- `.env` is gitignored. Never commit it.
- There are **no fallback credentials anywhere in the code**, by design. If a suite
  cannot find an account it skips; it does not quietly use someone else's login.
- CI reads credentials from repository secrets, never from a file.
- For per-environment logins, create `.env.cms2`, `.env.cms3` and so on. They load
  ahead of `.env` and are gitignored too.

## 3. Verify the installation

```bash
npm run verify                    # typecheck + lint + format
npx playwright test --list        # the suite should enumerate ~886 tests
```

Then a real run:

```bash
npm run cms2 -- --grep @smoke
```

On success you should see:

- a banner naming the resolved environment, application URL and API URL;
- `✓ CMS reachable at …`;
- a cached session at `storage/cms2/admin.json`;
- a report at `reports/cms2/html`.

## Troubleshooting

**`No admin credentials`** — `.env` is missing or the variables are blank. Global
setup fails fast here on purpose; a run without credentials would produce a wall of
login failures that look like product bugs.

**`No 'footprint' cookie — this browser context is not authenticated`** — the cached
session is stale or the `setup` project did not run. Delete `storage/<env>/` and
re-run.

**`⚠ API host for "cms3" is inferred…`** — expected. See
[known-gaps.md](known-gaps.md#1-unconfirmed-api-hosts-cms3-cms4-live). Set
`CMS_API_BASE_URL` once you confirm the real host.

**`Unknown TEST_ENV "…"`** — a typo. Valid values: `cms`, `cms2`, `cms3`, `cms4`,
`live`. This fails rather than defaulting, because a silent fallback could point a
destructive suite at the wrong server.

**Browsers missing after a dependency change** — re-run `npm run install:browsers`.
