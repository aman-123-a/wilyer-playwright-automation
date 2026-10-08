# Wilyer CMS — File Upload Notification Automation Framework

Enterprise-grade **Playwright + TypeScript** automation for the Wilyer CMS
**File Upload Notification (Maker/Checker)** workflow against
[`https://cms.pocsample.in`](https://cms.pocsample.in).

It validates the end-to-end flow: a **Maker** uploads a file and submits it for
approval, a **Checker** approves or rejects it, and the system raises in-app and
**email** notifications — all asserted across the UI, the network/API layer, and
a real **IMAP** mailbox.

---

## Features

- **Page Object Model** — `LoginPage`, `DashboardPage`, `UploadPage`, `ApprovalPage`, `NotificationPage` on a shared `BasePage`.
- **Custom fixtures** — page objects, role-scoped authenticated pages (`makerPage` / `checkerPage`), a `NetworkMonitor`, an `ApiHelper`, and an `EmailHelper` injected into every test.
- **Session reuse** — global setup logs both roles in once and persists storage-state; specs start authenticated.
- **Email validation** — IMAP (`imapflow` + `mailparser`) with bounded polling (60s timeout / 5s interval) for delayed delivery; validates subject, body, file name, timestamp, maker name and HTML formatting.
- **API monitoring** — captures Upload / Notification / Approval calls and error responses; asserts status codes and payloads.
- **Cross-browser** — Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari.
- **Rich reporting** — HTML + Allure + JUnit; screenshots, video, and traces retained on failure.
- **Config-driven** — everything tunable via `.env`; CI-aware retries/workers.
- **Tagged suites** — `@smoke @regression @notification @permission @security @edgecase`.

---

## Project structure

```
wilyer-upload-framework/
├── config/            # env loader (typed) + constants (routes, subjects, API patterns)
├── fixtures/          # custom Playwright test fixtures
├── pages/             # Page Objects (POM)
├── utils/             # logger, emailHelper, apiHelper, uploadHelper, loginHelper, assertions
├── test-data/         # users, workflow data, generated/static file fixtures
├── tests/
│   ├── maker/         # upload + submit for approval
│   ├── checker/       # approve / reject
│   ├── email/         # IMAP notification validation
│   ├── negative/      # negative cases (#11)
│   ├── edge/          # edge cases (#12)
│   ├── permission/    # RBAC boundaries (#13)
│   └── api/           # API monitoring (#14)
├── global-setup.ts    # auth state bootstrap
├── global-teardown.ts # generated-fixture cleanup
├── playwright.config.ts
├── .github/workflows/ci.yml
└── .env.example
```

---

## Setup

```bash
cd wilyer-upload-framework
npm install
npm run install:browsers
cp .env.example .env   # then fill in real values
```

### Configuring email validation (Gmail IMAP)

1. Enable IMAP in Gmail settings.
2. Create an **App Password** (`https://myaccount.google.com/apppasswords`) — use this, not the account password.
3. Set `IMAP_USER` / `IMAP_PASSWORD` and `NOTIFICATION_FROM` in `.env`.

If IMAP is left unconfigured, email specs **skip cleanly** (the rest of the suite still runs).

---

## Running

```bash
npm test                      # full suite, all projects
npm run test:smoke            # @smoke only
npm run test:regression       # @regression
npm run test:notification     # @notification
npm run test:permission       # @permission
npm run test:security         # @security
npm run test:edgecase         # @edgecase

npm run test:maker            # Maker specs
npm run test:checker          # Checker specs
npm run test:email            # email validation

npm run test:chromium         # single browser
npm run test:mobile           # Mobile Chrome + Mobile Safari
npm run test:headed           # headed
npm run test:ui               # Playwright UI mode
```

---

## Reporting

```bash
npm run report            # open the Playwright HTML report
npm run allure:serve      # generate + open Allure interactively
npm run allure:generate   # generate static Allure report
npm run allure:open       # open generated Allure report
```

Artifacts on failure: full-page screenshot, video, and a Playwright trace
(`npx playwright show-trace <trace.zip>`).

---

## CI/CD

`.github/workflows/ci.yml` runs the suite across Chromium/Firefox/WebKit on
push/PR, uploads HTML + Allure + traces/videos as artifacts, and publishes a
merged Allure report. Provide credentials via repository **Secrets**
(`MAKER_EMAIL`, `IMAP_PASSWORD`, etc.).

---

## Conventions & best practices

- **Stable locators** — role/label/text first, `data-testid`/CSS only as fallback; no nth-child chains.
- **Explicit waits** — network-idle + element-state waits; no fixed sleeps in the happy path.
- **Strict TypeScript** — `strict`, no implicit `any`, typed env config.
- **Reusable assertions** — domain assertions in `utils/assertions.ts`.
- **Isolation** — every test seeds its own uniquely-named file; no cross-test state.

> **Selector note:** UI selectors are written defensively against the live app
> but some (submit-for-approval control, status chips, notification bell) are
> best-effort. Verify against the running DOM and adjust the relevant Page
> Object — selectors are centralised there by design.
