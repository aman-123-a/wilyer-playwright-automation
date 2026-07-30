# Doc 20 — Campaigns V1 with RBAC: Test Plan & Test Case Suite

**Document ID:** CMP-QA-DOC-20
**Date:** 2026-07-30
**Author:** QA (Lead Test Engineer)
**Source spec:** *Campaigns — Version 1 with RBAC* (Playlists, Clusters, Folder System, RBAC, Publish Approval Email)
**Environment under test:** `https://cms2.pocsample.in` · API `https://v3-5api2.pocsample.in/v3/cms`
**Relationship to existing docs:** this is the PRD-aligned, 7-column deliverable. The deep
per-field suite lives in [Doc 03](03-detailed-test-cases.md) (CMP-001…220) and
[Doc 05](05-edge-cases.md); confirmed defects are in [BUG-LIST.md](BUG-LIST.md). Cases below
cite those IDs where a case is already known to fail.

---

# Part 1 — Test Plan

## 1.1 Scope

**In scope**

| # | Area | What V1 must prove |
|---|------|--------------------|
| 1 | Campaign playback & loop logic | Index mapping across loop iterations, wrap-around, single- vs multi-file, mid-flight edits |
| 2 | Folder system & access control | Inheritance, restricted folders, visibility parity with Media/Widgets |
| 3 | Playlists & clusters integration | Add / edit / remove / order position; cluster parity with playlist |
| 4 | RBAC | create · view · update · delete · publish across Admin, Editor, Viewer, Restricted |
| 5 | Publish approval email | Exact template text, dynamic count and screen list, batch behaviour |

**Out of scope for V1:** campaign scheduling/dayparting, campaign analytics/proof-of-play
reporting, cross-account campaign sharing, campaign versioning/rollback, offline player
resolution of campaigns beyond the cached loop.

## 1.2 Test approach

Three layers, deliberately, because the dominant defect pattern on this feature is
**validation living in the browser and not on the server** (see BUG-LIST.md):

1. **UI (Playwright)** — user-visible behaviour, folder visibility, picker, ordering.
2. **API (direct)** — every boundary the UI blocks is re-attempted against the endpoint with a
   real token. A case is only *passed* when the API agrees with the UI.
3. **Player/loop simulation** — index-mapping cases are asserted against the resolved playback
   sequence, not against the editor preview.

