# Prayer Schedule — Banner Duration & Lead Time: CRUD + Boundary Testing

- **Target:** https://cms.pocsample.in/prayer-schedule → Schedules → **Configure Schedule Plan** drawer
- **Build:** v3.5.20 · **Account:** <admin — see local .env> (admin) · **Date:** 2026-07-16
- **Scope:** `Banner duration` and `Pre-announcement → Lead time` fields
- **Method:** field-level HTML5 checks + real save/update against `v3-5api.pocsample.in`. Test data created on a throwaway plan **`zz-boundary-test`** (Delhi), **deleted afterward** — no residual data.

## Field definitions
| Field | Input | min | max | step | required | Unit |
|-------|-------|-----|-----|------|----------|------|
| Banner duration | `number` | **1** | none | none (integers) | false | min |
| Lead time (pre-announce) | `number` | **1** | none | none (integers) | false | min before |

Lead time only appears when the **Pre-announcement** checkbox is enabled.

## Boundary values — client (HTML5) vs server (save)
| Field | Value | Client validity | Save result | Verdict |
|-------|-------|-----------------|-------------|---------|
| Banner | `0` | ❌ "must be ≥ 1" | **POST create → 400** `"bannerDurationMin" must be greater than or equal to 1` | ✅ enforced |
| Banner | `-3` | ❌ "must be ≥ 1" | (blocked same as 0) | ✅ |
| Banner | `2.5` | ❌ "integers only" | n/a | ✅ client blocks |
| Banner | `abc` | coerced → `0`, invalid | n/a | ✅ |
| Banner | `999999` | ✅ valid (no max) | **PUT update → 200 accepted** | ❌ **BUG — no upper cap** |
| Lead | `0` | ❌ "must be ≥ 1" | **PUT update → 200 "Plan saved"**, persisted `preAnnounceLeadMin: 0` | ❌ **BUG — server accepts 0** |
| Lead | `2.5` / `abc` / `-3` | ❌ (same client msgs) | n/a | ✅ client blocks |

## CRUD lifecycle (all verified)
| Op | Endpoint | Status | Result |
|----|----------|--------|--------|
| **Create** | `POST /prayer-schedule/create` | **201** | `bannerDurationMin:10, isPreAnnouncement:true, preAnnounceLeadMin:3` persisted |
| **Read** | reopened Configure drawer | — | Fields reload saved values (banner 10, lead 3) ✅ |
| **Update** | `PUT /prayer-schedule/update/{id}` | **200** | Values change; banner drives the prayer display window (`toTime = fromTime + bannerDurationMin`) |
| **Delete** | `DELETE /prayer-schedule/delete/{id}` | **200** | Confirm modal "This cannot be undone" → plan removed |

## Bugs / issues found

1. **Banner duration has no upper bound.** `999999` saved (200). The banner length drives each prayer's active window, so huge values wrap around midnight into **invalid ranges**:
   - Asr `16:01 → 02:40` (end **before** start), Maghrib `19:21 → 06:00`, Isha `20:46 → 07:25` (next day).
   - Fix: cap banner duration (e.g. ≤ minutes-to-next-prayer, or a sane max like 60).

2. **Inconsistent min validation between the two fields.** Server enforces `bannerDurationMin ≥ 1` (**400**) but has **no guard for `preAnnounceLeadMin`** — lead time `0` saved successfully as "Plan saved". Either apply the same `≥ 1` server rule to lead time, or decide 0 is legal and relax banner too — but they should match. (The HTML `min=1` on lead time is not enforced at save.)

   ![Lead time 0 validation bug](file:///C:/Users/User/.gemini/antigravity-ide/brain/33541b76-a734-44dd-b5cc-e3042c62321b/media__1784197185209.png)


3. **Lead time also has no upper cap** (same `number/min=1/no-max` definition as banner) — a lead time longer than the gap to the prayer, or longer than the banner, is nonsensical and currently accepted.

4. **Failed save closes the drawer and discards input.** Saving banner=`0` returned 400 but the Configure drawer **closed**, losing all entered field data — the user must re-enter everything. Drawer should stay open on validation failure.

5. **Plan-level lead time not propagated to prayers (confirm-by-design).** After saving `preAnnounceLeadMin:3` at plan level, every per-prayer object still had `isPreAnnouncement:false, preAnnounceLeadMin:null`. May be intentional (per-prayer override) — worth confirming the pre-announcement actually fires.

## Note — unrelated observation
The Configure dialog now shows required `*` indicators on Plan name / City / Calculation method / Madhab / Start date / End date (literal text, verified). This **differs from my earlier retest** of ClickUp bug `86d3q15uz` (2026-07-16 AM) where no `*` were present — suggesting a deploy since. **Recommend re-verifying `86d3q15uz` — it now appears FIXED.**
