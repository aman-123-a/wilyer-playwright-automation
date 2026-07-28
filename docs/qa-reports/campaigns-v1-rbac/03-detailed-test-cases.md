# Campaigns V1 with RBAC — Detailed Test Cases

**Document ID:** CMP-QA-DOC-03
**Cases:** CMP-001 … CMP-220 (220 detailed cases)
**Edge cases:** see [05-edge-cases.md](05-edge-cases.md) (CMP-EDGE-001 … CMP-EDGE-112)

**Legend**
Priority: P0 (blocker/smoke) · P1 (high) · P2 (medium) · P3 (low)
Severity: S1 Critical · S2 Major · S3 Minor · S4 Cosmetic
Auto = Playwright automation candidate · Reg = regression pack member
Steps use `→` as the step separator.

**Global preconditions (assumed for every case unless overridden)**
`PRE-G1` Tester is logged into the CMS under test (branch-pinned base URL).
`PRE-G2` Test folder `QA-Campaigns` exists with ≥ 10 media assets (images, videos, widgets).
`PRE-G3` Roles from the RBAC matrix (Doc 04 §7) are seeded with matching sub-user accounts.
`PRE-G4` At least 2 screens and 1 cluster are registered and online.

---

## 3.1 Campaign CRUD — CMP-001 … CMP-034

| ID | Module | Title | Pri | Sev | Precondition | Test Data | Steps | Expected Result | Post Condition | Auto | Reg | Req |
|----|--------|-------|-----|-----|--------------|-----------|-------|-----------------|----------------|------|-----|-----|
| CMP-001 | CRUD | Create campaign with 3 media items | P0 | S1 | PRE-G2 | Name `QA_Camp_Basic`; items Img1, Img2, Img3 | Open Campaigns → Create → enter name → add 3 images → Save | Campaign created, listed in folder, item count = 3, order preserved | Campaign exists | Yes | Yes | FR-CMP-01, FR-CMP-02 |
| CMP-002 | CRUD | Create campaign with exactly 1 item (lower boundary) | P1 | S2 | PRE-G2 | Name `QA_Camp_Single`; item Img1 | Create → add 1 image → Save | Save succeeds; campaign valid and publishable (BR-04) | Campaign exists | Yes | Yes | FR-CMP-10 |
| CMP-003 | CRUD | Save campaign with 0 items | P0 | S2 | — | Name `QA_Camp_Empty`; no items | Create → enter name → Save without adding items | Blocked with a specific validation message; nothing persisted | No campaign created | Yes | Yes | BR-04 |
| CMP-004 | CRUD | Create campaign at maximum item count | P2 | S2 | AS-04 bound confirmed | 1000 items via API seed | Seed 1000 items → open in UI → Save | Save succeeds within perf budget; all 1000 persisted in order | Campaign exists | Yes | No | FR-CMP-10 |
| CMP-005 | CRUD | Exceed maximum item count | P2 | S2 | AS-04 | 1001 items | Attempt to add item 1001 | Blocked with a clear limit message; no partial save | Unchanged | Yes | No | FR-CMP-10 |
| CMP-006 | CRUD | Name at minimum length | P2 | S3 | — | Name `A` | Create with 1-char name → Save | Accepted (or rejected per confirmed min-length rule) consistently in UI and API | — | Yes | No | FR-CMP-01 |
| CMP-007 | CRUD | Name at maximum length | P2 | S3 | — | 255-char name | Create → Save | Accepted; full name persisted, list truncates visually with tooltip | — | Yes | No | FR-CMP-01 |
| CMP-008 | CRUD | Name exceeding maximum length | P2 | S3 | — | 256-char name | Create → Save | Rejected or truncated at 255 — behaviour identical in UI and API | — | Yes | Yes | FR-CMP-01 |
| CMP-009 | CRUD | Blank name | P0 | S2 | — | Name `""` | Create → leave name empty → Save | Validation error on the name field; Save blocked | — | Yes | Yes | FR-CMP-01 |
| CMP-010 | CRUD | Whitespace-only name | P1 | S2 | — | Name `"     "` | Create → spaces only → Save | Treated as blank; rejected | — | Yes | Yes | FR-CMP-01 |
| CMP-011 | CRUD | Name with leading/trailing whitespace | P2 | S3 | — | `"  Camp  "` | Create → Save → reopen | Name trimmed on save; stored value has no padding | — | Yes | No | BR-11 |
| CMP-012 | CRUD | Unicode name (Devanagari + CJK) | P2 | S3 | — | `अभियान_测试` | Create → Save → search for it | Saved, displayed and searchable without mojibake | — | Yes | No | FR-CMP-01 |
| CMP-013 | CRUD | Emoji in name | P3 | S4 | — | `Camp 🎉🔥` | Create → Save → list | Persisted and rendered correctly (4-byte UTF-8 safe) | — | Yes | No | FR-CMP-01 |
| CMP-014 | CRUD | RTL name rendering | P3 | S4 | — | `حملة إعلانية` | Create → Save → view list | Rendered RTL without breaking layout or adjacent columns | — | No | No | FR-CMP-01 |
| CMP-015 | CRUD | Duplicate name in the same folder | P1 | S2 | Campaign `QA_Camp_Basic` exists | Same name, same folder | Create with an existing name → Save | Rejected with a duplicate-name error (BR-11) | Unchanged | Yes | Yes | BR-11 |
| CMP-016 | CRUD | Duplicate name differing by case | P1 | S2 | `QA_Camp_Basic` exists | `qa_camp_basic` | Create → Save | Rejected — uniqueness is case-insensitive (AS-02) | Unchanged | Yes | Yes | BR-11 |
| CMP-017 | CRUD | Same name in a different folder | P2 | S3 | Campaign exists in Folder A | Same name, Folder B | Create in Folder B → Save | Accepted — uniqueness is folder-scoped | 2 campaigns | Yes | No | BR-11 |
| CMP-018 | CRUD | Script payload in name | P0 | S1 | — | `<script>alert(1)</script>` | Create → Save → view list, picker and email | Stored escaped; rendered as literal text everywhere; no script execution | — | Yes | Yes | SC-SEC-009 |
| CMP-019 | CRUD | SQL metacharacters in name | P1 | S1 | — | `'; DROP TABLE campaign;--` | Create → Save → search | Stored literally; no SQL error; search returns the record | — | Yes | Yes | SC-SEC-011 |
| CMP-020 | CRUD | Edit campaign name | P0 | S2 | CMP-001 done | New name `QA_Camp_Renamed` | Open campaign → rename → Save | Name updated everywhere including playlists referencing it | Renamed | Yes | Yes | FR-CMP-05 |
| CMP-021 | CRUD | Reorder items by drag and drop | P0 | S1 | Campaign with 3 items | Move item 3 → position 1 | Open → drag item 3 to top → Save → reopen | New order persisted; playback order follows the new sequence | Reordered | Yes | Yes | FR-CMP-03 |
| CMP-022 | CRUD | Remove one item | P0 | S2 | Campaign with 3 items | Remove item 2 | Open → remove item 2 → Save | 2 items remain, ordinals recompacted 1,2 with no gap | 2 items | Yes | Yes | FR-CMP-04 |
| CMP-023 | CRUD | Remove all items from a saved campaign | P1 | S2 | Campaign with 3 items | Remove all | Open → remove every item → Save | Blocked (BR-04) or saved as unpublishable draft with an explicit warning | Per rule | Yes | Yes | BR-04 |
| CMP-024 | CRUD | Add an item to a published campaign | P0 | S1 | Campaign published to a screen | Add Img4 | Open published campaign → add item → Save | Change enters approval flow; email triggered; loop length becomes 4 | Pending | Yes | Yes | FR-CMP-02, FR-APR-01 |
| CMP-025 | CRUD | Duplicate/clone a campaign | P2 | S3 | Campaign exists | — | Select → Duplicate | Copy created with a distinct name, identical items and order | 2 campaigns | Yes | No | FR-CMP-07 |
| CMP-026 | CRUD | Delete an unused campaign | P0 | S2 | Campaign not referenced | — | Select → Delete → confirm | Removed from listing; soft-deleted in DB (AS-05) | Deleted | Yes | Yes | FR-CMP-06 |
| CMP-027 | CRUD | Delete a campaign referenced by a playlist | P0 | S1 | Campaign used in Playlist P1 | — | Delete → confirm | Blocked with a "in use by N playlists" message, **or** allowed with explicit warning and playlist degrades safely — never a player crash (BR-08) | Per rule | Yes | Yes | BR-08 |
| CMP-028 | CRUD | Cancel the create dialog | P2 | S3 | — | Partially filled form | Create → fill → Cancel | Nothing persisted; list unchanged; no orphan draft row | Unchanged | Yes | No | FR-CMP-01 |
| CMP-029 | CRUD | Delete confirmation can be cancelled | P2 | S3 | Campaign exists | — | Delete → Cancel in the confirm dialog | Campaign remains intact | Unchanged | Yes | Yes | FR-CMP-06 |
| CMP-030 | CRUD | Add mixed item types (image + video + widget) | P0 | S1 | PRE-G2 | Img1, Vid1, Wid1 | Create → add one of each type → Save | All three accepted in one campaign; each renders its correct type badge (AS-03) | Campaign exists | Yes | Yes | FR-CMP-02 |
| CMP-031 | CRUD | Video-only campaign | P1 | S2 | — | Vid1, Vid2 | Create → add 2 videos → Save | Accepted; durations derived from video length | — | Yes | No | FR-CMP-02 |
| CMP-032 | CRUD | Widget-only campaign | P1 | S2 | — | Wid1, Wid2 | Create → add 2 widgets → Save | Accepted; widget duration rules apply | — | Yes | No | FR-CMP-02 |
| CMP-033 | CRUD | Same media item added twice to one campaign | P2 | S3 | — | Img1, Img1 | Create → add Img1 twice → Save | Allowed (item plays on two different loops) or blocked — behaviour must be defined and consistent | — | Yes | No | FR-CMP-02 |
| CMP-034 | CRUD | Per-item duration edit inside a campaign | P1 | S2 | Campaign with 3 items | Item 2 duration = 15 s | Open → set item 2 duration → Save → reopen | Duration persisted per item; floor of 1 s enforced (BR-13) | — | Yes | Yes | FR-CMP-05, BR-13 |

