# CMS Smoke + CRUD Functional QA Report

**Target:** https://cms.pocsample.in (cms test server — writes allowed)
**Date:** 2026-07-24
**Suite:** `cms-e2e` (Playwright, TypeScript) — full functional pass
**Scope:** Chromium, all modules, `CMS_ALLOW_DESTRUCTIVE=true` (create/update/delete enabled)
**Auth:** admin session via local `.env` (verified working)

---

## 1. Executive summary

| Metric | Count |
|--------|-------|
| Total tests | 124 |
| ✅ Passed | 74 |
| ❌ Failed (parallel run) | 11 |
| ⚠️ Flaky (passed on retry) | 9 |
| ⏭️ Skipped | 30 |
| Run duration | ~21 min (4 workers) |

A second **serial run (`workers=1`)** of every failure was executed to separate
genuine defects from load-induced flakiness. Result: **9 reproduced, 10 passed,
1 skipped** — the serial pass is the authoritative signal below.

### Verdict
- **Core CMS is healthy.** Auth (15/15), Dashboard, Screens, Reports, Team,
  Groups, and most of Library/Playlists/Prayer-Schedule pass cleanly.
- **6 genuine app-behavior findings** reproduced without load pressure (§3).
- **2 issues are test-side / environment**, not CMS defects (§4).
- **~1/3 of the parallel failures were navigation timeouts** that vanished when
  run serially — the suite over-parallelizes this slow external server (§5).

---

## 2. Per-module results

| Module | Pass | Fail | Flaky | Skip | Notes |
|--------|:----:|:----:|:----:|:----:|-------|
| auth | 15 | 0 | 0 | 0 | ✅ incl. SQLi/XSS/oversized-input rejection |
| a11y | 2 | 0 | 0 | 0 | ✅ no serious/critical violations |
| dashboard | 9 | 1 | 1 | 0 | stuck-loader finding (§3E) |
| screens | 4 | 0 | 0 | 0 | ✅ |
| groups | 2 | 1 | 1 | 0 | failures were load timeouts — pass serially |
| library | 9 | 2 | 1 | 1 | unsupported-file finding (§3F); rest load timeouts |
| playlists | 4 | 1 | 1 | 0 | **search-not-filtering finding (§3A)** |
| media-sets | 0 | 2 | 2 | 8 | **counter findings (§3B, §3C)**; builder flaky under load |
| reports | 4 | 0 | 0 | 0 | ✅ |
| billing | 2 | 2 | 0 | 0 | test-side false positive (§4.1) — app OK |
| team | 5 | 0 | 0 | 0 | ✅ |
| permissions | 0 | 1 | 3 | 10 | test-data dependency (§4.2); nav tests load-flaky |
| prayer-schedule | 17 | 1 | 0 | 11 | **search-not-debounced finding (§3D)** |

---

## 3. Genuine app-behavior findings (reproduced serially)

### 3A. Playlist search does not filter the listing — **HIGH**
- **Test:** `playlists › search narrows the listing or yields an empty state`
- **Observed:** Searching a guaranteed-nonexistent term still shows all 50
  playlist cards. `Expected 0, Received 50` after a 15 s poll — serial + parallel.
- **Impact:** Users cannot narrow the playlist list by search; the query appears
  to be ignored client-side.
- **Recommend:** Verify the playlist search input actually filters results
  (vs. only filtering server-side on submit, or a broken bind).

### 3B. Media-set builder file-type counters overlap — **MEDIUM**
- **Test:** `media-sets › type filter narrows the file set and the counter tracks it`
- **Observed:** `Images + Videos > All` (All = 804, but the two type-filtered
  totals sum to more). File-type counts are not mutually exclusive / overcount.
- **Impact:** Misleading counts in the media-set create builder.

### 3C. Media-set builder "shown" counter drifts from visible tiles — **MEDIUM**
- **Test:** `media-sets › F1 — the "N of total" counter stays in sync…`
- **Observed:** After filtering, the header counter's "shown" value ≠ the number
  of file tiles actually rendered (expected 150). Matches a previously logged
  regression ("Report F1").
