# Campaigns V1 with RBAC — Positive & Negative Test Coverage

**Document ID:** CMP-QA-DOC-04
Cross-references the detailed cases in Doc 03. This document organises the same cases by
**intent** (happy path vs. fault injection) so a tester can run a targeted pass, and adds
cases that exist only in this dimension (`CMP-P-nnn`, `CMP-N-nnn`).

---

## 4. Positive Test Cases

### 4.1 Normal workflow

| ID | Title | Expected |
|----|-------|----------|
| CMP-P-001 | Create → add 3 items → save → verify in folder | Campaign persisted with correct order |
| CMP-P-002 | Insert campaign into a playlist → save → publish | Screens receive the campaign |
| CMP-P-003 | Assign campaign to a cluster → sync | All cluster screens play it |
| CMP-P-004 | Edit campaign name → save | Name updated everywhere it is referenced |
| CMP-P-005 | Reorder items → save → reopen | New order persisted and drives playback |
| CMP-P-006 | Delete an unused campaign | Removed cleanly, audit entry written |
| CMP-P-007 | End-to-end: create → playlist → approve → publish → play | Full happy path with no manual intervention |

*(Detailed: CMP-001, 020, 021, 026, 064, 086, 089, 170)*

### 4.2 Boundary workflow

| ID | Title | Boundary |
|----|-------|----------|
| CMP-P-010 | Campaign with exactly 1 item | Lower bound of item count |
| CMP-P-011 | Campaign with exactly 2 items | Smallest alternating cycle |
| CMP-P-012 | Campaign at the documented maximum item count | Upper bound |
| CMP-P-013 | Name at 1 character | Lower name bound |
| CMP-P-014 | Name at 255 characters | Upper name bound |
| CMP-P-015 | Item duration at the 1 s floor | BR-13 lower bound |
| CMP-P-016 | Playlist with exactly 1 slot, and that slot is a campaign | Spec Case 3 |
| CMP-P-017 | Folder nesting at the maximum supported depth | AS-12 |

*(Detailed: CMP-002, 004, 006, 007, 034, 046, 143, 146, 147)*

### 4.3 Bulk workflow

| ID | Title | Expected |
|----|-------|----------|
| CMP-P-020 | Bulk-add 50 items to one campaign | All added in order, single save |
| CMP-P-021 | Bulk-delete 20 campaigns | All soft-deleted, one audit entry each |
| CMP-P-022 | Bulk-move 20 campaigns between folders | All moved, references intact |
| CMP-P-023 | Bulk approve 10 pending campaign changes | All approved; email count correct |
| CMP-P-024 | Bulk publish to 100 screens | Completes within the perf budget |
| CMP-P-025 | Bulk assign one campaign to 5 clusters | All clusters sync |

*(Detailed: CMP-004, 100, 180)*

### 4.4 Multiple-user workflow

| ID | Title | Expected |
|----|-------|----------|
| CMP-P-030 | User A creates, User B edits, User C publishes | Each step attributed to the correct actor in the audit log |
| CMP-P-031 | Submitter and approver are different users | Approval completes; segregation of duties respected |
| CMP-P-032 | Two users edit *different* campaigns simultaneously | No interference |
| CMP-P-033 | Admin changes a role while a sub-user is active | New permissions apply on the sub-user's next action |
| CMP-P-034 | Two users view the same campaign read-only | Both see identical, current data |

*(Detailed: CMP-131, 135, 173, 219)*

### 4.5 Approval workflow

| ID | Title | Expected |
|----|-------|----------|
| CMP-P-040 | Submit → pending → approve → publish | State machine advances correctly at each step |
| CMP-P-041 | Submit → pending → reject → resubmit → approve | Rework loop completes |
| CMP-P-042 | Approver sees the accurate media delta in the queue | Counts match the actual change |
| CMP-P-043 | Approval triggers exactly one email | BR-10 |
| CMP-P-044 | Approval writes an audit entry with actor and time | FR-APR-05 |

*(Detailed: CMP-167…172, 186, 200)*

### 4.6 Folder hierarchy