## 3.2 Folder System — CMP-035 … CMP-062

| ID | Module | Title | Pri | Sev | Precondition | Test Data | Steps | Expected Result | Post Condition | Auto | Reg | Req |
|----|--------|-------|-----|-----|--------------|-----------|-------|-----------------|----------------|------|-----|-----|
| CMP-035 | Folder | Campaign created in the currently open folder | P0 | S1 | Folder `F_A` open | — | Open F_A → Create campaign → Save | Campaign lands in F_A, not at root | In F_A | Yes | Yes | FR-FLD-01 |
| CMP-036 | Folder | Campaign listed alongside media in the folder | P0 | S2 | Campaign in F_A | — | Open F_A | Campaign appears with a distinguishing type indicator | — | Yes | Yes | FR-FLD-01 |
| CMP-037 | Folder | **Parity** — folder listing behaviour matches Media | P0 | S1 | Media + campaign in F_A | — | Perform the same list/sort/filter actions on a media file and on a campaign; compare | Identical behaviour; any divergence is a defect (PB-RULE-04) | — | Yes | Yes | PB-RULE-04 |
| CMP-038 | Folder | Move a campaign to another folder | P1 | S2 | Campaign in F_A; F_B writable | Target F_B | Select campaign → Move → F_B | Campaign now in F_B; references from playlists remain intact | In F_B | Yes | Yes | FR-FLD-04 |
| CMP-039 | Folder | Move into a folder without write permission | P0 | S1 | F_C restricted for the user | Target F_C | Attempt Move to F_C | Blocked in UI; API returns 403; campaign unmoved | Unchanged | Yes | Yes | FR-FLD-04, BR-06 |
| CMP-040 | Folder | Copy a campaign to another folder | P2 | S3 | Campaign in F_A | Target F_B | Select → Copy → F_B | Independent copy created in F_B; editing the copy does not affect the original | 2 campaigns | Yes | No | FR-FLD-05 |
| CMP-041 | Folder | Copy preserves item order | P2 | S3 | Campaign with 4 ordered items | — | Copy → open the copy | Order identical to the source | — | Yes | No | FR-FLD-05 |
| CMP-042 | Folder | Rename a folder containing campaigns | P2 | S3 | F_A holds 2 campaigns | New name `F_A_renamed` | Rename F_A | Campaigns remain accessible; playlist references unaffected | — | Yes | No | FR-FLD-06 |
| CMP-043 | Folder | Delete a folder containing unused campaigns | P1 | S2 | F_A holds 2 unused campaigns | — | Delete F_A → confirm | Behaviour identical to deleting a folder of media (PB-RULE-04) | Per rule | Yes | Yes | FR-FLD-06 |
| CMP-044 | Folder | Delete a folder containing an in-use campaign | P0 | S1 | Campaign in F_A used by a playlist | — | Delete F_A | Blocked or explicitly warned; no dangling playlist reference | Per rule | Yes | Yes | BR-08 |
| CMP-045 | Folder | Campaign at nesting depth 2 | P1 | S2 | `F1/F2` exists | — | Create a campaign in F1/F2 → verify listing and picker | Fully functional at depth 2 | — | Yes | Yes | FR-FLD-03 |
| CMP-046 | Folder | Campaign at nesting depth 5 | P2 | S3 | `F1/F2/F3/F4/F5` | — | Create at depth 5 → open from the picker | Functional; breadcrumb shows the full path | — | Yes | No | AS-12 |
| CMP-047 | Folder | Restricted parent hides child campaigns | P0 | S1 | Sub-user denied on F1; campaign in F1/F2 | Sub-user session | Log in as sub-user → browse | Neither F1, F2 nor the campaign is visible | — | Yes | Yes | FR-FLD-02, BR-07 |
| CMP-048 | Folder | Restricted child inside an accessible parent | P0 | S1 | F1 allowed, F1/F2 denied | Sub-user | Browse F1 | F1 contents visible; F2 and its campaigns hidden | — | Yes | Yes | FR-FLD-03 |
| CMP-049 | Folder | Permission inheritance parent → child | P0 | S1 | Grant on F1 only | Sub-user | Grant F1 → check F1/F2 access | Child inherits the parent grant unless explicitly overridden | — | Yes | Yes | FR-FLD-03 |
| CMP-050 | Folder | Explicit child override beats inheritance | P0 | S1 | F1 granted, F1/F2 explicitly denied | Sub-user | Access F1/F2 | Denied — the explicit override wins | — | Yes | Yes | FR-FLD-03 |
| CMP-051 | Folder | Revoking parent access removes child visibility | P0 | S1 | Sub-user had access | — | Admin revokes F1 → sub-user refreshes | Child campaigns disappear from list, picker, search and API | — | Yes | Yes | FR-RBAC-05 |
| CMP-052 | Folder | Granting folder access reveals campaigns without re-login | P0 | S1 | Sub-user logged in, no access | — | Admin grants F1 → sub-user refreshes (no re-login) | Campaigns become visible | — | Yes | Yes | FR-RBAC-05 |
| CMP-053 | Folder | Restricted campaign absent from the playlist picker | P0 | S1 | Campaign in a denied folder | Sub-user | Open playlist editor → Campaigns tab | The restricted campaign is not listed | — | Yes | Yes | FR-PL-08, BR-07 |
| CMP-054 | Folder | Restricted campaign absent from search results | P0 | S1 | Same | Search its exact name | Search as sub-user | No result returned; no "exists but hidden" hint | — | Yes | Yes | BR-07 |
| CMP-055 | Folder | Restricted campaign 403 on direct API fetch | P0 | S1 | Campaign id known | `GET /campaign/{id}` as sub-user | Call the API directly with the sub-user token | 403 (or 404 to avoid existence disclosure) — never 200 | — | Yes | Yes | FR-RBAC-03, RSK-02 |
| CMP-056 | Folder | Moving a campaign into a restricted folder revokes others' access | P1 | S2 | Sub-user can see the campaign in F_A | Move to restricted F_C | Admin moves → sub-user refreshes | Campaign no longer visible to the sub-user | — | Yes | Yes | BR-05 |
| CMP-057 | Folder | Root-level campaign (no folder) | P2 | S3 | — | — | Create at root → verify listing and picker | Handled consistently with root-level media | — | Yes | No | FR-FLD-01 |
| CMP-058 | Folder | Breadcrumb navigation from a campaign | P3 | S4 | Campaign at depth 3 | — | Open campaign → click breadcrumb segments | Navigates to the correct ancestor folders | — | Yes | No | SC-FLD-025 |
| CMP-059 | Folder | Empty-folder state | P3 | S4 | Empty folder F_E | — | Open F_E | Correct empty-state message, no error, no infinite spinner | — | Yes | No | SC-FLD-026 |
| CMP-060 | Folder | Folder Permission RBAC control on campaigns | P0 | S1 | Role has Folder Permission revoked | Sub-user | Attempt to change campaign folder access | Control hidden/disabled; API 403 | — | Yes | Yes | FR-RBAC-01 |
| CMP-061 | Folder | Campaign counts in folder metadata are accurate | P2 | S3 | F_A holds 3 campaigns | — | View folder summary | Count reflects only campaigns the user may see | — | Yes | No | FR-FLD-07 |
| CMP-062 | Folder | Campaign inherits new permissions when the folder tree is restructured | P1 | S2 | Move F2 under a restricted F3 | — | Move folder → check access | Campaign access recomputed from the new ancestry | — | Yes | Yes | FR-FLD-03 |

