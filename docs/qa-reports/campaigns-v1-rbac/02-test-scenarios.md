# Campaigns V1 with RBAC — Test Scenario Catalogue

**Document ID:** CMP-QA-DOC-02
**Scenarios:** 232
**Technique basis (ISTQB):** equivalence partitioning, boundary value analysis, decision tables,
state transition, use-case, pairwise, error guessing, exploratory charters.

Scenario IDs are `SC-<MODULE>-nnn`. Detailed test cases in Doc 03 map back to these.

---

## SC-CRUD — Campaign CRUD (28)

| ID | Scenario | Technique |
|----|----------|-----------|
| SC-CRUD-001 | Create a campaign with a valid name and 3 media items | Use case |
| SC-CRUD-002 | Create a campaign with the minimum 1 item | BVA |
| SC-CRUD-003 | Create a campaign with 0 items (save attempt) | BVA / negative |
| SC-CRUD-004 | Create with maximum supported items (1000, AS-04) | BVA |
| SC-CRUD-005 | Create with items exceeding the maximum | BVA / negative |
| SC-CRUD-006 | Name at minimum length (1 char) | BVA |
| SC-CRUD-007 | Name at maximum length (255) | BVA |
| SC-CRUD-008 | Name exceeding maximum length (256) | BVA / negative |
| SC-CRUD-009 | Name blank | Negative |
| SC-CRUD-010 | Name whitespace-only | Negative |
| SC-CRUD-011 | Name with leading/trailing whitespace (trim behaviour) | EP |
| SC-CRUD-012 | Name with Unicode (Devanagari, CJK) | EP |
| SC-CRUD-013 | Name with emoji | EP |
| SC-CRUD-014 | Name with RTL text (Arabic/Hebrew) | EP |
| SC-CRUD-015 | Duplicate name in the same folder | Negative |
| SC-CRUD-016 | Duplicate name differing only by case | Negative |
| SC-CRUD-017 | Same name in a different folder | Positive |
| SC-CRUD-018 | Name with HTML/script payload | Security |
| SC-CRUD-019 | Name with SQL metacharacters | Security |
| SC-CRUD-020 | Edit campaign name | Use case |
| SC-CRUD-021 | Reorder items via drag and drop | Use case |
| SC-CRUD-022 | Remove one item from a campaign | Use case |
| SC-CRUD-023 | Remove all items from a saved campaign | Negative |
| SC-CRUD-024 | Add an item to an existing published campaign | State transition |
| SC-CRUD-025 | Duplicate/clone a campaign | Use case |
| SC-CRUD-026 | Delete an unused campaign | Use case |
| SC-CRUD-027 | Delete a campaign referenced by a playlist | Negative / integrity |
| SC-CRUD-028 | Cancel out of the create dialog — nothing persisted | Use case |

## SC-FLD — Folder system (26)

| ID | Scenario |
|----|----------|
| SC-FLD-001 | Campaign created inside the currently open folder |
| SC-FLD-002 | Campaign visible in the folder listing alongside media |
| SC-FLD-003 | **Parity:** campaign folder listing behaves identically to media (PB-RULE-04) |
| SC-FLD-004 | Move a campaign to another folder |
| SC-FLD-005 | Move to a folder the user cannot write to |
| SC-FLD-006 | Copy a campaign to another folder |
| SC-FLD-007 | Copy preserves item order |
| SC-FLD-008 | Rename a folder containing campaigns |
| SC-FLD-009 | Delete a folder containing campaigns |
| SC-FLD-010 | Delete a folder containing an in-use campaign |
| SC-FLD-011 | Nested folder — campaign at depth 2 |
| SC-FLD-012 | Nested folder — campaign at depth 5 |
| SC-FLD-013 | Nested folder — campaign at maximum supported depth |
| SC-FLD-014 | Restricted parent hides child campaigns |
| SC-FLD-015 | Restricted child inside an accessible parent |
| SC-FLD-016 | Permission inheritance parent → child |
| SC-FLD-017 | Permission override on a child folder |
| SC-FLD-018 | Revoking parent access removes child campaign visibility |
| SC-FLD-019 | Granting folder access reveals campaigns without re-login |
| SC-FLD-020 | Restricted campaign absent from the playlist picker |
| SC-FLD-021 | Restricted campaign absent from search results |
| SC-FLD-022 | Restricted campaign returns 403 on direct API fetch |
| SC-FLD-023 | Moving a campaign into a restricted folder revokes access for others |
| SC-FLD-024 | Root-level campaign (no folder) |
| SC-FLD-025 | Folder breadcrumb navigation from a campaign |
| SC-FLD-026 | Empty-folder state shows the correct message |

