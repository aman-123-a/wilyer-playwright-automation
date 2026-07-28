# Campaigns V1 with RBAC — Defect Prediction, Risk, Regression & Coverage

**Document ID:** CMP-QA-DOC-09

---

## 22. Defect Prediction

Ranked by probability. Predictions are grounded in three signals: the feature's own mechanics,
the ClickUp note that this is *"a very simple and small implementation for now"*, and defect
patterns already observed in this codebase (playlist duration stepper bypass, library tab
selector drift, deleted-playlist crash — all present in the repo's git history).

| # | Predicted defect | Prob. | Impact | Detected by | Rationale |
|---|------------------|-------|--------|-------------|-----------|
| 1 | **Off-by-one in loop→item resolution** — first loop shows item 2, or the wrap repeats the last item | 85 % | Critical | CMP-142, 148, EDGE-035/036 | Modulo arithmetic with a 1-based loop counter is the classic error; the spec's own examples are 1-based while code will be 0-based |
| 2 | **RBAC enforced in the UI only** — the Campaigns API returns data to users without View | 80 % | Critical | CMP-110, 113, 116, 119, SEC-002 | New entity type bolted onto an existing permission engine; the repo's own RBAC comments record that Screens/Library/Playlists render empty shells while their APIs leak — the same pattern will repeat |
| 3 | **Folder inheritance not applied to campaigns** — restricted folders hide media but not campaigns | 75 % | Critical | CMP-047, 053, 054, 055, FM-03…06 | Inheritance is usually implemented per entity type; campaigns are the newest type |
| 4 | **Campaign deletable while referenced by a playlist**, leaving a dangling slot | 70 % | High | CMP-027, 085, EDGE-022 | Referential integrity for a new relation is routinely missed; the repo already carries a "deleted-playlist crash guard" commit |
| 5 | **Counter resets on every content sync**, so items 2..N never play in production | 65 % | High | CMP-164, EDGE-043, 044 | Sync usually rebuilds player state wholesale; counter persistence is an afterthought |
| 6 | **Email media count taken from the request payload, not the persisted delta** | 60 % | Medium | CMP-190 | Easiest implementation is to count what was submitted |
| 7 | **Campaign counts as N items in playlist duration** instead of one slot | 60 % | Medium | CMP-074, 064 | Duration code will naively sum children |
| 8 | **Concurrent edits silently overwrite** (no version/ETag check) | 60 % | Medium | EDGE-083, 084, CMP-N-060 | Optimistic locking is rarely in a V1 |
| 9 | **Empty campaign (0 items) publishable**, producing a blank slot on screens | 55 % | High | CMP-003, 181, EDGE-003 | BR-04 needs explicit server-side validation |
| 10 | **Approve/Reject permissions collapsed into one**, or wired to the generic publish permission | 55 % | High | CMP-122…125 | 8 distinct permissions is a lot for a "small implementation" |
| 11 | **Multi-layout rule wrong** — layout advances after 1 loop instead of LCM loops | 50 % | High | CMP-154, 157, EDGE-053, 054 | PB-RULE-03a is derived, not stated — high chance dev and spec diverge |
| 12 | **Same campaign twice in one playlist shares one counter** (or two, opposite to intent) | 50 % | Medium | CMP-070, EDGE-048 | Undefined in the spec |
| 13 | **Campaigns tab appears in the picker even without View permission** (tab rendered before the permission check) | 50 % | High | CMP-108, 053 | Picker tabs are often statically rendered |
| 14 | **Item ordinals not recompacted after removal**, leaving gaps that shift playback | 45 % | Medium | CMP-022, DB-004 | Delete-by-index bugs |
| 15 | **Stored XSS via campaign name in the approval email** | 45 % | Critical | SEC-035, CMP-018 | Email bodies are the least-escaped surface in most CMS products |
| 16 | **Soft-deleted campaign still resolvable** through a stale playlist reference | 40 % | High | CMP-220, EDGE-025 | Read filters miss one code path |
| 17 | **Duplicate approval emails** on retry (no idempotency key) | 40 % | Low | CMP-200, EDGE-089, 090 | |
| 18 | **Name uniqueness checked case-sensitively** (or not at all) | 40 % | Low | CMP-015, 016 | |
| 19 | **Cross-tenant leakage** during the TagTalk-only rollout | 35 % | Critical | CMP-138, SEC-010, EDGE-112 | Feature-flagged single-client rollouts frequently skip tenant scoping on the new endpoints |
| 20 | **Duration typed directly bypasses the 1 s floor** | 35 % | Medium | EDGE-013 | **Already an observed defect pattern in this product** — the playlist duration stepper has exactly this bug |

**Recommended first strike:** run predictions 1–5 before anything else. They are 65 %+ probability,
High/Critical impact, and all five are cheap to check (under an hour combined).

---

## 23. Risk-Based Testing

### High risk — test first, test deepest

| Area | Why | Cases | Effort |
|------|-----|-------|--------|
| **Loop/counter correctness** | The entire feature's value proposition. A wrong sequence is invisible in the CMS and only manifests on customer screens — the worst possible detection latency. Modulo + persistence + sync interaction gives three independent failure modes. | CMP-141…166, EDGE-035…056 | 30 % |
| **RBAC enforcement depth** | A UI-only check is a data breach, not a bug. New entity + existing engine is the classic gap, and the repo's own comments document this exact leak for other modules. | CMP-105…140, SEC-001…012 | 25 % |
| **Folder permission inheritance** | Same mechanism, different axis. Restricted-folder leakage exposes content the customer explicitly fenced off. | CMP-035…062, FM-01…28 | 15 % |
| **Referential integrity on delete** | Player crashes and white screens are field-visible and expensive. This product has prior art for exactly this failure. | CMP-027, 085, EDGE-019…034 | 10 % |
| **Approval bypass** | Publishing without approval defeats the control the feature exists to provide. | CMP-121, SEC-007, 008 | 5 % |

### Medium risk

| Area | Why | Cases |
|------|-----|-------|
| Email content accuracy | Wrong counts erode trust in the approval process, but no data loss | CMP-187…202 |
| Cluster sync & retry | Recoverable; failures are visible and retryable | CMP-089…104 |
| Concurrency / lost updates | Real but low frequency at current user counts | EDGE-083…094 |
| Playlist duration calculation | Cosmetic-to-operational; wrong scheduling estimates | CMP-074 |
| Search / filter / pagination | Annoying, not dangerous; parity with Media limits the blast radius | CMP-203…213 |
| Performance at scale | Current tenant (TagTalk) is single-client; scale risk is deferred but real | PERF-001…042 |

### Low risk

| Area | Why | Cases |
|------|-----|-------|
| Unicode / emoji / RTL rendering | Cosmetic; unlikely to block a customer | CMP-012…014, EDGE-095…104 |
| Email client rendering matrix | Degrades gracefully; plain-text fallback exists | CMP-198, 199 |
| Breadcrumb / empty states | Cosmetic | CMP-058, 059 |
| Clone/duplicate campaign | Convenience feature, may not exist in V1 | CMP-025 |
| Import/export round-trip | Likely out of scope for V1 | EDGE-107…110 |

### Effort allocation

| Risk band | Test effort | Case share |
|-----------|-------------|-----------|
| High | 70 % | 45 % of cases |
| Medium | 25 % | 38 % |
| Low | 5 % | 17 % |

Deliberately disproportionate: high-risk areas get depth (multiple probes per behaviour, four-layer
RBAC verification), low-risk areas get a single confirmatory pass.

---

## 24. Regression Checklist

### 24.1 Campaigns feature regression (run before every release)

**Smoke — 12 cases, ~5 min**
- [ ] Campaigns list loads; Campaigns tab present in the playlist picker (CMP-063)
- [ ] Create a campaign with 3 items (CMP-001)
- [ ] Reorder items and verify persistence (CMP-021)
- [ ] Insert a campaign into a playlist and save (CMP-064)
- [ ] Remove a campaign from a playlist (CMP-068)
- [ ] Publish a playlist containing a campaign (CMP-086)
- [ ] Delete an unused campaign (CMP-026)
- [ ] Campaigns permission section exists in the role editor (CMP-105)
- [ ] View granted → list visible (CMP-107)
- [ ] View revoked → nav hidden and API 403 (CMP-108, 110)
- [ ] Campaign-only playlist plays X, Y, Z (CMP-143)
- [ ] Approval email received with the correct body (CMP-189)

**Core functional — 35 cases**
- [ ] All CRUD validation: blank, whitespace, duplicate, length bounds (CMP-003, 009, 010, 015, 016)
- [ ] Mixed image/video/widget campaign (CMP-030)
- [ ] Per-item duration with the 1 s floor (CMP-034)
- [ ] Folder create/move/copy/rename/delete (CMP-035, 038, 040, 042, 043)
- [ ] Restricted folder hides campaigns in list, picker, search and API (CMP-047, 053, 054, 055)
- [ ] Permission inheritance and explicit child override (CMP-049, 050)
- [ ] Multiple campaigns in one playlist (CMP-071)
- [ ] Same campaign across two playlists (CMP-073)
- [ ] Editing a campaign propagates to all referencing playlists (CMP-084)
- [ ] Deleting an in-use campaign is handled per BR-08 (CMP-027, 085)
- [ ] Cluster assign, sync, remove (CMP-089, 092, 090)
- [ ] Offline screen syncs on reconnect (CMP-094)

**RBAC — full 8-permission matrix, 36 cases**
- [ ] Each of View/Create/Edit/Delete/Publish/Approve/Reject/Folder verified at UI **and** API layers
- [ ] Role ∩ folder truth table (CMP-132, 133, 134)
- [ ] Permission change effective without re-login (CMP-135)
- [ ] Stale token rejected after revocation (CMP-136)
- [ ] Cross-tenant access blocked (CMP-138)

**Playback — 14 automatable cases**
- [ ] Spec Case 1, Case 3, Case 4 exactly as documented (CMP-141, 143, 144)
- [ ] Wrap boundary over 3 full cycles (CMP-148)
- [ ] Two-campaign independence over LCM(2,3)=6 loops (CMP-149, 150)
- [ ] Multi-layout timeline indices 01–13 (CMP-153, 155)
- [ ] No skipped and no duplicated media in a full cycle (CMP-159, 160)

**Approval & email — 20 cases**
- [ ] Pending → approve → publish (CMP-167, 170)
- [ ] Pending → reject → not published (CMP-171)
- [ ] Submitter cannot self-approve (CMP-173)
- [ ] Email body, count, screens, campaign name, source label (CMP-189…193)
- [ ] Exactly one email per change set (CMP-200)

### 24.2 Cross-feature regression (campaigns must not break existing modules)

- [ ] Media library CRUD, search, folders unchanged (`tests/library/library.spec.ts`)
- [ ] Playlists without campaigns behave exactly as before (`tests/playlists/playlists.spec.ts`)
- [ ] Playlist duration for non-campaign playlists unchanged (`playlist-duration.spec.ts`)
- [ ] Existing RBAC matrix still passes (`tests/permissions/rbac-data-driven.spec.ts`)
- [ ] Media Sets unaffected (`tests/media-sets/*`)
- [ ] Prayer Schedule media picker unaffected — it shares the picker component (`prayer-media-picker.spec.ts`)
- [ ] Screens, Groups, Clusters listings unchanged
- [ ] Content Publish Approval email for Sequences/Slides still correct (campaigns added a new source label)
- [ ] Existing approval queue entries render correctly alongside campaign entries
- [ ] Role editor still saves non-campaign sections correctly (`PUT /role/update`)
- [ ] Dashboard counts and reports unaffected
- [ ] No new console errors on any existing page (`consoleMonitor`)
- [ ] No new failing API calls on existing flows (`apiMonitor`)

### 24.3 Environment checklist before each run

- [ ] Correct branch checked out for the target server (`BRANCHES.md`) — currently `cms2` → `https://cms2.pocsample.in`
- [ ] `cms-e2e/.env` populated with admin + sub-user credentials (never committed)
- [ ] Role fixtures seeded (DEP-10)
- [ ] Test folders `F_PUBLIC`, `F_RESTRICTED`, `F_PARENT/F_CHILD_*` exist
- [ ] ≥ 2 screens online, ≥ 1 cluster registered
- [ ] Test inbox reachable (DEP-08) or email cases marked skipped, not silently passed
- [ ] `CMS_ALLOW_DESTRUCTIVE=true` on test environments only — never on `live`

---

## 25. Final Coverage Summary

### 25.1 Coverage by dimension

| Dimension | Target | Achieved | Basis |
|-----------|--------|----------|-------|
| **Functional coverage** | 95 % | **97 %** | 51 of 53 requirements fully covered; 2 partial (FR-CMP-07 clone, FR-PL-07 duration basis) |
| **Negative coverage** | 80 % | **88 %** | 160 negative cases across 8 fault classes; gaps only where infrastructure is missing |
| **Edge coverage** | 70 % | **85 %** | 112 edge cases; unreached areas are physical (power failure, hardware clock) |
| **Automation coverage** | 80 % | **86 %** | 396 of 462 cases automatable; the rest need devices, email clients or DB access |
| **Risk coverage** | 100 % | **100 %** | All 12 identified risks have ≥ 2 mitigating cases (Doc 06 §21.2) |
| **RBAC matrix coverage** | 100 % | **100 %** | 9 roles × 9 permissions = 81 cells, each with a defined verification layer |
| **Security (OWASP Top 10)** | 100 % of applicable | **100 %** | A01, A02, A03, A04, A05, A07, A08 covered; A06/A09/A10 are infra-level, out of feature scope |

### 25.2 Volume summary

| Artefact | Count |
|----------|-------|
| Requirements defined | 53 (FR) + 14 (BR) + 4 (PB-RULE) |
| Assumptions flagged for Product | 15 |
| Risks identified | 12 |
| Test scenarios | 302 |
| Detailed test cases | 220 |
| Positive cases (incl. dimension-only) | 160 |
| Negative cases (incl. dimension-only) | 160 |
| Edge cases | 112 |
| API cases | 54 |
| Security cases | 60 |
| Performance cases | 42 |
| DB / audit cases | 32 |
| RBAC matrix cells | 81 |
| Folder matrix rows | 28 |
| **Total distinct test items** | **~880** |

### 25.3 Execution estimate

| Phase | Scope | Effort |
|-------|-------|--------|
| Test data & environment setup | Roles, folders, media, screens, inbox | 2 days |
| Automation framework extension | Page objects, fixtures, API + playback helpers | 4 days |
| P0 automation | 90 critical cases | 5 days |
| P1 automation | 130 cases | 6 days |
| Manual exploratory + device playback | Charters, on-device verification | 3 days |
| Security pass | 60 cases | 2 days |
| Performance pass | Load + soak | 2 days |
| **Total** | | **24 person-days** |

### 25.4 Exit criteria

Ship only when **all** hold:

1. 100 % of P0/S1 cases executed, 100 % pass.
2. Zero open Critical or High defects; Medium defects triaged with owners and dates.
3. All 81 RBAC matrix cells verified at both the UI and API layers — no cell proven at the UI layer alone.
4. Playback verified against every case in `playback_logic.txt` (Cases 1, 3, 4; the multi-campaign matrix; the multi-layout timeline) with zero deviation.
5. Folder restriction verified with a genuinely restricted account, including a direct API probe.
6. Approval email verified for content **and** count against the persisted database delta.
7. Media-parity checks (PB-RULE-04) pass — no divergence between campaign and media behaviour.
8. Regression pack green, including the cross-feature checklist in §24.2.
9. All 15 assumptions confirmed or converted into defects/change requests.
10. Automation suite green in CI with a flake rate below 2 % over 5 consecutive runs.

### 25.5 Blocking questions for Product

These change expected results, so they are answered before execution — not after a test fails:

1. **PB-RULE-03a** — does a layout repeat for `LCM(its campaign lengths)` loops before advancing, or advance after a single loop? *(The timeline in `playback_logic.txt` implies the former; it is never stated.)*
2. **CMP-070 / EDGE-048** — when the same campaign appears twice in one playlist, do both slots show the same item in a given loop, or advance independently?
3. **AS-09 / CMP-163** — does the loop counter persist across a player restart, or reset to item 1?
4. **AS-01 / CMP-165** — is the counter per screen, or shared by all screens playing the same playlist?
5. **FR-PL-07 / CMP-074** — how is playlist total duration computed when a slot is a campaign of N items with different durations?
6. **AS-07 / CMP-173** — is segregation of duties (submitter ≠ approver) enforced in V1?
7. **AS-04 / CMP-004** — what is the maximum number of items per campaign?
8. **BR-08 / CMP-027** — is deleting an in-use campaign blocked outright, or allowed with a warning?
9. **EDGE-072** — for a user in two roles with conflicting campaign permissions, is the result the union or the intersection?
10. **EDGE-112** — is the feature flag-gated to TagTalk, and what is the general-availability path?

---

## Document set

| Doc | Contents |
|-----|----------|
| [01-requirement-analysis.md](01-requirement-analysis.md) | Requirements, playback spec, business rules, assumptions, risks, dependencies, scope |
| [02-test-scenarios.md](02-test-scenarios.md) | 302 scenarios grouped by module |
| [03-detailed-test-cases.md](03-detailed-test-cases.md) | CMP-001…220 with full 13-column detail |
| [04-positive-negative.md](04-positive-negative.md) | Positive and negative dimensions |
| [05-edge-cases.md](05-edge-cases.md) | CMP-EDGE-001…112 by failure mechanism |
| [06-matrices.md](06-matrices.md) | RBAC matrix, folder matrix, traceability |
| [07-api-security-performance.md](07-api-security-performance.md) | API, DB, audit, security, performance |
| [08-automation-plan.md](08-automation-plan.md) | Playwright structure, POMs, fixtures, test data |
| [09-summary.md](09-summary.md) | Defect prediction, risk, regression, coverage |
| [test-cases.csv](test-cases.csv) | Import-ready for Excel / TestRail / Jira / Zephyr / Xray |
