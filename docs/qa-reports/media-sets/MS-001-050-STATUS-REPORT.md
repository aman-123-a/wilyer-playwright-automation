# Media Set — Status of the 50 Scenarios (MS-001 … MS-050)

| | |
|---|---|
| **Environment** | **cms2.pocsample.in** (Pre-Production 2), build v3.5.25 |
| **Executed** | 2026-10-07 · Chromium, **headless** · Playwright (API + UI) |
| **Data** | Created with prefix `ZZ_QA_MS_`, removed after the run (cms2 verified back to its previous sets) |
| **Detail** | [`MS-001-050-status.csv`](MS-001-050-status.csv) — every scenario with its actual result |

## Summary

| Status | Count | % |
|---|---|---|
| ✅ Pass | 26 | 52% |
| ❌ Fail | 4 | 8% |
| 🟡 Observed (behaviour recorded, needs a product decision / not applicable) | 7 | 14% |
| ⛔ Blocked (cannot be run on cms2 — reason given) | 13 | 26% |
| ⚪ Not Run | 0 | 0% |
| **Total** | **50** | |

**37 of 50 scenarios were executed.** Create, edit, cancel, delete, refresh, search, pagination, details, persistence, XSS, authentication and permission-denied behaviour work. Four scenarios failed and two are access-control failures that matter most.

## Failures

| ID | Scenario | What happened |
|---|---|---|
| MS-007 | Create Media Set exceeding maximum name length | no maximum enforced: input maxlength=none; API accepts 300 chars (201) and 5000 chars (201) |
| MS-019 | Sort Media Sets | UI sort controls found: 0; API default order [Gamma,Beta,Alpha]; sort=name asc [Gamma,Beta,Alpha]; desc [Gamma,Beta,Alpha] — there is no way to sort Media Sets: no UI control, and the API ignores sort/order |
| MS-048 | API attempts to access another user's Media Set | same-account scope: a folder-fenced maker cannot LIST the admin's root-level set (0 results) but READ-by-id returns 200 with the full document. Cross-tenant IDOR could not be tested (one account on cms2) |
| MS-049 | API attempts to modify another user's Media Set | folder-fenced maker modified a set it cannot list: update → 200 (admin then saw "…_target_BY_MAKER"), delete → 200. Cross-tenant modification could not be tested |

## All scenarios

