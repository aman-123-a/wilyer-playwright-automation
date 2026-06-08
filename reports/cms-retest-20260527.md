# CMS E2E Retest Report — Pre-Live-Update

**Date:** 2026-05-27
**Target:** https://cms.pocsample.in (staging) + prod comparison
**Command:** `npm run cms` (playwright.cms.config.js)
**Duration:** 19.5 min · 4 workers · chromium

## Summary

| Result | Count |
| --- | --- |
| ✅ Passed | 89 |
| ❌ Failed | 13 |
| ⚠️ Flaky (passed on retry) | 3 |
| ⏭️ Skipped | 29 |
| ⏸️ Did not run | 4 |
| **Total** | **138** |

**Verdict:** Core read/navigation paths are green. Go-live blockers: 3 CRUD regressions + 1 auth/security finding. The 7 injected-failure "blank screen" failures are pre-existing app robustness gaps (no error boundary), unchanged from prior runs.

---

## Failures by category

### 🔴 Go-live blockers

**Auth / security (1)**
- `api-validation.spec.js:56` — unauthenticated `GET /api/playlists` returns **200** (serves data without auth). Expected 401/403/redirect/404. **Security risk — verify before push.**

**CRUD regressions (3)** — failed on both attempts:
- `playlist-crud.spec.js:48` — edit / rename a playlist in the editor
- `spaces-rooms.spec.js:65` — delete a room/group (with confirmation)
- `library-crud.spec.js:112` — upload a valid image, then delete it (round-trip)

### 🟡 App robustness gaps (pre-existing, injected backend failures)

UI white-screens / freezes instead of showing an error or empty state when the API is forced to fail. No error boundary.
- `api-validation.spec.js:76` — frontend blanks when API 500s
- `dashboard-analytics.spec.js:67` — analytics 500 → blank dashboard
- `dashboard-analytics.spec.js:78` — empty analytics → blank
- `dashboard-analytics.spec.js:87` — corrupted payload → white-screen
- `dashboard-analytics.spec.js:96` — slow analytics → UI freeze (no loader)
- `playback-analytics.spec.js:51` — corrupted playback data → crash
- `playback-analytics.spec.js:60` — empty dataset → no empty state
- `playback-analytics.spec.js:90` — analytics 500 → blank page

### ⚪ Fixture / environment

- `known-bugs-regression.spec.js:240` — sub-user permission visibility errors at 0ms (missing sub-user creds/fixture; full `subuser-scoping` spec skipped too).

---

## Flaky (passed on retry)

- `dashboard-analytics.spec.js:130` — dashboard loads under 10000ms
- `known-bugs-regression.spec.js:157` — trigger key dropdown populates
- `library-crud.spec.js:190` — clearing search restores full grid (30s `networkidle` timeout on first try)

---

## Environment notes

- **Heavy `429` rate-limiting** across Library/Playlist specs — the app throttles under 4 parallel workers. Likely root cause of the 3 flaky tests and the Library navigation timeout. Recommend re-running CRUD failures with `--workers=1` to confirm they are real regressions vs. throttling artifacts.
- `401` console errors on auth tests are the known-benign login probe — not failures.
- Prod vs. staging comparison: no new 5xx, no new console errors, dashboard load within tolerance (prod 6993ms / staging 10600ms).

## Recommended next step

Re-run the 3 CRUD failures single-threaded to separate real regressions from 429 throttling:

```
npx playwright test --config=playwright.cms.config.js --workers=1 \
  playlist-crud.spec.js:48 spaces-rooms.spec.js:65 library-crud.spec.js:112
```
