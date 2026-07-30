# Campaigns V1 — Access Comparison: Main User vs Restricted Sub-User vs Unrestricted Sub-User

**Document ID:** CMP-QA-DOC-15
**Type:** Executed authorization comparison
**Environment:** `cms2` — app `https://cms2.pocsample.in` · API `https://v3-5api2.pocsample.in/v3/cms`
**Date:** 2026-07-28
**Suite:** `tests/campaigns/api/campaign-subuser-access.spec.ts`
**Result:** 7 passed / 1 skipped for **each** of the two sub-user profiles

```bash
# restricted profile (default, from .env)
npm run cms2 -- tests/campaigns/api/campaign-subuser-access.spec.ts

# unrestricted profile
CMS_SUBUSER_EMAIL=ak22@gmail.com CMS_SUBUSER_PASSWORD=12345 \
  npm run cms2 -- tests/campaigns/api/campaign-subuser-access.spec.ts
```

---

## Accounts under test

| Role in this document | Account | Role name on cms2 | `isRestrictedAccess` |
|-----------------------|---------|-------------------|----------------------|
| **Main user** (owner/admin) | `dev@wilyer.com` | — (account owner) | `false` |
| **Restricted sub-user** | `manager12348@yopmail.com` | `CHILD` | **`true`** |
| **Unrestricted sub-user** | `ak22@gmail.com` | `UNRES15` | `false` |

### Note on `manager1248@yopmail.com`

That address **does not exist on any environment**. Verified two independent ways:

1. `POST /auth/login` → `404 {"message":"User not found"}` on cms, cms2, cms3 **and** cms4.
2. Absent from the complete cms2 member list (66 accounts enumerated via `GET /team/read`).

The three similar accounts that *do* exist are `manager1234@yopmail.com` (MANGER),
`manager12345@yopmail.com` (QA) and `manager12348@yopmail.com` (CHILD). This document uses
**`manager12348@yopmail.com`**, per confirmation.

---

## Token claims side by side

| Claim | Main user | Restricted sub-user | Unrestricted sub-user |
|-------|-----------|---------------------|-----------------------|
| `email` | dev@wilyer.com | manager12348@yopmail.com | ak22@gmail.com |
| `role` | `user` | `subuser` | `subuser` |
| `userId` | `62263c1e14f5a72ee1bdf395` | **`62263c1e14f5a72ee1bdf395`** | **`62263c1e14f5a72ee1bdf395`** |
| `partner` | `622ee61be8c6e16eb0a82473` | `null` | `null` |
| `isRestrictedAccess` | `false` | **`true`** | `false` |
| `isCampaignEnabled` | `true` | `true` | `true` |
| `access` | `{}` (empty — unrestricted by design) | full module map | full module map |
| `access.campaigns` | — | `{view, create, update, delete}` **all true** | `{view, create, update, delete}` **all true** |

### Two findings fall straight out of this table

**1. All three tokens share one `userId`.** The sub-users carry the *owner's* id. `role`
distinguishes them, but any audit log, "created by" field or report keyed on `userId` would
attribute every sub-user action to the main user. → **BUG-CMP-13**

**2. The campaign permission flags are identical for both sub-users — yet their access is
completely different.** Both have `campaigns: {view, create, update, delete} = true`. The only
differentiator is `isRestrictedAccess` plus folder grants.

This is the single most important result for the RBAC test plan: **the four campaign permission
flags are not what actually gates campaign access.** A matrix built on toggling
view/create/update/delete would produce identical outcomes for two accounts that behave nothing
alike. The effective rule is `permission AND folder-access`.

---

## Behaviour comparison

| Check | Main user | Restricted sub-user | Unrestricted sub-user |
|-------|-----------|---------------------|-----------------------|
| **List campaigns** (`folderId=` empty) | **36** — root only | **0** | **43** — root + 4 folders |
| **Create** | ✅ `200` | ❌ `403` *"You can only create campaigns inside a folder you have access to."* | ✅ `200` |
| **Read foreign campaign by id** | ✅ `200` | ❌ `403` *"You don't have access to this campaign."* | ✅ (nothing is foreign to it) |
| **Delete admin-owned campaign** | ✅ `200` | ❌ `403` | ✅ `200` |
| **Delete non-existent id** | `400 Campaign not found.` | `400 Campaign not found.` | `400 Campaign not found.` |