| ID | Scenario | Type | Status | Actual result |
|---|---|---|---|---|
| MS-001 | Create Media Set with valid name | Positive | ✅ Pass | created through the UI with landscape+portrait images; list shows "Media set created"; API has 2 zones |
| MS-002 | Create Media Set with unique name | Positive | ✅ Pass | two differently named sets both created (201) |
| MS-003 | Create Media Set with duplicate name | Negative | ✅ Pass | API 409 "A media set with this name already exists in this folder"; UI: message "already exists in this folder", builder stayed open |
| MS-004 | Create Media Set with blank name | Negative | ✅ Pass | blank name → UI message "Media set name is required"; nothing saved |
| MS-005 | Create Media Set with spaces-only name | Negative | ✅ Pass | spaces-only name: UI message "Media set name is required"; API 400; nothing saved |
| MS-006 | Create Media Set with minimum allowed name length | Boundary | ✅ Pass | 1-character name "Q" accepted (201). No documented minimum exists; 1 is the effective minimum |
| MS-007 | Create Media Set exceeding maximum name length | Boundary | ❌ Fail | no maximum enforced: input maxlength=none; API accepts 300 chars (201) and 5000 chars (201) |
| MS-008 | Use special characters in Media Set name | Negative | 🟡 Observed | no validation rule for special characters is defined; all accepted: a&b → 201, a/b → 201, a#b → 201, @!$%^*() → 201, <b>x</b> → 201, a"b'c → 201, a\b → 201, a%20b → 201. Confirm the intended rule with the product owner |
| MS-009 | Use Unicode characters in name | Positive | ✅ Pass | unicode name (Devanagari + emoji + Arabic) saved, found by search and displayed intact on the card |
| MS-010 | Edit Media Set name | Positive | ✅ Pass | new name shown on the card, in the delete confirmation, in the Move-to-Folder modal and in the API |
| MS-011 | Cancel Media Set creation | Positive | ✅ Pass | Cancel after naming and assigning both formats creates nothing |
| MS-012 | Delete unused Media Set | Positive | ✅ Pass | unused set deleted: card gone, Total 0, API no longer returns it |
| MS-013 | Delete Media Set used by Playlist | Negative | ⛔ Blocked | Needs a Media Set that a Playlist uses. cms2 offers no way to add a media set to a playlist (publishing a set creates/extends a playlist only after screens + approval). Not safely reachable without publishing to a live screen. |
| MS-014 | Delete Media Set used by Layout | Negative | ⛔ Blocked | Needs a Media Set used by a Layout. No layout surface for media sets exists on this build. |
| MS-015 | Refresh page after creation | Regression | ✅ Pass | set created in the UI is still listed after a full page refresh |
| MS-016 | Search Media Set by exact name | Functional | ✅ Pass | exact name returns exactly that set (Total - 1) |
| MS-017 | Search using partial name | Functional | ✅ Pass | partial text "…_srch_" returns all 3 matching sets; case-insensitive partial also matches |
| MS-018 | Search with no matching name | Negative | ✅ Pass | empty-state shown: "No media sets match "zzz_no_such_set_123"" |
| MS-019 | Sort Media Sets | Functional | ❌ Fail | UI sort controls found: 0; API default order [Gamma,Beta,Alpha]; sort=name asc [Gamma,Beta,Alpha]; desc [Gamma,Beta,Alpha] — there is no way to sort Media Sets: no UI control, and the API ignores sort/order |
| MS-020 | Pagination with many Media Sets | Functional | ✅ Pass | UI page 1 = 20 cards, page 2 = 4 cards, no overlap (24 total) |
| MS-021 | Open Media Set details | Functional | ✅ Pass | File Details page lists the set's files with resolution/orientation/format/size and tabs (Playback Reports, Delivery Report, Target Screens, Publish History) |
| MS-022 | Add image to Media Set | Positive | ✅ Pass | an image is added by assigning it to a display format: edit → pick the format → click an image → Save Changes persisted (landscape file now image_8__1782275603866.png…). A set holds one file per format (2 formats in this set); extra add-media buttons found: 0 |
| MS-023 | Add video to Media Set | Positive | ✅ Pass | video saved in the Landscape format (duration 28s) |
| MS-024 | Add multiple media files | Positive | 🟡 Observed | 3 formats (Landscape, Portrait, Square) accepted via API (201, 3 zones). A set takes ONE file per display format, so "multiple files" means multiple formats; the UI's Change ratio offers Landscape/Portrait/Square. Multi-select of several files at once is not a feature of the builder |
| MS-025 | Add unsupported media type | Negative | 🟡 Observed | the builder only offers library files filtered as All/Images/Videos/Folders; documents, audio or other types cannot be picked, so "unsupported type" cannot be attempted from the set screen. File-type rejection happens at Library upload (not part of Media Sets). Server-side check of a non-image/video file id not possible with the |
| MS-026 | Add duplicate media to Media Set | Negative | 🟡 Observed | the same file in two formats is accepted (201) with no warning; the requirement for duplicates is undefined (and orientation mismatch is not enforced server-side — MS-API-D4) |
| MS-027 | Remove media from Media Set | Positive | ✅ Pass | × on the Portrait file then Save → UI message "must have at least 2 display formats"; stored formats with a file: 2/2; "Remove format" on Portrait then Save → UI message "at least 2 display formats"; stored zones: 2 |
| MS-028 | Remove all media | Functional | ✅ Pass | Clear Media empties all slots (no confirmation prompt); Save Changes then does NOT store an empty set — the stored set keeps both files and the screen stays on the edit view (an empty media set cannot be saved). The same rule shows "must have at least 2 display formats" when a file/format is removed (MS-027). Note: clearing is n |
| MS-029 | Reorder media inside Media Set | Functional | 🟡 Observed | Not applicable on this build: formats are fixed slots (Landscape / Portrait / Square), each holding one file; there is no ordering of files inside a set and no reorder control. Order only exists between media sets when several are published together. |
| MS-030 | Save Media Set after adding media | Regression | ✅ Pass | file changed in Edit, saved, page refreshed: the change persisted (365990 → 55bb7c) |
| MS-031 | Add Media Set to Playlist | Integration | ⛔ Blocked | opened a playlist editor: no "Media Set" option in the editor. Media sets reach playlists only through the publish flow (Publish → "Publish as new playlist" / "Append data in existing playlist"), which needs a live screen and approval; not executed. ClickUp 86d3vufju (Media Sets in Clusters / Prayer Schedule / Bulk Publish) is i |
| MS-032 | Add same Media Set to multiple Playlists | Integration | ⛔ Blocked | Depends on MS-031 (no direct "add media set to playlist" control found); reuse across playlists can only be exercised by publishing, which needs live screens. |
| MS-033 | Use Media Set in Layout | Integration | ⛔ Blocked | No Layout editor surface for Media Sets on this build; rendering needs a published layout on a screen. |
| MS-034 | Publish Playlist containing Media Set | E2E | ⛔ Blocked | Publishing writes to real screens and, on cms2, enters the maker/checker approval flow. Not submitted in this run (the publish modal and screen picker were exercised up to Continue — see MS-FN-P01..P05). |
| MS-035 | Sync published Media Set to Screen | E2E | ⛔ Blocked | Player/screen scenario — requires a published set and an online player. The only registered screens on cms2 are offline, and publishing was not performed. |
| MS-036 | Verify Media Set playback on player | E2E | ⛔ Blocked | Player/screen scenario — requires a published set and an online player. The only registered screens on cms2 are offline, and publishing was not performed. |
| MS-037 | Verify media order on player | E2E | ⛔ Blocked | Player/screen scenario — requires a published set and an online player. The only registered screens on cms2 are offline, and publishing was not performed. |
| MS-038 | Update Media Set after publishing | E2E | ⛔ Blocked | Player/screen scenario — requires a published set and an online player. The only registered screens on cms2 are offline, and publishing was not performed. |
| MS-039 | Delete media after Media Set is published | Regression | ⛔ Blocked | Player/screen scenario — requires a published set and an online player. The only registered screens on cms2 are offline, and publishing was not performed. |
| MS-040 | Media Set with image + video + widget | Mixed | 🟡 Observed | A media set accepts images and videos only (builder filters: All / Images / Videos / Folders). Widgets are not selectable, so an image + video + widget set cannot be built. |
| MS-041 | Large Media Set | Performance | ✅ Pass | 50-format set: create 201 in 375ms, 50 zones stored; edit view opened in 2118ms. (Also: 220 sets in one account → all operations within budget, see volume run; no cap on zones — 500 accepted.) |
| MS-042 | Upload large video into Media Set | Performance | ⛔ Blocked | Uploading a very large video (and waiting for transcoding) would load the shared Library/CMS storage for every colleague and needs a multi-hundred-MB test file; not attempted. Existing 126 MB 4K videos in the library were assigned to sets without issue (MS-EDG-13 style check not re-run). |
| MS-043 | Multiple users edit same Media Set | Concurrency | 🟡 Observed | two editors on one set: the last save wins silently ("…_043_A"); the second user is not warned that the set changed. No data corruption or duplicate |
| MS-044 | Viewer opens Media Set | RBAC | ⛔ Blocked | No view-only identity exists on cms2 (no CMS_VIEWER_* account). Existing roles: maker = full read/write on media sets, checker = no access (403). |
| MS-045 | Editor modifies Media Set | RBAC | ✅ Pass | maker (editor-type role) can create (201), edit (200) and delete (200) its own set |
| MS-046 | User without permission opens Media Set | Security | ✅ Pass | checker (no media-set permission): API list 403, create 403; /library → /library, "Media Sets" tab visible=false |
| MS-047 | API request without authentication | Security | ✅ Pass | read/create/update/delete without a token → 401/401/401/401 Unauthorized |
| MS-048 | API attempts to access another user's Media Set | Security | ❌ Fail | same-account scope: a folder-fenced maker cannot LIST the admin's root-level set (0 results) but READ-by-id returns 200 with the full document. Cross-tenant IDOR could not be tested (one account on cms2) |
| MS-049 | API attempts to modify another user's Media Set | Security | ❌ Fail | folder-fenced maker modified a set it cannot list: update → 200 (admin then saw "…_target_BY_MAKER"), delete → 200. Cross-tenant modification could not be tested |
| MS-050 | Media Set name contains XSS payload | Security | ✅ Pass | 3 XSS payloads (img onerror, svg onload, script tag) in name and description render as literal text on the cards, in the delete modal, the Move modal and the edit fields (name + description "<script>window.__xss…"); no script ran (window flag 0), no dialog, no injected DOM |

