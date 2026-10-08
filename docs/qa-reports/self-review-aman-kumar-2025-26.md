# Annual Self-Review — Aman Kumar, QA Engineer

**Review period:** 7 Aug 2025 – 23 Jul 2026 · **Team:** CMS / Wilyer Signage · **Date:** 23 Jul 2026

## Headline impact

Over the review period I reported **948 issues — 55% of everything the entire team logged** (1,724 workspace tasks), nearly double the next contributor. **608 of my reports (64%) have already shipped as fixes**, directly improving product quality across six platforms. Every figure below is verifiable in ClickUp (workspace: Wilyer Private Limited, CMS space).

## Scope of ownership

- **Platforms:** CMS POC Sample (cms.pocsample.in), CMS Live (Wilyer Signage), Android Player, LG webOS, Samsung Tizen, BrightSign / Raspberry Pi, Windows, On-Premise
- **Modules:** RBAC / Group-in-Group, folder system, playlists, screens, widgets, Media Sets, Prayer Schedule, rollout, reports, direct file publish
- **Beyond manual QA:** built and maintain Playwright E2E automation (cms-e2e suite, RBAC role-permission specs, Media Sets, Prayer Schedule), page-object architecture, CI workflow, and ClickUp reporting tooling

## Key wins

| Win | Evidence |
|---|---|
| Drove POC Sample to near-zero defect backlog | 171 of 174 issues resolved (**98%**) |
| Owned QA for the year's biggest initiative — RBAC / Group-in-Group | 210 issues found (incl. 54 merge bugs), **93% fixed before release** |
| Sustained release-crunch regression sweeps | 179 issues in Jul 2026 alone (RBAC merge + POC regression); 154 in Apr 2026 |
| High-signal reporting | 64% of all my reports converted into shipped fixes |
| Test automation as an engineering contribution | Playwright E2E suites with fixtures, page objects and CI; structured test reports (auto-login widgets, media sets, prayer schedule CRUD 16/16 green) |

## Risks I surfaced

- **LG / Samsung:** 25 of 26 reported issues remain in backlog — release risk for TV deployments.
- **On-Premise:** 9 of 10 reports unresolved, including licensing and 2FA gaps filed Jul 2026.
- Escalated both for platform-team capacity; tracking to closure next quarter.

## Growth this period

- Moved from purely manual verification to **automation-first QA**: Playwright + TypeScript, MCP-driven test generation, API-level checks.
- Built repeatable reporting: live ClickUp API pulls → work reports and dashboards, replacing manual status collation.

## Goals — next period

1. Reduce LG/Samsung + On-Premise open backlog from 34 to **under 10**.
2. Expand automated E2E coverage to all critical CMS flows (target: screens, library, playlists, RBAC smoke on every deploy).
3. Cut manual regression time by **30%** via suite parallelisation and CI gating.
4. Establish defect-escape tracking (bugs found in production vs pre-release) as a standing quality metric.

---

*Supporting evidence: full task-by-task report (`clickup-work-report-aman-kumar-2025-08-07_2026-07-23.pdf`), interactive dashboard (Claude artifact), ClickUp space CMS (ID 90162815762).*