## 3.3 Playlist Integration — CMP-063 … CMP-088

| ID | Module | Title | Pri | Sev | Precondition | Test Data | Steps | Expected Result | Post Condition | Auto | Reg | Req |
|----|--------|-------|-----|-----|--------------|-----------|-------|-----------------|----------------|------|-----|-----|
| CMP-063 | Playlist | Campaigns tab present in the media picker | P0 | S1 | Playlist editor open | — | Open a playlist → open the picker | Tabs read Media / Widgets / Sequences / **Campaigns** | — | Yes | Yes | FR-PL-01 |
| CMP-064 | Playlist | Insert a campaign into an empty playlist (spec Case 3) | P0 | S1 | Empty playlist | Campaign `X,Y,Z` | Picker → Campaigns → select → add | Campaign occupies one slot; playlist shows 1 item, not 3 (BR-01) | Saved | Yes | Yes | PB-RULE-01 |
| CMP-065 | Playlist | Insert at position 2 of 4 (spec Case 4) | P0 | S1 | Playlist `file1, file2, file3` | Campaign `c1,c2,c3` | Insert campaign at index 2 | Order = file1, Campaign, file2, file3 | Saved | Yes | Yes | PB-RULE-01 |
| CMP-066 | Playlist | Insert at the first position | P1 | S2 | Playlist with 3 items | — | Insert campaign at index 1 | Campaign is first; other items shift down | Saved | Yes | Yes | FR-PL-02 |
| CMP-067 | Playlist | Insert at the last position | P1 | S2 | Playlist with 3 items | — | Append campaign | Campaign is last | Saved | Yes | Yes | FR-PL-02 |
| CMP-068 | Playlist | Remove a campaign from a playlist | P0 | S1 | Playlist contains a campaign | — | Select slot → remove → Save | Slot removed; remaining order intact; campaign entity itself untouched | Saved | Yes | Yes | FR-PL-03 |
| CMP-069 | Playlist | Reorder the campaign slot within the playlist | P1 | S2 | Campaign at index 2 | Move to index 4 | Drag slot → Save → reopen | New position persisted | Saved | Yes | Yes | FR-PL-02 |
| CMP-070 | Playlist | Same campaign inserted twice in one playlist | P1 | S2 | — | Campaign A ×2 | Insert A at index 1 and index 3 → Save | Both slots accepted; **counter behaviour must be defined** — do both slots show the same item in a loop, or advance independently? | Saved | Yes | Yes | FR-PL-05, AS-01b |
| CMP-071 | Playlist | Two different campaigns in one playlist | P0 | S1 | — | CampA(2), CampB(3) | Insert both → Save → publish | Both slots present; playback follows PB-RULE-02 independence | Saved | Yes | Yes | FR-PL-04 |
| CMP-072 | Playlist | Three campaigns in one playlist | P2 | S2 | — | Lengths 2, 3, 4 | Insert all three → Save | Accepted; full cycle = LCM 12 | Saved | Yes | No | PB-RULE-02 |
| CMP-073 | Playlist | Same campaign across two playlists | P0 | S1 | Campaign A | Playlists P1, P2 | Add A to P1 and P2 → publish both | Both function; editing A propagates to both | Saved | Yes | Yes | FR-PL-06 |
| CMP-074 | Playlist | Playlist duration calculation with a campaign | P1 | S2 | Playlist with a 3-item campaign | Items 10 s each | Read the displayed total duration | Total is computed on a defined basis (per-loop, not the sum of all variants) and is documented; value matches the rule | — | Yes | Yes | FR-PL-07 |
| CMP-075 | Playlist | Per-item duration override from the playlist slot | P2 | S3 | Campaign in a playlist | Set slot duration 20 s | Change duration on the slot → Save | Behaviour defined: slot-level override vs campaign-level durations; no silent loss | — | Yes | No | FR-CMP-05 |
| CMP-076 | Playlist | Campaign in a multi-zone layout | P1 | S2 | Layout with 2 zones | Campaign in zone B | Add campaign to zone B → Save → preview | Campaign confined to zone B; zone A unaffected | Saved | Yes | Yes | FR-PL-02 |
| CMP-077 | Playlist | Campaigns in multiple layouts of one playlist | P0 | S1 | 3 layouts | CampA(3), CampB(2), CampC(4) | Build the spec's multi-layout playlist | Saves correctly; playback matches PB-RULE-03 timeline | Saved | Yes | Yes | PB-RULE-03 |
| CMP-078 | Playlist | Save and reopen — campaign persists | P0 | S1 | Playlist with a campaign | — | Save → exit → reopen | Campaign slot present with the same position and settings | — | Yes | Yes | FR-PL-02 |
| CMP-079 | Playlist | Playlist preview renders the campaign slot | P1 | S2 | Playlist with a campaign | — | Click Preview | Preview shows the campaign; ideally cycles variants, at minimum shows item 1 without error | — | Yes | Yes | SC-PL-017 |
| CMP-080 | Playlist | Search within the Campaigns picker tab | P1 | S2 | ≥ 20 campaigns | Query `QA_Camp` | Type in the picker search | Filters to matching campaigns only; respects folder restrictions | — | Yes | Yes | SC-PL-018 |
| CMP-081 | Playlist | Picker pagination / lazy load | P2 | S3 | ≥ 100 campaigns | Scroll | Scroll the Campaigns tab | Additional campaigns load without duplicates or gaps | — | Yes | No | SC-PL-019 |
| CMP-082 | Playlist | Picker folder filter inside the Campaigns tab | P1 | S2 | Campaigns across folders | — | Use the Folders filter in the picker | Filters campaigns by folder, mirroring Media tab behaviour | — | Yes | Yes | PB-RULE-04 |
| CMP-083 | Playlist | Campaign slot label and thumbnail | P2 | S3 | Campaign in a playlist | — | Inspect the slot | Shows the campaign name and a campaign-type indicator, not a single media thumbnail masquerading as a file | — | Yes | No | SC-PL-021 |
| CMP-084 | Playlist | Editing a campaign updates all playlists using it | P0 | S1 | Campaign A in P1 and P2 | Add item to A | Edit A → Save → open P1 and P2 | Both reflect the new item count; both enter approval flow if published | — | Yes | Yes | FR-PL-06 |
| CMP-085 | Playlist | Deleting a campaign used in a playlist | P0 | S1 | A used in P1 | — | Delete A → open P1 | Per BR-08: blocked, or the slot degrades to an explicit "unavailable" state — the editor must not crash or white-screen | — | Yes | Yes | BR-08 |
| CMP-086 | Playlist | Publish a playlist containing a campaign | P0 | S1 | Playlist ready, screens online | — | Publish → confirm | Publish succeeds; approval email triggered; screens receive the campaign | Published | Yes | Yes | FR-PL-02, FR-EML-01 |
| CMP-087 | Playlist | Campaign slot survives a playlist duplicate | P2 | S3 | Playlist with a campaign | — | Duplicate the playlist | Copy retains the campaign reference (not a deep copy of items) | — | Yes | No | FR-PL-06 |
| CMP-088 | Playlist | Unsaved-changes warning after adding a campaign | P2 | S3 | Campaign added, not saved | — | Navigate away | Warning shown; no silent data loss | — | Yes | No | SC-UX-004 |

