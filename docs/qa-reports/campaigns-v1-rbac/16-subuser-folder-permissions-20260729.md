# Campaigns — Sub-user folder permissions (CRUD · negative · BVA · integration)

**Environment:** `https://cms2.pocsample.in` · API `https://v3-5api2.pocsample.in/v3/cms`
**Date:** 2026-07-29
**Identities:** admin `dev@wilyer.com` (unrestricted) · sub-user `manager12348@yopmail.com`
(restricted, scoped to one folder). Credentials live only in the local gitignored `.env`.
**Suite:** `tests/cms2/campaigns/rbac/subuser-folder-campaigns.spec.ts` — 31 tests,
**five consecutive clean runs, zero flakes**, no residue left on the shared server.
**Method:** every request is made as an explicit identity (the suite clears `storageState`
and logs in per identity). Denials are asserted on exact status **and** message, and every
"was it really blocked?" claim is settled by an admin read-back, not by the error alone.

---

## 1. How the permission actually works

The sub-user's JWT grants `access.campaigns = {view, create, update, delete}` — **all four
true**. That is not the operative rule. `isRestrictedAccess: true` layers a **folder fence** on
top, and the fence decides.

Campaign folders are the **media** folder namespace (`GET /folder/read`). There is no
`/campaign-folder` endpoint — that 404s. Note this is a *different* namespace from playlist
folders: the same folder name "Noida" has one id as a media folder and another as a playlist
folder, which matters when writing tooling against it.

| Attempt (restricted sub-user) | Result |
|---|---|
| create **inside** an assigned folder | `200` |
| create in an **unassigned** folder | `403` "Access denied to this folder." |
| create at the **root** — `null`, `""`, or omitted | `403` "You can only create campaigns inside a folder you have access to." |
| create with a well-formed **unknown** folder id | `400` "Folder not found." |
| read / update / delete a campaign in an unassigned folder | `403` "You don't have access to this campaign." |
| move own campaign **out** of its folder (or to root) | `403`, and the campaign does not move |
| no token | `401` |

**A restricted sub-user cannot create a campaign at the root at all.** Every campaign it makes
must live in an assigned folder. The editor handles this invisibly: campaigns are only
reachable through a playlist editor, and the picker derives `folderId` from the playlist it was
opened in — verified on the wire in SUBF-041.

### What is done well

The fence is enforced **server-side**, not just in the UI, and it holds against the two attacks
that matter:

- **Privilege escalation** — the sub-user cannot move its own campaign into a folder it does
  not own, nor to the root. The denial is real: a follow-up read shows `folderId` unchanged.
- **IDOR** — read-one, update and delete against a campaign in a foreign folder all return
  `403` with the *same* message. Authorization runs **before** the lookup, so the response does
  not distinguish "exists but forbidden" from "does not exist" — no existence leak.

Three spellings of "no folder" (`null`, `""`, omitted) plus a malformed id all land on the same
rule. None of them silently defaults to the root, which is the hole this kind of fence usually
has.

---

## 2. Defects

| ID | Severity | Title | UI? |
|----|----------|-------|-----|
| **BUG-SUBF-01** | **High / S2** | Campaign items may reference media outside the folder fence — cross-scope disclosure | No |
| BUG-SUBF-02 | Medium / S3 | A campaign item may point at a media id that does not exist | No |
| — | — | BUG-CMP-01 / 04 / 08 / 09 confirmed to apply on the sub-user path too | mixed |

### BUG-SUBF-01 — media reference escapes the folder fence (new)

The fence covers where a campaign is **filed**. It does not cover what a campaign item
**points at**.

Repro, all as the sub-user:

1. Confirm file `6a6335c662dca4bcc662d41d` is **not** in the sub-user's library —
   `GET /file/read` for that identity does not return it.
2. `POST /campaign/create` with `folderId` = the assigned folder and
   `data: [{ file: "6a6335c662dca4bcc662d41d", duration: 10 }]` → **200**.
3. `GET /campaign/read/{id}` as the sub-user returns:

