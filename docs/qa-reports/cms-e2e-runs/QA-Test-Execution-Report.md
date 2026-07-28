# QA Test Execution Report — Wilyer Cloud CMS

**Automated End-to-End Regression — Playwright (TypeScript)**

| | |
|---|---|
| **Project** | Wilyer Cloud CMS — E2E Automation (`cms-e2e`) |
| **Application Under Test** | https://cms.pocsample.in |
| **Application Build** | v3.5.18.7.1 |
| **Report Type** | Test Execution Report — Client Delivery / Release Sign-off |
| **Test Framework** | Playwright 1.50 + TypeScript (Page Object Model) |
| **Execution Date** | 2026-05-25 |
| **Execution Mode** | Headless, parallel (4 workers), 1 local retry |
| **Prepared By** | QA Automation Engineering |
| **Document Status** | Final |

---

## 1. Executive Summary

A full automated regression cycle was executed against the Wilyer Cloud CMS
staging build (`v3.5.18.7.1`) covering the Authentication, Dashboard, Media
Library, and Accessibility domains, together with a one-time authentication
setup stage.

**42 test cases** were scheduled. **38 were executed** (4 were intentionally
skipped — see §6) and **all 38 executed cases ultimately passed (100% effective
pass rate)**. **Zero functional defects** were detected. One test was classified
as *flaky* — it failed once on a slow page load and passed deterministically on
the automatic retry.

From a **functional** standpoint the build is **stable and release-ready**.
However, the cycle surfaced material **non-functional findings** that are not
release-blocking by themselves but require remediation tracking:

- **Performance:** Key pages load **2.5×–3.9× over the agreed budgets** (Dashboard 12.5s vs 5s; Library 15.7s vs 4s).
- **Accessibility:** **10 serious/critical WCAG 2.1 AA violations** across Dashboard and Library.
- **Asset integrity:** **7 broken media thumbnails** (expired/missing CDN assets) in the Library.

**Overall QA Verdict:** **CONDITIONAL PASS** — functional sign-off granted;
performance and accessibility remediation recommended prior to General
Availability (GA). See §15.

---

## 2. Environment Details

| Attribute | Value |
|---|---|
| Target environment | Staging |
| Base URL | https://cms.pocsample.in |
| Application version | v3.5.18.7.1 |
| Test account | `dev@wilyer.com` (Admin / full access) |
| Authentication | Session cached once via `setup` project → reused (storage state) |
| Host OS | Windows 11 Pro (10.0.26200) |
| Node.js | v22.18.0 |
| Playwright | v1.50 |
| Viewport | 1440 × 900 |
| Network | Live internet → staging (shared environment) |
| Execution mode | Headless |
| Parallelism | 4 workers, fully parallel across files |
| Retry policy | 1 retry (local) / 2 retries (CI) |

---

## 3. Browser Details

| Browser | Engine | Device Profile | Status in this run |
|---|---|---|---|
| **Chromium** | Blink | Desktop Chrome | ✅ Executed |
| Firefox | Gecko | Desktop Firefox | Configured (not in this cycle) |
| WebKit | WebKit | Desktop Safari | Configured (not in this cycle) |
| Mobile Chrome | Blink | Pixel 7 | Configured (not in this cycle) |
| Mobile Safari | WebKit | iPhone 14 | Configured (not in this cycle) |

> This cycle was executed on **Chromium** as the primary reference browser.
> Cross-browser and mobile-viewport projects are fully wired in
> `playwright.config.ts` and are scheduled for the nightly matrix.

---

## 4. Test Execution Metrics

| Metric | Value |
|---|---|
| Total test cases | **42** |
| Executed | 38 |
| Skipped (intentional) | 4 |
| **Passed** | **37** |
| **Failed** | **0** |
| Flaky (passed on retry) | 1 |
| Effective pass rate (executed) | **100%** |
| Defects raised (functional) | 0 |
| Non-functional findings | 3 (performance, accessibility, asset integrity) |
| Wall-clock duration | ~6.0 minutes |
| Cumulative test time | ~1,174 s (across 4 workers) |

---

## 5. Passed / Failed Counts

| Result | Count | % of executed |
|---|---|---|
| ✅ Passed | 37 | 97.4% |
| 🔁 Flaky (recovered on retry) | 1 | 2.6% |
| ❌ Failed | 0 | 0% |
| ⏭️ Skipped (gated/placeholder) | 4 | — |

---

## 6. Module-wise Results

| # | Module | Total | Passed | Flaky | Failed | Skipped | Status |
|---|---|---|---|---|---|---|---|
| 1 | Authentication | 16 | 15 | 1 | 0 | 0 | ✅ Pass |
| 2 | Dashboard | 11 | 11 | 0 | 0 | 0 | ✅ Pass |
| 3 | Media Library | 12 | 8 | 0 | 0 | 4 | ✅ Pass |
| 4 | Accessibility | 2 | 2 | 0 | 0 | 0 | ✅ Pass* |
| 5 | Auth Setup (session) | 1 | 1 | 0 | 0 | 0 | ✅ Pass |
| | **Total** | **42** | **37** | **1** | **0** | **4** | ✅ |

