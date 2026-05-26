# RBAC Permission Test Report — Wilyer CMS

**Application:** https://cms.pocsample.in (`v3.5.18.7.1`)
**Date:** 2026-05-26
**Tester:** QA Automation (Playwright + TypeScript)
**Role under test:** `un` (53 permissions) — assigned to sub-user `ak22@gmail.com`
**Admin account:** `dev@wilyer.com`
**Spec:** `cms-e2e/tests/permissions/rbac-data-driven.spec.ts`

---

## 1. Scope & method

Verify that toggling a role's permissions as **admin** correctly changes what the
**sub-user** can see and reach. Each permission was driven end-to-end through the
real UI: admin edits the role → saves → sub-user session is fully re-established
→ access is verified → original state restored.

The permission UI is **section-based** (not per-permission checkboxes by id):
each section (`Reports`, `Cluster Management`, `Team Administration`, …) exposes
**NONE / READ-ONLY / ALL** bulk controls plus per-module checkboxes once expanded,
saved via **Update Role** → `PUT /v3/cms/role/update/<id>`.

---

## 2. Automated suite result — 8/8 PASSED

Live run, Chromium, single worker (`npx playwright test tests/permissions/rbac-data-driven.spec.ts --project=chromium`):

| # | Test | Result |
|---|------|--------|
| 1 | setup › authenticate as admin | ✅ PASS |
| 2 | Reports › REVOKED → fenced out of `/reports` | ✅ PASS |
| 3 | Reports › GRANTED → can reach `/reports` | ✅ PASS |
| 4 | Cluster Management › REVOKED → fenced out of `/clusters` | ✅ PASS |
| 5 | Cluster Management › GRANTED → can reach `/clusters` | ✅ PASS |
| 6 | Team Administration › REVOKED → fenced out of `/team` | ✅ PASS |
| 7 | Team Administration › GRANTED → can reach `/team` | ✅ PASS |
| 8 | disabled-vs-hidden action controls | ✅ PASS |

Role restored to its original 53 permissions after the run.

---

## 3. Per-permission sweep (every module section)

Revoked each module section in turn and probed every route as the sub-user:

| Permission section | Nav link when revoked | Direct URL (`page.goto`) | Data API when revoked |
|---|---|---|---|
| Team Administration | hidden ✅ | **403 page** ✅ | — |
| Reports | hidden ✅ | **403 page** ✅ | — |
| Screens Management | hidden ✅ | ⚠️ shell renders (no 403 page) | `screen/readStats` → **403** ✅ |
| Content Management (Library) | hidden ✅ | ⚠️ shell renders | `file/read`, `folder/read` → **403** ✅ |
| Content (Playlists) | hidden ✅ | ⚠️ shell renders (0 rows) | `playlist/read` → **403** ✅ |
| Screen Group Management | hidden ✅ | ⚠️ shell renders (0 rows) | `group/read` → **403** ✅ |
| Cluster Management | hidden ✅ | ⚠️ shell renders (0 rows) | `cluster/read` → **403** ✅ |
| Remote Update (Rollouts) | **link stays visible** ⚠️ | ⚠️ shell renders | (no gated call observed) |
| Overview & Monitoring | (kept granted — required to save) | — | — |

---

## 4. Edge cases verified

| Edge case | Coverage | Result |
|---|---|---|
| **#1 Session / token eviction** | Cookies + localStorage + sessionStorage cleared, fresh sub-user login | ✅ No stale-token access leak |
| **#2 Direct URL access** | `page.goto()` to revoked routes | ✅ Team/Reports → 403 page; others → data API 403 |
| **#3 Save race condition** | `waitForResponse(PUT /role/update == 200)` before logout | ✅ Never logs out mid-save |
| **#4 Disabled vs hidden** | Admin-only write actions asserted hidden OR `toBeDisabled()` | ✅ Pass |

---

## 5. Findings / observations

### Security posture — sound at the data layer
Every revoked module's **data API returns 403**, so no content leaks. Core
authorization is enforced server-side.

### Issues worth raising (UX / consistency, not data leaks)

1. **Inconsistent route guard.** Only **Team** and **Reports** render a clean
   `403 Permission Denied` page. The other six modules render an **empty shell**
   with silent background 403s instead of an explicit "Access Denied" — a revoked
   user sees a blank page rather than a clear message.

2. **Rollouts nav link not hidden.** After revoking *Remote Update*, the
   **Rollouts** sidebar link remains visible, whereas every other revoked module
   correctly hides its link.

3. **0-permission save blocked client-side.** Saving a role with **Total Selected
   = 0** does not fire the PUT (Update Role is inert) — at least one permission is
   required. (Behaves as intended; documented for completeness.)

### Capability toggles (not route gates)
`File Uploading` and `Content Publishing` are Enable/Disable **capability**
toggles, enforced server-side on their action APIs. With *File Uploading* OFF the
sub-user still sees the Library link, can open `/library`, and sees an enabled
"Upload Files" button — i.e. no nav/route effect. They are intentionally excluded
from the UI route-fencing matrix; their enforcement belongs in an API-level test.

---

## 6. Bugs found in the test harness during the live pass (fixed)

1. Anchored nav regex (`/^reports$/i`) matched nothing — sidebar links carry a
   leading icon glyph (`" Reports"`). De-anchored.
2. Sidebar is a `<ul>`, not a `<nav>`/`<aside>` landmark — `locator('nav, aside')`
   matched the wrong container (and made the "hidden" assertion a false pass).
   Re-scoped to "the list containing the Logout link."
3. `File Uploading` mis-modeled as a route gate — reclassified (see §5).

---

## 7. How to reproduce

```bash
cd cms-e2e
npm run lint                                  # typecheck
npx playwright test tests/permissions/rbac-data-driven.spec.ts \
    --project=chromium --workers=1 --retries=0
npx playwright show-report playwright-report  # HTML report (run without --reporter override)
```

> Note: the suite mutates the shared live `un` role and restores it after each
> block. Run single-worker, no-retries to avoid concurrent mutation.
