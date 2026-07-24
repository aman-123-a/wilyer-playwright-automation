# learn-playwright — a starter suite for Playwright + JavaScript

A small, heavily-commented Playwright project built on the real **Wilyer CMS Media Sets**
flows, so you can learn by reading and tweaking working tests.

## What's inside

```
learn-playwright/
├─ playwright.config.js     # config: baseURL, reporters, the setup→chromium auth pattern
├─ config.js                # creds + shared IDs (Noida folder, sample files)
├─ auth.setup.js            # logs in ONCE, saves session (handles flaky reCAPTCHA)
├─ pages/                   # Page Object Models (locators live here, not in tests)
│  ├─ LoginPage.js
│  └─ MediaSetsPage.js
├─ utils/api.js             # API helpers (reads the Bearer token from the session)
└─ tests/
   ├─ 01-basics.spec.js     # Lesson 1: navigation, locators, assertions
   ├─ 02-mediaset-ui.spec.js# Lesson 2: forms, negative tests, search, XSS-safety
   └─ 03-mediaset-api.spec.js# Lesson 3: API CRUD + boundary + a documented known bug
```

## Run it

From the **repo root**:

```bash
# one-time: install browsers
npm run playwright:install

# run the whole learn suite (headless)
npm run learn

# watch it run in the interactive UI (great for learning!)
npm run learn:ui

# open the HTML report after a run
npm run learn:report
```

The first run executes `auth.setup.js`, which logs in and writes `.auth/state.json`.
Every other test reuses that session, so they start already logged-in and skip reCAPTCHA.

> **reCAPTCHA note:** login is gated by reCAPTCHA v3. In automation it sometimes
> fails to connect and the Log In button fires no request — `auth.setup.js` retries
> with reloads to get past it.

## The learning path (read the files in order)

1. **01-basics** — how a test is shaped: `goto` → locate → `expect`. Note that
   assertions auto-retry (no `sleep`).
2. **02-mediaset-ui** — real UI work: the create form, a negative test (empty name),
   `waitForResponse` to watch the API, and confirming the search box escapes HTML.
3. **03-mediaset-api** — the fast lane. Full CRUD against the API, boundary/negative
   cases, and `test.fail()` used to *document a known bug* (ClickUp 86d3n51bv): the
   500-on-malformed-folderId. The suite stays green while the bug lives and goes red
   the day it's fixed.

## Handy commands

```bash
# record your clicks into test code
npx playwright codegen cms2.pocsample.in

# run one file
npx playwright test tests/03-mediaset-api.spec.js --config=learn-playwright/playwright.config.js

# debug step-by-step
npm run learn -- --debug
```

## Next things to try
- Turn `02` into a full UI create by clicking a landscape file then a portrait file.
- Add a `test.step()` inside the CRUD test to group create/read/update/delete.
- Move the sample file IDs to `listImageFiles()` so tests self-heal when data changes.
```
