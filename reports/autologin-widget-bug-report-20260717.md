# Auto Login Widget — Test Execution & Bug Report

- **Target:** https://cms3.pocsample.in/library → Widgets → **Auto Login** → *Add New*
- **Feature under test:** Auto Login widget **create form** (fields: `Widget Name*`, `WebPage URL`, `+ Add Custom Params`, one‑login/per‑screen toggle)
- **Source test cases:** Google Sheet "Auto Login Widget Test Cases" (AL‑001 … AL‑071)
- **Login:** dev@wilyer.com (admin)
- **Date:** 2026‑07‑17
- **Method:** Live exploratory execution via browser automation (data‑driven from the sheet)

---

## 1. Executive summary

The Auto Login **create form** has effectively **no validation on the `WebPage URL` field** and gives **no user feedback on silent failures**. Of the create‑form validation cases that were executable, the widget‑name‑required check works, but every URL‑related expectation from the sheet failed. A separate **form‑state reset defect** was also found.

| Verdict | Count | Cases |
|--------|-------|-------|
| ✅ Pass | 1 | AL‑001 |
| ⚠️ Partial | 2 | AL‑006, AL‑007 |
| ❌ Fail (bug) | 2 | AL‑002, AL‑003 |
| 🔵 Extra bug (not in sheet) | 2 | Form‑reset, URL self‑embed |
| ⛔ Blocked (tooling/env) | 5 | AL‑004, AL‑005, AL‑008, AL‑009, AL‑010 |
| ➖ N/A for this form | 1 | AL‑055 |
| 🚫 Not executable in this environment | ~55 | AL‑011–032, AL‑033–054*, AL‑056–071 |

\* AL‑033–043 (custom params / mode toggles) *are* UI‑executable but could not be reached before the browser session became unstable — see §5.

---

## 2. Bugs found (ranked)

### BUG‑1 — `WebPage URL` accepts blank and invalid values (no validation)  🔴 High
- **Cases:** AL‑002 (blank URL), AL‑003 (`abcd`)
- **Steps:** Add New → enter a valid Widget Name → set URL to empty (AL‑002) or `abcd` (AL‑003) → **Save**.
- **Expected (sheet):** AL‑002 "URL is required"; AL‑003 "Please enter a valid URL". Save blocked.
- **Actual:** Both **saved successfully** ("Widget created successfully"; widget count incremented). No validation error.
- **Notes:** The field is `type="url"` but the custom Save handler bypasses HTML5 constraint validation. The form label "WebPage URL" has **no required asterisk**, so blank‑accept may be by design — but arbitrary strings like `abcd` being accepted is a clear defect. A URL is the core of an *Auto Login* widget; saving one with no/invalid URL produces a non‑functional widget.

### BUG‑2 — `ftp://` (and unsupported protocols) fail silently with no feedback  🟠 Medium
- **Case:** AL‑006 (`ftp://server.com`)
- **Expected (sheet):** "Protocol not supported" validation error.
- **Actual:** Clicking **Save** does **nothing** — no save, **no error message, no toast**. The modal just stays open. User has no idea why it won't save.
- **Notes:** Inconsistent with BUG‑1 — `abcd` (also invalid) *saves*, but `ftp://` is silently rejected. Either way there is no user‑facing feedback. Silent no‑op on a primary action is a UX defect.

### BUG‑3 — "Add New" does not reset the form (stale/dirty state persists)  🟠 Medium
- **Not a sheet case — found during execution.**
- **Steps:** Open *Add New*, type into Name/URL, close via **X** or **Cancel** without saving → open *Add New* again.
- **Actual:** The form **reopens pre‑populated** with the previous, unsaved Name and URL instead of a blank form (verified via DOM read: the Name textbox still held the prior value).
- **Risk:** A user can accidentally create a widget carrying leftover data from an abandoned attempt. Also caused test contamination during this run.

### BUG‑4 — Invalid URL is loaded unsanitized into the live‑preview iframe (self‑embed)  🟡 Low
- **Not a sheet case — found during execution.**
- **Actual:** Entering `abcd` / `ftp://server.com` makes the right‑hand **live preview iframe** resolve the value relatively and **load the CMS app (Wilyer dashboard) itself** inside the widget preview.
- **Notes:** Indicates the raw URL is placed into an iframe `src` without validation/allow‑listing. Low impact here (same origin) but worth allow‑listing `http/https` and validating before rendering.

