# Campaigns V1 — Bug List

**Environment:** `https://cms2.pocsample.in` · API `https://v3-5api2.pocsample.in/v3/cms`
**Build:** `v3.5.21` / `index-BZDVu4l_.js`
**Account:** dev@wilyer.com (admin, `isCampaignEnabled: true`)
**Date:** 2026-07-28 · **Status:** all 10 verified across 3 sessions, incl. a full cache-bypass retest
**Detail + screenshots:** [10-crud-boundary-search-test-run-20260728.md](10-crud-boundary-search-test-run-20260728.md)

`UI?` = reproducible by a manual tester through the interface alone (no API tooling)

---

## Summary

| ID | Severity | Title | UI? |
|----|----------|-------|-----|
| BUG-CMP-01 | **High / S1** | Campaign with zero media items accepted by the API | No (UI guards it) |
| BUG-CMP-02 | **High / S2** | Regex injection in campaign search (ReDoS risk) | Yes |
| BUG-CMP-03 | Medium / S2 | `GET /campaign/read` returns 500 when `sort`/`order` omitted | No |
| BUG-CMP-04 | Medium / S2 | Item duration accepts 0 and negative values | **Yes** |
| BUG-CMP-07 | Medium / S3 | Name uniqueness is case-sensitive | **Yes** |
| BUG-CMP-08 | Medium / S3 | No maximum length on campaign name | **Yes** |
| BUG-CMP-09 | Low / S3 | Whitespace-only name accepted by the API | No |
| BUG-CMP-10 | Low / S3 | Invalid `folderId` silently coerced to null | No |
| BUG-CMP-11 | Low / S4 | Search does not trim the query | Yes |
| BUG-CMP-12 | Low / S4 | Delete is not idempotent (400, not 404) | No |

*(BUG-CMP-05 and 06 were raised then retracted — false positives from misreading transient toasts. Documented in the main report.)*

---

## Details

### BUG-CMP-01 — Zero-item campaign accepted by the API · High / S1

**Steps:** `POST /campaign/create` with `{"data": [], "defaultDuration": 10, "name": "X", "folderId": ""}`
**Actual:** `200 {"message":"Campaign created successfully."}` — persisted with `items: 0`
**Expected:** `400` — a campaign must contain ≥ 1 media item (BR-04)
**Impact:** the empty campaign then appears in the playlist picker as a normal selectable card with no badge or warning, and can be inserted into a loop → blank frame on screen. Loop resolution `(loop-1) % length` divides by zero.
**Note:** the UI blocks this correctly; only the server does not. Once created, the record cannot be saved from the UI at all.
**Fix:** enforce `data.length >= 1` server-side on create *and* update; guard the picker and publish.

---

### BUG-CMP-02 — Regex injection in campaign search · High / S2

**Steps:** `GET /campaign/read?...&search=.*` — or simply type `.*` into the picker search box
**Actual:** returns **every** campaign. Metacharacters evaluate:

| Query | Result | Proves |
|-------|--------|--------|
| `QA_Dur_Zero` | 1 | literal control |
| `QA_Dur_Zer.` | 1 | `.` wildcard |
| `Q{2,}` | 1 | quantifier |
| `(QA\|rtgv)` | 8 | alternation |
| `.*` | all | full-collection match |
| `^QA` | 7 | anchor |

**Expected:** input treated as a literal string
**Impact:** (1) **ReDoS** — a catastrophic-backtracking pattern can pin database CPU (*not exploited — shared server*); (2) users with `.`/`(`/`+`/`*` in campaign names get wrong results; (3) once folder restrictions ship, `.*` is a candidate for enumerating restricted names — **retest when RBAC lands**.
**Fix:** escape input before regex construction, or use a text index.

---

### BUG-CMP-03 — 500 when `sort`/`order` omitted · Medium / S2

**Steps:** `GET /campaign/read?limit=50&page=1&search=&folderId=` (no `sort`, no `order`)
**Actual:** `500`
**Expected:** `200` with default sort, or `400`
**Impact:** any client not replicating the UI's exact query string breaks. Optional-looking params are mandatory.
**Fix:** default `sort=createdAt`, `order=-1`; `400` on invalid values.

---

### BUG-CMP-04 — Item duration accepts 0 and negative values · Medium / S2 · **UI-reproducible**