## SC-PL — Playlist integration (24)

| ID | Scenario |
|----|----------|
| SC-PL-001 | Campaigns tab visible in the playlist media picker |
| SC-PL-002 | Insert a campaign into an empty playlist (Case 3) |
| SC-PL-003 | Insert a campaign at position 2 of 4 (Case 4) |
| SC-PL-004 | Insert a campaign at the first position |
| SC-PL-005 | Insert a campaign at the last position |
| SC-PL-006 | Remove a campaign from a playlist |
| SC-PL-007 | Reorder a campaign within the playlist |
| SC-PL-008 | Insert the same campaign twice in one playlist |
| SC-PL-009 | Insert two different campaigns in one playlist |
| SC-PL-010 | Insert three or more campaigns |
| SC-PL-011 | Use the same campaign across two playlists |
| SC-PL-012 | Playlist total-duration calculation with a campaign slot |
| SC-PL-013 | Per-item duration override inside a campaign slot |
| SC-PL-014 | Campaign in a multi-zone layout |
| SC-PL-015 | Campaign in multiple layouts of one playlist |
| SC-PL-016 | Save and reopen — campaign persists |
| SC-PL-017 | Playlist preview renders the campaign slot |
| SC-PL-018 | Campaign search inside the picker |
| SC-PL-019 | Picker pagination with many campaigns |
| SC-PL-020 | Picker shows only permitted campaigns |
| SC-PL-021 | Campaign thumbnail/label correctness in the slot |
| SC-PL-022 | Editing a campaign updates every playlist using it |
| SC-PL-023 | Deleting a campaign used in a playlist |
| SC-PL-024 | Playlist publish with a campaign |

## SC-CL — Cluster integration (16)

| ID | Scenario |
|----|----------|
| SC-CL-001 | Assign a campaign to a cluster |
| SC-CL-002 | Remove a campaign from a cluster |
| SC-CL-003 | Cluster behaviour matches playlist behaviour |
| SC-CL-004 | Sync a campaign to all screens in a cluster |
| SC-CL-005 | Sync to a cluster containing offline screens |
| SC-CL-006 | Offline screen receives the campaign on reconnect |
| SC-CL-007 | Sync failure is surfaced to the user |
| SC-CL-008 | Retry a failed sync |
| SC-CL-009 | Rollback after a partial sync |
| SC-CL-010 | Sync a campaign edit to an already-synced cluster |
| SC-CL-011 | Concurrent sync of two campaigns |
| SC-CL-012 | Cluster with 50+ screens |
| SC-CL-013 | Campaign removed from cluster stops playing on screens |
| SC-CL-014 | Cluster respects campaign folder restrictions |
| SC-CL-015 | Assign a campaign to multiple clusters |
| SC-CL-016 | Cluster sync status reporting accuracy |

## SC-RBAC — Role Based Access Control (34)

