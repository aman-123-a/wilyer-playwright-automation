# Campaigns V1 — CRUD Automation, RBAC Blockers & Defect Status

> **⚠ CORRECTION (same day, later session) — see [Doc 14](14-subuser-api-access-20260728.md).**
> The § RBAC blockers claim below that "campaigns have no role-based access
> control" is **WRONG**. Campaign permissions exist as
> `access.campaigns = { view, create, update, delete }` in the sub-user's JWT,
> and the API enforces them. The error came from reasoning off the **admin's**
> token (whose `access` is `{}`, because an unrestricted admin needs no map) plus
> the role editor UI, which does not surface this permission set. Blocker 2 was
> also a typo in the account name — the correct sub-user is
> `manager12348@yopmail.com` and it authenticates on cms2. Read Doc 14 for the
> verified position; the defect table below is unaffected.

**Document ID:** CMP-QA-DOC-12
**Type:** Executed automation build + verified defect re-status
**Environment:** `https://cms2.pocsample.in` (branch `cms2`) · API `https://v3-5api2.pocsample.in/v3/cms`
**Account:** dev@wilyer.com (admin, `isCampaignEnabled: true`)
**Date:** 2026-07-28 (later session than Doc 10)
**Method:** Playwright automation, every persistence claim confirmed by API read-back

---

## Executive summary

1. **A Campaign CRUD automation suite now exists and runs against cms2** —
   `campaign-crud.spec.ts` (23 cases) and `campaign-authz.spec.ts` (6 cases),
   backed by a `CampaignPickerPage` page object and a typed `CampaignApi` client.

2. **Three defects from Doc 10 are now FIXED.** The suite detected them by design:
   known defects are asserted against *correct* behaviour and marked
   `test.fail()`, so a fix turns the run red and forces the expectation to be
   updated. BUG-CMP-02, BUG-CMP-03 and BUG-CMP-07 are closed.

3. **Seven defects still reproduce**, all of the same class Doc 10 identified:
   validation lives in the browser, not on the server.

4. **The requested Campaign RBAC suite cannot be built on cms2 today.** Two hard
   blockers, both verified — see § RBAC blockers. The headline finding is that
   **campaigns have no role-based access control at all.**

5. **Token-layer authorization is sound.** All six authorization probes pass:
   anonymous access, malformed tokens and forged JWT payloads are all rejected.

---

## Defect status — re-verified this session

Every row below was re-executed directly against the API in a single run, with
fresh names to rule out residue collisions.

| ID | Defect | Doc 10 | **Now** | Evidence |
|----|--------|--------|---------|----------|
| BUG-CMP-01 | Zero-item campaign accepted | FAIL | **STILL OPEN** | `data: []` → 200 `Campaign created successfully.` |
| BUG-CMP-02 | Regex injection in search | FAIL | **FIXED** | `.*` → **0** results (was 34 = everything) |
| BUG-CMP-03 | 500 when `sort`/`order` omitted | FAIL | **FIXED** | same query → **200** |
| BUG-CMP-04 | Item duration accepts 0 / negative | FAIL | **STILL OPEN** | `duration: 0` → 200, persisted |
| BUG-CMP-07 | Uniqueness is case-sensitive | FAIL | **FIXED** | lowercase variant → **400** `already exists` |
| BUG-CMP-08 | No maximum name length | FAIL | **STILL OPEN** | 1000-char name → 200 |
| BUG-CMP-09 | Whitespace-only name accepted | FAIL | **STILL OPEN** | `"   \t   "` → 200 |
| BUG-CMP-10 | Invalid `folderId` coerced to null | FAIL | **STILL OPEN** | `"notavalidid"` → 200, stored `null` |
| BUG-CMP-11 | Search does not trim | FAIL | **STILL OPEN** | literal → 1, padded → 0 |
| BUG-CMP-12 | Delete not idempotent | FAIL | **STILL OPEN** | 1st → 200, 2nd → **400** (404 expected) |

**Net: 3 fixed, 7 open.** No regressions among the previously-passing controls.

### A false pass worth recording

On the first automated run, BUG-CMP-09 (whitespace name) appeared **fixed** — the
API returned 400. It was not fixed. The 400 read
`A campaign named '     ' already exists.`: the request had collided with
whitespace-named residue left by an earlier session, so it was rejected for being
a *duplicate*, not for being *blank*.

All-whitespace names of different lengths are different strings, so the test now
uses an 11-space name and asserts the rejection **reason**, not just the status
code. Without that assertion the suite would have reported a fixed bug that is
still open.

The same class of error bit the suite's own cleanup: the case-duplicate test
creates a lowercased name, and the teardown sweep matched the `QA_CRUD_` prefix
case-sensitively, so those artefacts were never deleted. They accumulated and
made later runs pass for the wrong reason. The sweep is now case-insensitive.

### Unexplained, low priority

A pre-existing campaign (`ww`, items of 30/28/28 s) reports `duration: 302828` —
the digits concatenated rather than summed (86). **Not reproducible** on
freshly-created or freshly-updated campaigns: `CMP-030` asserts the numeric sum
across both write paths and passes. Likely legacy data from an older build.

---

## RBAC blockers — the requested suite cannot run on cms2

### Blocker 1 — campaigns have no role-based permissions (finding, not just a blocker)

The requested matrix assumes a Campaign permission set of View / Create / Update /
Delete. **It does not exist in this build.**

Method: opened the role editor for four different roles, expanded every
permission accordion, and clicked every `+N` chip so nothing stayed lazily
unrendered. Then searched the dialog's full text.

