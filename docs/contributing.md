# Contributing

## Before you push

```bash
npm run verify    # typecheck + lint + format check
```

## Where code goes

| Layer         | Holds                                         | Rule                                         |
| ------------- | --------------------------------------------- | -------------------------------------------- |
| `tests/`      | specs                                         | describe intent; no raw selectors            |
| `pages/`      | page objects                                  | one per screen; owns that screen's selectors |
| `components/` | reusable UI wrappers (tables, modals, toasts) | shared across screens                        |
| `fixtures/`   | Playwright fixtures                           | wiring only, no assertions                   |
| `helpers/`    | domain helpers (RBAC, permissions)            | knows what a role or module is               |
| `utils/`      | generic tooling (monitors, assertions, perf)  | product-agnostic                             |
| `api/`        | HTTP client and per-module services           | no UI knowledge                              |
| `test-data/`  | factories and static fixture data             | no credentials, ever                         |

A selector belongs in exactly one page object. If two specs need the same locator,
that is the signal to move it, not to copy it.

## Adding coverage for a module

```
tests/<module>/<type>/<module>-<what>.spec.ts
```

Types in use: `functional`, `crud`, `search`, `boundary`, `negative`, `rbac`,
`security`, `api`, `performance`, `a11y`.

Put browser-free REST specs in `<module>/api/` — the `api` project claims that path
and runs them once instead of once per browser.

## Tagging

Every test carries at least one of `@smoke`, `@sanity`, `@regression`. Add
`@critical` / `@p1` for severity, and `@destructive` for anything that writes.

```ts
test('CMP-001 · create a campaign through the picker @smoke @critical @ui', …);
```

## Locators

In order of preference:

1. `getByRole` with an accessible name
2. `getByLabel`, `getByPlaceholder`, `getByText`
3. `data-testid` (configured as the test-id attribute)
4. CSS — last resort, and only scoped

Never use index-based CSS or XPath chains that encode layout. They break on any
markup change and tell you nothing about what broke.

## Waiting

No fixed sleeps. Wait on the state you actually care about:

```ts
// no
await page.waitForTimeout(2000);

// yes
await expect(page.getByRole('row')).toHaveCount(5);
await page.waitForResponse((r) => r.url().includes('/campaign/read'));
```

`page.waitForLoadState('networkidle')` is a timing proxy, not a signal — the lint
rule flags it.

## Assertions

Use web-first assertions; they retry, so they absorb ordinary render latency:

```ts
// no — samples once, races the render
expect(await input.inputValue()).toBe('1');

// yes — retries until it matches or times out
await expect(input).toHaveValue('1');
```

Never assert a conditional you might skip:

```ts
// no — passes silently when the branch is not taken
if (visible) expect(x).toBe(y);
```

Give assertions a message. `expect(count, 'rejected upload must not create a card')`
turns a failure into a finding.

## Verifying persistence

Settle every persistence claim with an API read-back, not a toast. Toast lifetime on
this CMS (~11 s) outlives a create loop, so a stale toast from the previous action
reads as success for the current one. That produced two false findings during manual
exploration — see `docs/qa-reports/campaigns-v1-rbac/`.

## Credentials

Never commit one. Not as a default, not as a fallback, not "temporarily".

```ts
// no
const user = { email: process.env.X ?? 'real.person@gmail.com', password: '12345' };

// yes
const user = credentialsFor('viewer');
test.skip(user === undefined, 'Set CMS_VIEWER_EMAIL / CMS_VIEWER_PASSWORD.');
```

CI fails the build on hardcoded credentials.

## Test data

Always name artefacts through a factory, so parallel workers cannot collide and
teardown can sweep by prefix:

```ts
import { uniqueName } from '../../../test-data/factories';
const name = uniqueName('campaign'); // QA-campaign-m3f9k2-w2-7
```

Clean up what you create, in `afterEach`, filtered to your own prefix.

## Claiming a permission is verified

`helpers/rbac/PermissionMatrix.ts` only asserts cells marked `confirmed`, and a
`confirmed` cell requires an `evidence` note naming the environment, the account and
the date:

```ts
delete: {
  allowed: false,
  status: 'confirmed',
  evidence: 'cms2, viewer account, 2026-08-01: Delete absent; DELETE returned 403.',
}
```

Mark it `expected` if you have not watched it happen. Unverified expectations are
reported, never asserted — a matrix asserted from assumption passes by agreeing with
an invented specification.

## Commits

Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`.
Explain _why_ in the body, not just what — the diff already says what.