| ID | Scenario |
|----|----------|
| SC-RBAC-001 | Campaign permission section exists in the role editor |
| SC-RBAC-002 | Section exposes NONE / READ-ONLY / ALL bulk controls (existing UI pattern) |
| SC-RBAC-003 | View granted — campaign list visible |
| SC-RBAC-004 | View revoked — nav/tab hidden |
| SC-RBAC-005 | View revoked — direct URL blocked |
| SC-RBAC-006 | View revoked — data API returns 403 |
| SC-RBAC-007 | Create granted — create control available |
| SC-RBAC-008 | Create revoked — create control hidden or disabled |
| SC-RBAC-009 | Create revoked — POST API returns 403 |
| SC-RBAC-010 | Edit granted — campaign editable |
| SC-RBAC-011 | Edit revoked — edit control hidden or disabled |
| SC-RBAC-012 | Edit revoked — PUT/PATCH API returns 403 |
| SC-RBAC-013 | Delete granted — delete succeeds |
| SC-RBAC-014 | Delete revoked — delete control hidden or disabled |
| SC-RBAC-015 | Delete revoked — DELETE API returns 403 |
| SC-RBAC-016 | Publish granted — publish succeeds |
| SC-RBAC-017 | Publish revoked — publish blocked in UI and API |
| SC-RBAC-018 | Approve granted — approve succeeds |
| SC-RBAC-019 | Approve revoked — approve blocked |
| SC-RBAC-020 | Reject granted — reject succeeds |
| SC-RBAC-021 | Reject revoked — reject blocked |
| SC-RBAC-022 | Folder Permission granted — user manages campaign folder access |
| SC-RBAC-023 | Folder Permission revoked — folder controls blocked |
| SC-RBAC-024 | View without Edit — read-only rendering |
| SC-RBAC-025 | Edit without View — contradictory grant handled sanely |
| SC-RBAC-026 | Create without Publish — campaign saved but not publishable |
| SC-RBAC-027 | Publish without Approve — requires another actor |
| SC-RBAC-028 | Effective permission = role ∩ folder (both grant → allow) |
| SC-RBAC-029 | Role grants, folder denies → denied |
| SC-RBAC-030 | Folder grants, role denies → denied |
| SC-RBAC-031 | Permission change takes effect without re-login |
| SC-RBAC-032 | Stale token cannot retain revoked access |
| SC-RBAC-033 | Privilege escalation attempt via role payload manipulation |
| SC-RBAC-034 | Cross-tenant campaign access blocked (TagTalk scoping) |

## SC-APR — Approval workflow (18)

| ID | Scenario |
|----|----------|
| SC-APR-001 | Campaign change enters pending-approval state |
| SC-APR-002 | Pending state visible to the submitter |
| SC-APR-003 | Pending state visible to the approver |
| SC-APR-004 | Approve → content publishes |
| SC-APR-005 | Reject → content does not publish |
| SC-APR-006 | Reject requires/records a reason |
| SC-APR-007 | Submitter cannot self-approve (AS-07) |
| SC-APR-008 | Approve twice (idempotency) |
| SC-APR-009 | Approve an already-rejected item |
| SC-APR-010 | Reject an already-approved item |
| SC-APR-011 | Campaign deleted while pending approval |
| SC-APR-012 | Campaign edited while pending approval |
| SC-APR-013 | Two approvers act concurrently |
| SC-APR-014 | Approval queue ordering and filtering |
| SC-APR-015 | Bulk approve multiple campaign changes |
| SC-APR-016 | Approval audit entry created |
| SC-APR-017 | Approval survives approver's permission being revoked mid-flow |
| SC-APR-018 | Pending item expiry / stale approval handling |

## SC-PUB — Publish (12)

| ID | Scenario |
|----|----------|
| SC-PUB-001 | Publish a playlist containing a campaign |
| SC-PUB-002 | Publish a cluster containing a campaign |
| SC-PUB-003 | Publish with an empty campaign — blocked (BR-04) |
| SC-PUB-004 | Publish to offline screens |
| SC-PUB-005 | Publish failure surfaces an actionable error |
| SC-PUB-006 | Republish after a failure |
| SC-PUB-007 | Campaign deleted mid-publish |
| SC-PUB-008 | Publish during a concurrent campaign edit |
| SC-PUB-009 | Bulk publish to 50+ screens |
| SC-PUB-010 | Publish rollback on partial failure |
| SC-PUB-011 | Publish without Publish permission — blocked |
| SC-PUB-012 | Publish audit entry created |