## 3.4 Cluster Integration — CMP-089 … CMP-104

| ID | Module | Title | Pri | Sev | Precondition | Test Data | Steps | Expected Result | Post Condition | Auto | Reg | Req |
|----|--------|-------|-----|-----|--------------|-----------|-------|-----------------|----------------|------|-----|-----|
| CMP-089 | Cluster | Assign a campaign to a cluster | P0 | S1 | Cluster C1 with 3 screens | Campaign A | Open C1 → add campaign A → Save | Campaign assigned; all 3 screens targeted | Assigned | Yes | Yes | FR-CL-01 |
| CMP-090 | Cluster | Remove a campaign from a cluster | P0 | S1 | A assigned to C1 | — | Remove → Save | Removed; screens stop playing it after sync | — | Yes | Yes | FR-CL-01 |
| CMP-091 | Cluster | **Parity** — cluster behaviour matches playlist behaviour | P0 | S1 | — | — | Run CMP-064…069 equivalents against a cluster | Identical results to the playlist path | — | Yes | Yes | FR-CL-01 |
| CMP-092 | Cluster | Sync a campaign to all screens | P0 | S1 | C1 screens online | — | Assign → Publish → observe sync status | All screens report success within the sync SLA | Synced | Yes | Yes | FR-CL-02 |
| CMP-093 | Cluster | Sync to a cluster containing offline screens | P0 | S1 | 1 of 3 screens offline | — | Publish | Online screens sync; offline one is flagged pending — not reported as success | Partial | Yes | Yes | FR-CL-04 |
| CMP-094 | Cluster | Offline screen syncs on reconnect | P0 | S1 | Screen offline with a pending campaign | — | Bring the screen online | Campaign delivered automatically; playback starts correctly | Synced | Partial | Yes | FR-CL-04 |
| CMP-095 | Cluster | Sync failure surfaced to the user | P0 | S2 | Force a sync error | — | Publish with the sync service failing | Explicit error state per screen with a reason — not a silent success | — | Yes | Yes | FR-CL-03 |
| CMP-096 | Cluster | Retry a failed sync | P1 | S2 | A screen failed sync | — | Click Retry | Retry issued; success on recovery; no duplicate content | Synced | Yes | Yes | FR-CL-03 |
| CMP-097 | Cluster | Rollback after partial sync | P1 | S1 | 2 of 3 screens synced then failure | — | Trigger rollback | All screens end in one consistent state — never a mixed-version cluster | Consistent | Partial | Yes | FR-CL-03 |
| CMP-098 | Cluster | Sync a campaign edit to an already-synced cluster | P0 | S1 | A synced to C1 | Add item to A | Edit A → publish | Updated campaign propagates; screens pick up the new length | Synced | Yes | Yes | FR-CL-02 |
| CMP-099 | Cluster | Concurrent sync of two campaigns | P2 | S2 | A and B assigned | — | Publish both simultaneously | Both complete; no interleaving corruption or lost update | Synced | Partial | No | SC-CL-011 |
| CMP-100 | Cluster | Cluster with 50+ screens | P2 | S2 | Large cluster | — | Assign campaign → publish | Completes within the perf budget; status accurate for every screen | Synced | Partial | No | SC-PERF-008 |
| CMP-101 | Cluster | Cluster respects campaign folder restrictions | P0 | S1 | Campaign in a restricted folder | Sub-user | Sub-user opens the cluster picker | Restricted campaign not offered | — | Yes | Yes | BR-07 |
| CMP-102 | Cluster | Assign a campaign to multiple clusters | P1 | S2 | C1, C2 | Campaign A | Assign A to both | Works in both; edits propagate to both | — | Yes | Yes | FR-CL-01 |
| CMP-103 | Cluster | Cluster sync status accuracy | P1 | S2 | Mixed online/offline | — | Read the status panel | Per-screen status matches the actual device state | — | Yes | Yes | SC-CL-016 |
| CMP-104 | Cluster | Removing a campaign stops playback on screens | P0 | S1 | A playing on C1 screens | — | Remove A → publish → observe screens | Screens stop showing campaign items; no black frame or freeze | — | Partial | Yes | SC-CL-013 |

## 3.5 RBAC — CMP-105 … CMP-140

All RBAC cases follow the harness already proven in `cms-e2e/tests/permissions/rbac-data-driven.spec.ts`:
admin toggles the permission and waits for `PUT /role/update` 2xx → full session eviction →
fresh sub-user login → assert **nav**, **direct route**, **action control**, and **data API** together.
A UI-only assertion is insufficient (RSK-02).