| ID | Title | Expected |
|----|-------|----------|
| CMP-P-050 | Create a campaign at each depth 1–5 | All function identically |
| CMP-P-051 | Inherit permission from grandparent (depth 3) | Inheritance flows through every level |
| CMP-P-052 | Move a campaign up the tree | Permissions recomputed from the new ancestry |
| CMP-P-053 | Move a campaign down the tree | Same |
| CMP-P-054 | Copy across sibling folders | Independent copy created |

*(Detailed: CMP-038, 040, 045, 046, 049, 062)*

### 4.7 Publish workflow

| ID | Title | Expected |
|----|-------|----------|
| CMP-P-060 | Publish a playlist with one campaign | Screens updated |
| CMP-P-061 | Publish a playlist with three campaigns | All slots resolve correctly |
| CMP-P-062 | Publish a multi-layout playlist | PB-RULE-03 timeline honoured |
| CMP-P-063 | Republish after an edit | Screens pick up the new version |
| CMP-P-064 | Publish to a cluster with all screens online | Full sync success |

*(Detailed: CMP-077, 086, 092, 153, 183)*

### 4.8 Campaign playback

| ID | Title | Spec |
|----|-------|------|
| CMP-P-070 | Case 1 verified over 4 loops (incl. wrap) | PB-RULE-01 |
| CMP-P-071 | Case 3 campaign-only playlist over 4 loops | PB-RULE-01 |
| CMP-P-072 | Case 4 mid-position campaign over 3 loops | PB-RULE-01 |
| CMP-P-073 | Two-campaign interleave over the full LCM(2,3)=6 cycle | PB-RULE-02 |
| CMP-P-074 | Three-layout timeline, indices 01–13 | PB-RULE-03 |

*(Detailed: CMP-141…144, 149, 150, 153, 155)*

---

## 5. Negative Test Cases

### 5.1 Blank / null / whitespace

| ID | Title | Expected |
|----|-------|----------|
| CMP-N-001 | Blank campaign name | Field-level validation error |
| CMP-N-002 | Whitespace-only name | Treated as blank, rejected |
| CMP-N-003 | `null` name via API | 400, not a 500 |
| CMP-N-004 | Missing `items` key in the create payload | 400 with a specific field error |
| CMP-N-005 | `items: []` via API | 400/422 per BR-04 |
| CMP-N-006 | `null` inside the items array | 400, no partial insert |
| CMP-N-007 | Blank folder id on create | Default to root or 400 — defined, never a 500 |
| CMP-N-008 | Whitespace-only reject reason | Rejected if the reason is mandatory |

### 5.2 Duplicates

| ID | Title | Expected |
|----|-------|----------|
| CMP-N-010 | Duplicate name in the same folder | Rejected (BR-11) |
| CMP-N-011 | Duplicate name differing only by case | Rejected |
| CMP-N-012 | Duplicate name differing only by trailing space | Rejected after trim |
| CMP-N-013 | Duplicate create request replayed (double-click / retry) | Exactly one campaign created — idempotency |
| CMP-N-014 | Same media item added twice to one campaign | Per the defined rule, applied consistently |

### 5.3 Unsupported / corrupt / missing media

| ID | Title | Expected |
|----|-------|----------|
| CMP-N-020 | Add an unsupported file type to a campaign | Rejected with a clear message |
| CMP-N-021 | Add a corrupted image | Rejected at upload, or campaign flagged — player must not crash |
| CMP-N-022 | Add a zero-byte file | Rejected |
| CMP-N-023 | Add a media item that was deleted after selection | Save rejected or item dropped with an explicit warning |
| CMP-N-024 | Media deleted after the campaign is published | Player skips gracefully (BR-14); CMS flags the campaign |
| CMP-N-025 | Media moved to a restricted folder after inclusion | Campaign behaviour defined; no silent leak to unentitled viewers |
| CMP-N-026 | Widget that fails to load at playback | Slot skipped; loop continues |

### 5.4 Invalid identifiers

