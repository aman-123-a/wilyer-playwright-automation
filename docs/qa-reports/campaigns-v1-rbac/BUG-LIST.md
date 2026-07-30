# Campaigns V1 — Bug List

**Environment:** `https://cms2.pocsample.in` · API `https://v3-5api2.pocsample.in/v3/cms`
**Accounts:** `dev@wilyer.com` (admin) · `manager12348@yopmail.com` (restricted sub-user) · `ak22@gmail.com` (unrestricted sub-user)
**Date:** 2026-07-28 · **Last re-verified:** 2026-07-28, automation session
**Method:** every row below re-executed directly against the API in one pass, with fresh
names to rule out residue collisions. Persistence confirmed by read-back, never by a toast.
**Detail:** [Doc 10](10-crud-boundary-search-test-run-20260728.md) · [Doc 12](12-crud-rbac-automation-and-defect-status-20260728.md) · [Doc 13](13-api-performance-20260728.md) · [Doc 14](14-subuser-api-access-20260728.md)
**Regression suite:** `tests/campaigns/` — open defects are encoded as `test.fail()` against
the *correct* behaviour, so the run turns red the moment one is fixed.

`UI?` = reproducible by a manual tester through the interface alone (no API tooling)

---

## Summary — 15 open, 3 fixed

| ID | Severity | Title | UI? | Status |
|----|----------|-------|-----|--------|
| BUG-PERM-03 | **Critical / S1** | A sub-user can rewrite its **own** role — self-escalation, and it can clear its own folder fence | **Yes** | **OPEN** |
| BUG-PERM-02 | **High / S1** | `campaigns.update` is not enforced — revoking edit rights does nothing | No | **OPEN** |
| BUG-PERM-01 | **High / S2** | Revoked permissions stay usable for the life of the existing token (24 h) | No | **OPEN** |
| BUG-CMP-01 | **High / S1** | Campaign with zero media items accepted by the API | No (UI guards it) | **OPEN** |
| BUG-CMP-04 | Medium / S2 | Item duration accepts 0 and negative values | **Yes** | **OPEN** |
| BUG-CMP-08 | Medium / S3 | No maximum length on campaign name | **Yes** | **OPEN** |
| BUG-CMP-13 | Medium / S2 | Sub-user token carries the **admin's** `userId` — audit attribution risk | No | **OPEN (unconfirmed impact)** |
| BUG-CMP-15 | Medium / S3 | Campaign permissions are enforced but **not editable** in the role editor | Yes | **OPEN** |
| BUG-CMP-16 | **High / S2** | Admin's campaign list hides foldered campaigns; sub-user's does not | **Yes** | **OPEN** |
| BUG-CMP-09 | Low / S3 | Whitespace-only name accepted by the API | No | **OPEN** |
| BUG-CMP-10 | Low / S3 | Invalid `folderId` silently coerced to null | No | **OPEN** |
| BUG-CMP-11 | Low / S4 | Search does not trim the query | Yes | **OPEN** |
| BUG-CMP-12 | Low / S4 | Delete is not idempotent (400, not 404) | No | **OPEN** |
| BUG-CMP-14 | Low / S4 | Delete distinguishes "forbidden" from "not found" — existence leak | No | **OPEN** |
| BUG-CLU-01 | Low / S3 | Cluster batch content page `/batch-settings/<id>` is not addressable — a direct navigation, reload or bookmark redirects to `/clusters`, losing the batch being edited | **Yes** | **OPEN** |
| BUG-CMP-02 | ~~High / S2~~ | ~~Regex injection in campaign search~~ | — | **✅ FIXED** |
| BUG-CMP-03 | ~~Medium / S2~~ | ~~500 when `sort`/`order` omitted~~ | — | **✅ FIXED** |
| BUG-CMP-07 | ~~Medium / S3~~ | ~~Name uniqueness is case-sensitive~~ | — | **✅ FIXED** |

*(BUG-CMP-05 and 06 were raised then retracted — false positives from misreading transient
toasts. Documented in Doc 10.)*

**The dominant pattern is unchanged:** validation lives in the browser, not on the server.
Every remaining boundary the UI blocks, the API accepts. **Authorization is the exception** —
it is enforced server-side and per-record, and held up under direct-id attack (Doc 14).

