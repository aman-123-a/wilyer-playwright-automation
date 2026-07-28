# Campaigns V1 with RBAC — Edge Case Catalogue

**Document ID:** CMP-QA-DOC-05
**Cases:** CMP-EDGE-001 … CMP-EDGE-112 (112 edge cases)

Edge cases are grouped by the *failure mechanism* they probe, not by UI module — that is how
they are triaged when they fail. Each carries a defect-probability rating (H/M/L) informing the
execution order: run **H** first.

---

## E1 — Campaign size & composition (CMP-EDGE-001 … 018)

| ID | Edge case | Expected | Prob |
|----|-----------|----------|------|
| CMP-EDGE-001 | Campaign with exactly 1 item in a 5-item playlist | Same item every loop; no visual "stuck" bug reported as a defect | M |
| CMP-EDGE-002 | Campaign with 2 items | Clean alternation A,B,A,B | L |
| CMP-EDGE-003 | Campaign with 0 items reaching playback (data created out-of-band) | Player skips the slot; no black frame, no crash | **H** |
| CMP-EDGE-004 | Campaign with 1000 items | Editor usable; save within budget; playback resolves item 1000 correctly | M |
| CMP-EDGE-005 | Campaign with 1001 items (over the limit) | Rejected cleanly at the boundary | M |
| CMP-EDGE-006 | Campaign longer than the number of loops a screen ever completes in a day | Later items may never play — is this surfaced to the user? | M |
| CMP-EDGE-007 | Mixed image + video + widget in one campaign | All types resolve; durations correct per type | **H** |
| CMP-EDGE-008 | Campaign of videos with wildly different durations (2 s vs 10 min) | Loop length varies per loop — is total-duration display honest? | M |
| CMP-EDGE-009 | Campaign containing a widget that self-refreshes | Widget lifecycle correct when it is skipped on non-matching loops | M |
| CMP-EDGE-010 | All items in a campaign are the same media file | Plays identically every loop; no dedupe collapsing the campaign to length 1 | M |
| CMP-EDGE-011 | Campaign item with 0-second duration | Rejected (BR-13 floor) or skipped — never an infinite-speed loop | **H** |
| CMP-EDGE-012 | Campaign item with a huge duration (24 h) | Accepted or bounded; other loop items still eventually play | M |
| CMP-EDGE-013 | Campaign item duration typed directly, bypassing the stepper floor | Server-side validation rejects sub-1 s (known pattern from playlist duration) | **H** |
| CMP-EDGE-014 | Very large video (2 GB) in a campaign | Handled per media rules; sync timeout surfaced, not silent | M |
| CMP-EDGE-015 | Campaign whose total item size exceeds player storage | Explicit capacity error before publish, not a mid-playback failure | **H** |
| CMP-EDGE-016 | Campaign with items of mismatched aspect ratios | Rendered per the zone's fit rules, consistently across variants | L |
| CMP-EDGE-017 | Campaign with a portrait item in a landscape zone | Same handling as a media file in that zone (PB-RULE-04) | L |
| CMP-EDGE-018 | Adding an item during an active playback cycle | New length applies from the next sync; counter does not desync | **H** |

## E2 — Referential integrity (CMP-EDGE-019 … 034)