Persistence is confirmed by **read-back**, never by a toast. Authorization is confirmed by
**direct-ID attack** (guessing/reusing another tenant's campaign ID), not by absence from a list.

## 1.3 Roles and test identities

| Role | Identity | Campaign permissions | Folder fence |
|------|----------|---------------------|--------------|
| Admin / Owner | `dev@wilyer.com` | all four verbs | none (account-wide) |
| Editor | sub-user, role *unres1* (`ak22@gmail.com`) | view, create, update | none |
| Viewer | sub-user, view-only role | view only | none |
| Restricted User | `manager12348@yopmail.com`, role *child (Required)* | per-role | `isRestrictedAccess: true` + assigned folders |

`campaigns` exposes exactly four verbs — `view`, `create`, `update`, `delete`. There is **no
separate `publish` permission**; publish authority is derived from playlist/screen rights. Every
publish case below states which right it actually exercises. **Raise this with product** — an
explicit `campaigns.publish` verb is assumed by the PRD's approval-email flow but does not exist.

## 1.4 Entry / exit criteria

**Entry:** feature deployed to cms2; four role identities seeded; folder tree `F1/F2/F3` with a
restricted branch; ≥10 assets (images, videos, widgets); ≥2 online screens and ≥1 cluster;
mail sink reachable for approval-email assertions.

**Exit:** 100 % of P0 executed and passed; ≥95 % P1 passed; zero open S1 defects; every open
defect encoded in the regression suite as `test.fail()` against the *correct* behaviour so the
run turns red when it is fixed.

## 1.5 Priority definition

`P0` blocker / smoke — data loss, security boundary, blank screen in the field.
`P1` high — core function wrong but recoverable, or a customer-visible correctness bug.
`P2` medium — edge, cosmetic, or low-frequency path.

## 1.6 Risk register

| Risk | Why it matters for Campaigns |
|------|------------------------------|
| Loop index divides by campaign length | A zero-item campaign makes `(loop-1) % length` divide by zero → **blank frame on a customer screen** (BUG-CMP-01, server accepts it) |
| Permission is a JWT claim | Revocation does not reach a live session for up to 24 h (BUG-PERM-01) |
| `campaigns.update` unenforced | Edit rights cannot be withdrawn from a role that may create (BUG-PERM-02) |
| Self-escalation | A sub-user with `roles.update` can clear its own folder fence (BUG-PERM-03) |
| Email fan-out | One campaign edit can touch hundreds of screens — batching, truncation and count accuracy are untested territory |

---

# Part 2 — Test Case Suite

Legend — Steps use `→` as the separator. `PRE-G*` are the global preconditions in §1.4.

## Module 1 — Campaign Playback & Loop Logic (`CP-LOOP-*`)

| Test Case ID | Module / Area | Test Scenario | User Role / Preconditions | Test Steps | Expected Result | Priority |
|---|---|---|---|---|---|---|
| CP-LOOP-001 | Playback / index mapping | PRD reference case: 4-file campaign at position 2 of a 5-slot loop | Admin. Campaign `C4` with files A,B,C,D. Playlist `P5` with 5 slots, `C4` in slot 2. Screen online | Publish P5 → observe 4 consecutive loop iterations | Iteration 1 → A, 2 → B, 3 → C, 4 → D. Slots 1,3,4,5 play their fixed media unchanged every iteration | P0 |
| CP-LOOP-002 | Playback / wrap-around | Campaign index wraps after the last file | Admin. CP-LOOP-001 setup | Observe iterations 5, 6, 7, 8 | Iteration 5 → A, 6 → B, 7 → C, 8 → D. Mapping is `((iteration-1) mod 4) + 1` with no skip or repeat at the boundary | P0 |
| CP-LOOP-003 | Playback / single-file | Single-file campaign behaves like plain media | Admin. Campaign `C1` with file A only, in a 3-slot loop | Observe 5 iterations | A plays in every iteration. No stall, no skipped slot, no visible difference from a plain media item | P0 |
| CP-LOOP-004 | Playback / two-file | Two-file campaign alternates | Admin. Campaign `C2` = A,B | Observe 6 iterations | A,B,A,B,A,B — strict alternation | P1 |
| CP-LOOP-005 | Playback / non-divisor length | Campaign length not a divisor of loop slot count | Admin. Campaign of 3 files in a 5-slot loop | Observe 15 iterations | Campaign index advances once per **loop iteration**, independent of slot count: 1,2,3,1,2,3… The two counters must not couple | P0 |
| CP-LOOP-006 | Playback / longer than loop | Campaign has more files than the loop has slots | Admin. 10-file campaign in a 2-slot loop | Observe 10 iterations | All 10 campaign files are reached in order across 10 iterations; none is starved | P1 |
| CP-LOOP-007 | Playback / multiple campaigns | Two campaigns in the same loop advance independently | Admin. `C4`(4 files) in slot 1, `C3`(3 files) in slot 3 | Observe 12 iterations | Each campaign keeps its own index; they resynchronise only at iteration 13 (LCM 12). No shared counter | P0 |
| CP-LOOP-008 | Playback / same campaign twice | Same campaign placed in two slots of one loop | Admin. `C4` in slot 1 and slot 4 | Observe 4 iterations | Defined and consistent behaviour: either both slots show the same index (shared state) or each slot advances independently. Must be documented, not accidental | P1 |
| CP-LOOP-009 | Playback / zero-file | Campaign with zero media files in a loop | Admin. Campaign created with `data: []` via API (**BUG-CMP-01** — server accepts it) | Add to a playlist → publish → observe | Must never reach a screen. Publish blocked with an explicit error. **Currently: `(loop-1) % 0` — expect a blank frame or player crash.** Regression asserts the block | P0 |
| CP-LOOP-010 | Playback / durations | Per-file duration is honoured per iteration | Admin. Campaign A=5s, B=15s, C=10s | Time three iterations | Iteration 1 holds 5s, 2 holds 15s, 3 holds 10s. Loop total varies per iteration accordingly | P1 |
| CP-LOOP-011 | Playback / default duration | `defaultDuration` applies to files with no explicit duration | Admin. Campaign with `defaultDuration: 10`, one file with duration 20 | Observe both iterations | Explicit 20 wins for its file; every other file plays for 10 | P1 |
| CP-LOOP-012 | Playback / video duration | Video file in a campaign plays to its natural length | Admin. Campaign with a 30s video at index 2 | Observe iteration 2 | Video plays full length, not truncated to defaultDuration, and the loop advances only on completion | P1 |
| CP-LOOP-013 | Playback / widget | Widget file in a campaign renders and advances | Admin. Campaign with a widget at index 3 | Observe iteration 3 | Widget renders with live data and advances after its configured duration | P1 |
| CP-LOOP-014 | Playback / mixed types | Image + video + widget in one campaign | Admin. Campaign A=image, B=video, C=widget | Observe 3 iterations | Each type renders correctly in its own iteration; no type-transition artefact or black frame between them | P0 |
| CP-LOOP-015 | Playback / mid-flight add | File appended while the loop is running | Admin. 3-file campaign live on a screen, currently at index 2 | Append file D → approve/publish → observe | Loop length becomes 4 at the next safe boundary. Index does not jump backwards or skip; no frame dropped during the swap | P0 |
| CP-LOOP-016 | Playback / mid-flight remove | Currently-playing file removed from a live campaign | Admin. 4-file campaign live, playing index 3 | Remove file C → publish → observe | Current frame completes, then the loop resolves against the new 3-file list. No blank frame, no stale reference | P0 |
| CP-LOOP-017 | Playback / mid-flight reorder | Files reordered while live | Admin. Live campaign A,B,C,D at index 2 | Reorder to D,C,B,A → publish | Next iteration resolves against the new order. Index semantics after reorder are defined (position-based, not identity-based) and documented | P1 |
| CP-LOOP-018 | Playback / index persistence | Player restart mid-campaign | Admin. Campaign at index 3 of 4 | Reboot the player device → observe first iteration after boot | Defined behaviour: index resets to 1 **or** resumes at 4. Must be consistent across reboots and documented — silent divergence between devices is a defect | P1 |
| CP-LOOP-019 | Playback / offline | Screen loses network mid-loop | Admin. Campaign live | Disconnect the screen → observe 4 iterations offline | Campaign continues rotating from cache with correct index mapping. No fallback to always-index-1 | P0 |
| CP-LOOP-020 | Playback / reconnect | Screen reconnects after a campaign edit made while offline | Admin. Campaign edited during the outage | Reconnect → observe | Screen pulls the new campaign, resolves the index against the new length, and does not replay stale files | P1 |
| CP-LOOP-021 | Playback / two screens | Same campaign on two screens started at different times | Admin. `C4` published to Screen1 and Screen2, Screen2 powered on 2 minutes later | Observe both | Each screen keeps its own index. Cross-screen sync is **not** a V1 requirement — assert no crash and no shared-counter coupling | P2 |
| CP-LOOP-022 | Playback / large campaign | 100-file campaign in a loop | Admin. Campaign seeded with 100 files via API | Observe iterations 1, 50, 99, 100, 101 | Correct file at each index; iteration 101 wraps to file 1. No memory growth or slowdown across the cycle | P2 |
| CP-LOOP-023 | Playback / duplicate file | Same media file at two indices of one campaign | Admin. Campaign A,B,A,C | Observe 4 iterations | Iterations 1 and 3 both play A. Duplicates are positions, not deduplicated | P2 |
| CP-LOOP-024 | Playback / deleted source media | Media file inside a live campaign deleted from the library | Admin. Live 4-file campaign | Delete the source of file B → observe iteration 2 | Either the delete is blocked while referenced, or the loop skips index 2 gracefully. **Never** a blank frame or a broken-asset placeholder on a customer screen | P0 |
| CP-LOOP-025 | Playback / duration 0 | Item duration of 0 or negative | Admin. Item duration set to 0 via API (**BUG-CMP-04**) | Publish → observe that iteration | Rejected at save. If it reaches the player, assert it does not busy-loop or skip instantly through the whole campaign | P1 |
| CP-LOOP-026 | Playback / campaign deleted while live | Campaign deleted while playing on a screen | Admin. Campaign live in playlist P5 | Delete the campaign | Blocked with an "in use by N playlists" message, or the slot degrades to a defined placeholder. No player crash | P0 |

## Module 2 — Folder System & Access Control (`CP-FLD-*`)

| Test Case ID | Module / Area | Test Scenario | User Role / Preconditions | Test Steps | Expected Result | Priority |
|---|---|---|---|---|---|---|
| CP-FLD-001 | Folder / create | Campaign is created in the currently open folder | Admin. Folder `F1` open | Open F1 → Create campaign → Save | Campaign lands in F1, not at root | P0 |
| CP-FLD-002 | Folder / listing | Campaign lists alongside media and widgets | Admin. Campaign + media + widget in F1 | Open F1 | All three listed with a distinguishing type indicator for the campaign | P0 |
| CP-FLD-003 | Folder / parity | Folder behaviour matches Media and Widgets exactly | Admin. F1 holds one media file and one campaign | Perform the same list, sort, filter, rename, move and delete actions on each; compare | Identical behaviour. Any divergence is a defect — the PRD requires the *existing* folder rules | P0 |
| CP-FLD-004 | Folder / move | Move a campaign between folders | Admin. Campaign in F1, F2 writable | Select → Move → F2 → verify playlist references | Campaign in F2; playlists referencing it still resolve | P1 |
| CP-FLD-005 | Folder / move denied | Move into a folder the user cannot write | Restricted User fenced to F1; F2 not assigned | Attempt Move to F2 (UI **and** direct API call) | Blocked in UI; API returns 403; campaign unmoved | P0 |
| CP-FLD-006 | Folder / inheritance | Child folder inherits the parent grant | Restricted User granted F1 only; campaign in `F1/F2` | Log in as Restricted → browse F1 → open F2 | F2 and its campaign are visible and usable | P0 |
| CP-FLD-007 | Folder / explicit deny | Explicit child deny overrides an inherited grant | Restricted User granted F1, explicitly denied `F1/F2` | Browse F1 | F1 contents visible; F2 and its campaigns hidden everywhere — list, picker, search and API | P0 |
| CP-FLD-008 | Folder / restricted parent | Restricted parent hides the whole subtree | Restricted User denied F1; campaign in `F1/F2/F3` | Browse the library | Neither F1, F2, F3 nor the campaign appears at any level | P0 |
| CP-FLD-009 | Folder / depth | Campaign at nesting depth 5 | Admin. `F1/F2/F3/F4/F5` | Create a campaign at depth 5 → open from the playlist picker | Fully functional; breadcrumb shows the full path | P2 |
| CP-FLD-010 | Folder / revocation | Revoking folder access removes campaign visibility | Restricted User currently has F1 | Admin revokes F1 → sub-user refreshes and re-lists | Campaigns disappear from list, picker, search and API. **Note BUG-PERM-01** — verify whether the revocation takes effect before the token expires; if not, that is the defect | P0 |
| CP-FLD-011 | Folder / direct ID | Fenced user fetches an out-of-fence campaign by ID | Restricted User fenced to F1; campaign ID from F2 known | `GET /campaign/:id` with the F2 campaign ID | 403. The list filter must not be the only boundary | P0 |
| CP-FLD-012 | Folder / cross-account | Campaign ID from another tenant | Restricted User; campaign ID belonging to a different account | `GET`, `PUT` and `DELETE` on that ID | 403 or 404 on all three, with no data leaked in the error body | P0 |
| CP-FLD-013 | Folder / existence leak | Error responses do not distinguish forbidden from missing | Restricted User | Request a real out-of-fence ID and a random non-existent ID; compare status, body and timing | Responses indistinguishable. **BUG-CMP-14** — delete currently distinguishes them | P1 |
| CP-FLD-014 | Folder / invalid ID | Campaign created with a bogus `folderId` | Admin, via API | `POST /campaign/create` with `folderId: "not-a-real-id"` | 400. **BUG-CMP-10** — currently coerced silently to null, so the campaign lands at root | P1 |
| CP-FLD-015 | Folder / foreign folder ID | Create a campaign into a folder the caller cannot access | Restricted User fenced to F1 | `POST` with `folderId` of F2 | 403; nothing written | P0 |
| CP-FLD-016 | Folder / delete with contents | Delete a folder containing an in-use campaign | Admin. Campaign in F1 used by playlist P1 | Delete F1 | Blocked or explicitly warned. No dangling playlist reference | P0 |
| CP-FLD-017 | Folder / admin list parity | Admin's campaign list includes foldered campaigns | Admin. Campaigns at root and inside F1 | Open the campaign list | Both appear. **BUG-CMP-16** — the admin list currently hides foldered campaigns while the sub-user's shows them | P1 |
| CP-FLD-018 | Folder / rename | Rename a folder holding campaigns | Admin. F1 holds 2 campaigns | Rename F1 | Campaigns remain accessible; playlist references unaffected | P2 |
| CP-FLD-019 | Folder / search scope | Search respects the folder fence | Restricted User fenced to F1; a matching campaign exists in F2 | Search for its exact name | Zero results. Search must not bypass the fence | P0 |
| CP-FLD-020 | Folder / search hygiene | Search query trimming and metacharacters | Any role | Search `"  camp  "`, then `.*`, then `'; DROP TABLE campaign;--` | Query trimmed (**BUG-CMP-11**); regex treated literally (**BUG-CMP-02**, fixed — regression); SQL metacharacters stored/searched literally with no error | P1 |

## Module 3 — Playlists & Clusters Integration (`CP-PLC-*`)

| Test Case ID | Module / Area | Test Scenario | User Role / Preconditions | Test Steps | Expected Result | Priority |
|---|---|---|---|---|---|---|
| CP-PLC-001 | Playlist / add | Add a campaign to a playlist | Editor. Campaign in an accessible folder | Open playlist → Add content → pick the campaign → Save → reopen | Campaign occupies one slot, shown with a campaign badge and its file count | P0 |
| CP-PLC-002 | Playlist / picker visibility | Picker shows only campaigns the user may access | Restricted User fenced to F1; campaigns exist in F1 and F2 | Open the playlist content picker | Only the F1 campaign is offered. The F2 campaign is absent, not greyed out | P0 |
| CP-PLC-003 | Playlist / position | Campaign placed at a specific loop position | Editor. 5-slot playlist | Insert the campaign at position 2 → Save → reopen | Position 2 persisted; the other four slots keep their order | P0 |
| CP-PLC-004 | Playlist / reorder | Reorder a campaign inside the loop | Editor. Campaign at position 2 | Drag to position 4 → Save → publish → observe playback | New position persisted and reflected on the screen; campaign index continues from its current value | P1 |
| CP-PLC-005 | Playlist / first and last | Campaign at position 1 and at the last position | Editor | Place at position 1 → verify; move to the last position → verify | Both boundaries behave identically to a middle position | P1 |
| CP-PLC-006 | Playlist / remove | Remove a campaign from a playlist | Editor | Remove the slot → Save → reopen | Slot gone, remaining slots recompacted with no gap. The campaign itself still exists in its folder | P0 |
| CP-PLC-007 | Playlist / multiple | Several campaigns in one playlist | Editor | Add three different campaigns at positions 1, 3, 5 → publish → observe | All three rotate independently and correctly (see CP-LOOP-007) | P0 |
| CP-PLC-008 | Playlist / campaign-only | Playlist consisting solely of campaigns | Editor | Build a 3-slot playlist of only campaigns → publish | Valid and playable; no assumption that a loop needs at least one plain media item | P1 |
| CP-PLC-009 | Playlist / edit propagation | Editing a campaign updates every playlist using it | Editor. Campaign used by playlists P1 and P2 | Add a file to the campaign → publish | Both playlists reflect the new length. No stale copy in either | P0 |
| CP-PLC-010 | Playlist / rename propagation | Renaming a campaign updates playlist references | Editor. Campaign used by P1 | Rename → open P1 | New name shown; the reference resolves by ID, not by name | P1 |
| CP-PLC-011 | Playlist / delete referenced | Delete a campaign that a playlist uses | Admin. Campaign used by 2 playlists | Delete → confirm | Blocked with an "in use by 2 playlists" message, or allowed with an explicit warning and safe degradation. Never a dangling reference | P0 |
| CP-PLC-012 | Cluster / add | Add a campaign to a cluster | Editor. Cluster with 2 screens | Open cluster → add the campaign → Save | Accepted with the same flow and validation as a playlist | P0 |
| CP-PLC-013 | Cluster / parity | Cluster behaviour matches playlist behaviour | Editor | Run CP-PLC-003, 004, 006, 009 against a cluster and compare against the playlist results | Identical in every case. The PRD states "the same functionality as playlists" — any divergence is a defect | P0 |
| CP-PLC-014 | Cluster / fan-out | Campaign edit propagates to every screen in the cluster | Editor. Cluster of 3 screens | Edit the campaign → publish → observe all 3 | All three receive the update; each keeps its own loop index | P0 |
| CP-PLC-015 | Cluster / access | Cluster picker respects the folder fence | Restricted User fenced to F1 | Open the cluster content picker | Only F1 campaigns offered | P0 |
| CP-PLC-016 | Cluster / mixed | Cluster holding campaigns and plain media | Editor | Build a mixed cluster → publish → observe | Campaign slots rotate; media slots stay fixed. No interference | P1 |
| CP-PLC-017 | Playlist / duration recalculation | Playlist total duration with a campaign present | Editor. Campaign files 5s, 15s, 10s in a loop with two 10s images | Read the displayed playlist duration | Duration is shown per iteration or as a range, not as a single wrong number. A fixed total that ignores per-iteration variance is a defect | P1 |
| CP-PLC-018 | Playlist / zero-file campaign | Zero-file campaign offered in the picker | Editor. Zero-file campaign exists via API (**BUG-CMP-01**) | Open the picker | Either absent or clearly badged as unpublishable and non-selectable. Silently selectable is a P0 defect | P0 |
| CP-PLC-019 | Playlist / concurrent edit | Two users edit the same playlist slot | Editor A and Editor B, same playlist | A moves the campaign to position 3; B removes it; both save | Last write wins with a conflict warning, or optimistic-lock rejection. Never a corrupted slot list | P1 |
| CP-PLC-020 | Playlist / undo | Cancel out of a playlist edit that touched a campaign | Editor | Add a campaign → Cancel | Nothing persisted; playlist unchanged on reopen | P2 |

## Module 4 — Role-Based Access Control (`CP-RBAC-*`)

| Test Case ID | Module / Area | Test Scenario | User Role / Preconditions | Test Steps | Expected Result | Priority |
|---|---|---|---|---|---|---|
| CP-RBAC-001 | RBAC / Admin | Admin holds all four campaign verbs | Admin | Create, view, edit, delete a campaign; add it to a playlist and publish | All succeed and persist on read-back | P0 |
| CP-RBAC-002 | RBAC / Editor create | Editor with `create` can create | Editor role: view + create + update | Create a campaign in an accessible folder | 200; campaign persisted | P0 |
| CP-RBAC-003 | RBAC / Editor delete denied | Editor without `delete` cannot delete | Editor role: view + create + update | `DELETE /campaign/:id` (UI and API) | UI hides or disables the action; API returns 403; the campaign survives | P0 |
| CP-RBAC-004 | RBAC / Viewer read | Viewer can list and open campaigns | Viewer role: view only | List campaigns; open one; open a playlist containing one | Read succeeds. Create, edit and delete controls are absent | P0 |
| CP-RBAC-005 | RBAC / Viewer create denied | Viewer cannot create | Viewer role | `POST /campaign/create` directly | 403 and **nothing written** — verify by listing afterwards, not by the response alone | P0 |
| CP-RBAC-006 | RBAC / Viewer edit denied | Viewer cannot edit | Viewer role | `PUT /campaign/update` on an existing campaign | 403; the campaign is byte-identical on read-back | P0 |
| CP-RBAC-007 | RBAC / Viewer delete denied | Viewer cannot delete | Viewer role | `DELETE /campaign/:id` | 403; the campaign survives | P0 |
| CP-RBAC-008 | RBAC / view revoked | Revoking `view` blocks both list and read-by-id | Sub-user with `campaigns.view` revoked | List campaigns, then fetch a known ID directly | 403 on both. The list filter is not the boundary | P0 |
| CP-RBAC-009 | RBAC / update unenforced | Revoking `update` actually withdraws edit rights | Sub-user with `create` granted, `update` revoked | `PUT /campaign/update` | Must be 403. **BUG-PERM-02 — currently 200: the endpoint admits the caller when `create` OR `update` is held.** Encoded as `test.fail()` | P0 |
| CP-RBAC-010 | RBAC / self-escalation | A sub-user cannot rewrite its own role | Restricted User whose role carries `roles.update` | `PUT /role/update/:ownRoleId` granting itself `campaigns.delete` and setting `isRestrictedAccess: false` → re-authenticate → attempt a delete outside the fence | Must be 403 — a role may never edit itself. **BUG-PERM-03 (Critical) — currently succeeds and the escape is effective in the re-issued JWT** | P0 |
| CP-RBAC-011 | RBAC / revocation latency | Revocation reaches a live session | Sub-user logged in with `campaigns.delete`, session open | Admin revokes `delete` → sub-user (without re-login) attempts a delete | Must be 403 immediately. **BUG-PERM-01 — `access` is a JWT claim, so the ability survives up to 24 h.** Assert on the live session, never after a re-login | P0 |
| CP-RBAC-012 | RBAC / re-grant | Re-enabling a revoked permission restores the ability | Sub-user, permission revoked then re-granted | Revoke → confirm 403 → re-grant → re-authenticate → retry | Ability restored; no data was destroyed by the revocation | P1 |
| CP-RBAC-013 | RBAC / module isolation | A campaigns-only permission change leaves other modules intact | Sub-user with media, playlists, screens permissions | Change only `campaigns.*` via `PUT /role/update/:id` → re-check every other module | All other modules unchanged, including the module count. **The endpoint replaces rather than merges the permissions object** — snapshot and restore around the write | P0 |
| CP-RBAC-014 | RBAC / no bleed-through | Campaign permissions do not grant media rights | Sub-user with all four campaign verbs, no media permissions | Attempt a media upload and a media delete | 403 on both. `upload` is a media verb, not a campaign verb | P1 |
| CP-RBAC-015 | RBAC / fence beats permission | Full campaign permissions do not lift the folder fence | Restricted User, all four verbs, fenced to F1 | Attempt create, read, update, delete against a campaign in F2 | 403 on all four. Permission answers *what*, the fence answers *where* — the two are independent | P0 |
| CP-RBAC-016 | RBAC / unfenced comparison | An unfenced sub-user with the identical permission set can use the root | Editor (unfenced), same permissions as CP-RBAC-015 | Repeat CP-RBAC-015 at the root folder | All four succeed — confirming the CP-RBAC-015 denial is attributable to the fence, not the permission | P1 |
| CP-RBAC-017 | RBAC / anonymous | Unauthenticated access | No token | Call every campaign endpoint with no token, then with a malformed token, then with an expired token | 401 in all cases, before any permission logic runs. No campaign data in the body | P0 |
| CP-RBAC-018 | RBAC / owner unaffected | Revoking a sub-user does not affect the owner | Admin + sub-user | Revoke all sub-user campaign permissions → Admin performs all four verbs | Admin unaffected throughout | P1 |
| CP-RBAC-019 | RBAC / publish authority | Publishing a campaign change requires screen/playlist rights | Editor with campaign rights but **no** publish/screen rights | Edit a campaign that is live on a screen → attempt to publish | Publish blocked; the campaign edit is either saved as a draft or rolled back. **No `campaigns.publish` verb exists — confirm with product which right actually gates this** | P0 |
| CP-RBAC-020 | RBAC / Viewer publish denied | Viewer cannot publish | Viewer role | Attempt to publish a playlist containing a campaign | 403; nothing dispatched to any screen | P0 |
| CP-RBAC-021 | RBAC / audit attribution | Actions are attributed to the acting sub-user | Sub-user with create rights | Create a campaign → inspect the audit record / `createdBy` | Records the sub-user's ID. **BUG-CMP-13 — the sub-user token currently carries the admin's `userId`**, so attribution is wrong | P1 |
| CP-RBAC-022 | RBAC / permission editability | Campaign permissions are editable in the role editor UI | Admin | Open the role editor → look for campaign toggles | The four campaign verbs are visible and toggleable. **BUG-CMP-15 — they are enforced by the API but not exposed in the editor**, so an admin cannot administer them | P1 |
| CP-RBAC-023 | RBAC / IDOR on update | Direct-ID write attack | Restricted User; a campaign ID outside the fence | `PUT /campaign/update` with that ID and a valid body | 403; the target campaign is unchanged on read-back by the Admin | P0 |
| CP-RBAC-024 | RBAC / privilege via playlist | Restricted user reaches an out-of-fence campaign through a playlist | Restricted User with access to playlist P1, which contains an F2 campaign | Open P1 → inspect the campaign slot → attempt to open, edit and copy it | The slot may render as an opaque reference, but read, edit and copy of the campaign are denied. Playlist membership must not launder folder access | P0 |
| CP-RBAC-025 | RBAC / role deletion | Deleting a role in use | Admin. A sub-user holds the role | Delete the role | Blocked or the sub-user is downgraded to no access — never silently escalated to full access | P1 |
| CP-RBAC-026 | RBAC / concurrent role edit | Permission changed while the sub-user is mid-operation | Sub-user opens the campaign editor; Admin revokes `update` | Sub-user clicks Save | Save rejected with a clear message; nothing persisted (subject to BUG-PERM-01) | P1 |

## Module 5 — Content Publish Approval Email (`CP-MAIL-*`)

Template under test, verbatim from the spec:

> `X Media files are being added/removed from these "Screen(s)" through Campaigns/Sequences/Slide, etc.`

Every case asserts the **rendered** string, not the template. Any unresolved placeholder
(`X`, a literal `Screen(s)`, or the unsubstituted `Campaigns/Sequences/Slide, etc.`) is a P0
defect — the slash-list is a spec placeholder for the actual content type and must resolve to
one value.

| Test Case ID | Module / Area | Test Scenario | User Role / Preconditions | Test Steps | Expected Result | Priority |
|---|---|---|---|---|---|---|
| CP-MAIL-001 | Email / trigger | Adding files to a live campaign triggers the email | Admin. Campaign live on Screen A; approver mailbox reachable | Add 2 files → publish → check the approver mailbox | Exactly one email arrives, addressed to the approver, within the agreed SLA | P0 |
| CP-MAIL-002 | Email / exact text | Rendered body matches the required format | As CP-MAIL-001 | Read the email body | Reads `2 Media files are being added from these "Screen A" through Campaigns` — `X` resolved to 2, screen name resolved, content type resolved to a single value. Character-for-character comparison against the approved string | P0 |
| CP-MAIL-003 | Email / count accuracy, add | `X` equals the number of files added | Admin. Live campaign | Add exactly 3 files → publish | `X = 3`. Not the campaign's total file count, not the screen count | P0 |
| CP-MAIL-004 | Email / count accuracy, remove | `X` equals the number of files removed, and the verb is `removed` | Admin. Live 5-file campaign | Remove 2 files → publish | `X = 2` and the verb reads `removed` | P0 |
| CP-MAIL-005 | Email / mixed add and remove | One edit both adds and removes | Admin. Live campaign | Add 3, remove 1, in one save → publish | Defined behaviour: either two sentences with correct counts, or one message stating both. A net count of 2 is **wrong** and is a defect | P0 |
| CP-MAIL-006 | Email / no-op | Reorder only, no add or remove | Admin. Live campaign | Reorder files → publish | No email, or an email whose wording does not claim files were added or removed. `0 Media files are being added` is a defect | P1 |
| CP-MAIL-007 | Email / metadata-only | Rename the campaign, files unchanged | Admin. Live campaign | Rename → publish | No add/remove email is sent | P1 |
| CP-MAIL-008 | Email / single screen | Screen list with exactly one screen | Admin. Campaign on Screen A only | Add 1 file → publish | Singular rendering: `1 Media file` (or the approved singular form) and one screen name. Assert the pluralisation rule explicitly | P1 |
| CP-MAIL-009 | Email / multiple screens | Campaign live on several screens | Admin. Campaign on Screens A, B, C | Add 1 file → publish | All three screen names listed, correctly delimited, none omitted or duplicated | P0 |
| CP-MAIL-010 | Email / cluster | Campaign published through a cluster | Admin. Cluster of 4 screens | Add 1 file → publish | Every screen in the cluster is enumerated, or the cluster is named with its screen count. The recipient must be able to tell which physical screens are affected | P0 |
| CP-MAIL-011 | Email / via playlist chain | Campaign reached through playlist → screen | Admin. Campaign in P1; P1 on Screens A and B | Edit the campaign → publish | Both screens listed. The email must traverse the campaign → playlist → screen chain, not stop at the playlist | P0 |
| CP-MAIL-012 | Email / campaign in two playlists | One campaign, two playlists, overlapping screens | Admin. C in P1 (Screens A,B) and P2 (Screens B,C) | Edit C → publish | Screens A, B, C listed once each. **Screen B must not be duplicated** | P1 |
| CP-MAIL-013 | Email / unpublished campaign | Editing a campaign that reaches no screen | Admin. Campaign not in any playlist | Add 2 files → save | No email. The trigger is "changes affect screens", not "campaign changed" | P0 |
| CP-MAIL-014 | Email / offline screen | Campaign live on a powered-off screen | Admin. Screen A offline | Add 1 file → publish | Screen A is still listed — assignment, not connectivity, determines the list | P1 |
| CP-MAIL-015 | Email / batch, many files | Large add in one save | Admin. Live campaign | Add 50 files in one save → publish | One email, `X = 50`. Not 50 emails | P0 |
| CP-MAIL-016 | Email / batch, many screens | Campaign on 100 screens | Admin | Add 1 file → publish | One email. Screen list either complete or truncated with an explicit `…and N more`. Silent truncation is a defect | P1 |
| CP-MAIL-017 | Email / rapid successive edits | Several saves in quick succession | Admin. Live campaign | Add 1 file, save; add 1 more, save; add 1 more — within 60s | Defined behaviour: three emails with `X=1` each, or one debounced email with `X=3`. Never an email with a wrong count | P1 |
| CP-MAIL-018 | Email / rejected approval | Approver rejects the change | Approver | Trigger the email → reject | Change does not reach the screen; the campaign reverts or stays pending. A rejection notice is sent to the initiator | P0 |
| CP-MAIL-019 | Email / approve | Approver approves | Approver | Trigger → approve | Change publishes; screens update; the loop resolves against the new length (link to CP-LOOP-015) | P0 |
| CP-MAIL-020 | Email / stale link | Approval link used twice, or after the campaign was deleted | Approver | Approve → click the same link again; separately, delete the campaign then approve | Second click is a safe no-op with a clear message. Approving a deleted campaign does not publish anything or 500 | P1 |
| CP-MAIL-021 | Email / recipients | Only entitled approvers receive the email | Admin. Approvers with and without access to the affected screens | Trigger the email | Only approvers entitled to those screens are recipients. Screen names are a data leak to anyone else | P0 |
| CP-MAIL-022 | Email / restricted initiator | Restricted user triggers an approval | Restricted User fenced to F1, campaign in F1 on Screen A | Edit → publish | Email fires normally and names only Screen A. It must not enumerate screens outside the initiator's scope | P1 |
| CP-MAIL-023 | Email / injection | Campaign or screen name contains markup | Admin. Campaign named `<script>alert(1)</script>`, screen named `A"><img src=x onerror=1>` | Trigger the email → open in an HTML mail client | Both rendered as literal escaped text. No script execution, no broken markup, no header injection via a newline in the name | P0 |
| CP-MAIL-024 | Email / unicode | Non-ASCII campaign and screen names | Admin. Devanagari + CJK + emoji names | Trigger the email | Correct UTF-8 in subject and body; no mojibake, no `?` substitution | P2 |
| CP-MAIL-025 | Email / long name | 255-character campaign name | Admin | Trigger the email | Name rendered whole or sensibly truncated; subject line does not break the mail client | P2 |
| CP-MAIL-026 | Email / concurrent editors | Two users edit the same campaign near-simultaneously | Editor A and Editor B | A adds 1 file; B adds 2; both publish within seconds | Each email reports its own delta accurately. Neither reports the other's count | P1 |
| CP-MAIL-027 | Email / delivery failure | Mail service unavailable at publish time | Admin. Mail sink blocked | Trigger a publish | The publish/approval state stays consistent — the change does not silently go live because the email failed. Failure is logged and retried | P0 |
| CP-MAIL-028 | Email / other content types | Same trigger via a Sequence or a Slide | Admin | Repeat CP-MAIL-002 for each other content type in the slash-list | The content-type token resolves to that type, and to exactly one value per email | P1 |

## Cross-cutting — Security & Data Integrity (`CP-SEC-*`)

| Test Case ID | Module / Area | Test Scenario | User Role / Preconditions | Test Steps | Expected Result | Priority |
|---|---|---|---|---|---|---|
| CP-SEC-001 | Security / XSS | Script payload in the campaign name | Admin | Create with `<script>alert(1)</script>` → view the list, the picker, the playlist slot and the approval email | Stored escaped and rendered as literal text in all four surfaces. No execution | P0 |
| CP-SEC-002 | Security / SQL & NoSQL | Metacharacter payloads in name and search | Admin | Create with `'; DROP TABLE campaign;--`; search with `{"$ne": null}` | Stored and matched literally. No 500, no unfiltered result set | P0 |
| CP-SEC-003 | Validation / empty campaign | Zero-item campaign rejected server-side | Admin, via API | `POST /campaign/create` with `data: []` | 400. **BUG-CMP-01 — currently 200.** Also assert on update | P0 |
| CP-SEC-004 | Validation / name bounds | Name length and whitespace | Admin, via API | Create with `""`, `"     "`, 1 char, 255 chars, 256 chars | Blank and whitespace-only rejected (**BUG-CMP-09**); a maximum is enforced (**BUG-CMP-08** — none currently); UI and API agree | P1 |
| CP-SEC-005 | Validation / duration bounds | Item duration boundaries | Admin, via API | Set duration to 0, -1, 0.5, and a very large value | 0 and negatives rejected (**BUG-CMP-04**); the accepted range is documented and identical in UI and API | P1 |
| CP-SEC-006 | API / delete idempotency | Deleting the same campaign twice | Admin | `DELETE /campaign/:id` twice | Second call returns 404, not 400. **BUG-CMP-12** | P2 |
| CP-SEC-007 | API / missing parameters | Endpoint robustness | Admin | Call list, create and update with required parameters omitted, null, and wrong-typed | 400 with a specific message. Never a 500 (**BUG-CMP-03**, fixed — regression) | P1 |
| CP-SEC-008 | API / rate and payload | Abuse resistance | Editor | Rapid-fire 200 create calls; submit a 10 MB campaign body | Rate-limited or throttled, not crashed. Oversized payload rejected with 413 | P2 |
| CP-SEC-009 | Data / referential integrity | Referenced entities survive a partial failure | Admin | Force a failure mid-publish (kill the request after the campaign write, before the playlist write) | No half-written state: either both persist or neither. Read-back confirms | P0 |
| CP-SEC-010 | Data / duplicate names | Name uniqueness rules | Admin | Create the same name twice in one folder; then differing only by case; then in a different folder | Same-folder duplicates rejected, case-insensitively (**BUG-CMP-07**, fixed — regression); the same name in a different folder is accepted | P1 |

---

## Part 3 — Coverage summary

| Module | Cases | P0 | P1 | P2 |
|--------|-------|----|----|----|
| 1 · Playback & loop logic | 26 | 11 | 11 | 4 |
| 2 · Folder system & access | 20 | 11 | 7 | 2 |
| 3 · Playlists & clusters | 20 | 11 | 8 | 1 |
| 4 · RBAC | 26 | 15 | 11 | 0 |
| 5 · Publish approval email | 28 | 12 | 12 | 4 |
| Cross-cutting security | 10 | 4 | 4 | 2 |
| **Total** | **130** | **64** | **53** | **13** |

## Part 4 — Cases expected to fail today

These are pre-mapped to open defects and are encoded in the regression suite as `test.fail()`
against the **correct** behaviour, so the run turns red the moment one is fixed.

| Case | Defect | Severity |
|------|--------|----------|
| CP-RBAC-010 | BUG-PERM-03 — self-escalation, fence escape | Critical / S1 |
| CP-RBAC-009 | BUG-PERM-02 — `campaigns.update` not enforced | High / S1 |
| CP-RBAC-011 · CP-FLD-010 | BUG-PERM-01 — revocation does not reach a live token | High / S2 |
| CP-SEC-003 · CP-LOOP-009 · CP-PLC-018 | BUG-CMP-01 — zero-item campaign accepted | High / S1 |
| CP-FLD-017 | BUG-CMP-16 — admin list hides foldered campaigns | High / S2 |
| CP-SEC-005 · CP-LOOP-025 | BUG-CMP-04 — duration accepts 0 and negatives | Medium / S2 |
| CP-RBAC-021 | BUG-CMP-13 — sub-user token carries the admin's `userId` | Medium / S2 |
| CP-RBAC-022 | BUG-CMP-15 — campaign permissions not editable in the role editor | Medium / S3 |
| CP-SEC-004 | BUG-CMP-08 · BUG-CMP-09 — no name maximum; whitespace-only accepted | Low–Medium |
| CP-FLD-014 | BUG-CMP-10 — invalid `folderId` coerced to null | Low / S3 |
| CP-FLD-020 | BUG-CMP-11 — search does not trim | Low / S4 |
| CP-SEC-006 | BUG-CMP-12 — delete not idempotent | Low / S4 |
| CP-FLD-013 | BUG-CMP-14 — forbidden vs not-found existence leak | Low / S4 |

## Part 5 — Open questions for product

1. **No `campaigns.publish` verb exists.** The module exposes only view/create/update/delete.
   Which right gates publishing a campaign change to a screen? CP-RBAC-019 and CP-RBAC-020
   cannot have a definitive expected result until this is answered.
2. **`Campaigns/Sequences/Slide, etc.` in the email template** — confirmed as a placeholder for
   the actual content type, resolving to one value per email? CP-MAIL-002 asserts that reading.
3. **Loop index on player restart** (CP-LOOP-018) — reset to 1, or resume? V1 must pick one.
4. **Same campaign in two slots of one loop** (CP-LOOP-008) — shared index or independent?
5. **Mid-flight reorder semantics** (CP-LOOP-017) — is the live index position-based or
   identity-based after a reorder?
6. **Campaign length limit** — is there a maximum file count per campaign? CP-LOOP-022 assumes
   100 is valid.