---

## Open defects

### BUG-CMP-01 — Zero-item campaign accepted by the API · High / S1

**Steps:** `POST /campaign/create` with `{"data": [], "defaultDuration": 10, "name": "X"}`
**Actual:** `200 {"message":"Campaign created successfully."}` — persisted with `items: 0`
**Expected:** `400` — a campaign must contain ≥ 1 media item (BR-04)
**Impact:** the empty campaign appears in the playlist picker as a normal selectable card with
no badge or warning and can be inserted into a loop → blank frame on a customer screen. Loop
resolution `(loop-1) % length` divides by zero.
**Note:** the UI blocks this correctly; only the server does not. Once created, the record
cannot be saved from the UI at all.
**Fix:** enforce `data.length >= 1` server-side on create *and* update; guard the picker and publish.

---

### BUG-CMP-04 — Item duration accepts 0 and negative values · Medium / S2 · **UI-reproducible**

**Steps (UI):** playlist editor → Campaigns → `+ New` → add a media item → type `0` or `-5`
into the per-item duration → Create
**Actual:** accepted and saved. Server stores `duration: 0` / `-5`. With `-5` the editor
displays **`Total Duration : -1h:-1m:-5s`**.
**Expected:** minimum 1 second (BR-13)
**Root cause:** the per-item duration `<input type="number">` has **no `min` attribute** (the
Default Duration field correctly has `min="1"`), and there is no server-side check.
**Note:** the **same defect class already known in playlist duration** — the stepper enforces a
floor, typing bypasses it. Reimplemented in a new module.
**Fix:** `min=1` on the input + server-side `duration >= 1`.

---

### BUG-CMP-08 — No maximum length on campaign name · Medium / S3 · **UI-reproducible**

**Steps:** enter a 255-, 507- or 1000-character name
**Actual:** accepted and persisted; input has `maxLength = -1`; no server cap
**Expected:** capped (255 suggested)
**Impact:** overflows the picker card and pushes page layout; also flows into playlist slot
labels and the approval email body.
**Fix:** cap in schema and input.

---

### BUG-CMP-13 — Sub-user token carries the admin's `userId` · Medium / S2 · NEW

**Steps:** log in as `manager12348@yopmail.com`, decode the `footprint` JWT
**Actual:** `userId: 62263c1e14f5a72ee1bdf395` — **identical to the admin's** `userId`.
`role` correctly reads `subuser`, and `partner` is `null`.
**Expected:** an identifier unique to the sub-user, or a clearly separate actor field
**Impact:** if any audit log, "created by" field, or report attributes actions by `userId`,
**every sub-user action is recorded as the admin's** — which would make the audit trail
useless for exactly the accountability question it exists to answer.
**Status: impact NOT confirmed.** Proving it needs a write performed by the sub-user, and this
account currently cannot write anything (see BUG-CMP-15 / folder scope). Raised now because it
would invalidate the expected results of the audit-log cases in Doc 03 before they are written.
**Fix:** confirm attribution keys on a per-user identity, not the parent account id.

---

### BUG-CMP-15 — Campaign permissions are enforced but not editable · Medium / S3 · NEW

**Steps:** Team → Roles → Edit (any role) → expand every permission accordion and every `+N` chip
**Actual:** **zero** occurrences of "campaign" in the role editor, across four different roles.
Yet a sub-user's JWT carries `access.campaigns = { view, create, update, delete }`, and the API
enforces it.
**Expected:** a permission the API enforces should be visible and editable by an administrator
**Impact:** an admin cannot grant or revoke campaign access through the product. The permission
is real, enforced, and invisible. This also **blocks the RBAC test matrix** — the 16 combinations
cannot be driven without a way to change these flags.
**Open question for the team:** is this set through another surface, inherited from Content
Management, or seeded outside the UI?
**Fix:** surface the campaign permission set in the role editor, or document the supported path.
**Update (2026-07-29):** the flags *are* settable through the API — `PUT /role/update/:id` with the
full permission object — so the RBAC matrix is no longer blocked; it is driven that way by
`tests/cms2/campaigns/rbac/campaign-permission-matrix.spec.ts`. The UI gap stands.
**Caution for anyone scripting this:** that endpoint **replaces** `permissions` wholesale rather
than merging, so a partial body silently wipes every other module for every user holding the role.
`helpers/rbac/rolePermissions.ts` always rewrites the full object for this reason.