- Occurrences of "campaign" in the role editor: **0**
- Permission sections present (10): `overview-&-monitoring`, `screens-management`,
  `content-management`, `screen-group-management`, `team-administration`,
  `reports`, `cluster-management`, `remote-update`, `file-uploading`,
  `content-publishing`
- Content Management's own permissions: `view, upload, update, delete, publish, create` (21/23 selected)

The only campaign gate is the **account-level JWT claim `isCampaignEnabled`**.
That is a feature flag, not access control: it is per-account, cannot be scoped
per user or per role, and offers no separation between viewing a campaign and
deleting one.

**Consequence:** any user in an account with campaigns enabled can create, edit
and delete every campaign in that account. There is no read-only campaign role,
no approver/maker separation, and no folder fencing. All 16 permission
combinations in the request currently collapse to a single state: full access.

**Severity: High.** This is the answer to "test campaign RBAC" — there is none to
test. It should be triaged as a product gap before test cases are written against
a model that does not exist.

### Blocker 2 — the maker account does not exist on cms2

```
POST https://v3-5api2.pocsample.in/v3/cms/auth/login
     {"email":"manager1248@yopmail.com", ...}
  → 404 {"message":"User not found"}
```

The Team → Members search for `manager1248` also returns zero rows. Login through
the UI shows the toast "User not found".

Direct API login against the other environments could not be used to locate the
account — `/auth/login` is reCAPTCHA-gated (`400 Recaptcha verification failed`),
so it needs a real browser session per environment.

**Everything requiring a second identity is therefore blocked:** cross-user
visibility, IDOR, privilege escalation, ownership change, permission-removed-
mid-session, and multi-user concurrency.

---

## What was delivered and executed

### Files

| File | Purpose |
|------|---------|
| `cms-e2e/pages/CampaignPickerPage.ts` | Picker component object — list, search, create/update/delete modals |
| `cms-e2e/utils/campaignApi.ts` | Typed REST client with pagination, seeding and prefix teardown |
| `cms-e2e/data/campaigns.data.ts` | Names, duration boundaries, search payloads |
| `cms-e2e/tests/campaigns/campaign-crud.spec.ts` | 23 CRUD / validation / known-defect cases |
| `cms-e2e/tests/campaigns/campaign-authz.spec.ts` | 6 token-layer authorization cases |
| `cms-e2e/fixtures/test-fixtures.ts` | Extended with `campaignPicker` + `campaignApi` |
| `cms-e2e/config/env.ts` | Added `API_BASE_URL` (pinned per branch, like `BASE_URL`) |

### Feature facts pinned during this build

| Item | Value |
|------|-------|
| Auth | `Authorization: Bearer <jwt>`, JWT stored in the **`footprint` cookie** (not localStorage) |
| List cap | `limit` > 100 → 400; the client pages instead |
| Campaign id in UI | Only exposed via the card's report link `a[href="/campaign-report/<id>"]` |
| Modals | `#createCampaign` / `#updateCampaign` / `#deleteCampaign`, all `data-bs-backdrop="static" data-bs-keyboard="false"` — Escape and backdrop clicks do **not** close them |
| Duplicate ids | `#name` and `#defaultDuration` exist in *both* create and update modals — locators must be modal-scoped |
| Read-one | Returns `defaultDuration`; the list projection does not (corrects Doc 10) |

### Authorization results — all pass

| Case | Result |
|------|--------|
| SEC-001 unauthenticated list | Rejected |
| SEC-002 malformed bearer token | Rejected |
| SEC-003 JWT with tampered `userId` | Rejected — signature verified |
| SEC-004 JWT with `isCampaignEnabled` self-granted | Rejected |
| SEC-005 anonymous create + delete | Rejected |

---

## Suite status — honest reporting

Latest full run: **24 passed · 3 flaky · 1 failed.**

- The 11 known-defect cases show as expected-failures and count as passing.
- **3 UI cases are flaky** (`CMP-012`, `CMP-018`, `CMP-021`) — they pass on retry.
- **1 UI case is failing**: `CMP-026` (delete through the picker). It passes
  reliably in isolation and failed under parallel load. This is **instability in
  the test, not a defect in the application** — the delete path itself is
  confirmed working by the API-level round trip (`CMP-002`) and by manual
  verification. It needs a more deterministic wait on the picker list refresh.

The API-layer cases (CRUD round trip, validation, authorization) are stable
across every run. The instability is confined to the browser-driven cases, which
drive a slow shared server through a modal-heavy UI.

---

## Test data hygiene

All artefacts carry a `QA_CRUD_` prefix and a worker index, so teardown removes
only this suite's data and never a colleague's. Final state verified by API
read-back: **0 residue**, campaign count returned to baseline.

One pre-existing whitespace-named campaign from an earlier session was left in
place — it is not this suite's data, and deleting another party's record on a
shared server was not assumed.

---

## Recommended fix order

1. **Campaign RBAC** — design and ship the permission set. Currently absent (High).
2. **BUG-CMP-01** — zero-item campaigns (blank frames on customer screens).
3. **BUG-CMP-04** — duration ≤ 0; a known playlist bug reintroduced in campaigns.
4. **BUG-CMP-08 / 09 / 10** — one schema pass over name and folderId validation.
5. **BUG-CMP-11 / 12** — search trim and delete status code (cosmetic).

Items 2–5 remain a single Joi/schema ticket, as Doc 10 recommended.

---

## To unblock the RBAC suite

1. A **working maker account on cms2** (or confirmation of which environment
   `manager1248@yopmail.com` belongs to).
2. Confirmation of whether **Campaign RBAC is shipped, planned, or out of scope**.
   If planned, the Doc 08 §19.5 matrix and the `kind: 'checkbox'` harness
   extension are ready to build against it the moment the permissions exist.