---

## 3. Passed / partial

| TC | Scenario | Expected | Actual | Verdict |
|----|----------|----------|--------|---------|
| **AL‑001** | Widget Name blank + valid URL | "Widget Name is required"; can't save | Red toast **"Widget name is required"**, save blocked | ✅ **PASS** |
| **AL‑006** | `ftp://server.com` | "Protocol not supported" error | Save is a **silent no‑op**, no error shown | ⚠️ Partial (see BUG‑2) |
| **AL‑007** | Name = spaces only | Trimmed + "cannot be empty" error | Name **trimmed to empty & save blocked** (guard works); explicit message not reliably shown | ⚠️ Partial |

---

## 4. Blocked by test tooling / environment  ⛔

These create‑form cases could **not be executed reliably** and are **not** reported as pass/fail:

- **AL‑004** (URL `google.com`, no protocol), **AL‑005** (`http://test.com`), **AL‑008** (emoji name `🚀Login`), **AL‑009** (500‑char name), **AL‑010** (SQLi name `' OR 1=1--`).

**Why blocked:**
1. The **Widget Name field would not accept synthesized keyboard input** through the automation harness (typed text was dropped; only direct DOM value‑set worked, which then did not trigger the React Save handler). This is an automation/React‑state artifact, **not confirmed app behavior**, so verdicts would be unreliable.
2. The **browser automation session was repeatedly torn down** between steps, losing modal state.

**Recommendation:** run these via a proper Playwright spec (`page.fill()` fires native input events and integrates with React) rather than the interactive harness. See §7.

---

## 5. UI‑executable but not reached this run  🔵

- **AL‑033–AL‑040** — Custom Params (duplicate keys, empty values, spaces, special chars, Unicode, delete, edit) via **+ Add Custom Params**.
- **AL‑041–AL‑043** — one‑login / per‑screen mode toggle behavior & repeated switching.

These are genuinely testable on this form and should be covered in the follow‑up Playwright run.

- **AL‑055 (UI password masking)** — ➖ **N/A for this create form**: the form has **no password field**. Credential capture happens in the separate "record login" flow, not in this dialog.

---

## 6. Not executable in this environment  🚫

The majority of the sheet describes **integration / performance / security** scenarios that need infrastructure not available from a CMS browser session. Documented as out‑of‑scope for UI execution:

- **AL‑011–AL‑032** — login **recording** against real external target sites; wrong/empty credentials; cancel/close/crash mid‑record; network disconnect; account states (locked, disabled, deleted, expired, MFA, CAPTCHA, session/password change). Need real target sites + recording runtime + OS/network control.
- **AL‑044–AL‑054** — publishing to **real media players**, offline publish/queue, edit mid‑cycle, remove/assign, duplicate, **export/import**, dependency deletion. Need player hardware and publish backend.
- **AL‑056–AL‑071** — **API/packet interception**, **RBAC** roles, on‑device local‑storage/cache inspection, **bulk 100 widgets/players**, **48‑hour endurance**, **throttling/spike** load. Need API access, multiple roles, load tooling, and long‑running device fleets.

---

## 7. Recommendations

1. **Add URL validation** on Save: require non‑empty, enforce `http(s)` scheme, reject/normalize others with a **visible** error (fixes BUG‑1 & BUG‑2). Mark the field required (asterisk) if it is meant to be.
2. **Never fail silently** — every rejected Save must show a toast/inline error (BUG‑2).
3. **Reset the create form** on open so *Add New* always starts blank (BUG‑3).
4. **Validate/allow‑list** the URL before binding it to the preview iframe `src` (BUG‑4).
5. Automate AL‑001–010 and AL‑033–043 as a **data‑driven Playwright spec** (a `cms-e2e` suite already exists in this repo) — `page.fill()` avoids the input issues hit here.

---

## 8. Test‑data cleanup

Two widgets were created on the live CMS during execution:
- `AutoLogin_01` — ✅ **deleted**.
- `TC_AL003` (URL `abcd`) — ⚠️ **still present**; the session became unresponsive before deletion. **Please delete manually** (Library → Widgets → Auto Login → search "TC").