---

### BUG-CMP-16 — `folderId=` means different things to different users · High / S2 · NEW · **UI-reproducible**

**Steps:** issue the *identical* request as an admin and as an unrestricted sub-user:
`GET /campaign/read?limit=100&page=1&sort=createdAt&order=-1&search=&folderId=`

| Caller | Result | Breakdown |
|--------|--------|-----------|
| `dev@wilyer.com` (admin) | **36** | all `folderId: null` — root only |
| `ak22@gmail.com` (unrestricted sub-user) | **43** | the same 36 root **+ 7 inside 4 different folders** |

Campaigns visible only to the sub-user: **7**. Visible only to the admin: **0**.

**The admin is not unauthorized — the list simply omits them.** Direct read by id succeeds:

```
ADMIN GET /campaign/read/6a688de6d22047adcde109e4  → 200  (campaign "wsd", folderId 6a4f5e…)
ADMIN GET /campaign/read?…&folderId=6a4f5e6d87fd23e8b532811d → 200 totalDocs=1
ADMIN GET /campaign/read?…&folderId=6a4f5e62472a0f8e8390871f → 200 totalDocs=4
```

So an empty `folderId` is interpreted as **"root only"** for the admin and as
**"everything, flattened"** for the sub-user. One of the two is wrong; they cannot both be right
for the same request.

**Impact (confirmed):** the playlist picker uses exactly this query, so **an administrator
cannot see 7 campaigns that exist in their own account** — they are absent from the picker and
cannot be inserted into a playlist. Content silently missing from the owner's view is a
functional defect, not a cosmetic one.

**Impact (unverified, potentially serious):** if "empty `folderId` ⇒ all folders flattened"
applies to *any* sub-user, then a **partially-restricted** user — one granted access to a single
folder — may receive campaigns from folders they cannot access, bypassing folder fencing.
This could **not** be tested: the only restricted account available (`manager12348@yopmail.com`)
has access to **no** folder and correctly receives 0, which does not discriminate between the
two behaviours. **Testing it requires a sub-user granted access to exactly one folder** — see
BUG-CMP-15.

**Fix:** make the semantics of an empty `folderId` identical for every caller, and state which
one is intended. If "root only" is correct, the sub-user list is over-returning and must be
re-checked against folder permissions. If "all" is correct, the admin list is under-returning
and hiding the account's own content.

**Related:** `GET /campaign-folder/read` returns `404 Page Not found.` — the campaign folder
list lives at some other path, which should be confirmed while fixing this.

---

### BUG-PERM-03 — A sub-user can rewrite the role assigned to itself · Critical / S1 · NEW · **UI-reproducible**

**Steps:** as `manager12348@yopmail.com` (folder-fenced sub-user, role *child (Required)*, which
carries `roles.update = true`), call
`PUT /role/update/<own roleId>` with its own permission object, setting
`campaigns.create = true` and `isRestrictedAccess = false`.
**Actual:** `200 {"success":true,"message":"Role updated successfully"}`. The permission the
account owner had revoked is restored, **and the sub-user's own folder fence is switched off**.
Logging in again returns a JWT with `isRestrictedAccess: false` and full `access.campaigns`.
**Expected:** role administration must refuse an edit to the role that governs the caller, and
must never allow granting a permission the caller does not already hold.
**Impact:** the folder fence is the entire security boundary for a restricted sub-user — it is
what stops it seeing other branches' media, screens and campaigns. Any sub-user whose role
includes role management can remove that boundary from itself in one request, then re-login and
operate account-wide. This is vertical privilege escalation with no admin involvement.
**Note:** calling `/role/update` is legitimate for this role; editing *its own* role is not.
The same reproduces for the unrestricted sub-user (`ak22@gmail.com`, role *unres1*).
**Fix:** reject `roleId === caller.assignedRoleId`; additionally cap any granted permission by
the caller's own set, and treat `isRestrictedAccess` as owner-only.
**Automated:** `PERM-RES-022` / `PERM-UNR-022`.