| ID | Edge case | Expected | Prob |
|----|-----------|----------|------|
| CMP-EDGE-019 | Media deleted while inside a published campaign | Player skips it (BR-14); CMS flags the campaign as degraded | **H** |
| CMP-EDGE-020 | Media deleted *during* an active playback loop | Current loop completes or skips gracefully; no freeze | **H** |
| CMP-EDGE-021 | All media in a campaign deleted | Campaign becomes empty → treated per BR-04, not a crash | **H** |
| CMP-EDGE-022 | Campaign deleted while a playlist referencing it is open in another tab | Second tab shows a clear stale-state error on save | M |
| CMP-EDGE-023 | Campaign deleted while it is publishing | Publish aborts atomically or completes with the pre-delete snapshot | **H** |
| CMP-EDGE-024 | Campaign deleted while pending approval | Approval entry resolved; approver sees no orphan | M |
| CMP-EDGE-025 | Campaign restored after soft delete | Playlist references reconnect, or explicitly do not — documented either way | M |
| CMP-EDGE-026 | Playlist deleted while its campaign is playing | Screens fall back to default content; no black screen | **H** |
| CMP-EDGE-027 | Folder deleted containing an in-use campaign | Blocked or cascaded safely (BR-08) | **H** |
| CMP-EDGE-028 | Campaign referenced by 20 playlists, then edited | All 20 update; all 20 enter approval; email counts correct | M |
| CMP-EDGE-029 | Circular reference attempt (campaign containing itself, via API) | Rejected — no infinite resolution loop | **H** |
| CMP-EDGE-030 | Campaign containing another campaign (nesting) | Rejected in V1 (out of scope) with a clear error, not a stack overflow | **H** |
| CMP-EDGE-031 | Media replaced in place (same id, new file) | Campaign picks up the new file; no stale CDN cache on the player | M |
| CMP-EDGE-032 | Media renamed while in a campaign | Campaign reflects the new name; playback unaffected | L |
| CMP-EDGE-033 | Media moved to a restricted folder while in a published campaign | Playback continues (already published) but new viewers cannot see it — defined behaviour | M |
| CMP-EDGE-034 | Two campaigns sharing the same media item; one is deleted | The other is unaffected | L |

## E3 — Playback & loop counter (CMP-EDGE-035 … 056)

The highest-risk cluster (RSK-01, RSK-09, RSK-10). Every case here is derived from
`playback_logic.txt`.

| ID | Edge case | Expected | Prob |
|----|-----------|----------|------|
| CMP-EDGE-035 | Loop 1 starts at item 1, not item 2 | Off-by-one guard | **H** |
| CMP-EDGE-036 | Wrap from item N to item 1 with no repeat of item N | Off-by-one guard at the boundary | **H** |
| CMP-EDGE-037 | Observe 3 consecutive full cycles for drift | Sequence identical each cycle | **H** |
| CMP-EDGE-038 | Campaign length changed from 3 → 4 mid-playback | Counter adapts without skipping the new item forever | **H** |
| CMP-EDGE-039 | Campaign length changed from 4 → 2 while the pointer is at item 4 | Pointer clamps safely; no out-of-range read | **H** |
| CMP-EDGE-040 | Item removed from the middle of a campaign mid-playback | Remaining items still all play; no permanent skip | **H** |
| CMP-EDGE-041 | Player restart mid-cycle | Resumes or restarts per AS-09 — deterministic and documented | **H** |
| CMP-EDGE-042 | Player power failure mid-item | Recovers to a valid state on boot; no corrupt counter file | **H** |
| CMP-EDGE-043 | Player restarted 20 times in a row | If the counter resets each time, items 2..N never play — a real product defect | **H** |
| CMP-EDGE-044 | Content sync during a cycle | Counter not reset by unrelated syncs (RSK-09) | **H** |
| CMP-EDGE-045 | Player offline for 24 h, then reconnects | Resumes coherently; no burst-through of missed loops | M |
| CMP-EDGE-046 | Two screens on the same playlist, started 1 h apart | Behaviour documented: independent counters expected (AS-01) | M |
| CMP-EDGE-047 | Same campaign in two playlists on the same screen | Counter scope defined — shared or per-slot | **H** |
| CMP-EDGE-048 | Same campaign twice in ONE playlist | Both slots' behaviour defined (CMP-070) | **H** |
| CMP-EDGE-049 | Two campaigns of coprime lengths (3, 5) | Full cycle = 15 loops; all 15 combinations occur exactly once | M |
| CMP-EDGE-050 | Two campaigns of equal length (3, 3) | Lockstep; cycle = 3, not 9 | M |
| CMP-EDGE-051 | Campaign lengths 1 and 7 | Cycle = 7; the length-1 campaign repeats its single item | L |
| CMP-EDGE-052 | Five campaigns, lengths 2/3/4/5/7 | Cycle = LCM 420 loops — is this practically verifiable, and does the player handle it? | M |
| CMP-EDGE-053 | Layout with zero campaigns among layouts that have them | Plays once per cycle (PB-RULE-03a) | **H** |
| CMP-EDGE-054 | Layout containing two campaigns of different lengths | Repeats LCM times before advancing | **H** |
| CMP-EDGE-055 | Single-layout playlist (no layout rotation) | PB-RULE-01 applies unchanged | L |
| CMP-EDGE-056 | Layout order changed while playing | Next cycle uses the new order; current cycle completes coherently | M |

