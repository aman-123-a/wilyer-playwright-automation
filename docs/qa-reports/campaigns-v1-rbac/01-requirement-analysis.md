# Campaigns V1 with RBAC — Requirement Analysis

**Document ID:** CMP-QA-DOC-01
**Feature:** Campaigns Version 1 with RBAC
**Product:** Wilyer Signage CMS
**Author:** QA Architecture
**Date:** 2026-07-28
**Standards applied:** ISTQB Foundation/Advanced test design, ISO/IEC 25010 product quality model, OWASP ASVS + Top 10 (2021)

---

## 1.1 Feature Summary

A **Campaign** is a *variant container* of media items placed as a single slot inside a loop
(playlist or cluster content list). On each playback loop the campaign slot resolves to the
**next** item in its own ordered list, cycling modulo the campaign length.

**Canonical example (from the specification):**

Playlist loop = `[Image A, Campaign, Video B, Widget C]`
Campaign items = `[Image1, Image2, Image3, Image4]`

| Loop | Position 1 | Position 2 (Campaign) | Position 3 | Position 4 |
|------|-----------|-----------------------|-----------|-----------|
| 1 | Image A | Image1 | Video B | Widget C |
| 2 | Image A | Image2 | Video B | Widget C |
| 3 | Image A | Image3 | Video B | Widget C |
| 4 | Image A | Image4 | Video B | Widget C |
| 5 | Image A | **Image1** (wrap) | Video B | Widget C |

**Resolution rule (derived, must be confirmed with Product):**
`item_index = (loop_counter - 1) mod campaign_length`

This single formula is the highest-value invariant in the whole feature — most playback defects
will be an off-by-one, a non-persisted counter, or a counter that resets on the wrong event.

---

## 1.1a Authoritative Playback Specification

Source: `playback_logic.txt` attached to ClickUp task *Campaigns → Version-1 with RBAC*
(CMS / 2026 Sprints, created 2026-07-24). **This file overrides any inference below.**

### PB-RULE-01 — Single campaign in a loop

```
Case 1: file1 + widget1 + Campaign(A,B,C)
  Loop 1: file1, widget1, A
  Loop 2: file1, widget1, B
  Loop 3: file1, widget1, C

Case 3: Campaign(X,Y,Z) only
  Loop 1: X    Loop 2: Y    Loop 3: Z

Case 4: file1 + Campaign(c1,c2,c3) + file2 + file3
  Loop 1: file1, c1, file2, file3
  Loop 2: file1, c2, file2, file3
  Loop 3: file1, c3, file2, file3
```

Static items replay every loop; the campaign slot advances one item per loop.
A campaign-only playlist is explicitly valid (Case 3).

### PB-RULE-02 — Multi-campaign interleaving (independent counters)

> *"Parallel campaigns advance independently and wrap around automatically."*

CampA = `[A1, A2]` (length 2), CampB = `[B1, B2, B3]` (length 3):

| Loop | CampA slot | CampB slot | Note |
|------|-----------|-----------|------|
| 1 | A1 | B1 | |
| 2 | A2 | B2 | |
| 3 | **A1** | B3 | CampA wrapped |
| 4 | A2 | **B1** | CampB wrapped |
| 5 | A1 | B2 | |
| 6 | A2 | B3 | full cycle = **LCM(2,3) = 6** |

**Each campaign owns its own counter.** There is no shared/global pointer. The pattern
repeats every `LCM(len₁, len₂, … lenₙ)` loops — this LCM is the single most important
derived value for playback verification and is used throughout Doc 05 §11.

### PB-RULE-03 — Multi-layout chronological playback

> Sequential flow Layout 0 → Layout 1 → Layout 2, then back to the start.

