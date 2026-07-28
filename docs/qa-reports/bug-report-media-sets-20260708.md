# Bug Report — Library → Media Sets

**Module:** Library › Media Sets
**Environment:** https://cms2.pocsample.in (build v3.5.20) · API `v3-5api2.pocsample.in/v3/cms/`
**Account:** <admin — see local .env> (test)
**Tested:** 2026-07-08 · exploratory CRUD + boundary-value analysis
**Tester:** Aman Kumar (QA)

---

## BUG-01 — Media set name has no maximum length (client or server)

| Field | Value |
|-------|-------|
| **ID** | MSET-01 |
| **Severity** | Medium |
| **Priority** | Medium |
| **Type** | Input validation / data integrity |
| **Component** | Create/Edit Media Set → Name field |
| **Status** | Open |

**Preconditions:** Logged in; at least one 16:9 and one 9:16 media file available.

**Steps to reproduce:**
1. Go to Library → **Media Sets** → **Create Media Set** (or edit an existing set).
2. In **Media set name**, enter a 300-character string (e.g. `"L" + "x"×299`).
3. Assign a matching-orientation file to each display format.
4. Click **Create** / **Save Changes**.

**Expected:** Name is rejected or truncated at a sensible maximum (e.g. 100–255 chars) with a validation message.

**Actual:** The full 300-character name is accepted, saved, and returned verbatim. The `<input>` has no `maxlength` (attribute = `-1`) and the API applies no length cap. In the list card the name overflows and is hidden with a CSS ellipsis only.

**Evidence:** Stored name length confirmed = 300 chars (DOM `title` + text node). No error toast; "Media set updated" shown.

**Impact:** Unbounded names risk layout breakage, DB/index bloat, and inconsistent display across views.

**Suggested fix:** Enforce a max length on both the client input (`maxlength`) and server validation; surface a clear message at the limit.

---

## BUG-02 — Media set with 0 display formats can be saved (empty set bypasses required-media guard)

| Field | Value |
|-------|-------|
| **ID** | MSET-02 |
| **Severity** | High |
| **Priority** | High |
| **Type** | Business-logic / validation gap |
| **Component** | Edit Media Set → Display Formats |
| **Status** | Open |

**Preconditions:** An existing media set with ≥1 display format.

**Steps to reproduce:**
1. Open a media set → **Edit**.
2. Remove every display format using the **✕** on each format card (until header reads "**0 formats in this set**").
3. Click **Save Changes**.

**Expected:** Save is blocked — a media set must contain at least one display format with an assigned file (consistent with the create-time rule).

**Actual:** Save succeeds ("Media set updated"). The set persists as **0 files · 0.00 MB**, i.e. an empty, unusable media set.

**Root cause (observed):** The required-media guard ("Please add files to display formats: 16:9, 9:16") iterates over *existing* formats. With zero formats there is nothing to validate, so the check passes. Contrast: a format that exists **without** a file *is* correctly blocked.

**Impact:** Empty media sets can be created/left behind; downstream consumers (screens/rollouts) may reference a set with no content, causing blank playback or errors.

**Suggested fix:** Add a guard requiring `formats.length >= 1` (and each format has an assigned file) on both Save and Create, client and server.

---

## Validation confirmed working (no defect — regression baseline)

| Case | Behavior |
|------|----------|
| Empty name → Create | Blocked: "Media set name is required" (no API call) |
| Whitespace-only name | Blocked (trimmed) |
| Format present but no file assigned | Blocked: "Please add files to display formats: 16:9, 9:16" |
| Landscape file into portrait (9:16) slot | Blocked: "That's a landscape file — drop it in the Landscape format" |
| 1-char name (min boundary) | Accepted |
| XSS payload in name `<img src=x onerror=alert(1)>` | Stored but **escaped**; renders as literal text in card and delete modal — not executed |
| Delete | Custom confirm modal ("This cannot be undone") → removes set |

---

## Notes
- All name/format validation is enforced as client-side toasts.
- No native browser dialogs used; delete uses an in-app modal.
- Boundary suite covered: name length (0 / whitespace / 1 / 300 chars), special/XSS chars, media-required, orientation match, and format-count (0 formats).