## E4 — Timing, timezone & clock (CMP-EDGE-057 … 068)

| ID | Edge case | Expected | Prob |
|----|-----------|----------|------|
| CMP-EDGE-057 | Player clock ahead of the server by 1 h | Playback unaffected; scheduling/audit timestamps correct | M |
| CMP-EDGE-058 | Player clock behind by 1 h | Same | M |
| CMP-EDGE-059 | Player clock set backwards during playback | Counter does not rewind or double-advance | **H** |
| CMP-EDGE-060 | Screen timezone differs from the CMS user's | Audit and email timestamps unambiguous (UTC + offset) | M |
| CMP-EDGE-061 | DST spring-forward during playback | No skipped or doubled loop | M |
| CMP-EDGE-062 | DST fall-back during playback | Same | M |
| CMP-EDGE-063 | Campaign published exactly at midnight local | No off-by-one-day scheduling error | M |
| CMP-EDGE-064 | Leap-second / NTP step correction | Playback continues | L |
| CMP-EDGE-065 | Screen in UTC+14 vs UTC-11 | Both correct; no negative-duration computation | M |
| CMP-EDGE-066 | Long-running loop crossing a date boundary | Loop completes; reporting attributes it correctly | L |
| CMP-EDGE-067 | Audit timestamps monotonic under clock adjustment | No out-of-order audit entries | M |
| CMP-EDGE-068 | Email timestamp matches the actual change time | No timezone mislabelling in the email | M |

## E5 — Permissions & inheritance (CMP-EDGE-069 … 082)

| ID | Edge case | Expected | Prob |
|----|-----------|----------|------|
| CMP-EDGE-069 | Permission revoked while the user is mid-edit | Save blocked with a clear message; no partial write | **H** |
| CMP-EDGE-070 | Permission granted while the user is on the page | Access appears on refresh, without re-login | M |
| CMP-EDGE-071 | Folder access revoked while the campaign is open | Further reads blocked; the open view does not leak new data | **H** |
| CMP-EDGE-072 | User belongs to two roles with conflicting campaign permissions | Union or intersection — defined, documented, consistent with Media | **H** |
| CMP-EDGE-073 | Role deleted while the user is logged in | Session degraded safely to no access, not to full access | **H** |
| CMP-EDGE-074 | Deep inheritance: grant at depth 1, campaign at depth 5 | Inherited correctly through all levels | M |
| CMP-EDGE-075 | Deny at depth 3 overriding a grant at depth 1 | Deny wins for depth 3+ | **H** |
| CMP-EDGE-076 | Grant at depth 3 under a deny at depth 1 | Documented precedence — most-specific-wins or deny-wins, matching Media | **H** |
| CMP-EDGE-077 | Campaign moved from a permitted to a restricted folder mid-session | Access re-evaluated on the next request | M |
| CMP-EDGE-078 | Restricted folder appearing in the picker's folder filter list | Restricted folder names must not leak | **H** |
| CMP-EDGE-079 | Campaign count badge revealing hidden campaigns | Counts must exclude what the user cannot see | M |
| CMP-EDGE-080 | Search autocomplete suggesting a restricted campaign name | Must not appear | **H** |
| CMP-EDGE-081 | Error message disclosing a restricted campaign's existence | 404 vs 403 chosen consistently to avoid enumeration | M |
| CMP-EDGE-082 | Approval email revealing a restricted campaign's name to an unentitled approver | Must not leak | **H** |

## E6 — Concurrency & versioning (CMP-EDGE-083 … 094)