- **Impact:** The "N of total" indicator misreports the visible set.

### 3D. Prayer-schedule media-picker search is not debounced — **MEDIUM (perf)**
- **Test:** `prayer-schedule › Choose Media picker › search input is debounced`
- **Observed:** Typing 5 characters fired **6** `file/read` API requests
  (expected ≤ 2). One request per keystroke.
- **Impact:** Unnecessary backend load and UI jank on every media search.

### 3E. Dashboard loading spinner never resolves — **MEDIUM**
- **Test:** `dashboard › no broken images, no stuck loader`
- **Observed:** A spinner/loader (`[class*=spinner|loader]`, `[role=progressbar]`,
  `[aria-busy=true]`) remains visible after the wait window — serial + parallel.
- **Impact:** A dashboard widget appears to hang loading. Confirm whether a tile
  (e.g. map/analytics) genuinely stalls, or a spinner element is left mounted.

### 3F. Unsupported file upload shows no rejection message — **MEDIUM (needs dev confirm)**
- **Test:** `library › rejects an unsupported file format`
- **Observed:** Uploading a `.exe` produced no user-facing rejection text
  (`/not supported|unsupported|invalid file|not allowed/`).
- **Impact:** Either the format is silently rejected with no feedback, or the
  validation copy differs from expectations. Confirm the intended UX for
  disallowed file types.

---

## 4. Test-side / environment issues (NOT CMS defects)

### 4.1 Billing empty-state assertion is too narrow (false positive)
- 2 "failures" (`billing loads with plans or an empty state @smoke`, and the
  clean-console variant) are **not CMS bugs**. The billing page correctly renders
  the empty state heading **"You don't have any plans yet."** for an account with
  no plans. `BillingPage.expectPlansLoaded()` only recognizes `/no (plan|purchase|
  data)/i`, which doesn't match that copy.
- **Fix (test):** widen the empty-state regex to include
  `don't have any plans` (pages/BillingPage.ts:49).

### 4.2 RBAC suite depends on a role literally named "un"
- `permissions › REVOKED → sub-user is fenced out of /reports` (and 10 skipped
  RBAC cases chained after it) look for a role card with heading **"un"** to
  toggle. That role/test-data doesn't exist on this env, so setup fails.
- **Fix (env/test):** seed the expected sub-user role, or parameterize the role
  name via `.env` / test-data.

---

## 5. Infrastructure note — parallel over-subscription

The following failed **only** in the 4-worker parallel run and **passed serially**,
all with `page.goto: Timeout 30000ms exceeded`:

- groups listing / "New Group" modal, playlists listing, library media-card
  detail, dashboard smoke, media-set builder load, permissions `/admin`,
  `/management`, forced-403 nav.

The slow external server stalls navigation under 4 concurrent workers (the config
comment already flags this). **Recommend `workers: 2`** for this env to remove the
noise — it directly converts 9 flaky + ~3 failed into stable passes.

---

## 6. Skipped tests (30)

Not executed due to preconditions, not failures:
- RBAC data-driven GRANTED/REVOKED matrix (blocked by §4.2 setup).
- Several media-sets and prayer-schedule `@api` / write cases gated on
  pre-existing folders/media that weren't present.

---

## 7. Recommended next actions

1. **Triage the 6 findings in §3** with the dev team — 3A (playlist search) is the
   highest-impact.
2. Apply the two test fixes in §4 (billing regex, RBAC role seeding) to remove
   false positives and unblock the 10 skipped RBAC cases.
3. Set `workers: 2` (or raise `navigationTimeout`) to stabilize the suite on the
   slow test server.
4. Optionally re-run cross-browser (firefox/webkit/mobile projects are wired) once
   the above are addressed.

---

*Artifacts: `playwright-report/` (HTML + traces/video on failure), `reports/serial-rerun.log`,
`test-results/**/error-context.md`. Generated from the 2026-07-24 chromium run.*