| ID | Module | Title | Pri | Sev | Precondition | Test Data | Steps | Expected Result | Post Condition | Auto | Reg | Req |
|----|--------|-------|-----|-----|--------------|-----------|-------|-----------------|----------------|------|-----|-----|
| CMP-105 | RBAC | Campaigns permission section exists in the role editor | P0 | S1 | Admin session | Role `QA_Role` | Team → Roles → Edit role | A Campaigns section is present with NONE / READ-ONLY / ALL controls | — | Yes | Yes | FR-RBAC-01 |
| CMP-106 | RBAC | Section exposes all 8 permissions | P0 | S1 | Role editor open | — | Expand the Campaigns section | View, Create, Edit, Delete, Publish, Approve, Reject, Folder Permission all present | — | Yes | Yes | FR-RBAC-01 |
| CMP-107 | RBAC | View granted → list visible | P0 | S1 | View = ON | Sub-user | Grant View → sub-user login → open Campaigns | List renders; data API returns 200 | — | Yes | Yes | FR-RBAC-02 |
| CMP-108 | RBAC | View revoked → nav/tab hidden | P0 | S1 | View = OFF | Sub-user | Revoke → fresh login | Campaigns nav entry and picker tab absent | — | Yes | Yes | FR-RBAC-07 |
| CMP-109 | RBAC | View revoked → direct URL blocked | P0 | S1 | View = OFF | `/campaigns` | `page.goto('/campaigns')` as sub-user | 403 page, redirect, or empty shell **with** a 403 data API | — | Yes | Yes | FR-RBAC-03 |
| CMP-110 | RBAC | View revoked → list API 403 | P0 | S1 | View = OFF | `GET /campaign/read` | Direct API call with the sub-user token | 403; no campaign data in the body | — | Yes | Yes | RSK-02 |
| CMP-111 | RBAC | Create granted → create control available | P0 | S1 | Create = ON | Sub-user | Open Campaigns | Create button visible and functional | — | Yes | Yes | FR-RBAC-02 |
| CMP-112 | RBAC | Create revoked → control hidden or disabled | P0 | S1 | Create = OFF | Sub-user | Open Campaigns | Create control absent or disabled — never visible-and-actionable | — | Yes | Yes | FR-RBAC-07 |
| CMP-113 | RBAC | Create revoked → POST API 403 | P0 | S1 | Create = OFF | `POST /campaign/create` | Direct API call | 403; no row inserted | — | Yes | Yes | FR-RBAC-03 |
| CMP-114 | RBAC | Edit granted → campaign editable | P0 | S1 | Edit = ON | Sub-user | Open a campaign → change name → Save | Save succeeds | — | Yes | Yes | FR-RBAC-02 |
| CMP-115 | RBAC | Edit revoked → edit controls blocked | P0 | S1 | Edit = OFF | Sub-user | Open a campaign | Read-only rendering; Save hidden/disabled | — | Yes | Yes | FR-RBAC-07 |
| CMP-116 | RBAC | Edit revoked → PUT/PATCH API 403 | P0 | S1 | Edit = OFF | `PUT /campaign/update/{id}` | Direct API call | 403; record unchanged in the DB | — | Yes | Yes | FR-RBAC-03 |
| CMP-117 | RBAC | Delete granted → delete succeeds | P0 | S1 | Delete = ON | Sub-user | Delete an unused campaign | Deleted; audit entry written | — | Yes | Yes | FR-RBAC-02 |
| CMP-118 | RBAC | Delete revoked → control blocked | P0 | S1 | Delete = OFF | Sub-user | Open a campaign | Delete hidden or disabled | — | Yes | Yes | FR-RBAC-07 |
| CMP-119 | RBAC | Delete revoked → DELETE API 403 | P0 | S1 | Delete = OFF | `DELETE /campaign/{id}` | Direct API call | 403; row still present | — | Yes | Yes | FR-RBAC-03 |
| CMP-120 | RBAC | Publish granted → publish succeeds | P0 | S1 | Publish = ON | Sub-user | Publish a playlist containing a campaign | Publish completes | — | Yes | Yes | FR-RBAC-02 |
| CMP-121 | RBAC | Publish revoked → blocked in UI and API | P0 | S1 | Publish = OFF | Sub-user | Attempt publish via UI, then via API | Both blocked; 403 from the publish endpoint | — | Yes | Yes | RSK-06 |
| CMP-122 | RBAC | Approve granted → approve succeeds | P0 | S1 | Approve = ON, item pending | Approver | Open the approval queue → Approve | Item approved; content publishes; audit entry written | — | Yes | Yes | FR-APR-02 |
| CMP-123 | RBAC | Approve revoked → blocked | P0 | S1 | Approve = OFF | Sub-user | Attempt approve via UI and API | Control hidden; API 403; item stays pending | — | Yes | Yes | FR-RBAC-02 |
| CMP-124 | RBAC | Reject granted → reject succeeds | P0 | S1 | Reject = ON, item pending | Approver | Reject with a reason | Item rejected; not published; reason stored | — | Yes | Yes | FR-APR-03 |
| CMP-125 | RBAC | Reject revoked → blocked | P0 | S1 | Reject = OFF | Sub-user | Attempt reject | Control hidden; API 403 | — | Yes | Yes | FR-RBAC-02 |
| CMP-126 | RBAC | Folder Permission granted → user manages campaign folder access | P1 | S2 | Folder Permission = ON | Sub-user | Change folder access for a campaign folder | Change accepted and effective | — | Yes | Yes | FR-RBAC-01 |
| CMP-127 | RBAC | Folder Permission revoked → blocked | P0 | S1 | Folder Permission = OFF | Sub-user | Attempt the same | Blocked in UI and API | — | Yes | Yes | FR-RBAC-01 |
| CMP-128 | RBAC | View without Edit → read-only | P0 | S1 | View ON, Edit OFF | Sub-user | Open a campaign | Content visible, all mutating controls inert | — | Yes | Yes | FR-RBAC-07 |
| CMP-129 | RBAC | Edit without View → contradictory grant | P1 | S2 | View OFF, Edit ON | Sub-user | Attempt to reach a campaign | Handled sanely (deny, since View gates discovery); no crash, no partial data leak | — | Yes | Yes | FR-RBAC-04 |
| CMP-130 | RBAC | Create without Publish | P1 | S2 | Create ON, Publish OFF | Sub-user | Create a campaign → attempt publish | Creation succeeds; publish blocked | — | Yes | Yes | FR-RBAC-02 |
| CMP-131 | RBAC | Publish without Approve | P1 | S2 | Publish ON, Approve OFF | Sub-user | Submit for publish | Requires a separate approver; user cannot self-approve | — | Yes | Yes | AS-07 |
| CMP-132 | RBAC | Effective permission = role ∩ folder (both allow) | P0 | S1 | Role Edit ON, folder writable | Sub-user | Edit a campaign in that folder | Allowed | — | Yes | Yes | BR-06 |
| CMP-133 | RBAC | Role allows, folder denies → denied | P0 | S1 | Role Edit ON, folder denied | Sub-user | Attempt edit | Denied in UI and API | — | Yes | Yes | BR-06 |
| CMP-134 | RBAC | Folder allows, role denies → denied | P0 | S1 | Role Edit OFF, folder writable | Sub-user | Attempt edit | Denied in UI and API | — | Yes | Yes | BR-06 |
| CMP-135 | RBAC | Permission change effective without re-login | P0 | S1 | Sub-user logged in | Revoke View | Admin revokes → sub-user refreshes | Access removed immediately, or the session is invalidated | — | Yes | Yes | FR-RBAC-05 |
| CMP-136 | RBAC | Stale token cannot retain revoked access | P0 | S1 | Sub-user token captured before revocation | Old bearer token | Call the API with the pre-revocation token | 401/403 — the old token must not work | — | Yes | Yes | RSK-02 |
| CMP-137 | RBAC | Privilege escalation via role payload | P0 | S1 | Sub-user token | Crafted `PUT /role/update` granting itself Campaigns ALL | Send the request | 403; role unchanged; attempt audit-logged | — | Yes | Yes | SC-SEC-006 |
| CMP-138 | RBAC | Cross-tenant campaign access blocked | P0 | S1 | Two tenants seeded | Tenant B campaign id | Tenant A user calls `GET /campaign/{B_id}` | 403/404; no data disclosure (TagTalk scoping) | — | Yes | Yes | SC-SEC-020 |
| CMP-139 | RBAC | READ-ONLY bulk button sets the expected subset | P1 | S2 | Role editor | — | Click READ-ONLY on the Campaigns section → Save → inspect | View ON; Create/Edit/Delete/Publish/Approve/Reject OFF | — | Yes | Yes | FR-RBAC-02 |
| CMP-140 | RBAC | NONE / ALL bulk buttons behave correctly | P1 | S2 | Role editor | — | Click NONE, save, verify; click ALL, save, verify | NONE clears every campaign permission; ALL sets every one | — | Yes | Yes | FR-RBAC-02 |