| Index | Layout | Source | Played |
|-------|--------|--------|--------|
| 01 | Layout 0 | Static | file1 |
| 02 | Layout 0 | CampA `[A,B,C]` | A |
| 03 | Layout 0 | Static | file1 |
| 04 | Layout 0 | CampA | B |
| 05 | Layout 0 | Static | file1 |
| 06 | Layout 0 | CampA | C |
| 07 | Layout 1 | CampB `[X,Y]` | X |
| 08 | Layout 1 | CampB | Y |
| 09 | Layout 2 | CampC `[m,n,o,p]` | m |
| 10 | Layout 2 | CampC | n |
| 11 | Layout 2 | CampC | o |
| 12 | Layout 2 | CampC | p |
| → | | | **repeat from index 01** |

**Derived rule (PB-RULE-03a):** a layout repeats for `LCM(campaign lengths in that layout)`
loops — exhausting its campaigns — *before* playback advances to the next layout.
Layout 0 ran 3 loops (CampA len 3), Layout 1 ran 2 (len 2), Layout 2 ran 4 (len 4).
A layout with **no** campaign therefore plays exactly once per cycle. This rule is
**derived, not stated verbatim** — it is the highest-priority item to confirm with
Product, and CMP-151…CMP-160 are written to prove or disprove it.

### PB-RULE-04 — Parity with Media files

> Sameer Vashisth, 2026-07-27: *"We need to make sure, we are following the same
> behaviour of Media files for Campaigns."*

This elevates **behavioural parity with Media** to an acceptance oracle. Wherever this
suite says "same as Media", the test must be executed **twice** — once against a Media
file and once against a Campaign — and the two results compared. Divergence is a defect
even where the campaign behaviour is independently reasonable. Applies to: folder
placement, folder restriction, search, filter, sort, pagination, move/copy, rename,
delete, permission inheritance, and picker presentation.

### Context & scope constraints (from task activity)

| Note | Source | Testing impact |
|------|--------|----------------|
| *"Campaigns are being made for TagTalk Client specifically right now"* | Sameer, 2026-07-24 | Tenant-scoped rollout — verify no cross-tenant leakage; confirm whether the feature is flag-gated per client |
| *"We have made a very simple and small implementation for now"* | Sameer, 2026-07-24 | Expect thin validation and missing edge handling — the negative/edge sections (Doc 03) carry the highest defect yield |
| Task filed under **Urgent Features** | 2026-07-24 | Prioritise P0 smoke + RBAC + playback correctness first; defer P2/P3 |

---

## 1.2 Functional Requirements

Requirement IDs are used by the Traceability Matrix (Doc 04).

### FR-CMP — Campaign entity & CRUD

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CMP-01 | User can create a campaign with a unique name within its folder scope | P0 |
| FR-CMP-02 | User can add ordered media items (image, video, widget) to a campaign | P0 |
| FR-CMP-03 | User can reorder campaign items; order defines the loop variant sequence | P0 |
| FR-CMP-04 | User can remove an item from a campaign | P0 |
| FR-CMP-05 | User can edit campaign metadata (name, description, per-item duration) | P1 |
| FR-CMP-06 | User can delete a campaign (soft delete, recoverable per retention policy) | P0 |
| FR-CMP-07 | User can duplicate/clone a campaign | P2 |
| FR-CMP-08 | Campaign list supports search, filter (type/owner/folder/status) and sort | P1 |
| FR-CMP-09 | Campaign list supports pagination consistent with Media/Widgets listings | P1 |
| FR-CMP-10 | Campaign supports a minimum of 1 item and a defined maximum (see AS-04) | P1 |

### FR-FLD — Folder system

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-FLD-01 | Campaigns live in the same folder tree used by Media and Widgets | P0 |
| FR-FLD-02 | Folder restrictions apply to campaigns identically to Media/Widgets | P0 |
| FR-FLD-03 | Permission inheritance flows parent → child folder | P0 |
| FR-FLD-04 | A campaign can be moved between folders (subject to permission on both) | P1 |
| FR-FLD-05 | A campaign can be copied to another folder | P2 |
| FR-FLD-06 | Deleting/renaming a folder handles contained campaigns per Media rules | P1 |
| FR-FLD-07 | A user with no access to a folder sees neither the folder nor its campaigns | P0 |