**Steps (UI):** playlist editor → Campaigns → `+ New` → add a media item → type `0` or `-5` into the per-item duration → Create
**Actual:** accepted and saved. Server stores `duration: 0` / `-5`. With `-5` the editor displays **`Total Duration : -1h:-1m:-5s`**.
**Expected:** minimum 1 second (BR-13)
**Root cause:** the per-item duration `<input type="number">` has **no `min` attribute** (the Default Duration field correctly has `min="1"`), and no server-side check.
**Note:** this is the **same defect class already known in playlist duration** — stepper enforces a floor, typing bypasses it. Reimplemented in a new module.
**Fix:** `min=1` on the input + server-side `duration >= 1`.

---

### BUG-CMP-07 — Name uniqueness is case-sensitive · Medium / S3 · **UI-reproducible**

**Steps (UI):** create campaign `Test_Name`, then create `test_name`
**Actual:** both created. Exact-case duplicates *are* correctly rejected (`400 "A campaign named 'X' already exists."`); changing capitalisation slips through.
**Expected:** case-insensitive uniqueness (BR-11)
**Already happening in production data on cms2:**
```
VANS     /  vans
vansh 1  /  Vansh 1
```
Both pairs created by a real user, not by testing.
**Fix:** case-insensitive collation on the uniqueness check.

---

### BUG-CMP-08 — No maximum length on campaign name · Medium / S3 · **UI-reproducible**

**Steps:** enter a 255-, 507- or 1000-character name
**Actual:** accepted and persisted; input has `maxLength = -1`; no server cap
**Expected:** capped (255 suggested)
**Impact:** overflows the picker card and pushes page layout; also flows into playlist slot labels and the approval email body.
**Fix:** cap in schema and input.

---

### BUG-CMP-09 — Whitespace-only name accepted by the API · Low / S3

**Steps:** `POST /campaign/create` with `"name": "     "`
**Actual:** `200`, persisted with `len: 6`; renders as an unnamed card
**Expected:** rejected as empty
**Note:** the UI trims correctly (typing spaces leaves the field empty and `required` blocks it) — the API does not. The blank-name rejection already works; it just runs **before** trimming.
**Fix:** trim server-side before the empty check.

---

### BUG-CMP-10 — Invalid `folderId` silently coerced to null · Low / S3

**Steps:** `POST /campaign/create` with `"folderId": "notavalidid"`
**Actual:** `200`; stored as `folderId: null`
**Expected:** `400` — no such folder
**Impact:** low today (folders not enforced yet). **Escalates to High when folder restrictions ship** — a client could park a campaign outside the folder tree and bypass restriction entirely. Retest during the RBAC pass.
**Fix:** validate the folder exists and is writable by the caller.

---

### BUG-CMP-11 — Search does not trim the query · Low / S4

**Steps:** search `"  Campaign_Name  "` (leading/trailing spaces)
**Actual:** 0 results; the same query without padding returns 1
**Expected:** query trimmed
**Impact:** copy-pasting a name silently returns nothing.

---

### BUG-CMP-12 — Delete is not idempotent · Low / S4

**Steps:** `DELETE /campaign/delete/{id}` twice
**Actual:** 1st → `200`; 2nd → `400 {"message":"Campaign not found."}`
**Expected:** `404` (or `204`) — `400` misrepresents a missing resource as a malformed request
**Impact:** cosmetic; raised for API consistency.

---

## Recommended fix order

1. **BUG-CMP-01** — zero-item campaign (blank frames on customer screens)
2. **BUG-CMP-02** — regex injection (ReDoS; data-leak candidate once RBAC lands)
3. **BUG-CMP-04** — duration ≤ 0 (a known bug reintroduced in a new module; UI-reproducible)
4. **BUG-CMP-07** — case-sensitive uniqueness (already affecting real users)
5. **BUG-CMP-03** — 500 on missing sort params
6. **BUG-CMP-08 / 09 / 10 / 11 / 12** — validation and status-code hardening

Items 1, 3, 6 and most of 5 are one underlying task: **a single Joi/schema pass over the campaign
endpoints.** Scoped together they are one ticket, not eight.

---

## Verification status

| Session | Method | Outcome |
|---------|--------|---------|
| 1 (initial) | UI + API | 12 raised |
| 2 (retest) | Fresh JWT, API | 10/10 reproduce; 2 retracted as false positives |
| 3 (hard refresh) | Service worker unregistered, caches cleared, cache-buster, **UI-only** | Same build `v3.5.21`; 10/10 still reproduce; BUG-04/07/08 confirmed reproducible through the UI alone |

All test data created during verification was deleted; zero residue, confirmed by API read-back.
