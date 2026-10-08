# Media Sets — Gap-fill execution report

**Env:** cms2.pocsample.in (v3.5.25) · **Run:** 2026-10-08 · **Specs:** `tests/cms2/media-sets/{auth,rbac,validation,move,audit}/`
**Identities:** `unmaker` (maker, folder-fenced, fileApproval.required) · `unchecker` (checker, no Media Sets grant, fileApproval.approve, logs.view) · admin fixture. Credentials come from the gitignored `.env` (`MS_MAKER_*`, `MS_CHECKER_*`); none appear in code, reports or logs.

## Result

| | Count | % of 98 |
|---|---|---|
| Total executed | **98** | |
| Passed | **93** | 94.9 % |
| Known defect (test marked `test.fail`, defect re-confirmed) | **4** | 4.1 % |
| Failed (unexpected) | **1** (intermittent, see D-05) | 1.0 % |
| Blocked (not runnable on this build) | 6 areas, listed below | — |
| Skipped | 0 | — |

Plus the pre-existing `folders/` spec (28 cases) re-run after removing 5 stale defect markers: **28 / 28 pass**. Not counted above.
Housekeeping tests (2 identity probes, 4 cleanup steps) are excluded from the 98.

### By area
| Area | Executed | Pass | Known defect | Fail |
|---|---|---|---|---|
| Auth / session (TC-A01–A14) | 14 | 13 | 1 | 0 |
| RBAC / authorization / tamper (TC-B01–B05) | 8 | 7 | 1 | 0 |
| Validation, BVA, special chars, unicode, XSS, search inputs, dup (TC-D, TC-E, TC-C09) | 45 | 45 | 0 | 0 |
| Move, pagination, concurrency, network/status handling | 25 | 23 | 1 | 1 |
| Audit log | 6 | 5 | 1 | 0 |

### By requested category (what was actually covered)
| Category | Status | Notes |
|---|---|---|
| Positive | Covered | A01–A04, maker CRUD, unicode round-trip, every move hop |
| Negative | Covered | A05–A09, blank/whitespace names (6 variants), malformed/deleted move targets, 13 search inputs |
| Edge | Covered | A10–A14, refresh, second tab, back-after-logout, same-folder move, unicode/emoji |
| BVA | Covered, with a caveat | **No maximum name length is configured**, so 50 was not assumed. 1/2/49/50/51/52/100/255/256/1000 chars all accepted and round-trip exactly (no truncation, no duplicate). Zero length rejected |
| CRUD | Covered | maker full cycle; create/update/delete/move by API; pre-existing UI CRUD in `folders/` |
| Search | Covered | special/XSS/long/blank/whitespace terms never 5xx; search spans pages; search is folder-scoped when `folderId` is sent (root-only otherwise) |
| Folder / root / move | Covered | Root→A→Root→B→A, nested A1, same-folder, malformed, orphan, deleted set, deleted destination, parallel moves |
| Pagination | Covered | 0, 1, size−1, size, size+1, last page of 1, delete/move last record, paged search (limit 5) |
| Media handling | Partial | Existing builder/format specs cover add/remove; image/video mix not re-run in this pass |
| Validation | Covered | |
| RBAC | Covered | UI route, API, data visibility, IDOR, token tamper, anonymous |
| Security | Covered | XSS ×5 stored + search reflection (no execution, rendered as literal text), spoofed owner/role fields ignored, forged/expired JWT rejected |
| API | Covered | all status paths asserted <500 |
| Concurrency | Covered | parallel create/edit/delete/rename/move |
| Persistence | Covered | round-trips after create/update/move; login-as-another-user reads |
| Audit | Covered | attribution, ordering, exactly-once, no entry for refused/denied actions, unicode |
| Maker-Checker / Approval / Rejection | **Blocked** | see below |

## Defects (every FAIL)