## Blocked — why and what is needed

| IDs | Reason | To unblock |
|---|---|---|
| MS-013, 014, 031, 032, 033 | A media set reaches a playlist only through *Publish → new/append playlist*; the playlist editor has no "Media Set" option and there is no layout surface for sets. | Publish to a test screen (approval flow) or a build that adds media sets to the playlist/layout editors (ClickUp 86d3vufju is in testing). |
| MS-034 … 039 | Publish, sync and playback need an online player; the only screens on cms2 are offline and nothing was published. | An online test screen/player and permission to publish. |
| MS-042 | Large-video upload and transcoding would load shared cms2 storage for all users. | A dedicated large test file and an agreed window. |
| MS-044 | No view-only identity exists on cms2 (maker = read/write, checker = no access). | A viewer role account (`CMS_VIEWER_*`). |

## Notes on interpretation

- **MS-022 / 024 / 027 / 029:** a media set is a set of *display formats* (Landscape, Portrait, Square), each holding **one** file. "Add media" means assigning a file to a format, "remove" means clearing a format's file or removing the format, and there is no reorder because there is no ordering inside a set. The product enforces a minimum of 2 formats.
- **MS-048 / 049:** there is only one tenant on cms2, so cross-account access could not be tested. Within the account, a **folder-fenced maker can read, rename and delete a root-level set it cannot list** — recorded as a failure of the "another user's set" scenarios. See `TEST-EXECUTION-REPORT.md` finding 1.
- **MS-019:** the list has no sort control and the API ignores `sort`/`order`; results are always newest-first.
- **MS-007 / 008:** no maximum name length and no special-character rule exist anywhere (UI input has no `maxlength`; API accepted 300 and 5,000 characters). Whether that is intended is a product decision.
