# Campaigns V1 — Sub-User API Access & IDOR

**Document ID:** CMP-QA-DOC-14
**Type:** Executed authorization test run
**Environment:** `cms2` — app `https://cms2.pocsample.in` · API `https://v3-5api2.pocsample.in/v3/cms`
**Accounts:** `dev@wilyer.com` (admin) · `manager12348@yopmail.com` (sub-user, restricted)
**Date:** 2026-07-28
**Suite:** `tests/campaigns/api/campaign-subuser-access.spec.ts` — `npm run cms2 -- tests/campaigns/api`
**Result:** 7/7 passed

---

## Correction to Doc 12

Doc 12 stated that **campaigns have no role-based access control**. That is
**wrong**, and this document supersedes it on that point.

Two mistakes produced it:

1. **Reasoning from the wrong token.** The admin's JWT carries `access: {}` — an
   unrestricted admin needs no permission map. I read that empty object, plus a
   role editor that never says "campaign", and concluded no such permission
   existed. A **sub-user** token settles it in one line.
2. **A typo in the account name.** `manager1248@yopmail.com` genuinely does not
   exist (404 on cms, cms2, cms3 and cms4). The real account is
   `manager12348@yopmail.com`, and it authenticates on cms2 normally.

The lesson is the one this feature keeps teaching: **an absence observed from the
wrong vantage point is not an absence.** The same class of error produced the
retracted BUG-CMP-05/06 in Doc 10 and the false "BUG-CMP-09 is fixed" reading in
Doc 12.

---

## The real permission model

The sub-user's JWT carries a full per-module access map. The campaign entry is
exactly the permission set the test request described:

```json
"campaigns": { "view": true, "create": true, "update": true, "delete": true }
```

Sibling modules use the same shape (`media`, `widgets`, `mediaSets`, `playlists`,
`sequences`, `screens`, `groups`, `team`, `roles`, `clusters`, `reports`, `logs`,
`fileApproval`, `makerAndChecker`, `remoteUpdate`).

Other identity claims for this account:

| Claim | Value |
|-------|-------|
| `role` | `subuser` |
| `isRestrictedAccess` | **`true`** |
| `isCampaignEnabled` | `true` |
| `partner` | `null` |
| `userId` | `62263c1e14f5a72ee1bdf395` — **the same id as the admin** |

### Two gates, not one

All four campaign permissions are `true`, yet the sub-user can neither list nor
create a campaign. A second, orthogonal control decides the outcome:
**`isRestrictedAccess` + folder scope.**

The server says so itself on create:

```
403 {"message":"You can only create campaigns inside a folder you have access to."}
```

So the effective answer is `permission AND folder-access`. Testing the permission
flags alone would give a misleading picture — which is precisely why the 16-way
matrix in the original request cannot be read off the flags without also
controlling folder assignment.

---

## Results

| ID | Check | Result | Server response |
|----|-------|--------|-----------------|
| SUB-001 | Identity + permission map | Confirmed sub-user token | `role: subuser`, `campaigns:{view,create,update,delete}` all true |
| SUB-002 | List campaigns | **0 of 36** | `200 {"docs":[],"totalDocs":0}` |
| SUB-003 | Create a campaign | **Denied** | `403 You can only create campaigns inside a folder you have access to.` |
| SUB-004 | Delete a non-existent id | Denied | `400 Campaign not found.` |
| SUB-005 | List scoping vs admin | **Scoped** | sub-user sees 0, admin sees 36 |
| SUB-006 | **IDOR — read foreign campaign by id** | **Blocked** | `403 You don't have access to this campaign.` |
| SUB-007 | **IDOR — delete admin-owned campaign by id** | **Blocked** | `403 You don't have access to this campaign.` |

### The headline: no IDOR

The important test is SUB-006/007. A scoped **list** proves nothing on its own —
plenty of systems filter the list and then happily serve any record by direct id.
This one does not:

- A campaign absent from the sub-user's list returns **403 on direct read by id**,
  not 200.
- A campaign created by the admin returns **403 on direct delete**, not 200.

For SUB-007 the target was a throwaway campaign **seeded and cleaned up as
admin**, so a successful bypass would have destroyed only this suite's own data,
never a colleague's.

**Campaign authorization is enforced server-side, per-record.** This is materially
stronger than the picture in Doc 10, where every validation rule turned out to be
client-only. Authorization and validation are clearly not the same code path.

---

## Observations worth raising

### 1. `userId` is the parent account's id — audit attribution risk (Medium)

The sub-user's token carries `userId: 62263c1e14f5a72ee1bdf395`, which is
**identical to the admin's** `userId`. `role` correctly reads `subuser`, so the
distinction exists somewhere, but if any audit log, "created by" field, or report
attributes actions by `userId`, **every sub-user action will be recorded as the
admin's**.

Not verified either way here — it needs a write performed by the sub-user, and
this account currently cannot write anything. Worth confirming before the audit-log
cases in Doc 03 are written, because it would invalidate their expected results.

### 2. Delete leaks existence ordering (Low)

`DELETE` of a non-existent id returns `400 Campaign not found.`, while `DELETE` of
a real-but-forbidden id returns `403 You don't have access`. The two responses
differ, so an attacker can distinguish "this id exists" from "this id does not"
without any access to it.

Low severity — ids are 24-char ObjectIds and not practically enumerable — but the
clean fix is to return the same status for both. This also relates to BUG-CMP-12
(delete returning 400 rather than 404).

### 3. The role editor does not expose campaign permissions (Medium)

`access.campaigns` is real and enforced, but four role editors inspected with every
accordion and `+N` chip expanded contain **zero** occurrences of "campaign".
So the permission is enforced but, as far as the admin UI is concerned,
**not editable**. Either it is set through another surface, inherited from
Content Management, or seeded outside the UI.

This matters for the requested RBAC matrix: without a UI (or documented API) to
toggle `campaigns.view/create/update/delete`, the 16 combinations cannot be driven
from the admin side. **This is the remaining blocker** — a much narrower one than
Doc 12 claimed.

---

## What is now unblocked, and what is not

**Unblocked** — the sub-user account works, so these are executable today:
identity/claims verification, list scoping, IDOR on read and delete, folder-scoped
create denial, and cross-account comparison against the admin baseline. All seven
are automated and passing.

**Still blocked** — the full 16-combination matrix, because there is no exposed
control to change `access.campaigns`. To unblock, one of:

1. Where in the admin UI campaign permissions are edited (if I missed the surface), or
2. The API call that updates a role's `access.campaigns`, or
3. Confirmation that campaign permissions are inherited from Content Management,
   in which case the matrix should be driven through that section instead.

Also still blocked: **folder RBAC**, which needs a sub-user with access to at least
one folder. This account has none, so every folder case currently collapses to the
same 403 and nothing can be differentiated.

---

## Recommendation

No authorization defects found. The per-record checks hold under direct-id attack,
which is the failure mode that matters.

Priorities from this run:

1. Confirm audit attribution is not keyed on `userId` (Observation 1).
2. Expose campaign permissions in the role editor, or document how they are set —
   this is what blocks the remaining matrix (Observation 3).
3. Grant the test sub-user access to one folder, so folder RBAC and the
   "permitted" half of every case become testable.