\* Accessibility tests **passed** because serious/critical violations are
recorded as soft warnings by default (see §13); they would **fail** under
`CMS_STRICT_MONITORS=true`. The underlying violations are documented in §13.

**Authentication coverage** included: valid login, invalid password, empty
credentials, invalid email format, password masking, logout, unauthorized-route
redirect, refresh persistence, mobile responsiveness, API-failure handling,
copy-paste credentials, and security inputs (SQL injection, XSS, oversized
input, special characters).

**Skipped (4) — intentional, not failures:**
| Test | Reason |
|---|---|
| Library — open media card → detail page | Conditional skip (no qualifying media at runtime) |
| Library — upload valid image | Gated behind `CMS_ALLOW_DESTRUCTIVE` (read-only run) |
| Library — reject unsupported format | Gated behind `CMS_ALLOW_DESTRUCTIVE` (read-only run) |
| Library — drag-and-drop upload | Documented placeholder (DataTransfer harness pending) |

---

## 7. Failure Analysis

**No hard functional failures were recorded in this cycle.**

The single non-deterministic event was a **flaky** result:

| Test | Module | Observed behaviour | Resolution |
|---|---|---|---|
| `valid login reaches the dashboard` | Authentication | First attempt timed out waiting for the dashboard shell (>20s) due to slow staging response; second attempt passed | Auto-recovered on retry (retry policy = 1) |

This is an **environment/performance-induced** intermittent, not a code defect —
see §8 and §11.

---

## 8. Root Cause Analysis

| Finding | Category | Root Cause | Severity |
|---|---|---|---|
| Login flakiness (1 occurrence) | Performance / stability | Staging app shell render exceeded 20s under concurrent load; navigation contention with parallel workers | Medium |
| Dashboard load 12.5s (budget 5s) | Performance | Heavy initial payload — stat aggregation + Google Maps cluster rendering (4,379 screens) on first paint | High |
| Library load 15.7s (budget 4s) | Performance | Synchronous media-grid fetch with a blocking "Loading media files…" overlay; large media set (838 files) | High |
| 7 broken Library thumbnails | Data / asset integrity | CDN thumbnail objects (CloudFront) missing/expired for specific media records | Medium |
| 10 WCAG serious/critical violations | Accessibility | Icon-only buttons without accessible names, form inputs without labels, links without discernible text, contrast shortfalls | High |

**Common theme:** the dominant risk driver is **non-functional**
(performance + accessibility), concentrated in the data-heavy Dashboard and
Library surfaces. Functional logic is sound.

---

## 9. Screenshots References

Artifacts are captured **only on failure/retry** and stored under
`test-results/` (auto-attached to the HTML and Allure reports).

| Artifact | Location |
|---|---|
| Flaky login — failure screenshot | `test-results/auth-auth-Authentication-v-…-chromium/test-failed-1.png` |
| Flaky login — video | `test-results/auth-auth-Authentication-v-…-chromium/video.webm` |
| Error context (DOM snapshot) | `test-results/<test-dir>/error-context.md` |
| Trace (Trace Viewer) | Captured on first retry → `test-results/<test-dir>/trace.zip` |
| Accessibility violation reports | Attached per a11y test (`a11y-violations`) |
| Broken-image list | Attached to Library checks (`broken-images`) |

> Open the consolidated HTML report with `npm run report`, or the Allure report
> with `npm run allure:serve`.

---

## 10. Console Error Summary

Console monitoring is active on every test (third-party noise — reCAPTCHA,
Google Maps, analytics — is filtered so only **application-origin** errors are
reported).

| Surface | App-origin console errors |
|---|---|
| Login page | 0 application errors (1 third-party reCAPTCHA notice — informational, filtered) |
| Dashboard | **0** |
| Media Library | **0** |

**Verdict:** ✅ No application-level console errors detected on the validated surfaces.

---

## 11. Failed API Summary

API monitoring tracks same-origin XHR/fetch responses (status ≥ 400) and slow
calls (> 3,000 ms).

| Metric | Result |
|---|---|
| Failed same-origin API requests (≥ 400) | **0** |
| Request failures (network) | **0** |
| Slow API calls (> 3s) flagged | None reported by the API monitor |

**Verdict:** ✅ No failed or failing API responses observed. The slow *page*
loads (§12) are driven by payload size and client-side rendering rather than API
error responses.

---

## 12. Performance Metrics

Page-load budgets are enforced as **soft gates** (warn by default, hard under
`CMS_STRICT_MONITORS=true`). Both monitored surfaces **exceeded** their budgets.

| Surface | Measured Load | Budget | Variance | Status |
|---|---|---|---|---|
| Dashboard | **12,455 ms** | 5,000 ms | **+149%** (2.5×) | ⚠️ Over budget |
| Media Library | **15,709 ms** | 4,000 ms | **+293%** (3.9×) | ⚠️ Over budget |

