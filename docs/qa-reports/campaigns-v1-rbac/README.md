# Campaigns V1 with RBAC — Enterprise QA Test Suite

**Feature:** Campaigns Version 1 with RBAC (Wilyer Signage CMS)
**Source of truth:** ClickUp *CMS / 2026 Sprints / Campaigns → Version-1 with RBAC* (created 2026-07-24, tagged **Urgent Features**) plus its `playback_logic.txt` attachment
**Target environment:** `https://cms2.pocsample.in` (branch `cms2` — updated code confirmed by the team)
**Date:** 2026-07-28
**Standards:** ISTQB test design · ISO/IEC 25010 · OWASP Top 10 (2021)

---

## Documents

| # | Document | Contents |
|---|----------|----------|
| 01 | [Requirement Analysis](01-requirement-analysis.md) | Functional requirements (53), **authoritative playback spec (PB-RULE-01…04)**, business rules (14), assumptions (15), risks (12), dependencies, out of scope, ISO 25010 map |
| 02 | [Test Scenarios](02-test-scenarios.md) | 302 scenarios grouped across 16 modules |
| 03 | [Detailed Test Cases](03-detailed-test-cases.md) | CMP-001 … CMP-220, full 13-column format |
| 04 | [Positive & Negative](04-positive-negative.md) | Happy-path and fault-injection dimensions |
| 05 | [Edge Cases](05-edge-cases.md) | CMP-EDGE-001 … CMP-EDGE-112, grouped by failure mechanism, probability-ranked |
| 06 | [Matrices](06-matrices.md) | RBAC matrix (9 roles × 9 permissions), folder permission matrix (28 rows), traceability |
| 07 | [API, Security & Performance](07-api-security-performance.md) | 54 API · 18 DB · 14 audit · 60 security · 42 performance cases |
| 08 | [Automation Plan](08-automation-plan.md) | Playwright structure, POM contracts, fixtures, playback assertions, test data |
| 09 | [Summary](09-summary.md) | Defect prediction, risk-based testing, regression checklist, coverage, exit criteria |
| — | [test-cases.csv](test-cases.csv) | 332 rows — import-ready for Excel / TestRail / Jira / Zephyr / Xray |

---

## What the playback attachment settles

`playback_logic.txt` is authoritative and resolves ambiguity the task description left open:

1. **Independent counters.** Parallel campaigns advance separately and wrap at their own length.
   CampA(2) + CampB(3) produces a full cycle of **LCM(2,3) = 6** loops.
2. **Layout exhaustion.** In the multi-layout timeline a layout repeats until its campaigns are
   exhausted (Layout 0 = 3 loops, Layout 1 = 2, Layout 2 = 4), then playback advances and finally
   wraps to Layout 0. This rule is **derived, not stated** — question #1 for Product.
3. **Campaign-only playlists are valid** (spec Case 3).
4. **Media parity** — Sameer's note *"we need to make sure we are following the same behaviour of
   Media files for Campaigns"* is treated as an acceptance oracle: folder, search, filter, move,
   copy, delete and permission cases are run twice (media vs campaign) and compared.

## Where the defects will be

Top five predictions, all ≥ 65 % probability with High/Critical impact — run these first:

1. Off-by-one in loop→item resolution (85 %)
2. RBAC enforced in the UI only, API leaks campaign data (80 %)
3. Folder inheritance not applied to the new entity type (75 %)
4. In-use campaign deletable, leaving a dangling playlist slot (70 %)
5. Loop counter reset on every content sync, so later items never play (65 %)

Full ranked list of 20 in [09-summary.md §22](09-summary.md).

## Ten blocking questions for Product

Answers change expected results, so they are needed **before** execution — see
[09-summary.md §25.5](09-summary.md). The two most important: the layout-repeat rule (PB-RULE-03a)
and whether the loop counter persists across a player restart.

---

## Coverage

| Dimension | Achieved |
|-----------|----------|
| Functional | 97 % |
| Negative | 88 % |
| Edge | 85 % |
| Automation | 86 % (396 of 462) |
| Risk | 100 % (all 12 risks ≥ 2 cases) |
| RBAC matrix | 100 % (81 cells) |
| OWASP Top 10 (applicable) | 100 % |

**~880 distinct test items · 24 person-days estimated**

## Non-negotiable testing rule

Every denied permission must be proven at **four layers** — UI control hidden/disabled, direct
route blocked, API 403, and no entity data in any response body. A permission proven denied at
the UI layer alone is **not tested**. This mirrors the pattern already established in
`cms-e2e/tests/permissions/rbac-data-driven.spec.ts`, whose own comments document that several
existing modules render an empty shell while their data APIs quietly return 403 — campaigns must
not repeat that gap silently.