### Restricted sub-user — fencing works, including against direct-id attack

The important result is that the fence is **per-record, not just a list filter**. Many systems
filter the list and then happily serve any record by direct id. This one does not:

- A campaign absent from its list → **403 on direct read by id**, not 200.
- An admin-owned campaign → **403 on direct delete**, not 200.

For the delete probe the target was a throwaway campaign **seeded and removed as the main user**,
so a successful bypass would have destroyed only this suite's own data.

**No IDOR. No privilege escalation. Authorization is enforced server-side.** This is materially
stronger than the validation story in Doc 10, where every boundary turned out to be client-only
— authorization and validation are clearly not the same code path.

### Unrestricted sub-user — full account rights, as designed

It can create, and it can delete a campaign belonging to the main user (`200`). That is **not**
IDOR: the account is account-wide by design. The test suite now decides what "correct" means from
the `isRestrictedAccess` claim, because asserting refusal unconditionally would report a false
security finding for this profile.

Worth stating for governance rather than as a defect: an unrestricted sub-user has **unconditional
destructive power over the account owner's content**, with no second confirmation and — given
finding 1 above — an audit trail that may not distinguish it from the owner.

---

## The anomaly: the main user sees *less* than a sub-user

| Caller | Campaigns listed | Breakdown |
|--------|------------------|-----------|
| Main user | 36 | all `folderId: null` — root only |
| Unrestricted sub-user | **43** | the same 36 **+ 7 inside 4 folders** |

Visible only to the sub-user: **7**. Visible only to the main user: **0**.

The main user is *authorised* for those 7 — the list simply omits them:

```
ADMIN GET /campaign/read/6a688de6…                       → 200  ("wsd", folderId 6a4f5e…)
ADMIN GET /campaign/read?…&folderId=6a4f5e6d87fd23e8b53… → 200  totalDocs=1
ADMIN GET /campaign/read?…&folderId=6a4f5e62472a0f8e839… → 200  totalDocs=4
```

So an empty `folderId` means **"root only"** for the main user and **"everything, flattened"**
for a sub-user. → **BUG-CMP-16 (High/S2)**

**Confirmed impact:** the playlist picker issues exactly this query, so the account owner cannot
see 7 of their own campaigns in the picker and cannot add them to a playlist.

**Unverified risk:** if "empty ⇒ all folders flattened" applies to *every* sub-user, a
**partially-restricted** account — one granted a single folder — may receive campaigns from
folders it cannot access, bypassing the fence. This could not be tested: the restricted account
has access to **no** folder and correctly returns 0, which does not discriminate between the two
behaviours.

---

## What this changes for the RBAC test plan

**Testable today** (automated, 7 cases, both profiles green): identity and claim verification,
list scoping, folder-scoped create denial, IDOR on read, IDOR on delete, and the main-user
visibility gap.

**Still blocked, and the blocker is now precise:** the 16-combination matrix cannot be driven,
because `access.campaigns` is enforced but **not editable anywhere in the role editor**
(BUG-CMP-15) — and, per the finding above, toggling those flags would not change behaviour
anyway. What actually needs varying is **folder grants**.

**The one grant that unblocks the most:** give `manager12348@yopmail.com` access to **exactly one
folder**. That single change makes testable, all at once:

- the "permitted" half of every CRUD case for a restricted user,
- folder inheritance and folder switching,
- whether the flattened-list behaviour bypasses folder fencing (the open risk in BUG-CMP-16),
- duplicate names across different folders vs the same folder,
- whether a sub-user write is attributed to the sub-user or the owner (BUG-CMP-13).

---

## Defects referenced

| ID | Severity | Title |
|----|----------|-------|
| BUG-CMP-13 | Medium / S2 | Sub-user tokens carry the main user's `userId` — audit attribution risk |
| BUG-CMP-14 | Low / S4 | Delete distinguishes "forbidden" from "not found" — existence leak |
| BUG-CMP-15 | Medium / S3 | Campaign permissions enforced but not editable in the role editor |
| BUG-CMP-16 | **High / S2** | Main user's campaign list hides foldered campaigns; sub-user's does not |

Full detail: [BUG-LIST.md](BUG-LIST.md)

---

## Test data hygiene

Every campaign created during this comparison was removed, verified by API read-back across
**root and all four folders** (not root alone — the earlier baseline of 36 was itself the
main user's root-only view). Zero residue.