## 3.6 Playback Validation — CMP-141 … CMP-166

Executed against a real player where possible; otherwise against the player-simulation/preview
harness with the resolved schedule payload asserted at the API level.

| ID | Module | Title | Pri | Sev | Precondition | Test Data | Steps | Expected Result | Post Condition | Auto | Reg | Req |
|----|--------|-------|-----|-----|--------------|-----------|-------|-----------------|----------------|------|-----|-----|
| CMP-141 | Playback | Spec Case 1 — loops 1–3 | P0 | S1 | Screen online | `file1 + widget1 + Camp(A,B,C)` | Publish → observe 3 loops | L1 `file1,widget1,A` · L2 `file1,widget1,B` · L3 `file1,widget1,C` | — | Partial | Yes | PB-RULE-01 |
| CMP-142 | Playback | Case 1 — loop 4 wraps to A | P0 | S1 | CMP-141 running | — | Observe loop 4 | `file1, widget1, A` — wrap with no skip and no double-play of C | — | Partial | Yes | PB-RULE-01, RSK-01 |
| CMP-143 | Playback | Spec Case 3 — campaign-only playlist | P0 | S1 | Screen online | `Camp(X,Y,Z)` only | Publish → observe 3 loops | L1 X · L2 Y · L3 Z · L4 X | — | Partial | Yes | PB-RULE-01 |
| CMP-144 | Playback | Spec Case 4 — campaign in the middle of 4 | P0 | S1 | Screen online | `file1 + Camp(c1,c2,c3) + file2 + file3` | Publish → observe 3 loops | Exactly the three rows in the spec; static items identical each loop | — | Partial | Yes | PB-RULE-01 |
| CMP-145 | Playback | Static items replay unchanged every loop | P0 | S1 | Any campaign playlist | — | Observe 5 loops | Non-campaign items appear in every loop, unchanged and in position | — | Partial | Yes | PB-RULE-01 |
| CMP-146 | Playback | Single-item campaign | P1 | S2 | `Camp(A)` | — | Observe 3 loops | A plays every loop; no blank slot, no skip | — | Partial | Yes | BVA |
| CMP-147 | Playback | Two-item campaign alternates | P1 | S2 | `Camp(A,B)` | — | Observe 4 loops | A, B, A, B | — | Partial | Yes | BVA |
| CMP-148 | Playback | Wrap boundary integrity over 3 full cycles | P0 | S1 | `Camp(A,B,C)` | — | Observe 9 loops | A,B,C,A,B,C,A,B,C — no drift, no repeat, no skip | — | Partial | Yes | RSK-01 |
| CMP-149 | Playback | Multi-campaign independence, loops 1–6 | P0 | S1 | CampA(A1,A2), CampB(B1,B2,B3) | — | Publish → observe 6 loops | L1 A1,B1 · L2 A2,B2 · L3 A1,B3 · L4 A2,B1 · L5 A1,B2 · L6 A2,B3 | — | Partial | Yes | PB-RULE-02 |
| CMP-150 | Playback | Full cycle equals LCM(2,3)=6 | P0 | S1 | CMP-149 | — | Observe loop 7 | Loop 7 == loop 1 (A1,B1) — the pattern repeats every 6 loops | — | Partial | Yes | PB-RULE-02 |
| CMP-151 | Playback | Three campaigns, lengths 2/3/4 → cycle 12 | P2 | S2 | 3 campaigns | — | Observe 13 loops | Loop 13 == loop 1; every combination appears exactly once in 12 | — | Partial | No | PB-RULE-02 |
| CMP-152 | Playback | Equal-length campaigns advance in lockstep | P2 | S3 | Two 3-item campaigns | — | Observe 4 loops | Both advance together; cycle = 3 | — | Partial | No | PB-RULE-02 |
| CMP-153 | Playback | Multi-layout timeline, indices 01–12 | P0 | S1 | 3 layouts, CampA(3)/CampB(2)/CampC(4) | Spec §3 timeline | Publish → record the played sequence | Matches the specified 12-index table exactly | — | Partial | Yes | PB-RULE-03 |
| CMP-154 | Playback | Layout repeats for LCM(its campaign lengths) | P0 | S1 | Same | — | Count loops per layout | Layout 0 = 3, Layout 1 = 2, Layout 2 = 4 (confirms/refutes AS-01b) | — | Partial | Yes | PB-RULE-03a |
| CMP-155 | Playback | Cycle wraps from the last layout to Layout 0 | P0 | S1 | Same | — | Observe index 13 | Returns to Layout 0 / file1 — index 13 == index 01 | — | Partial | Yes | PB-RULE-03 |
| CMP-156 | Playback | Layout with no campaign plays once per cycle | P1 | S2 | Layout 3 static only | — | Observe a full cycle | Static layout plays exactly once per cycle | — | Partial | Yes | PB-RULE-03a |
| CMP-157 | Playback | Layout with two campaigns repeats LCM times | P2 | S2 | Layout with Camp(2) + Camp(3) | — | Count loops for that layout | 6 loops before advancing | — | Partial | No | PB-RULE-03a |
| CMP-158 | Playback | Same campaign in two layouts — counter scope | P1 | S2 | CampA in Layout 0 and Layout 1 | — | Observe a full cycle | Documented behaviour: one shared counter or two independent ones — must be deterministic and repeatable | — | Partial | Yes | AS-01b |
| CMP-159 | Playback | No skipped media across a full cycle | P0 | S1 | Any multi-campaign playlist | — | Record one full LCM cycle | Every campaign item appears at least once | — | Partial | Yes | RSK-01 |
| CMP-160 | Playback | No duplicate playback within one cycle | P0 | S1 | Same | — | Record one full cycle | No campaign item appears more times than `cycle_length / campaign_length` | — | Partial | Yes | RSK-01 |
| CMP-161 | Playback | Per-item duration honoured on device | P1 | S2 | Campaign with 5 s/10 s/15 s items | Stopwatch or player log | Measure each variant's on-screen time | Within the tolerance defined for media playback (e.g. ±500 ms) | — | Partial | Yes | FR-CMP-05 |
| CMP-162 | Playback | Transition accuracy between campaign items | P2 | S3 | Campaign with mixed types | — | Observe transitions across loops | No black frame, flicker, or stall at the campaign slot | — | No | Yes | SC-PLAY-021 |
| CMP-163 | Playback | Counter after player restart | P0 | S1 | Mid-cycle (on item 3 of 4) | — | Restart the player → observe | Resumes at item 4 (persisted) or restarts at item 1 — must match AS-09 and be documented | — | No | Yes | AS-09 |
| CMP-164 | Playback | Counter after a content sync | P0 | S1 | Mid-cycle | Push an unrelated content update | Sync → observe the next loops | Counter does not reset such that later items never play (RSK-09) | — | No | Yes | RSK-09 |
| CMP-165 | Playback | Two screens on the same playlist | P1 | S2 | 2 screens, same playlist | — | Publish → observe both | Behaviour is consistent and documented — either synchronised or independently counted, not arbitrary | — | No | Yes | AS-01 |
| CMP-166 | Playback | 24-hour soak — no drift | P2 | S2 | Campaign playing | — | Run 24 h → sample the sequence hourly | Sequence still matches the expected modulo position; no drift, leak or freeze | — | No | No | SC-PERF-013 |

