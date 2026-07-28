# Known gaps and test debt

A test suite that hides its own weak points is worse than one that names them: a
green run gets read as proof, and the gaps stay invisible until they matter. This
page is the honest inventory.

Last reviewed: 2026-07-28.

---

## 1. Unconfirmed API hosts (cms3, cms4, live)

**What we know.** The API base URL is verified for two environments only:

| Environment | API host                | Status       | Evidence                                                             |
| ----------- | ----------------------- | ------------ | -------------------------------------------------------------------- |
| `cms`       | `v3-5api.pocsample.in`  | **verified** | legacy RBAC + adaptive-content templates, prayer-schedule API audits |
| `cms2`      | `v3-5api2.pocsample.in` | **verified** | campaigns suite, live against cms2 on 2026-07-28                     |
| `cms3`      | `v3-5api3.pocsample.in` | _convention_ | inferred from the `cmsN → v3-5apiN` pattern; never observed          |
| `cms4`      | `v3-5api4.pocsample.in` | _convention_ | inferred; never observed                                             |
| `live`      | `api.wilyersignage.com` | _convention_ | inferred; never observed                                             |

**Why it is handled this way.** Guessing silently would make API suites fail with
404s that look like product defects. Instead `config/environments.ts` records the
confidence level per environment, and global setup prints a loud warning before any
run against an inferred host.

**To close it.** Confirm the real host, then set `apiConfidence: 'verified'` in
`config/environments.ts` with a dated note. Until then, override with
`CMS_API_BASE_URL`.

---

## 2. The permission matrix is almost entirely unpopulated

`helpers/rbac/PermissionMatrix.ts` currently holds **five confirmed cells**, all for
the campaigns module under the admin role. Every other module/role/action
combination is absent.

This is deliberate. A matrix filled in from assumption produces a suite that passes
because it agrees with an invented specification — the most expensive kind of green.
Each cell therefore carries a `status`:

- `confirmed` — observed against a real account, with dated evidence. Asserted.
- `expected` — believed but unverified. Reported, never asserted.

**To close it.** Run each role against each module, record what actually happens, and
promote cells with an `evidence` note naming the environment, account and date.

**Blocker.** Only the admin account is configured. The other seven roles
(`owner`, `support`, `maker`, `checker`, `viewer`, `restricted`, `unrestricted`) need
credentials in `.env` before their behaviour can be observed. Suites skip these roles
rather than failing.

---

## 3. Modules without dedicated coverage

The framework declares fourteen modules. These have page objects and/or specs:

dashboard · screens · groups · library · playlists · campaigns · prayer-schedule ·
team · reports · billing · media-sets

These are declared in `MODULES` but have **no dedicated suite yet**:

- **clusters** — route exists in `pages/BasePage.ts`; no page object, no spec
- **widgets** — surfaced as a Library tab; no dedicated coverage
- **notification-settings** — no page object, no spec

---

## 4. Test types not yet built out

The current suites cover functional, CRUD, boundary, negative, search, security,
API, a11y and performance to varying depth. Not yet present:

- **Visual regression** — no baseline screenshots, no `toHaveScreenshot()` coverage.
  Needs a decision on baseline storage and per-environment tolerance before it is
  worth starting.
- **Approval / maker-checker workflows** — no suite. The product's approval flow has
  not been mapped.
- **Contract testing** — the API services assert status codes and read-backs, but no
  schema validation against a published contract.

---

## 5. Lint debt (89 warnings, 0 errors)

`npm run lint` gates on **errors**. `npm run lint:strict` additionally fails on
warnings and does not currently pass. The breakdown:

| Count | Rule                     | Nature                                                             |
| ----- | ------------------------ | ------------------------------------------------------------------ |
| 34    | `expect-expect`          | mostly assertions reached through helpers not in the allow-list    |
| 18    | `no-conditional-in-test` | genuine: branching tests that can pass by skipping their assertion |
| 18    | `no-conditional-expect`  | genuine: same root cause                                           |
| 10    | `no-wait-for-timeout`    | genuine: fixed sleeps that should wait on state                    |
| 9     | assorted                 | `any` usage, `prefer-to-have-count`, `prefer-locator`              |

The conditional-assertion warnings matter most: a test shaped
`if (x) { expect(...) }` reports success when `x` is false and nothing was checked.
These are pre-existing and each needs a live run to rewrite safely.

**Why they were not simply suppressed.** Raising the gate to ignore them, or
mass-disabling the rules, would convert visible debt into invisible debt.

---

## 6. `networkidle` waits in the RBAC suites

Three sites use `page.waitForLoadState('networkidle')` — a Playwright anti-pattern,
because it is a timing proxy rather than a signal that the thing you care about has
happened.

- `tests/rbac/functional/permissions.spec.ts` (×2)
- `tests/rbac/functional/rbac-data-driven.spec.ts` (×1)

Each carries an inline `eslint-disable` with a `DEBT:` note. The correct fix is to
await the guard's own observable outcome (the redirect, the denial element, or the
specific data response). Doing that blind risks turning passing checks into flaky
ones, and verifying it needs a restricted-role account that is not yet configured.

---

## 7. Unverified at migration time

The 2.0 restructure was verified by type-checking, linting, formatting and full suite
enumeration (886 tests across 24 files, correct project routing). It was **not**
verified by executing the suite against a live CMS — that needs credentials which are
deliberately not in the repository.

Before trusting the first real run: execute `npm run cms2 -- --grep @smoke` and
confirm login, session caching under `storage/cms2/`, and report output under
`reports/cms2/`.