### FR-PL — Playlist integration

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PL-01 | Campaigns appear as a dedicated tab in the playlist media picker | P0 |
| FR-PL-02 | A campaign can be inserted into a playlist zone at any position | P0 |
| FR-PL-03 | A campaign can be removed from a playlist | P0 |
| FR-PL-04 | Multiple distinct campaigns can coexist in one playlist | P1 |
| FR-PL-05 | The same campaign can be inserted more than once in one playlist | P1 |
| FR-PL-06 | The same campaign can be used across multiple playlists | P0 |
| FR-PL-07 | Playlist duration calculation accounts for the campaign slot | P1 |
| FR-PL-08 | Only campaigns visible to the acting user appear in the picker | P0 |

### FR-CL — Cluster integration

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CL-01 | Campaigns can be assigned to clusters with playlist-equivalent behaviour | P0 |
| FR-CL-02 | Campaign changes propagate (sync) to all screens in the cluster | P0 |
| FR-CL-03 | Sync failures are surfaced, retryable, and do not corrupt player state | P0 |
| FR-CL-04 | Offline screens receive the campaign on reconnect | P1 |

### FR-RBAC — Role Based Access Control

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-RBAC-01 | Campaign permission set = View, Create, Edit, Delete, Publish, Approve, Reject, Folder Permission | P0 |
| FR-RBAC-02 | Each permission is independently grantable/revocable per role | P0 |
| FR-RBAC-03 | Permissions enforced server-side on every API, not only in the UI | P0 |
| FR-RBAC-04 | Effective permission = role permission ∩ folder permission | P0 |
| FR-RBAC-05 | Permission changes take effect without requiring the target user to re-login, or the session is invalidated | P0 |
| FR-RBAC-06 | Approve and Reject cannot be exercised by the same user who submitted (segregation of duties) — **to be confirmed, see AS-07** | P1 |
| FR-RBAC-07 | UI controls for unavailable actions are hidden or disabled — never visible-and-actionable | P1 |

### FR-APR — Approval / publish workflow

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-APR-01 | Campaign changes enter a Content Publish Approval flow | P0 |
| FR-APR-02 | Approver can approve; content then publishes to screens | P0 |
| FR-APR-03 | Approver can reject with a reason; content does not publish | P0 |
| FR-APR-04 | Pending state is visible to submitter and approver | P1 |
| FR-APR-05 | Approval decisions are audit-logged with actor and timestamp | P0 |

### FR-EML — Content Publish Approval email

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-EML-01 | Every campaign change triggers a Content Publish Approval email | P0 |
| FR-EML-02 | Body states the media delta and affected screens, e.g. *"3 Media files are being added/removed from these Screen(s) through Campaigns"* | P0 |
| FR-EML-03 | Email names the campaign(s) involved | P1 |
| FR-EML-04 | Email distinguishes the change source: Campaigns / Sequences / Slide / etc. | P1 |
| FR-EML-05 | Media count in the email matches the actual persisted delta | P0 |
| FR-EML-06 | Email renders correctly in major clients and on mobile | P2 |
| FR-EML-07 | Failed sends are retried; no duplicate emails for a single change | P1 |

### FR-AUD — Audit

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AUD-01 | Create, Update, Delete, Approve, Reject, Publish, Restore are logged | P0 |
| FR-AUD-02 | Each entry records actor, timestamp (UTC), entity id, before/after delta | P1 |
| FR-AUD-03 | Audit entries are immutable and readable only with permission | P1 |

---

## 1.3 Business Rules

