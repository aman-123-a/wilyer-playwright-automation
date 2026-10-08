# CMS Post-Merge Regression — Bug Report

**Target (merged/staging):** https://cms.pocsample.in
**Reference (prod):** https://cms.wilyersignage.com
**Account:** <admin — see local .env> (admin)
**Date:** 2026-05-21
**Tooling:** Playwright (`tests/cms-suite/known-bugs-regression.spec.js`), each case tagged `[BUG:n]`.

## Status legend
- ✅ **Fixed (validated)** — automated check passed against the live merged build.
- ⚠️ **Open / needs attention** — reproduced, or the feature appears absent.
- ⏳ **Pending execution** — test written; not yet run to completion live (destructive/conditional).
- 🔎 **Partial** — surface validated, but full data-semantics need a seeded fixture.

---

## Known-bug matrix

| # | Reported bug | Test | Status | Evidence / notes |
|---|--------------|------|--------|------------------|
| 1 | "You are not authorized to perform this action" on normal admin actions | `[BUG:1]` | ✅ Fixed (validated) | Browsed `/`, `/screens`, `/groups`, `/library`, `/playlists`, `/reports` as admin — the authorization toast never appeared in DOM or console. |
| 2 | Media publish history not showing | `[BUG:2,3]` | 🔎 Partial | The **Publish History** tab on `/file-details/<id>` renders without blank/crash/error. Whether rows populate needs a media item with a known publish history (see "Caveats"). |
| 3 | Delivery status not showing after publishing media | `[BUG:2,3]` | 🔎 Partial | The **Delivery Report** tab renders without blank/crash/error. Full delivery-status content needs a freshly-published media fixture. |
| 4 | Blank page after clicking "go back" | `[BUG:4]` | ✅ Fixed (validated) | In-app **Back** from media detail returns to a rendered Library (no white screen); browser-back across modules also renders. |
| 5 | Popup alignment issue | `[BUG:5]` | ✅ Fixed (validated) | Create-playlist modal is fully within the viewport and horizontally centred (within 12% of centre). |
| 6 | Touch scroll / click scroll issue | `[BUG:6]` | ✅ Fixed (validated) | Wheel scroll on the Library grid advances scroll position / inner container — page is not "stuck". |
| 7 | Schedule brightness issue | `[BUG:7]` | ⏳ Pending execution | Navigates to a screen's settings and probes for a brightness/schedule control; skips-with-reason if no screen/control is exposed for the account. |
| 8 | Newly added keys not showing in trigger | `[BUG:8]` | ⏳ Pending execution | Creates a throwaway playlist, opens Triggers → Add Condition, selects type **Player Sensors**, asserts the **Key** dropdown exposes real keys (Touch Interaction / Motion Sensor / RFID-NFC / GPIO Input). Skips if the trigger UI requires a layout first. |
| 9 | Deleted spaces/rooms restore issue | `[BUG:9]` | ⚠️ Open (feature absent) | **No trash / "Deleted Groups" / restore affordance found on `/groups`** during live exploration. A deleted group cannot be restored from the UI — the restore capability appears unimplemented in this build. |
| 10 | Duplicate room creation | `[BUG:10]` | ⏳ Pending execution | Creates two groups with an identical name and records whether the second is rejected or silently duplicated (logged), asserting the list does not crash/corrupt. |
| 11 | Sub-user permission visibility issue | `[BUG:11]` | ⏳ Pending execution | Logs in as the scoped sub-user and checks that admin-only modules (Team/Billing/Account) are not leaked into the sidebar. Skips if `CMS_SUBUSER_*` creds are not valid. Server-side enforcement is independently covered in `subuser-scoping.spec.js`. |

---

## Additional findings (observed during live exploration — not in the original list)

### F-1 — Console error spikes on two flows ⚠️
- **Closing the Library "Upload Files" dialog** produced a burst of **~45 console errors**.
- **Opening the playlist editor** (`/playlist-settings/<id>`) produced **~46 console errors** on load.
- These were observed in a single, non-rate-limited session (distinct from the HTTP 429s seen when running parallel test logins). Content/severity needs triage — they may be benign or may indicate failed sub-resource/data calls. Captured by `ConsoleMonitor`; set `CMS_STRICT_MONITORS=true` to fail on them once the app is expected to be clean.

### F-2 — High console-warning volume ℹ️
- Most authenticated pages emit **180+ console warnings**. Noise-filtered by `ConsoleMonitor` (favicon/analytics/ResizeObserver etc.), but the residual volume is worth a cleanup pass.

### F-3 — Silent create-validation (minor UX) ℹ️
- Submitting **Create Playlist** with an empty name is a **silent no-op**: the modal stays open with **no inline error or toast**. Functionally safe (no bad playlist is created — verified) but gives the user no feedback. Same pattern was previously noted on the Roles modal.

---

## How to reproduce / re-run

```bash
# All 11 bug checks (destructive cases need CMS_ALLOW_DESTRUCTIVE=true, the default)
npm run cms:bugs

# Non-destructive subset only
CMS_ALLOW_DESTRUCTIVE=false npm run cms:bugs

# Open the HTML report with traces, screenshots and video for any failure
npm run cms:report
```

## Caveats on partial (🔎) items
Bugs **2 & 3** are about *data* appearing in the Publish History / Delivery Report tabs after a publish. The automated test confirms the tabs **render and don't error**, which catches the "blank/not-showing" regression at the UI level. To assert the *content* end-to-end, seed the test by publishing a known media item to a known screen first, then assert the corresponding history/delivery row appears — recommended as a follow-up once a stable test screen is available.

## Validation provenance
Statuses marked ✅ were confirmed in a live run on 2026-05-21 (9/9 non-destructive checks passed, which included BUG 1, 2/3 surface, 4, 5, 6). Statuses marked ⏳ have tests written and registered but were not run to completion in that session. Status ⚠️ for BUG 9 is from direct UI inspection of `/groups`.