Supporting signals collected during the run:
- Navigation Timing (DOMContentLoaded, load, TTFB) captured per page; DCL > 0 confirmed on all surfaces.
- JS heap sanity check (Chromium) within the 400 MB ceiling.
- Library grid blocks behind a "Loading media files…" overlay that dominates perceived load time.

> **Note:** these durations reflect a **shared staging** environment and
> include third-party Google Maps initialisation on the Dashboard. Production /
> dedicated-environment numbers should be re-baselined.

---

## 13. Accessibility Findings (WCAG 2.1 A/AA — axe-core)

| Surface | Serious/Critical Violations | Notable Rules |
|---|---|---|
| Dashboard | **4** | `color-contrast`, `link-name`, `aria-command-name`, `list` |
| Media Library | **6** | `button-name` (≈150 nodes), `label` (≈50 nodes), `link-name` (≈51 nodes), `aria-allowed-attr`, `color-contrast`, `list` |

The highest-volume issues are **icon-only buttons without accessible names** and
**form fields without labels** in the Library, which materially impact
screen-reader usability.

---

## 14. Observations

1. **Functional quality is high** — all executed functional flows passed with zero defects, including security-input handling (SQLi/XSS payloads correctly rejected without authentication).
2. **Authentication is robust** — masking, logout, unauthorized-route redirect, refresh persistence, and API-failure handling all behave correctly.
3. **Performance is the primary risk** — both data-heavy surfaces load well beyond budget; this also caused the single flaky result.
4. **Accessibility debt is significant** and concentrated in the Library.
5. **Data hygiene** — broken CDN thumbnails indicate orphaned media references that should be reconciled.
6. **No server-side API errors** — failures are presentation/performance-layer, not backend.
7. **Session reuse works as designed** — a single authentication is shared across the suite, reducing run time and login load.

---

## 15. Risks

| # | Risk | Likelihood | Impact | Severity |
|---|---|---|---|---|
| R1 | Slow Dashboard/Library load degrades UX and may cause user-perceived timeouts at scale | High | High | 🔴 High |
| R2 | Accessibility violations expose compliance risk (ADA/EN 301 549/WCAG AA) | High | High | 🔴 High |
| R3 | Performance-induced flakiness reduces confidence in CI signal | Medium | Medium | 🟠 Medium |
| R4 | Broken media thumbnails erode customer trust in content management | Medium | Medium | 🟠 Medium |
| R5 | Cross-browser/mobile coverage not yet executed this cycle | Medium | Medium | 🟠 Medium |

---

## 16. Recommendations

**Performance (Priority 1)**
- Profile and optimise Dashboard first paint — defer/lazy-load the Maps cluster and paginate stat aggregation.
- Make the Library media grid non-blocking (progressive/lazy rendering) and remove the full-screen "Loading…" gate.
- Re-baseline performance budgets against a dedicated (non-shared) environment.

**Accessibility (Priority 1)**
- Add `aria-label`/visible text to icon-only buttons and links (Library toolbar/cards).
- Associate `<label>`s with all form inputs; fix color-contrast shortfalls.
- Add an a11y gate to the nightly run (`CMS_STRICT_MONITORS=true`).

**Stability & Coverage (Priority 2)**
- Enable the **cross-browser + mobile** matrix (Firefox, WebKit, Pixel 7, iPhone 14) in nightly CI.
- Run **destructive** suites (upload/delete) in an isolated data tenant with `CMS_ALLOW_DESTRUCTIVE=true`.
- Reconcile orphaned media records to clear broken thumbnails.
- Extend automation to the remaining CMS modules (Screens, Groups, Clusters, Rollouts, Playlists, Team, Reports, Account) per the framework's extension pattern.

---

## 17. Final QA Status

> ## 🟡 CONDITIONAL PASS — Functional Sign-off Granted
>
> **Functional regression: APPROVED.** All 38 executed test cases passed
> (100% effective), zero functional defects, zero application console errors,
> zero failed APIs.
>
> **Release recommendation:** The build is **functionally fit for release**.
> Performance (R1) and Accessibility (R2) findings are **High severity but
> non-functional** and do **not** block a functional go-live; they must be
> **logged, owned, and scheduled** for remediation, with the nightly strict-mode
> gate enabling enforcement going forward.

| Sign-off Dimension | Status |
|---|---|
| Functional correctness | ✅ Approved |
| API integrity | ✅ Approved |
| Console / stability | ✅ Approved |
| Performance | ⚠️ Conditional — remediation required |
| Accessibility (WCAG AA) | ⚠️ Conditional — remediation required |
| Cross-browser / mobile | ⏳ Pending (nightly matrix) |

| Role | Name | Decision | Date |
|---|---|---|---|
| QA Lead | _________ | ☐ Approve ☐ Reject | ______ |
| Engineering Lead | _________ | ☐ Approve ☐ Reject | ______ |
| Product Owner | _________ | ☐ Approve ☐ Reject | ______ |
| Release Manager | _________ | ☐ Approve ☐ Reject | ______ |

---

*Generated from Playwright execution artifacts (`reports/results.json`,
`playwright-report/`, `test-results/`). Environment: staging
`v3.5.18.7.1` · Chromium · 2026-05-25.*