---

### BUG-PERM-02 — `campaigns.update` is not enforced · High / S1 · NEW

**Steps:** revoke `campaigns.update` on the sub-user's role (leaving `create` granted), log in
again so the JWT carries `update: false`, then `POST /campaign/update/<id>` with a new name.
**Actual:** `200 {"message":"Campaign updated successfully."}` and the rename persists.
**Expected:** `403 "You are not authorized to perform this action."` — the answer `create`,
`view` and `delete` all give when revoked.
**Root cause, isolated by flipping one verb at a time:** the endpoint admits the caller when
`campaigns.create` **OR** `campaigns.update` is held, and refuses only when both are off.

| create | update | edit allowed? |
|--------|--------|----------------|
| ✓ | ✓ | yes |
| ✓ | ✗ | **yes — wrong** |
| ✗ | ✓ | yes |
| ✗ | ✗ | no |

**Impact:** edit rights cannot be withdrawn from any role that may create — an administrator who
unticks "update" gets no change in behaviour while the UI reports the permission as revoked. The
mirror case is equally broken: "may add, may not edit" is not expressible.
**Fix:** gate `/campaign/update` on `campaigns.update` alone.
**Automated:** `PERM-RES-012` / `PERM-UNR-012`, with `PERM-*-015` and `PERM-*-014` pinning the
other corners of the table.

---

### BUG-PERM-01 — Revoked permissions survive in the existing session · High / S2 · NEW

**Steps:** with the sub-user logged in, revoke `campaigns.create` on its role. Without the
sub-user logging in again, `POST /campaign/create` on its existing token.
**Actual:** `200` — the campaign is created and persists. The revocation only takes effect after
the sub-user re-authenticates.
**Expected:** authorisation resolved per request, or the session invalidated when its role changes.
**Impact:** `access` is a JWT claim, and the token's lifetime is 24 h (`exp - iat = 86400`). An
administrator removing access from a compromised or departing user has no way to make that
effective — the user keeps every revoked ability for up to a day, and nothing in the UI says so.
**Fix:** check permissions against the stored role on each request, or bump a role/user token
version on change and reject tokens minted before it.
**Automated:** `PERM-RES-021` / `PERM-UNR-021`.

---

### BUG-CMP-09 — Whitespace-only name accepted by the API · Low / S3

**Steps:** `POST /campaign/create` with `"name": "   \t   "`
**Actual:** `200`, persisted; renders as an unnamed card in the picker
**Expected:** rejected as empty
**Note:** the UI trims correctly (typing spaces leaves the field empty and `required` blocks it)
— the API does not. The blank-name rejection already works; it just runs **before** trimming.
**Verification trap:** re-testing with a plain `"     "` returns `400 "A campaign named '     '
already exists."` — a *duplicate* rejection from earlier residue, not a validation fix. This
read as "fixed" on the first automated run and was not. The regression test now uses an
11-space name and asserts the rejection **reason**, not just the status code.
**Fix:** trim server-side before the empty check.

---

### BUG-CMP-10 — Invalid `folderId` silently coerced to null · Low / S3