| ID | Rule |
|----|------|
| BR-01 | A campaign occupies exactly **one** slot in a loop regardless of how many items it holds. |
| BR-02 | The campaign advances **one** item per completed loop — not per item, not per screen refresh. |
| BR-03 | When the campaign pointer passes the last item it wraps to the first (`mod` semantics, BR-02). |
| BR-04 | A campaign must contain ≥ 1 playable item to be publishable. |
| BR-05 | Campaign visibility is governed by the folder tree, exactly as Media and Widgets. |
| BR-06 | Effective access = role permission **AND** folder permission. Neither alone grants access. |
| BR-07 | A restricted folder hides its campaigns from the picker, list, search, and API. |
| BR-08 | Deleting a campaign in use by a playlist/cluster must be blocked, or must degrade safely with an explicit warning — never a player crash. |
| BR-09 | Publishing requires Publish permission; approval requires Approve permission; the two are distinct. |
| BR-10 | Every publish-affecting change generates exactly one approval notification per change set. |
| BR-11 | Campaign names are unique within a folder (case-insensitive, trimmed) — **to be confirmed, AS-02**. |
| BR-12 | Soft-deleted campaigns are excluded from all listings, pickers, and playback resolution. |
| BR-13 | Per-item duration inside a campaign follows the same rules as playlist slide duration (min 1s floor). |
| BR-14 | Player must degrade gracefully (skip and continue) if a campaign item is unavailable at playback time. |

---

## 1.4 Assumptions

Assumptions are **testable claims awaiting Product confirmation**. Each one that proves false
invalidates the linked test cases — they are called out so the suite fails loudly rather than silently.

| ID | Assumption | Impact if wrong |
|----|------------|-----------------|
| AS-01 | ~~Loop counter is per screen/player~~ **CONFIRMED by PB-RULE-02:** each campaign owns an independent counter. Still open: whether that counter is per-screen or shared across screens playing the same playlist | Multi-screen tests (CMP-141…150) change entirely |
| AS-01b | **PB-RULE-03a (derived):** a layout repeats for `LCM(campaign lengths)` loops before advancing to the next layout | Multi-layout cases CMP-151…160 invert; highest-priority Product confirmation |
| AS-01c | Full playback cycle length = `LCM` of all campaign lengths in scope | All loop-count expectations in Doc 05 §11 must be recomputed |
| AS-02 | Campaign name uniqueness is scoped per folder, case-insensitive | Duplicate-name cases CMP-014…017 change expected result |
| AS-03 | Campaign items may mix images, videos and widgets freely | Mixed-type cases CMP-031…038 become negative tests |
| AS-04 | An upper bound exists on items per campaign (assumed 1000 for the stress cases) | Scale cases CMP-EDGE-011…014 need a new bound |
| AS-05 | Soft delete is used; a deleted flag exists in the campaign table | DB validation section 14 changes |
| AS-06 | Approval workflow is the existing Content Publish Approval, extended — not a new engine | Approval cases reuse existing fixtures |
| AS-07 | Segregation of duties (submitter ≠ approver) is enforced | FR-RBAC-06 cases become informational |
| AS-08 | Player firmware supports campaign resolution; CMS-only change is insufficient | Playback section 11 must run on real hardware |
| AS-09 | Loop counter survives player restart (persisted), otherwise it resets to item 1 | CMP-EDGE-041…048 expected results invert |
| AS-10 | Campaign APIs live under `/campaign/*` mirroring `/cluster/read`, `/role/update` conventions observed in the existing suite | API section 13 endpoint names need remapping |
| AS-11 | Timezone handling for scheduled publishes uses the screen's local timezone | DST/timezone edges CMP-EDGE-061…070 change |
| AS-12 | Nested folders are supported to arbitrary depth | Folder matrix depth cases change |

---

## 1.5 Risks

