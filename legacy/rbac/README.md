# Wilyer RBAC Test Suite

Playwright + TypeScript tests for the RBAC / role-hierarchy rules of
[cms.pocsample.in](https://cms.pocsample.in).

## Setup

```bash
cd rbac
npm install
npx playwright install chromium
cp .env.example .env   # edit if needed
```

## Run

```bash
npm run test:rbac         # headless
npm run test:headed       # watch the browser
npm run report            # open last HTML report
```

## Layout

```
rbac/
├── playwright.config.ts
├── data/roles.data.ts        # credentials, role payload type, permission sections
├── fixtures/auth.fixture.ts  # `authedPage` fixture — logs in once per test
├── pages/
│   ├── BasePage.ts
│   ├── LoginPage.ts
│   └── RolesPage.ts
├── utils/api.ts              # optional API-level validators
└── tests/rbac/
    ├── role-hierarchy.spec.ts       # TC-1, TC-2, TC-3, TC-4
    ├── role-permissions.spec.ts     # TC-5, TC-7
    ├── role-access-control.spec.ts  # TC-6  (needs RESTRICTED_* env)
    └── role-deletion.spec.ts        # TC-8
```

## Selectors still to verify

`RolesPage` uses `data-testid` placeholders for three RBAC-specific controls:

- `[data-testid="role-type-unrestricted"]` / `[data-testid="role-type-restricted"]`
- `[data-testid="role-parent-select"]`
- `[data-testid*="error"] | [role="alert"] | .error-text`

Swap these to confirmed selectors (see `pages/RolesPage.ts` — search for
`TODO(selector)`) once the RBAC UI is inspected.
