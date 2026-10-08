# Auth Screens — Bug Report

**Target:** https://cms.wilyersignage.com
**Scope:** Sign In (`/`), Forgot Password (`/forget`), Sign Up (`/signup`)
**Date:** 2026-06-30
**Method:** Live exploratory + automated Playwright (`wilyer-signage-suite/tests/auth/auth-screens.spec.ts`)
**Backend:** `v3-5api.wilyersignage.com/v3/cms/auth/*`

Severity: **High** = blocks/misleads users · **Medium** = wrong behaviour, workaround exists · **Low** = cosmetic / a11y / noise.
"Auto-flag" = covered by a `test.fail()` case that turns the suite **red** the moment the bug is fixed (delete the marker then).

---

## Sign Up (`/signup`)

| # | Sev | Title | Expected | Actual | Auto-flag |
|---|-----|-------|----------|--------|-----------|
| SU-1 | **High** | Primary submit button is labelled **"Sign In"** | "Sign Up" / "Create Account" | The account-creation button reads "Sign In", which looks like the wrong page / a dead end | ✅ |
| SU-2 | Med | **Terms of Service** link is a placeholder | Opens a real ToS page | `href="/signup"` (reloads the same page) | ✅ |
| SU-3 | Med | **Privacy Policy** link is a placeholder | Opens a real Privacy page | `href="/signup"` (reloads the same page) | ✅ |
| SU-4 | Low | Company-name placeholder typo | "Enter your organization name" | "Enter your **oganization** name" (missing "r") | ✅ |
| SU-5 | Med | Phone default country ≠ dial code | Country dropdown defaults to **India** to match the shown **+91** | Dial code shows **+91** but the country `<select>` defaults to **Afghanistan** (+93). A user who doesn't change it submits a mismatched code | ✅ |
| SU-6 | Med | No feedback on invalid submit | Inline/field errors naming each missing field; Terms gate explained | Blank submit just re-focuses Name; submitting with **Terms unchecked** does **nothing** — no request, no message. User is stuck with no clue why | — |

> The form **does** correctly block submission when mandatory fields are empty or Terms is unchecked (no API call is made) — the defect is the **absent messaging**, not the gating.

---

## Sign In (`/`)

| # | Sev | Title | Expected | Actual | Auto-flag |
|---|-----|-------|----------|--------|-----------|
| SI-1 | **High** | "Email or Phone" silently drops invalid input + leaks backend message | Reject "not-an-email" client-side with a clear "enter a valid email or phone" | The value is parsed as neither email nor phone, so the request posts `email:""` and the toast shows the raw Joi error **`"phoneNumber" must be a number`** — confusing and exposes backend internals | — |
| SI-2 | Med | No client-side email/phone format validation | Validate format before submit | Every malformed value round-trips to `/auth/login` (HTTP 400) | — |
| SI-3 | Low | Blank submit gives no user feedback | "Email and password are required" | Button click just re-focuses the email field; no message | — |
| SI-4 | Low (a11y) | Password show/hide toggle has no accessible name | `aria-label="Show password"` (button role) | Bare `<i>`/icon, no role, no name — invisible to screen readers and unreachable by name-based locators | — |

---

## Forgot Password (`/forget`)

| # | Sev | Title | Expected | Actual | Auto-flag |
|---|-----|-------|----------|--------|-----------|
| FP-1 | Low | Blank email → silent no-op | "Email is required" message | "Send OTP" does nothing; no request, no feedback | — |
| FP-2 | Med | No client-side email validation; leaky message | Validate format client-side | Malformed email posts to `/auth/forgetPassword` (400) and surfaces raw Joi **`"email" must be a valid email`** | — |
| FP-3 | Low | Email placeholder has a trailing space | "Enter your email" | "Enter your email " (trailing space) | — |

---

## Cross-cutting

| # | Sev | Title | Detail |
|---|-----|-------|--------|
| GEN-1 | Low | `checkAccess` logs a console **error** on every auth page load | `GET …/auth/checkAccess → 401` fires on Sign In/Forgot/Sign Up while logged out. Expected for an anonymous visitor — should be handled quietly, not logged as an error. |
| GEN-2 | Low (perf) | **Razorpay checkout SDK** is eagerly preloaded on the public Sign Up page | ~194 "preloaded but not used" console warnings. A payment SDK has no business loading on the registration screen — wasted bytes + console noise. |
| GEN-3 | Low (a11y) | Inconsistent heading levels | Sign In / Forgot use `<h2>`; Sign Up uses `<h4>`. Breaks heading hierarchy. |
| GEN-4 | Med | Backend (Joi) validation messages leak to the UI | Root cause behind SI-1 & FP-2: server messages like `"phoneNumber" must be a number` are shown verbatim. Map to friendly, user-facing copy. |

---

## Highest-impact fixes

1. **SU-1** — rename the Sign Up button to "Sign Up"/"Create Account" (users currently see "Sign In" on the registration form).
2. **SI-1 / GEN-4** — validate the email/phone field client-side and stop surfacing raw Joi messages.
3. **SU-2 / SU-3** — point the Terms & Privacy links at real pages (legal/compliance risk: users "agree" to links that don't exist).
4. **SU-5** — default the country to India so it agrees with the +91 dial code (or sync code ↔ country).

---

## Automated coverage

`wilyer-signage-suite/tests/auth/auth-screens.spec.ts` (run in the `no-auth` project):

```bash
CMS_BASE_URL=https://cms.wilyersignage.com \
npx playwright test --config=wilyer-signage-suite/playwright.config.ts --project=no-auth \
  tests/auth/auth-screens.spec.ts
```

- **Functional negatives** (blank / invalid / wrong-password / toggle / nav links / Terms gate) — asserted green.
- **Known defects** SU-1..SU-5 — encoded as `test.fail()`; they pass-as-expected today and will turn the suite **red** when each bug is fixed.
- **Destructive** paths (valid-email OTP send, real account creation) soft-skip unless `CMS_ALLOW_DESTRUCTIVE=true`.
- **Positive login** (`@smoke`) needs real `CMS_ADMIN_EMAIL` / `CMS_ADMIN_PASSWORD`.

Last run: **15 passed · 5 known-defects flagged · 2 destructive skipped** (negatives verified stable at `--retries=0`).