| ID | Sev | Pri | Role | Feature | Expected | Actual | API result | Audit result | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| **BUG-MS-FENCE-01** (MS-SC-04) | **CRITICAL** | P1 | maker (fenced) | RBAC — folder fence | Fenced user cannot read/change/delete a set outside its scope | List hides the set, but `POST /mediaSet/update/{id}` on an admin-owned root set returns **200** and changes it | update 200 (expected 401/403/404) | update logged as the maker | `rbac/media-sets-rbac.spec.ts` (marked `test.fail`) |
| **BUG-MS-LOG-02** | **HIGH** | P2 | maker | Audit — move | Log names source and destination folder | Move is logged as plain `Media set 'X' updated.`; entry has only `id,type,createdAt,msg,user` (no role, folder, status, old/new) | 200 | entry exists but cannot show where the set moved | `audit/media-sets-audit.spec.ts` (marked) |
| **BUG-AUTH-01** | **HIGH** | P2 | maker | Session — logout | Token is revoked on logout | A token captured before logout still gets 200 from `/mediaSet/read` afterwards (logout only clears the cookie) | 200 after logout | n/a | `auth/media-sets-auth.spec.ts` (marked) |
| **D-05 (BUG-MS-RACE-01)** | **HIGH** | P2 | admin | Concurrency — rename | Two parallel renames to one name → one wins, one 409 | **Intermittent (1 of 5 runs):** both returned 200 → two sets with the same name | 200 + 200 | two "updated" entries | `move/…` "parallel rename onto the same new name" (left unmarked; flaky by nature) |
| **API-D5** | MEDIUM | P3 | admin | Move — orphan folder | Well-formed non-existent `folderId` refused | Accepted (200); set points at a folder that does not exist | 200 | updated entry | `move/…` (marked) |

### Observations (not failures)
- **No name-length cap** (API-D2): a 1000-character name is stored. MEDIUM validation gap — needs a product decision on the limit.
- A role holding `logs.view` but **no Media Sets grant** (unchecker) can read media-set audit lines, including set names. Consistent with the grant, so treated as by-design; flag to product (LOW).
- Unverified, seen once: the fenced maker's root view showed "Total - 8" / "Media Sets (8)" with "No media sets yet" listed. A repeat run read 0, so not recorded as a defect; re-check.
- Fenced maker has **no Create button at Root** ("Open a folder to create a media set"). Intended; creation requires a folder.
- `unmaker`'s `mediaSets.publish` flipped false→true during the day — role drift on the shared account. Specs record it and do not assert it.

### Fixed since the last report (stale markers removed)
BUG-MS-LOG-01 (no audit entries for create/update/delete) and BUG-MS-SRCH-01 (`search` ignoring `folderId`).
Still open from before: BUG-MS-FLD-01 (malformed `folderId` on read → 500), API-D1…D4, D6…D10.

## Blocked — and why
These cases cannot run as written because **Media Set create/edit/delete/move are not approval-gated on this build**: a maker's create returns 201 immediately, there is no Pending state for a set. Approval applies to uploaded files (`/file/readUnapproved`) and publish requests.

| Cases | Reason |
|---|---|
| Maker create → Pending → Checker approve/reject, rejection reason, Approved/Rejected state transitions, two-checker race | No set-level approval state exists |
| Maker self-approve (UI + API) | No set-level approve endpoint; the file-approval equivalent needs an upload request created through the playlist editor |
| Pending Edit / Delete / Move | Same |
| Publish-request approval | Publishes to real screens; needs an approved test screen |
| Checker Folder A = yes / Folder B = no | `unchecker` has no Media Sets grant at all and `unmaker` is fenced to one folder; needs a second folder-scoped checker identity |
| Permission removal while a session is live (Admin changes grant mid-session) | Would alter the shared role; needs your approval and a restore step |

## Next, if wanted
1. File-approval maker→checker flow (upload as `unmaker`, decide as `unchecker`) — the closest real equivalent, reuse `ApprovalFlowsPage` with the `MS_*` identities.
2. Re-run the 6-line approval list once a test screen and a second checker are available.
3. Decide the name-length requirement, then convert the BVA cases from "controlled outcome" to strict accept/reject at the boundary.

## Reproduce
`npx cross-env TEST_ENV=cms2 playwright test tests/cms2/media-sets/<dir> --project=chromium --workers=1` for `auth`, `rbac`, `validation`, `move`, `audit` — one directory at a time (a single combined run exhausted memory on this machine).