## SC-EML — Content Publish Approval email (16)

| ID | Scenario |
|----|----------|
| SC-EML-001 | Email sent on campaign add to a screen |
| SC-EML-002 | Email sent on campaign removal |
| SC-EML-003 | Subject line correctness |
| SC-EML-004 | Body matches the specified structure (FR-EML-02) |
| SC-EML-005 | Media count matches the persisted delta |
| SC-EML-006 | Affected screen names listed correctly |
| SC-EML-007 | Campaign name present in the body |
| SC-EML-008 | Source labelled "Campaigns" (vs Sequences/Slide) |
| SC-EML-009 | Singular vs plural grammar (1 Media file vs 3 Media files) |
| SC-EML-010 | Mixed add + remove in one change set |
| SC-EML-011 | Large screen list truncation/formatting |
| SC-EML-012 | HTML formatting integrity |
| SC-EML-013 | Mobile/responsive rendering |
| SC-EML-014 | No duplicate emails for a single change |
| SC-EML-015 | Failed send is retried |
| SC-EML-016 | Recipients limited to entitled approvers |

## SC-SRCH — Search, filter, sort, pagination (14)

| ID | Scenario |
|----|----------|
| SC-SRCH-001 | Search a campaign by exact name |
| SC-SRCH-002 | Partial-match search |
| SC-SRCH-003 | Case-insensitive search |
| SC-SRCH-004 | Search with no results — empty state |
| SC-SRCH-005 | Search with special characters |
| SC-SRCH-006 | Search with Unicode/emoji |
| SC-SRCH-007 | Search respects folder restrictions |
| SC-SRCH-008 | Filter by folder |
| SC-SRCH-009 | Filter by owner/creator |
| SC-SRCH-010 | Filter by status (draft/pending/published) |
| SC-SRCH-011 | Sort by name, created date, updated date |
| SC-SRCH-012 | Pagination — page size and navigation |
| SC-SRCH-013 | Pagination stability during concurrent inserts |
| SC-SRCH-014 | **Parity:** search/filter behaves as it does for Media (PB-RULE-04) |

## SC-PLAY — Playback validation (24)

| ID | Scenario | Spec ref |
|----|----------|----------|
| SC-PLAY-001 | Case 1 — file1 + widget1 + Camp(A,B,C) across loops 1–3 | PB-RULE-01 |
| SC-PLAY-002 | Case 1 continued — loop 4 wraps to A | PB-RULE-01 |
| SC-PLAY-003 | Case 3 — campaign-only playlist X,Y,Z | PB-RULE-01 |
| SC-PLAY-004 | Case 4 — file1 + Camp(c1,c2,c3) + file2 + file3 | PB-RULE-01 |
| SC-PLAY-005 | Static items replay unchanged every loop | PB-RULE-01 |
| SC-PLAY-006 | Single-item campaign plays the same item every loop | BVA |
| SC-PLAY-007 | Two-item campaign alternates | BVA |
| SC-PLAY-008 | Wrap boundary — item N → item 1, no repeat, no skip | RSK-01 |
| SC-PLAY-009 | Multi-campaign independence — loops 1–6, CampA(2) + CampB(3) | PB-RULE-02 |
| SC-PLAY-010 | Full cycle equals LCM of campaign lengths | PB-RULE-02 |
| SC-PLAY-011 | Three campaigns of lengths 2, 3, 4 — cycle = 12 | PB-RULE-02 |
| SC-PLAY-012 | Equal-length campaigns advance in lockstep | PB-RULE-02 |
| SC-PLAY-013 | Multi-layout timeline indices 01–12 exactly as specified | PB-RULE-03 |
| SC-PLAY-014 | Layout repeats for LCM(its campaign lengths) before advancing | PB-RULE-03a |
| SC-PLAY-015 | Layout with no campaign plays once per cycle | PB-RULE-03a |
| SC-PLAY-016 | Cycle wraps from the last layout back to Layout 0 | PB-RULE-03 |
| SC-PLAY-017 | Same campaign in two layouts — counter shared or independent | AS-01b |
| SC-PLAY-018 | No skipped media across a full cycle | RSK-01 |
| SC-PLAY-019 | No duplicate playback within one cycle | RSK-01 |
| SC-PLAY-020 | Per-item duration honoured during playback | FR-CMP-05 |
| SC-PLAY-021 | Transition/timing accuracy between campaign items | Timing |
| SC-PLAY-022 | Counter behaviour after player restart | AS-09 |
| SC-PLAY-023 | Counter behaviour after content sync | RSK-09 |
| SC-PLAY-024 | Two screens playing the same playlist stay consistent | AS-01 |