## 3.7 Approval & Publish — CMP-167 … CMP-186

| ID | Module | Title | Pri | Sev | Precondition | Test Data | Steps | Expected Result | Post Condition | Auto | Reg | Req |
|----|--------|-------|-----|-----|--------------|-----------|-------|-----------------|----------------|------|-----|-----|
| CMP-167 | Approval | Campaign change enters pending approval | P0 | S1 | Published campaign | Add an item | Edit → Save | Status becomes Pending Approval; not yet live on screens | Pending | Yes | Yes | FR-APR-01 |
| CMP-168 | Approval | Pending state visible to the submitter | P0 | S2 | CMP-167 | — | Submitter views the campaign | Clear pending indicator with submission time | — | Yes | Yes | FR-APR-04 |
| CMP-169 | Approval | Pending item appears in the approver's queue | P0 | S1 | CMP-167 | Approver | Approver opens the queue | Item listed with campaign name, submitter, and the media delta | — | Yes | Yes | FR-APR-04 |
| CMP-170 | Approval | Approve → content publishes | P0 | S1 | Pending item | Approver | Approve | Status → Approved/Published; screens receive the change | Published | Yes | Yes | FR-APR-02 |
| CMP-171 | Approval | Reject → content does not publish | P0 | S1 | Pending item | Reason text | Reject with reason | Status → Rejected; screens keep the previous content | Rejected | Yes | Yes | FR-APR-03 |
| CMP-172 | Approval | Reject reason is required and stored | P1 | S2 | Pending item | Empty reason | Reject with a blank reason | Blocked if mandatory; when supplied, the reason is stored and shown to the submitter | — | Yes | Yes | FR-APR-03 |
| CMP-173 | Approval | Submitter cannot self-approve | P0 | S1 | Submitter also holds Approve | — | Submitter opens their own pending item | Approve disabled for own submission (AS-07) — or documented as allowed | — | Yes | Yes | FR-RBAC-06 |
| CMP-174 | Approval | Approve twice (idempotency) | P1 | S2 | Approved item | Replay the approve API call | Call approve again | Second call is a no-op or 409 — never a double publish or duplicate email | — | Yes | Yes | SC-APR-008 |
| CMP-175 | Approval | Approve an already-rejected item | P1 | S2 | Rejected item | — | Attempt approve | Blocked with a clear state error | — | Yes | Yes | SC-APR-009 |
| CMP-176 | Approval | Reject an already-approved item | P1 | S2 | Approved item | — | Attempt reject | Blocked or handled as a documented rollback flow | — | Yes | Yes | SC-APR-010 |
| CMP-177 | Approval | Campaign deleted while pending | P0 | S1 | Pending item | — | Delete the campaign → approver opens the queue | Queue entry resolved gracefully; no orphan approval; no crash | — | Yes | Yes | SC-APR-011 |
| CMP-178 | Approval | Campaign edited while pending | P1 | S2 | Pending item | Second edit | Edit again before approval | Approval reflects the latest state, or a second pending entry is created — defined, not ambiguous | — | Yes | Yes | SC-APR-012 |
| CMP-179 | Approval | Two approvers act concurrently | P1 | S1 | Pending item, 2 approvers | Approve + Reject at once | Both submit simultaneously | One wins deterministically; the other gets a clear conflict error; single final state | — | Partial | Yes | SC-APR-013 |
| CMP-180 | Approval | Bulk approve multiple campaign changes | P2 | S2 | 5 pending items | — | Select all → Approve | All approved; one audit entry each; correct email count | — | Yes | No | SC-APR-015 |
| CMP-181 | Publish | Publish with an empty campaign blocked | P0 | S1 | Campaign with 0 items | — | Attempt publish | Blocked per BR-04 with a specific message | — | Yes | Yes | BR-04 |
| CMP-182 | Publish | Publish failure surfaces an actionable error | P0 | S2 | Force a backend failure | — | Publish | Specific error shown; state not left half-published | — | Yes | Yes | FR-CL-03 |
| CMP-183 | Publish | Republish after a failure | P1 | S2 | CMP-182 | — | Fix and republish | Succeeds; no duplicate content on screens | Published | Yes | Yes | SC-PUB-006 |
| CMP-184 | Publish | Campaign deleted mid-publish | P0 | S1 | Publish in flight | — | Delete the campaign during publish | Publish aborts or completes atomically; screens never receive a dangling reference | — | Partial | Yes | SC-PUB-007 |
| CMP-185 | Publish | Publish during a concurrent campaign edit | P1 | S1 | Publish in flight | Another user edits the campaign | Concurrent actions | Published payload is internally consistent — no half-old/half-new item list | — | Partial | Yes | RSK-07 |
| CMP-186 | Publish | Publish audit entry created | P1 | S2 | Successful publish | — | Check the audit log | Entry with actor, timestamp, campaign id, target screens | — | Yes | Yes | FR-AUD-01 |

## 3.8 Content Publish Approval Email — CMP-187 … CMP-202

Requires DEP-08 (test inbox with API access). Where no inbox is available, assert the outbound
mail payload at the API/queue level instead — do not skip the count assertions.