```json
{ "file": { "id": "6a6335c662dca4bcc662d41d",
            "name": "sample_1784886700341.jpg",
            "type": "image",
            "thumb": "https://d2o2gp3gd28xa2.cloudfront.net/.../thumb-sample_1784886700341.png" } }
```

By referencing an id it cannot list, the sub-user obtains the foreign file's **name, type and a
working CDN thumbnail URL** — and can put that media on screens it controls. The id space is
guessable in bulk (24-hex Mongo ObjectIds are not secret; ids leak through any shared export or
URL), so this is enumerable rather than a one-off.

**Fix:** validate every `data[].file` against the caller's folder scope on write, the same way
`folderId` already is. Covered by SUBF-026, which currently asserts the defect.

### BUG-SUBF-02 — no referential integrity on media ids

`data: [{ file: "000000000000000000000000" }]` is accepted with `200` and stored. The reader
returns the dangling item, so the player receives content it cannot resolve. Covered by
SUBF-034.

### Previously-known defects, confirmed on the sub-user path

These are not new, but they were only recorded for the admin. All reproduce for the restricted
sub-user inside its own folder, so no role gates them:

| Case | Result | Existing id |
|---|---|---|
| zero media items | `200` — UI blocks it, API does not | BUG-CMP-01 |
| `defaultDuration` 0 / −5 / 2.5 / 999999 | all `200` | BUG-CMP-04 |
| name 256 / 1000 characters | `200` — no maximum length | BUG-CMP-08 |
| whitespace-only name | `200` — no trim | BUG-CMP-09 |
| **empty** name | `400` `"name" is not allowed to be empty` | *the only field rule enforced* |

One divergence worth noting: BUG-CMP-10 records that an invalid `folderId` is silently coerced
to `null` for the **admin**. For a restricted sub-user the folder is resolved *first*, so the
request is rejected outright (`403`/`400`) — the safer behaviour, and the one the admin path
should adopt.

---

## 3. Suite contents (31 tests)

**Smoke / positive CRUD** — SUBF-001 create in assigned folder · 002 read in folder (and root
omits it) · 003 read-one · 004 update · 005 delete.

**Negative — placement** — SUBF-010 unassigned folder · 011 root · 012 ×3 (omitted / empty
string / malformed) · 015 unknown folder id · 016 list an unassigned folder.

**Security** — SUBF-020 move out of scope blocked *and* nothing moved · 021 move to root
blocked · 022 IDOR read+update+delete, with admin read-back proving the record survived
untouched · 025 anonymous · 026 the media-reference leak.

**Boundary value analysis** — SUBF-030 empty name · 031 ×4 name lengths and whitespace ·
032 ×4 durations · 033 zero items · 034 non-existent media id.

**Integration** — SUBF-040 the admin sees the sub-user's campaign only via the folder ·
SUBF-041 the sub-user's real UI path (folder-scoped `/playlists` → playlist editor → Campaigns
tab → create), asserting the picker sends the folder's id **by itself**.

Run with:

```bash
npm run cms2 -- tests/cms2/campaigns/rbac/ --project=chromium
```

Requires `CMS_ALLOW_DESTRUCTIVE=true`. The suite creates and removes its own campaigns in both
folders and leaves nothing behind (verified: the sub-user's folder returns to its 4 pre-existing
campaigns, the root to 42).

**Note on the defect tests.** SUBF-026, 031, 032, 033 and 034 assert the *current, wrong*
behaviour so the suite stays green today and turns **red the moment a fix lands** and the
expectation needs flipping. Each names its bug id.

---

## 4. Two test-engineering notes

Recorded because both produced a false signal before being fixed, and both are easy to repeat:

- **Fixed-name boundary cases self-clean.** A 1-character name cannot also carry a unique
  suffix, and campaign names are unique per account — so the first run passed and the second
  reported a product `400` that was really this suite's own residue. SUBF-031 now purges by
  exact name on both sides of the assertion.
- **The folder card on `/playlists` is not drivable.** Clicking it changes SPA state with no URL
  change and no unique settle signal, so the click races hydration (~1 failure in 4). SUBF-041
  now resolves the playlist id through the API and navigates directly, keeping the assertions
  that carry meaning — the folder is visible, the editor opens, and the picker supplies
  `folderId` on its own.