| ID | Title | Expected |
|----|-------|----------|
| CMP-N-030 | GET a non-existent campaign id | 404 |
| CMP-N-031 | GET a malformed id (`abc`, `-1`, `0`) | 400 |
| CMP-N-032 | GET an extremely large id (int overflow) | 400, not a 500 |
| CMP-N-033 | Add a non-existent media id to a campaign | 400/422 |
| CMP-N-034 | Assign a campaign to a non-existent cluster | 404 |
| CMP-N-035 | Approve a non-existent approval id | 404 |
| CMP-N-036 | Move a campaign to a non-existent folder | 400/404 |

### 5.5 API manipulation & permission bypass

| ID | Title | Expected |
|----|-------|----------|
| CMP-N-040 | Create a campaign directly via API without Create permission | 403 |
| CMP-N-041 | Edit another tenant's campaign | 403/404 |
| CMP-N-042 | Publish without Publish permission via a direct API call | 403 |
| CMP-N-043 | Approve your own submission via a direct API call | 403 if segregation of duties is enforced |
| CMP-N-044 | Skip the approval gate by calling the publish endpoint directly | 403 — the gate is server-side (RSK-06) |
| CMP-N-045 | Mass-assign `owner_id` / `tenant_id` / `status` in the create payload | Ignored or rejected |
| CMP-N-046 | Set `deleted=false` on a soft-deleted campaign via PATCH | Rejected |
| CMP-N-047 | Read a campaign in a restricted folder by guessing its id | 403/404 |
| CMP-N-048 | Escalate privileges by editing your own role | 403 |

### 5.6 Session & authentication

| ID | Title | Expected |
|----|-------|----------|
| CMP-N-050 | Act with an expired session | Redirected to login; no partial write |
| CMP-N-051 | Save a campaign after the session expires mid-edit | Clear message; unsaved data preserved or explicitly discarded — never silently lost |
| CMP-N-052 | Reuse a token after logout | 401 |
| CMP-N-053 | Use a token whose role was revoked | 401/403 |
| CMP-N-054 | Tampered JWT (modified role claim) | Signature rejected, 401 |
| CMP-N-055 | Concurrent sessions for the same user, one revoked | Revocation applies to both |

### 5.7 Concurrency

| ID | Title | Expected |
|----|-------|----------|
| CMP-N-060 | Two users edit the same campaign simultaneously | Conflict detected (version/ETag) — no silent last-write-wins (RSK-07) |
| CMP-N-061 | Edit while another user deletes the same campaign | Second action gets a clear state error |
| CMP-N-062 | Reorder while another user removes an item | Consistent final state |
| CMP-N-063 | Two users add the same campaign to the same playlist | No duplicate corruption |
| CMP-N-064 | Approve and reject issued simultaneously | One deterministic winner |
| CMP-N-065 | Publish twice concurrently | One publish; no duplicate emails |

### 5.8 Publish, network & server faults

| ID | Title | Expected |
|----|-------|----------|
| CMP-N-070 | Publish with the sync service down | Explicit failure; retry available; no half state |
| CMP-N-071 | Network dropped mid-save | Save either completes or fails atomically |
| CMP-N-072 | Network dropped mid-publish | Recoverable; screens not left with partial content |
| CMP-N-073 | Backend returns 500 during create | Error surfaced; no orphan row |
| CMP-N-074 | Backend returns 502/504 during list | Retryable error state, not a white screen |
| CMP-N-075 | Slow API (10 s) during picker load | Loading state shown; no duplicate requests on impatience clicks |
| CMP-N-076 | SMTP down at approval time | Approval still recorded; email queued and retried |
| CMP-N-077 | DB constraint violation on save | Clean error; transaction rolled back |
| CMP-N-078 | Browser refresh mid-save | No duplicate campaign, no corrupt partial record |

---

## Positive / Negative balance

| Dimension | Count | Share |
|-----------|-------|-------|
| Positive (Doc 03 + CMP-P) | 118 + 42 | 54 % |
| Negative (Doc 03 + CMP-N) | 102 + 58 | 46 % |

A near 50/50 split is deliberate: per the ClickUp note *"we have made a very simple and small
implementation for now"*, the negative and edge dimensions are where the defect yield will be
highest for V1.

---

**Next:** [05-edge-cases.md](05-edge-cases.md)
