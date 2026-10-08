# Auto Login Widget — Test Report (AL-001 … AL-010)

**Date:** 2026-07-17
**Environment:** https://cms3.pocsample.in/  (account: <admin — see local .env>)
**Feature:** Library → Widgets → **Auto Login** widget, create dialog
**Scope run:** AL-001 … AL-010 (Widget Name / URL validation) — the automatable subset of the 90-case suite.
**Method:** Playwright, headed, programmatic login (passes invisible reCAPTCHA v3). Spec: `tests/autologin-validation.spec.js`.
**Outcome signal:** dialog stays open after *Save* ⇒ **REJECTED**; dialog closes + widget created ⇒ **ACCEPTED** (creation confirmed via widget-count delta).

> Note on verdicts: the spec's automatic `crashed`/`verdict` columns were unreliable (a naive "any console error" check flipped on ambient page noise for the first cases). Verdicts below are **re-derived by hand from the reliable dialog outcome**, not the auto flag.

## Results

| TC | Scenario | Input | App outcome | Expected | Verdict |
|----|----------|-------|-------------|----------|---------|
| AL-001 | Widget Name blank | name = `""` | **REJECTED** (save blocked) | reject | ✅ PASS |
| AL-002 | URL blank | url = `""` | **ACCEPTED** (created) | required validation | ⚠️ FINDING |
| AL-003 | Invalid URL | url = `abcd` | **ACCEPTED** (created) | reject | ❌ FAIL (BUG-2) |
| AL-004 | URL without protocol | url = `google.com` | **ACCEPTED** (created) | validate / auto-fix | ℹ️ OBSERVE |
| AL-005 | HTTP URL | url = `http://test.com` | **ACCEPTED** (created) | accepted or rejected | ✅ PASS |
| AL-006 | Unsupported protocol | url = `ftp://server.com` | **REJECTED** (save blocked) | validate | ✅ PASS |
| AL-007 | Name only spaces | name = `"   "` | **ACCEPTED** (created) | reject | ❌ FAIL (BUG-1) |
| AL-008 | Name with emoji | name = `🚀 …` | **ACCEPTED** (created) | handled correctly | ✅ PASS |
| AL-009 | Very long name (500 chars) | 500-char name | **ACCEPTED** (created) | validate / truncate | ⚠️ FINDING |
| AL-010 | SQL injection in name | `' OR 1=1--` | **ACCEPTED**, no crash/SQL error | stored safely | ✅ PASS |

**Tally:** 5 PASS · 2 FAIL · 3 FINDING/OBSERVE.

## Bugs found during execution

### BUG-1 — Whitespace-only Widget Name bypasses required validation  (AL-007) · Severity: Medium
- **Steps:** Auto Login → Add New → Widget Name = `"   "` (spaces), URL = `https://example.com/` → Save.
- **Actual:** Widget is created (dialog closes) with an effectively blank name.
- **Expected:** Same rejection as an empty name (AL-001 correctly blocks `""`).
- **Root cause (likely):** required-field check does not `trim()` before validating.

### BUG-2 — Invalid URL string accepted  (AL-003) · Severity: Medium/Low
- **Steps:** Auto Login → Add New → Widget Name = valid, WebPage URL = `abcd` → Save.
- **Actual:** Widget created with a non-URL value `abcd`.
- **Expected:** URL-format validation error.
- **Note:** Validation is *inconsistent* — `ftp://server.com` **is** rejected (AL-006), but `abcd` and `google.com` (no scheme) are accepted. Looks like scheme-blocklist only, no general format validation.

## Findings / to confirm with product

- **FINDING (AL-002):** WebPage URL is **not required** — a blank URL creates an Auto Login widget with no target page. The test sheet expected required-validation. May be by design (URL captured later in the recording step) — confirm intended behavior.
- **FINDING (AL-009):** No max-length on Widget Name — a 500-char name is accepted without truncation or validation. Possible UI/DB concern.
- **OBSERVE (AL-004):** `google.com` (no protocol) accepted; unknown whether the app auto-prefixes `https://`. Worth confirming the stored value.
- **POSITIVE (AL-010):** SQL-injection string stored without error/crash — no injection surfaced client-side. (Server-side/DB-level verification still recommended.)

## Not executed (blocked / out of automatable scope)

The remaining ~80 cases need capabilities this run can't provide:
- **AL-011…030** login success/failure, cancel/crash/disconnect during recording — require driving the in-widget **recording flow** against live sites + infra control (crash, network kill).
- **AL-021…028** account states (expired/locked/disabled/deleted/MFA) — need pre-provisioned accounts; **AL-026 CAPTCHA cannot be bypassed**.
- **AL-063…090** website edge cases (SSO, OAuth, HTTP 500/404, SSL expiry, DNS failure) — need external/controlled test sites.
- **AL-031…048** custom-params CRUD & per-screen publish — *automatable next* (dialog has "+ Add Custom Params" and one-login/per-screen toggle) but not covered in this run.

## Test-suite bug found (existing repo code, unrelated to product)

- **`tests/Library_Widgets_CRUD.spec.js`** calls `widgetRow(...)` on lines 98 and 129, but only `widgetRowInner` is defined → `ReferenceError` would crash the *Update* and *Delete* tests. Rename to `widgetRowInner` (or define `widgetRow`).

## Environment safety

- All widgets created by this run were cleaned up. Post-run counts verified at baseline: **Media Files (814), Widgets (699), Auto Login (3)** — no production data affected.
- A temporary cleanup helper had a dangerous empty-string match; it performed only no-op deletions (confirmed "delete 0 widgets"), harmed nothing, and has been removed.
