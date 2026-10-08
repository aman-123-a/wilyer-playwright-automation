# Wilyer Signage CMS — Post-Live Smoke Test Report

**Application:** cms.wilyersignage.com  
**Build version:** v3.5.20  
**Account tested:** <admin — see local .env>  
**Test date:** 2026-06-25  
**Tester:** Aman Kumar (QA)  
**Test type:** Functional smoke test (load + search + render). No destructive CRUD executed.

---

## Summary

All 9 navigation modules load successfully and search works on every module that has it. **0 console errors** across the entire session (the single pre-login error was Google's reCAPTCHA terms notice, not an app fault). One minor cosmetic typo found.

> Overall verdict: PASS — live build is healthy and usable.

---

## Module results

| Module | Loads | Search | Notes |
| --- | --- | --- | --- |
| Dashboard | PASS | n/a | Stats render: 69 screens, 1538 media files, 66.38 GB, last-5 table, location map, offline distribution |
| Screens | PASS | PASS | `bhavy` returned 6 correct results; 69 screens, filters, tags, pagination |
| Library | PASS | PASS | `test` filtered 1208 to 44 files; All/Videos/Photos tabs, folder search |
| Playlists | PASS | PASS | `test` returned only matching cards; 135 playlists, folder tree |
| Groups | PASS | PASS | 50 groups, table, New Group |
| Clusters | PASS | PASS | 43 clusters, table, New Cluster |
| Team | PASS | PASS | Members/Roles tabs, member table |
| Reports | PASS | PASS | Analytics / Previous Reports tabs; duration + screen search-select |
| Account | PASS | n/a | Profile / Adaptive Content / Device Profile tabs |
| Screen detail | PASS | n/a | `meting room 2` renders Active Playlist, Schedule/Settings, Assign Playlist |

---

## Search functionality

Verified working on all modules that expose search:

- **Screens** — `bhavy` -> 6 matching screens
- **Library** — `test` -> 1208 to 44 files
- **Playlists** — `test` -> all visible cards matched
- **Groups, Clusters, Team** — search boxes present and responsive
- **Reports** — screen search-and-select picker functional

---

## Issues found

| # | Severity | Module | Description |
| --- | --- | --- | --- |
| 1 | Minor / cosmetic | Account > Profile | Heading reads **"Organziation Name"** — typo, should be "Organization Name" |

---

## Health checks

- **Console errors:** 0 (session-wide, post-login)
- **Login / auth:** PASS (reCAPTCHA-protected form)
- **Navigation:** all sidebar links route correctly
- **Page titles / version:** consistent (v3.5.20)

---

## Scope and next steps

This run was a non-destructive smoke test (page load, search, render). The following were **not** executed on the live environment:

1. CRUD flows — create/edit/delete screens, playlists, groups; media upload
2. Role / permission changes (RBAC)
3. Scheduling and publish-approval workflows

**Recommended next:** run the CRUD flows with cleanup, and persist this checklist as a repeatable Playwright spec.