## SC-API — API testing (22)

| ID | Scenario |
|----|----------|
| SC-API-001 | GET campaign list — 200, schema, pagination |
| SC-API-002 | GET campaign by id — 200 |
| SC-API-003 | GET non-existent id — 404 |
| SC-API-004 | GET another tenant's campaign — 403/404 (IDOR) |
| SC-API-005 | POST create — 201 |
| SC-API-006 | POST with missing required fields — 400 |
| SC-API-007 | POST with invalid item ids — 400/422 |
| SC-API-008 | PUT full update — 200 |
| SC-API-009 | PATCH partial update — 200 |
| SC-API-010 | PATCH read-only field (mass assignment) — ignored/rejected |
| SC-API-011 | DELETE — 200/204 |
| SC-API-012 | DELETE already-deleted — idempotent |
| SC-API-013 | Bulk create/update/delete |
| SC-API-014 | Permission APIs reflect the role matrix |
| SC-API-015 | Approval APIs (approve/reject) |
| SC-API-016 | Publish API |
| SC-API-017 | Oversized payload — 413 |
| SC-API-018 | Malformed JSON — 400 |
| SC-API-019 | SQL injection payloads |
| SC-API-020 | XSS payloads stored and reflected |
| SC-API-021 | Rate limiting |
| SC-API-022 | Filtering + sorting + pagination combined |

## SC-DB — Database validation (12)

| ID | Scenario |
|----|----------|
| SC-DB-001 | Campaign record written with correct fields |
| SC-DB-002 | Item order persisted as an explicit ordinal |
| SC-DB-003 | Folder mapping row correct |
| SC-DB-004 | Playlist mapping row correct |
| SC-DB-005 | Cluster mapping row correct |
| SC-DB-006 | Approval status column transitions correctly |
| SC-DB-007 | created_by / created_at populated |
| SC-DB-008 | updated_by / updated_at populated on edit |
| SC-DB-009 | Soft-delete flag set, row retained |
| SC-DB-010 | Soft-deleted rows excluded from all reads |
| SC-DB-011 | Orphan cleanup when referenced media is deleted |
| SC-DB-012 | Referential integrity across campaign ↔ item ↔ folder |

## SC-AUD — Audit logs (10)

| ID | Scenario |
|----|----------|
| SC-AUD-001 | Create logged |
| SC-AUD-002 | Update logged with before/after delta |
| SC-AUD-003 | Delete logged |
| SC-AUD-004 | Approve logged |
| SC-AUD-005 | Reject logged with reason |
| SC-AUD-006 | Publish logged |
| SC-AUD-007 | Restore logged |
| SC-AUD-008 | Actor identity correct (not a service account) |
| SC-AUD-009 | Timestamps in UTC and monotonic |
| SC-AUD-010 | Audit visible only with permission; immutable |

## SC-SEC — Security (20)

