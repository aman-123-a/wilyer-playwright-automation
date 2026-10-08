# Doc 19 — Campaign permissions: enable / disable matrix across both sub-user types

**Environment:** `https://cms2.pocsample.in` · API `https://v3-5api2.pocsample.in/v3/cms`
**Date:** 2026-07-29
**Accounts:** `dev@wilyer.com` (owner) · `manager12348@yopmail.com` (folder-fenced sub-user,
role *child (Required)*) · `ak22@gmail.com` (account-wide sub-user, role *unres1*)
**Suites:**
`tests/cms2/campaigns/rbac/campaign-permission-matrix.spec.ts` (new, 34 cases)
`tests/cms2/campaigns/rbac/subuser-folder-campaigns.spec.ts` (existing, 31 cases, setup repaired)
**Result:** 64 passed, 1 skipped (data precondition), 0 failed.

---

## What was tested

The CMS fences a sub-user twice over, and the two controls are independent:

| Control | Question it answers | Where it lives |
|---------|--------------------|----------------|
| Role permission | *what* the role may do | `permissions.campaigns.{view,create,update,delete}` |
| Folder fence | *where* it may do it | `isRestrictedAccess` + assigned folders |

Doc 16 covered the folder fence. This pass covers the permission layer: each campaign
permission was **disabled and re-enabled** on the live role through
`PUT /role/update/:id`, the sub-user re-authenticated, and every verb re-attempted — for both
kinds of sub-user, so a finding can be attributed to the permission and not to the fence.

`upload` is not a campaign permission; campaigns expose exactly four verbs. Upload belongs to
the `media` module, which was checked for bleed-through (`PERM-*-023`) and is unaffected.

Both shared roles were snapshotted before the first write, restored afterwards, and the restore
was verified — including the module count, because the update endpoint replaces rather than
merges.

---

## Results

### Enforced correctly

| Permission | Granted | Revoked |
|-----------|---------|---------|
| `campaigns.create` | create → `200`, persists | `403`, **and nothing is written** |
| `campaigns.view` | list + read-by-id → `200` | `403` on both — the list filter is not the boundary |
| `campaigns.delete` | delete → `200`, gone | `403`, campaign survives |

Also confirmed: re-enabling a revoked permission restores the ability; revoking campaign
permissions destroys no existing data; a campaigns-only change leaves the other modules intact;
the owner is unaffected while a sub-user is revoked; anonymous callers get `401` before any
permission logic runs; and full campaign permissions still do **not** lift the folder fence
(`PERM-030`), while the unfenced sub-user with the identical permission set can use the root
(`PERM-031`).

### Three defects — identical for both sub-user types

| ID | Severity | Summary |
|----|----------|---------|
| **BUG-PERM-03** | Critical / S1 | A sub-user whose role carries `roles.update` can rewrite **its own** role: it granted itself the revoked permission and set `isRestrictedAccess: false`, escaping its folder fence entirely. Confirmed effective in the re-issued JWT. |
| **BUG-PERM-02** | High / S1 | `campaigns.update` is never enforced: `/campaign/update` admits the caller when `create` **or** `update` is held. Edit rights cannot be withdrawn from a role that may create. |
| **BUG-PERM-01** | High / S2 | `access` is a JWT claim, so a revocation does not reach an existing session — the sub-user keeps the revoked ability until it logs in again or the 24 h token expires. |

Full reproduction steps in [BUG-LIST](BUG-LIST.md).

BUG-PERM-03 is the one to act on first. The folder fence is the whole security boundary for a
restricted sub-user, and the account owner is not involved in removing it.

---

## Repairs to the existing folder suite

`subuser-folder-campaigns.spec.ts` could not run to completion before this pass:

1. It picked the sub-user's **first** assigned folder, which holds no media. Every create then
   failed payload validation (`"data[0].file" is not allowed to be empty`) and reported it as a
   permission result. It now picks an assigned folder that actually holds media.
2. The role had `campaigns.update = false` at the time of the run, so the folder-fence cases for
   update would have been denied by the *permission* layer and passed for the wrong reason. The
   suite now grants the full campaign set for its duration and restores the role afterwards, so
   only the fence varies.
3. The UI case resolved playlists from the first playlist folder only, and asserted a
   *media*-folder name against the *playlist* folder view — two different namespaces that can
   share a name and never share an id.

`SUBF-041` (the UI create path) now skips with a stated reason: the sub-user's playlist folder
holds no selectable media, so the create dialog cannot be completed — the button is disabled by
design ("Add at least one media item."). Seeding a playlist in the folder that does hold media
would make this leg runnable.

---

## Notes for whoever runs this next

- `PUT /role/update/:id` **replaces** `permissions`; a partial body wipes every other module for
  every user holding that role. Learned on a throwaway role, encoded in
  `helpers/rbac/rolePermissions.ts`.
- A permission change only reaches a sub-user on its next login — every toggle in the suite is
  followed by a fresh authentication.
- The owner's `/folder/read` does **not** list folders belonging to its sub-users, yet the owner
  can read, create and delete inside them by id. Worth a look as a navigation gap.
- `CMS_UNRESTRICTED_EMAIL` / `_PASSWORD` are new in `.env`. The `unrestricted` role in
  `helpers/rbac/roles.ts` previously resolved to `CMS_SUBUSER_*` — the folder-*fenced* account —
  so any suite asking for an unrestricted identity was silently getting a restricted one.