**Steps:** `POST /campaign/create` with `"folderId": "notavalidid"`
**Actual:** `200`; stored as `folderId: null`
**Expected:** `400` — no such folder
**Impact:** **raised from Low toward High by Doc 14.** Folder access is now confirmed to be the
*effective* campaign access control ("You can only create campaigns inside a folder you have
access to"). A write path that silently discards an invalid `folderId` and parks the record at
`null` is therefore adjacent to the security boundary, not merely cosmetic. Re-test whether a
restricted user can reach the `null` folder.
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
**Impact:** cosmetic; raised for API consistency. Shares a fix with BUG-CMP-14.

---

### BUG-CMP-14 — Delete leaks resource existence · Low / S4 · NEW

**Steps:** as a restricted sub-user, `DELETE` a non-existent id, then `DELETE` a real id
belonging to someone else
**Actual:** non-existent → `400 "Campaign not found."`; real-but-forbidden → `403 "You don't
have access to this campaign."`
**Expected:** the same response for both
**Impact:** the differing responses let a caller distinguish "this id exists" from "this id does
not" without any access to it. Low severity — 24-character ObjectIds are not practically
enumerable — but it is a free fix alongside BUG-CMP-12.
**Fix:** return one status for both cases (`404`), and run the authorization check before the lookup.

---

## Fixed since first report

| ID | Was | Now | Evidence |
|----|-----|-----|----------|
| BUG-CMP-02 | `.*` in search returned **all 34** campaigns; `^`, `{2,}`, `(a\|b)` all evaluated | **Treated literally** | `.*` → **0 results** |
| BUG-CMP-03 | `GET /campaign/read` without `sort`/`order` → **500** | **Defaults applied** | same query → **200** |
| BUG-CMP-07 | `Test_Name` and `test_name` both created; `VANS`/`vans` pairs in live data | **Rejected** | lowercase variant → `400 already exists` |

All three were detected automatically: the suite asserts the *correct* behaviour and marks the
case `test.fail()`, so a fix surfaces as "expected to fail, but passed" rather than sitting
unnoticed. Each is now a plain passing regression guard.

---

## Not defects — verified working

| Area | Result |
|------|--------|
| **Authorization (per-record)** | A sub-user cannot read or delete a campaign by direct id that it cannot list — `403` both times. **No IDOR.** |
| **List scoping** | Sub-user sees 0 of 36 campaigns; scoping is applied server-side |
| **Token integrity** | Anonymous, malformed, and forged JWTs (including a self-granted `isCampaignEnabled`) are all rejected |
| **XSS** | `<script>` in a campaign name is stored and rendered as inert text in the picker |
| **SQL metacharacters** | `' OR '1'='1` in search → 0 results, no error, no leak |
| **Duplicate on create/update** | Exact duplicates rejected with a clear message naming the campaign |
| **Performance** | All endpoints ~170–370 ms p50, an order of magnitude inside budget; no N+1 signature; genuine request concurrency (Doc 13) |

**Untested surfaces** (flagged, not cleared): XSS in the campaign **slot label**, the
**approval email body**, and `/campaign-report/{id}`. The email body is the highest-risk of the
three (Doc 07 SEC-035).

---

## Recommended fix order

1. **BUG-CMP-16** — admin cannot see foldered campaigns in their own account (and the folder-fencing question it raises)
2. **BUG-CMP-01** — zero-item campaign (blank frames on customer screens)
3. **BUG-CMP-04** — duration ≤ 0 (a known bug reintroduced in a new module; UI-reproducible)
4. **BUG-CMP-15** — expose campaign permissions in the role editor (blocks RBAC testing entirely)
5. **BUG-CMP-13** — confirm audit attribution before the audit-log cases are written
6. **BUG-CMP-08 / 09 / 10** — one schema pass over name and `folderId` validation
7. **BUG-CMP-11 / 12 / 14** — search trim and delete status codes

Items 1, 2, 5 and 6 remain a **single Joi/schema pass over the campaign endpoints** — one
ticket, not eight. Items 3 and 4 are separate, and belong to whoever owns the permission model.

---

## Verification status

| Session | Method | Outcome |
|---------|--------|---------|
| 1 (initial) | UI + API | 12 raised |
| 2 (retest) | Fresh JWT, API | 10/10 reproduce; 2 retracted as false positives |
| 3 (hard refresh) | Service worker unregistered, caches cleared, **UI-only** | Same build `v3.5.21`; 10/10 still reproduce |
| 4 (automation) | Playwright suite + direct API sweep | **3 fixed, 7 still open**; 1 false "fixed" reading caught and corrected |
| 5 (sub-user) | Restricted account, IDOR probes | No authorization defects; 3 new findings raised (13, 14, 15) |
| 6 (unrestricted sub-user) | `ak22@gmail.com` vs admin, list comparison | Admin/sub-user visibility mismatch found → BUG-CMP-16 |

All test data created during verification was deleted; **zero residue**, confirmed by API
read-back (campaign count returned to 36).

One pre-existing whitespace-named campaign from an earlier session was deliberately left in
place — it is not this suite's data, and deleting another party's record on a shared server was
not assumed.