| ID | Risk | Likelihood | Impact | Exposure | Mitigation |
|----|------|-----------|--------|----------|------------|
| RSK-01 | Off-by-one in loop→item resolution (starts at item 2, or repeats item 1 twice on wrap) | High | High | **Critical** | Dedicated playback matrix, loops 1..N+2 asserted explicitly |
| RSK-02 | RBAC enforced in UI only; API leaks campaign data to unauthorised users | High | Critical | **Critical** | Every RBAC UI case paired with a direct API probe (pattern already in `rbac-data-driven.spec.ts`) |
| RSK-03 | Folder permission inheritance not applied to the new entity type (campaigns) because it was bolted on after Media/Widgets | High | Critical | **Critical** | Full folder × role matrix (Doc 04), not spot checks |
| RSK-04 | Deleting media that a campaign references crashes the player or the editor | Medium | High | High | Referential-integrity edges CMP-EDGE-021…030 |
| RSK-05 | Email media count computed from the request payload rather than the persisted delta | Medium | Medium | Medium | Assert email count against DB delta, not against the UI |
| RSK-06 | Approval bypass — direct publish API call skips the approval gate | Medium | Critical | **Critical** | Security section 16, IDOR/broken-access cases |
| RSK-07 | Concurrent edits to the same campaign silently overwrite (last-write-wins, no version check) | High | Medium | High | Concurrency edges CMP-EDGE-081…090 |
| RSK-08 | Performance collapse when a folder holds thousands of campaigns (no pagination on picker) | Medium | Medium | Medium | Performance section 17 |
| RSK-09 | Loop counter resets on every content sync, so late items never play | Medium | High | High | CMP-EDGE-041…050 |
| RSK-10 | Campaign in multiple playlists shares one counter, desynchronising screens | Medium | High | High | AS-01 verification cases |
| RSK-11 | Soft-deleted campaigns still resolvable through a stale playlist reference | Medium | High | High | BR-12 cases |
| RSK-12 | Duplicate approval emails on retry (no idempotency key) | Medium | Low | Low | FR-EML-07 cases |

---

## 1.6 Dependencies

| ID | Dependency | Type | Notes |
|----|-----------|------|-------|
| DEP-01 | Folder system (Media/Widgets) | Internal | Campaign folder behaviour must match exactly |
| DEP-02 | RBAC role engine + `PUT /role/update` | Internal | Existing section-based permission UI |
| DEP-03 | Content Publish Approval workflow & mailer | Internal | Extended, not replaced (AS-06) |
| DEP-04 | Player firmware / signage runtime | External | Loop resolution executes on-device (AS-08) |
| DEP-05 | Cluster sync service | Internal | Delivery of campaign payloads |
| DEP-06 | Media library storage/CDN | Internal | Item availability at playback |
| DEP-07 | Audit log service | Internal | Section 15 |
| DEP-08 | SMTP / email provider + a test inbox (Mailhog/Mailtrap or API access) | External | **Blocking for automated email assertions** |
| DEP-09 | Test environment with ≥ 2 screens and 1 cluster | Environment | Playback + sync validation |
| DEP-10 | Seeded role set (9 roles, section 7) and matching sub-user accounts | Test data | **Blocking for the RBAC matrix** |
| DEP-11 | DB read access for section 14 validation | Environment | Otherwise those cases are manual/deferred |

---

## 1.7 Out of Scope (V1)

- Campaign scheduling by date range / dayparting (unless explicitly added).
- Campaign-level analytics and proof-of-play reporting.
- A/B testing, weighting or randomised variant selection (V1 is strictly sequential).
- Cross-tenant campaign sharing.
- Campaign templating / dynamic data binding.
- Player firmware upgrade path testing.
- Localisation of the approval email body beyond the default language.
- Migration of existing Sequences into Campaigns.

---

## 1.8 ISO/IEC 25010 Coverage Map

| Characteristic | Addressed by | Doc |
|----------------|-------------|-----|
| Functional suitability | CRUD, playlist, cluster, playback, approval cases | 02, 03, 05 |
| Performance efficiency | Load, latency, bulk publish, concurrency | 06 |
| Compatibility | Email client rendering, browser matrix, player models | 05, 06 |
| Usability | UX cases, empty states, error messaging, accessibility | 03, 06 |
| Reliability | Offline sync, retry, rollback, power failure, restart | 03 (edges), 05 |
| Security | RBAC, OWASP Top 10, IDOR, JWT, mass assignment | 06 |
| Maintainability | Automation plan, POM structure, fixture reuse | 07 |
| Portability | Multi-browser, multi-device player, timezone/DST | 03, 06 |

---

**Next:** [02-test-scenarios.md](02-test-scenarios.md) — 200+ scenarios grouped by module.
