# Maker–Checker Playwright Framework

Automated regression suite for the CMS Maker–Checker workflow at `https://cms.pocsample.in/`.

## Structure

```
pages/maker-checker/        Page Object Model classes
  BasePage.js
  LoginPage.js
  DashboardPage.js
  PlaylistPage.js
  ApprovalPage.js

utils/maker-checker/        Shared helpers + test data
  testData.js               Credentials, URLs, file paths, statuses
  helpers.js                login(), ensureInvalidFile(), retry()
  logger.js

tests/maker-checker/        Test specs (grouped with test.describe())
  01-smoke.spec.js          Smoke — both roles reach dashboard
  02-maker-flow.spec.js     CRUD + upload + submit + validations
  03-checker-flow.spec.js   Approve / reject / edit-before-approval
  04-status-validation.spec.js  Draft → Submitted → Approved/Rejected
  05-negative.spec.js       RBAC, invalid type, double-submit guardrails

playwright.maker-checker.config.js   Dedicated config (html + json report)
```

## Execution

```bash
# Install deps (first run only)
npm install
npx playwright install --with-deps

# Run the full Maker-Checker suite
npx playwright test --config=playwright.maker-checker.config.js

# Run a single group
npx playwright test --config=playwright.maker-checker.config.js tests/maker-checker/02-maker-flow.spec.js

# Headed / debug
npx playwright test --config=playwright.maker-checker.config.js --headed
npx playwright test --config=playwright.maker-checker.config.js --debug

# Open the HTML report after a run
npx playwright show-report reports/html
```

## Credentials

Defaults (override via env):

| Role    | Env var(s)                          | Default                         |
|---------|--------------------------------------|---------------------------------|
| Maker   | `MAKER_EMAIL`, `MAKER_PASSWORD`      | amankumarbsrbsr@gmail.com / 12345 |
| Checker | `CHECKER_EMAIL`, `CHECKER_PASSWORD`  | aman@wilyer.com / 12345         |
| URL     | `BASE_URL`                           | https://cms.pocsample.in        |

## Reports

After a run:
- **HTML**: `reports/html/index.html`
- **JSON**: `reports/results.json`
- **Failure artefacts**: `test-results/` (screenshot + video + trace)

View traces for any failed test with:
```bash
npx playwright show-trace test-results/<test-folder>/trace.zip
```