| ID | Scenario | OWASP |
|----|----------|-------|
| SC-SEC-001 | Broken access control — horizontal (other user's campaign) | A01 |
| SC-SEC-002 | Broken access control — vertical (viewer performs admin action) | A01 |
| SC-SEC-003 | IDOR on campaign id | A01 |
| SC-SEC-004 | IDOR on folder id | A01 |
| SC-SEC-005 | Forced browsing to campaign admin routes | A01 |
| SC-SEC-006 | Privilege escalation via role update payload | A01 |
| SC-SEC-007 | Approval bypass via direct publish API | A01 |
| SC-SEC-008 | Mass assignment of owner/tenant/status fields | A03/A08 |
| SC-SEC-009 | Stored XSS in campaign name | A03 |
| SC-SEC-010 | Reflected XSS in search | A03 |
| SC-SEC-011 | SQL injection in search/filter parameters | A03 |
| SC-SEC-012 | CSRF on state-changing campaign endpoints | A01 |
| SC-SEC-013 | JWT tampering (role claim) | A02/A07 |
| SC-SEC-014 | Expired token rejected | A07 |
| SC-SEC-015 | Token replay after logout | A07 |
| SC-SEC-016 | API token misuse / scope violation | A07 |
| SC-SEC-017 | Sensitive data in error responses | A04 |
| SC-SEC-018 | Missing rate limiting on create/publish | A04 |
| SC-SEC-019 | Insecure direct file access to campaign media | A01 |
| SC-SEC-020 | Cross-tenant leakage (TagTalk isolation) | A01 |

## SC-PERF — Performance (14)

| ID | Scenario |
|----|----------|
| SC-PERF-001 | Campaign list load with 1,000 campaigns |
| SC-PERF-002 | Folder load with 5,000 mixed assets |
| SC-PERF-003 | Playlist editor load with 5 campaigns |
| SC-PERF-004 | Picker Campaigns-tab open latency |
| SC-PERF-005 | Campaign with 1,000 items — editor responsiveness |
| SC-PERF-006 | Save latency for a large campaign |
| SC-PERF-007 | API p95 latency under nominal load |
| SC-PERF-008 | Bulk publish to 100 screens |
| SC-PERF-009 | 100 concurrent users browsing |
| SC-PERF-010 | 500 concurrent users |
| SC-PERF-011 | 1,000 concurrent users |
| SC-PERF-012 | Playback latency / transition jitter on device |
| SC-PERF-013 | Player memory over a 24 h soak |
| SC-PERF-014 | CMS CPU/memory during bulk sync |

## SC-UX — Usability & accessibility (12)

| ID | Scenario |
|----|----------|
| SC-UX-001 | Campaigns tab discoverable and labelled consistently |
| SC-UX-002 | Empty state for a folder with no campaigns |
| SC-UX-003 | Validation messages are specific and actionable |
| SC-UX-004 | Unsaved-changes warning on navigate away |
| SC-UX-005 | Loading/skeleton states during fetch |
| SC-UX-006 | Drag-and-drop reorder affordance and feedback |
| SC-UX-007 | Long names truncate with tooltip, no layout break |
| SC-UX-008 | Responsive layout at 1280 / 1440 / 1920 |
| SC-UX-009 | Keyboard-only create and reorder |
| SC-UX-010 | Screen-reader labels on campaign controls (WCAG 4.1.2) |
| SC-UX-011 | Colour contrast on campaign badges (WCAG 1.4.3) |
| SC-UX-012 | Focus order and visible focus in the picker |

---

**Scenario count by module**

| Module | Count |
|--------|-------|
| CRUD | 28 |
| Folder | 26 |
| Playlist | 24 |
| Cluster | 16 |
| RBAC | 34 |
| Approval | 18 |
| Publish | 12 |
| Email | 16 |
| Search/Filter | 14 |
| Playback | 24 |
| API | 22 |
| Database | 12 |
| Audit | 10 |
| Security | 20 |
| Performance | 14 |
| UX/A11y | 12 |
| **Total** | **302** |

---

**Next:** [03-detailed-test-cases.md](03-detailed-test-cases.md)
