# Campaigns V1 — API Performance (playlist picker hot path)

**Document ID:** CMP-QA-DOC-13
**Type:** Executed performance profile
**Environment:** `cms2` — app `https://cms2.pocsample.in` · API `https://v3-5api2.pocsample.in/v3/cms`
**Account:** dev@wilyer.com (admin)
**Date:** 2026-07-28
**Suite:** `tests/campaigns/perf/campaign-performance.spec.ts` — `npm run cms2 -- tests/campaigns/perf`
**Result:** 9/9 passed

---

## Method

Campaigns have no page of their own, so the hot path is the **Campaigns tab inside
the playlist editor** and the calls its modals make.

- Every figure is a **sample** (6–12 runs), reported as p50/p95 — never one timing.
- The **first call of each sample is discarded** as warm-up (TLS + connection setup).
- Assertions are on **p95**, not max, so a single outlier cannot fail a run.
- Requests are issued **through the browser context**, so they carry the same auth
  and TLS path as the real application rather than a synthetic client.
- Budget: `CMS_API_SLOW_MS` = 3000 ms per call.

---

## Results

| Operation | n | min | p50 | p95 | max | Payload |
|-----------|---|-----|-----|-----|-----|---------|
| `GET /campaign/read?limit=50` | 12 | 174 | **190** | 312 | 312 | 19.3 KB |
| `GET /campaign/read?limit=10` | 6 | 172 | 178 | 212 | 212 | 5.6 KB |
| `GET /campaign/read?limit=25` | 6 | 175 | 176 | 241 | 241 | 15.4 KB |
| `GET /campaign/read?limit=100` | 6 | 177 | 181 | 190 | 190 | 19.3 KB |
| `GET /campaign/read?search=QA` | 12 | 169 | 178 | 210 | 210 | — |
| `GET /campaign/read` page 1 | 6 | 179 | 182 | 194 | 194 | — |
| `GET /campaign/read` page 4 (last) | 6 | 168 | 184 | 206 | 206 | — |
| `GET /campaign/read/{id}` (3 items) | 12 | 171 | **226** | **411** | 411 | — |
| `POST /campaign/create` | 6 | 345 | **366** | 474 | 474 | — |
| `POST /campaign/update/{id}` | 6 | 195 | 200 | 209 | 209 | — |
| `DELETE /campaign/delete/{id}` | 7 | 166 | 170 | 184 | 184 | — |
| **UI: Campaigns tab → 36 cards rendered** | 1 | — | **1085 ms** | — | — | — |

Everything is comfortably inside the 3000 ms budget — by roughly an order of magnitude.

---

## What the numbers say

**1. Reads are dominated by fixed overhead, not by work.**
Page size 10 → 100 changed p50 by **×1.02** (178 ms → 181 ms) while the payload grew
×3.45. Response time is essentially flat with result-set size, which is what a
set-based query looks like. No N+1-per-item signature is visible at this data volume.

**2. Search is free.**
Search overhead is **−7 ms at p50 / +10 ms at p95** — i.e. indistinguishable from
noise. Consistent with BUG-CMP-02 having been fixed (`search` no longer builds an
unescaped regex), though at 36 documents even a full collection scan is free, so
this does not prove an index exists.

**3. Deep pagination costs nothing — but was barely exercised.**
Last page vs first page: **+2 ms** across only 4 pages. Skip-based pagination
degrades at depth; 4 pages is far too shallow to detect it.

**4. Create is the slowest operation, ~2× every other call.**
`POST /campaign/create` p50 **366 ms** vs 170–200 ms for update, delete and reads.
Worth a look if campaign creation ever moves into a bulk or scripted path, but it is
not a user-visible problem for one-at-a-time creation.

**5. Read-one has the widest spread of the read operations.**
p50 226 ms but p95 **411 ms** — nearly double. The list endpoint is steadier than
the single-document endpoint, which is the opposite of what you would expect.
Low priority at these absolute numbers; worth re-checking on a larger dataset.

**6. Concurrency is genuine — requests are not serialised.**
8 concurrent list calls completed in **637 ms wall-clock** against a serial p50 of
197 ms (8 sequential ≈ 1576 ms). Effective ~80 ms/request, a ~2.5× speed-up, with
zero failures. No connection-pool starvation or request serialisation.

**7. The tab feels responsive.**
1085 ms from clicking Campaigns to 36 cards on screen, against a 4000 ms listing
budget. The API portion of that is ~190 ms; the remaining ~900 ms is client-side
render and thumbnail fetching, not the API.

---

## The important caveat

**cms2 holds only ~36 campaigns.** These figures characterise the **latency floor**
of the endpoints — they say nothing about how they scale.

Specifically, these results **cannot** support a claim that:

- the list query is indexed (36 documents scan instantly either way),
- pagination holds up at depth (only 4 pages exist),
- payload size stays manageable (`limit=50` and `limit=100` returned the *same*
  19.3 KB, because both returned the entire collection).

A real scaling verdict needs the seeded datasets from Doc 08 §20.5 —
`DS_CAMPAIGNS_1K`, `DS_CAMPAIGNS_5K`, `DS_ITEMS_1K`. Seeding thousands of records
was **deliberately not done here**: cms2 is shared with colleagues actively working
on it, and load/soak testing belongs in k6 against an isolated environment
(Doc 08 §18.2), not in Playwright against a shared server.

For the same reason the concurrency check was capped at a burst of 8.

---

## One payload observation

The list projection returns each item's media **fully expanded** — `file.id`,
`file.thumb`, `file.type`, `file.name` for every item of every campaign. That is
what puts 19.3 KB on the wire for 36 campaigns. At 1,000 campaigns the same shape
extrapolates to roughly 500 KB per picker open, every time the tab is clicked.

If the picker only needs a name and one thumbnail per campaign, a slimmer list
projection (or a `fields` parameter) would keep that flat. Not a defect today —
flagged as the thing most likely to become one first as the dataset grows.

---

## Recommendation

No performance defects found at current data volume. Nothing here blocks release.

The follow-up worth scheduling is a **scaling run against a seeded, isolated
environment**, which would answer the three questions this profile cannot.
