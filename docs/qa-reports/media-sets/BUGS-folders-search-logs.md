# Media Sets — bugs found (folders / search / logs)

Environment: cms2.pocsample.in, v3.5.25, Pre-Production 2 · Account: dev@wilyer.com (admin) · Found 2026-10-07
Automated evidence: `tests/cms2/media-sets/folders/media-sets-folders-search-duplicate-logs.spec.ts` (cases marked `test.fail`)

---

## BUG-MS-LOG-01 — Media-set actions are not written to the audit log
**Severity:** S2 (High) · **Priority:** P1 · **Case IDs:** LOG-01, LOG-02, LOG-03, LOG-05

**Steps**
1. Log in as dev@wilyer.com, open Library ▸ Media Sets.
2. Create a media set (UI builder or `POST /mediaSet/create`), rename it (`POST /mediaSet/update/{id}`), move it to a folder, delete it.
3. Read the log: `GET /log/read?page=1&limit=50&type=mediaSet` (wait 15 s).

**Expected:** entries such as `Media set 'X' created.` / `updated.` / `deleted.` attributed to dev@wilyer.com.
**Actual:** no entry for any of these actions, from the API or the UI. The newest `mediaSet` entry is dated 2026-05-05 (`Media set 'hbjjhb' deleted.`). Folder create/delete (`type=folder`) are logged correctly, so the log itself works.
**Impact:** media-set changes (including deletes) cannot be traced to a user or time.

---

## BUG-MS-SRCH-01 — Search drops the folder filter
**Severity:** S3 (Medium) · **Priority:** P2 · **Case ID:** SRCH-03

**Steps**
1. Create set `T_x` inside folder A and set `T_y` in another folder (or no folder).
2. `GET /mediaSet/read?search=T_&folderId=<A>`.

**Expected:** only `T_x` (folder A).
**Actual:** both `T_x` and `T_y` are returned (`totalDocs` 2). With `folderId` alone the filter works (1 result).
**Impact:** a folder-scoped search shows sets from other folders.

---

## BUG-MS-FLD-01 — Malformed `folderId` on the list endpoint returns 500
**Severity:** S3 (Medium) · **Priority:** P3 · **Case ID:** FLD-05

**Steps:** `GET /mediaSet/read?page=1&limit=20&folderId=zzz`

**Expected:** 400 with a message, as `POST /mediaSet/create` already does (`Invalid folderId`).
**Actual:** HTTP 500.
**Impact:** unhandled server error on bad input; inconsistent with create.

---

## Not a bug (recorded behaviour)
- No clone/duplicate feature for media sets (no card action; `/mediaSet/duplicate|clone|copy` → 404). Raise as a feature gap only if the requirement exists.
- Deleting a folder that holds a media set returns 200 and the set survives.

---

## BUG-MS-PUB-01 — Screen count is wrong after publish / unpublish on one screen
**Severity:** S3 (Medium) · **Priority:** P2 · **Case ID:** PUB-07 (`media-sets-publish-flow.spec.ts`)

**Steps**
1. Create a new media set (shows "0 Screens").
2. Card ▸ Publish → tick one screen (`aman2`) → Publish → Continue (`POST /screen/publishMediaSet` → 200).
3. Read the set (`GET /mediaSet/read`, field `screenCount`; card badge).
4. Select the card ▸ Unpublish Media Set → tick `aman2` → Unpublish → Continue (`POST /screen/unpublishMedia` → 200).

**Expected:** 1 Screens after publish, 0 Screens after unpublish.
**Actual:** 2 Screens after publishing to one screen; 1 Screens after unpublishing it. A phantom screen stays on the set (`screens` array is empty in the same payload).
**Impact:** the badge and the delete/edit warnings that rely on it cannot be trusted.