| ID | Edge case | Expected | Prob |
|----|-----------|----------|------|
| CMP-EDGE-083 | Two users save the same campaign within 1 s | Version conflict detected — no silent overwrite (RSK-07) | **H** |
| CMP-EDGE-084 | User B saves stale data loaded before User A's change | Conflict error, not a rollback of A's work | **H** |
| CMP-EDGE-085 | Reorder and delete of the same item, concurrently | Consistent final ordinals with no gaps | M |
| CMP-EDGE-086 | Same campaign added to a playlist by two users at once | One coherent playlist; no duplicated slot | M |
| CMP-EDGE-087 | Approve and delete issued concurrently | One deterministic outcome | **H** |
| CMP-EDGE-088 | Publish and edit issued concurrently | Published payload internally consistent (RSK-07) | **H** |
| CMP-EDGE-089 | Double-click Save (duplicate request) | Idempotent; one save, one email | **H** |
| CMP-EDGE-090 | Duplicate publish requests from a retrying client | One publish; no duplicate screen content | **H** |
| CMP-EDGE-091 | Rapid create/delete/create of the same name | No unique-constraint deadlock; final state correct | M |
| CMP-EDGE-092 | Optimistic-lock version rollover / missing version field | Falls back to a safe conflict, not to last-write-wins | M |
| CMP-EDGE-093 | Rollback after a failed multi-screen publish | All screens return to the prior version | **H** |
| CMP-EDGE-094 | Backup restore of a campaign to an older state | References revalidated; playlists not corrupted | M |

## E7 — Text, encoding & rendering (CMP-EDGE-095 … 104)

| ID | Edge case | Expected | Prob |
|----|-----------|----------|------|
| CMP-EDGE-095 | 255-character name in list, picker, slot label and email | Truncated with tooltip; no layout break in any surface | M |
| CMP-EDGE-096 | Name of 4-byte emoji only (`🎉🎉🎉`) | Stored and rendered correctly; length counted in characters, not bytes | M |
| CMP-EDGE-097 | RTL name mixed with LTR digits | Bidi rendering does not corrupt the surrounding UI | L |
| CMP-EDGE-098 | Name with a zero-width or control character | Sanitised or rejected; not used to spoof another campaign's name | **H** |
| CMP-EDGE-099 | Name with a newline or tab | Rejected or normalised; must not break the email body | M |
| CMP-EDGE-100 | Name that is pure digits (`12345`) | Not coerced to a numeric id anywhere in the API | M |
| CMP-EDGE-101 | Name identical to a reserved word (`null`, `undefined`, `NaN`) | Handled as a plain string | M |
| CMP-EDGE-102 | HTML entities in the name shown in the email body | Escaped once, not double-escaped (`&amp;amp;`) | M |
| CMP-EDGE-103 | Very long folder path in the breadcrumb | Collapses gracefully | L |
| CMP-EDGE-104 | Campaign name colliding with a media file name | Both distinguishable in search and picker results | M |

## E8 — Scale, import/export & recovery (CMP-EDGE-105 … 112)

| ID | Edge case | Expected | Prob |
|----|-----------|----------|------|
| CMP-EDGE-105 | 5,000 campaigns in one folder | Listing paginates; picker remains responsive | M |
| CMP-EDGE-106 | 100 campaigns in a single playlist | Saves and publishes; playback cycle length is enormous — surfaced to the user | M |
| CMP-EDGE-107 | Export campaigns and re-import | Round-trip preserves item order and folder placement | M |
| CMP-EDGE-108 | Import a campaign referencing missing media | Rejected with a per-row error, not a partial import | **H** |
| CMP-EDGE-109 | Import a campaign with a duplicate name | Handled per BR-11 with a clear per-row result | M |
| CMP-EDGE-110 | Restore from backup after a bulk delete | Campaigns and their playlist links restored consistently | M |
| CMP-EDGE-111 | Audit log recovery after a service outage | No lost entries for actions that succeeded during the outage | M |
| CMP-EDGE-112 | Tenant data migration (TagTalk-only rollout → general availability) | No cross-tenant bleed; feature flag transitions cleanly | **H** |

---

## Edge-case execution priority

| Probability | Count | Run order |
|-------------|-------|-----------|
| **H (high)** | 44 | First — these carry the majority of expected defects |
| M (medium) | 55 | Second |
| L (low) | 13 | Last / time-permitting |
| **Total** | **112** | |

The **H** cluster is dominated by three mechanisms: loop-counter correctness (E3), referential
integrity when media/campaigns are deleted (E2), and permission re-evaluation on change (E5).
Those three are where V1 is most likely to break.

---

**Next:** [06-matrices.md](06-matrices.md)