| ID | Module | Title | Pri | Sev | Precondition | Test Data | Steps | Expected Result | Post Condition | Auto | Reg | Req |
|----|--------|-------|-----|-----|--------------|-----------|-------|-----------------|----------------|------|-----|-----|
| CMP-187 | Email | Email sent when a campaign adds media to a screen | P0 | S1 | Screen S1 published | Add 3 items | Edit campaign → Save → submit | One Content Publish Approval email received | — | Yes | Yes | FR-EML-01 |
| CMP-188 | Email | Email sent on campaign media removal | P0 | S1 | Campaign with 4 items | Remove 2 | Edit → Save | Email describes the removal | — | Yes | Yes | FR-EML-01 |
| CMP-189 | Email | Body matches the specified structure | P0 | S1 | CMP-187 | — | Open the email | Reads: *"3 Media files are being added/removed from these Screen(s) through Campaigns"* | — | Yes | Yes | FR-EML-02 |
| CMP-190 | Email | Media count matches the persisted delta | P0 | S1 | Add 3, remove 1 | — | Compare the email count against the DB delta | Count reflects what actually persisted, not the request payload (RSK-05) | — | Yes | Yes | FR-EML-05 |
| CMP-191 | Email | Affected screens listed correctly | P0 | S1 | Campaign on 3 screens | — | Read the screen list | All 3 named; no extra or missing screen | — | Yes | Yes | FR-EML-02 |
| CMP-192 | Email | Campaign name present in the body | P1 | S2 | — | Named campaign | Read the email | Campaign name present and correctly escaped | — | Yes | Yes | FR-EML-03 |
| CMP-193 | Email | Source labelled "Campaigns" not "Sequences"/"Slide" | P0 | S2 | Campaign change | — | Read the email | Source reads Campaigns | — | Yes | Yes | FR-EML-04 |
| CMP-194 | Email | Singular grammar for a single file | P2 | S3 | Add 1 item | — | Read the email | "1 Media file" (singular), not "1 Media files" | — | Yes | No | FR-EML-02 |
| CMP-195 | Email | Mixed add + remove in one change set | P1 | S2 | Add 2, remove 2 | — | Read the email | Both actions represented with correct counts | — | Yes | Yes | FR-EML-02 |
| CMP-196 | Email | Large screen list formatting | P2 | S3 | Campaign on 50 screens | — | Read the email | Readable — truncated with a count or scrollable; no wall of text, no clipping | — | Yes | No | FR-EML-06 |
| CMP-197 | Email | Subject line correctness | P1 | S2 | — | — | Read the subject | Identifies content publish approval and the affected entity; no template placeholders leak | — | Yes | Yes | FR-EML-02 |
| CMP-198 | Email | HTML integrity | P2 | S3 | — | — | Inspect the raw HTML | Valid HTML, no unrendered tags, no broken images | — | Yes | No | FR-EML-06 |
| CMP-199 | Email | Mobile/responsive rendering | P3 | S4 | — | Gmail iOS/Android, Outlook | Open on mobile clients | Readable without horizontal scrolling | — | No | No | FR-EML-06 |
| CMP-200 | Email | No duplicate emails for a single change | P1 | S2 | One change | — | Count received emails | Exactly one per change set (BR-10) | — | Yes | Yes | FR-EML-07 |
| CMP-201 | Email | Failed send is retried | P1 | S2 | SMTP temporarily failing | — | Trigger a change with SMTP down → restore | Email eventually delivered; retry logged; still exactly one email | — | Partial | Yes | FR-EML-07 |
| CMP-202 | Email | Recipients limited to entitled approvers | P0 | S1 | Mixed roles | — | Check recipients | Only users with Approve on that scope receive it; no campaign details leak to unentitled users | — | Yes | Yes | FR-EML-01, SC-SEC-020 |

## 3.9 Search, Filter, Audit & Data — CMP-203 … CMP-220

| ID | Module | Title | Pri | Sev | Precondition | Test Data | Steps | Expected Result | Post Condition | Auto | Reg | Req |
|----|--------|-------|-----|-----|--------------|-----------|-------|-----------------|----------------|------|-----|-----|
| CMP-203 | Search | Exact-name search | P1 | S2 | Campaign `QA_Camp_Basic` | Full name | Search | Exact record returned first | — | Yes | Yes | SC-SRCH-001 |
| CMP-204 | Search | Partial-match search | P1 | S2 | Several `QA_Camp_*` | `QA_Camp` | Search | All matching campaigns returned | — | Yes | Yes | SC-SRCH-002 |
| CMP-205 | Search | Case-insensitive search | P2 | S3 | — | `qa_camp` | Search | Same results as the exact-case query | — | Yes | No | SC-SRCH-003 |
| CMP-206 | Search | No results — empty state | P2 | S3 | — | `zzzznotfound` | Search | Empty-state message; no error, no stale results | — | Yes | Yes | SC-SRCH-004 |
| CMP-207 | Search | Special characters in the query | P2 | S3 | — | `%_'"<>` | Search | Handled literally; no 500, no SQL error, no XSS | — | Yes | Yes | SC-SEC-011 |
| CMP-208 | Search | Search respects folder restrictions | P0 | S1 | Restricted campaign | Sub-user, exact name | Search as sub-user | Not returned | — | Yes | Yes | BR-07 |
| CMP-209 | Search | **Parity** — search behaves as for Media | P1 | S2 | Media + campaign named alike | Same query | Search both entity types | Matching semantics (prefix/substring/ranking) | — | Yes | Yes | PB-RULE-04 |
| CMP-210 | Filter | Filter by folder | P1 | S2 | Campaigns across folders | Folder F_A | Apply the filter | Only F_A campaigns shown | — | Yes | Yes | SC-SRCH-008 |
| CMP-211 | Filter | Filter by status | P2 | S3 | Draft/pending/published mix | Status = Pending | Apply the filter | Only pending campaigns shown | — | Yes | No | SC-SRCH-010 |
| CMP-212 | Sort | Sort by name and by updated date | P2 | S3 | ≥ 10 campaigns | — | Toggle sorts | Correct ascending/descending order; stable across pages | — | Yes | No | SC-SRCH-011 |
| CMP-213 | Paging | Pagination navigation | P1 | S2 | ≥ 100 campaigns | Page size default | Page forward/back | No duplicates, no skipped records, correct total | — | Yes | Yes | FR-CMP-09 |
| CMP-214 | Audit | Create is audit-logged | P1 | S2 | — | — | Create a campaign → open the audit log | Entry with actor, UTC timestamp, campaign id | — | Yes | Yes | FR-AUD-01 |
| CMP-215 | Audit | Update logged with before/after delta | P1 | S2 | — | Rename + add item | Edit → check the audit entry | Delta shows both old and new values | — | Yes | Yes | FR-AUD-02 |
| CMP-216 | Audit | Delete, Approve, Reject, Publish, Restore logged | P1 | S2 | — | Each action | Perform each → check the log | One correct entry per action, correct actor | — | Yes | Yes | FR-AUD-01 |
| CMP-217 | DB | Item order persisted as an explicit ordinal | P1 | S2 | DB access (DEP-11) | Campaign with 4 items | Query the item table | Explicit ordinal column, contiguous from 1, no reliance on insertion order | — | Partial | Yes | SC-DB-002 |
| CMP-218 | DB | Soft delete sets the flag and retains the row | P1 | S2 | DB access | Delete a campaign | Query the row | `deleted` flag set; row retained; excluded from all reads (AS-05, BR-12) | — | Partial | Yes | SC-DB-009 |
| CMP-219 | DB | created_by / updated_by populated correctly | P2 | S3 | DB access | Create then edit as two users | Query the row | Correct distinct actor ids, not a service account | — | Partial | No | SC-DB-007 |
| CMP-220 | DB | Soft-deleted campaigns excluded from playback resolution | P0 | S1 | Campaign in a playlist, then deleted | — | Inspect the resolved schedule payload sent to screens | Deleted campaign not resolvable; playlist degrades per BR-08 | — | Yes | Yes | BR-12 |

---

## Case count by module

| Module | Range | Count |
|--------|-------|-------|
| CRUD | CMP-001…034 | 34 |
| Folder | CMP-035…062 | 28 |
| Playlist | CMP-063…088 | 26 |
| Cluster | CMP-089…104 | 16 |
| RBAC | CMP-105…140 | 36 |
| Playback | CMP-141…166 | 26 |
| Approval/Publish | CMP-167…186 | 20 |
| Email | CMP-187…202 | 16 |
| Search/Audit/DB | CMP-203…220 | 18 |
| **Total** | | **220** |

Positive cases: 118 · Negative cases: 102 (see [04-positive-negative.md](04-positive-negative.md) for the split).

---

**Next:** [04-positive-negative.md](04-positive-negative.md) · [05-edge-cases.md](05-edge-cases.md)
