# Retest Round 2 — ClickUp "Campaigns" list

**ClickUp list:** [Campaigns · 901616106811](https://app.clickup.com/9016764704/v/l/li/901616106811)
**Environment:** `cms2.pocsample.in` · **Date:** 2026-07-29 (second pass, same day)
**Suite:** `tests/cms2/campaigns/retest/clickup-in-development.spec.ts` — now **19 tests,
13 pass / 6 fail**. No residue left behind.
**Previous pass:** [Doc 17](17-clickup-in-development-retest-20260729.md)

The board moved between passes: **8 tasks are now `shipped`** (was 4), 8 remain `in development`.
This pass re-verified everything and extended the suite to cover the newly-shipped tickets.

> ### Headline
> **Three tickets marked `shipped` still reproduce**, and one of them turned out to hide a
> **critical permission-enforcement gap** that is worse than the ticket described.

---

## 1. Changes since the first pass

| ClickUp | Task | Was | Now | Retest verdict |
|---|---|---|---|---|
| 86d3v9yhr | Admin finds sub-user's foldered campaign | in dev | **shipped** | ✅ correctly shipped |
| 86d3v88q0 | Playlist log shows folder name | in dev | **shipped** | ✅ correctly shipped |
| 86d3ux0q0 | BUG-CMP-02 regex injection | in dev | **shipped** | ✅ correctly shipped |
| 86d3ux0r0 | BUG-CMP-03 500 without sort/order | in dev | **shipped** | ✅ correctly shipped |
| 86d3ux0pq | BUG-CMP-01 zero-item campaign accepted **by API** | — | **shipped** | ❌ **still reproduces** |
| 86d3ux0ru | BUG-CMP-04 duration accepts 0 / negative | — | **shipped** | ❌ **still reproduces** |
| 86d3ux0tj | BUG-CMP-05 duplicate-name validation not displayed | — | shipped | not retested (UI-only) |
| 86d3ux0u8 | BUG-CMP-06 silent no-op when save blocked | — | shipped | not retested (UI-only) |
| 86d3ux0v3 | BUG-CMP-07 name uniqueness case-sensitive | — | scoping | ✅ observed fixed (case-insensitive) |
| 86d3v7re7 | Campaign duration not shown in Layout | — | scoping | new, not retested |

**Fixture change mid-day:** the sub-user's role flipped from `campaigns.update: true` to
**`false`**. That unblocked ticket 86d3v07h8, which the first pass had to record as BLOCKED — it
is now testable, and it fails.

---

## 2. ❗ BUG-RT-01 — update permission is not enforced · **Critical / S1** · NEW

Discovered because the role change made the case testable for the first time.

**Precondition:** the sub-user's JWT now carries
`access.campaigns = {create: true, view: true, update: false, delete: true}`.

| Layer | Expected | Actual |
|---|---|---|
| UI — Edit button on a campaign card | hidden | **still rendered** (`button[data-bs-target="#updateCampaign"]` present, 1 per card) |
| API — `POST /campaign/update/{id}` as that role | `403` | **`200 {"message":"Campaign updated successfully."}`** |

The ticket 86d3v07h8 is written as a cosmetic complaint — *"the Edit button is visible even
though the user does not have Update/Edit permission"*. The retest shows the button is the lesser
half of the problem: **the endpoint honours the request regardless of the permission**, so
hiding the button would conceal the gap rather than close it.

This is a different class of defect from the folder fence, which *is* enforced server-side and
per-record (verified separately in
[Doc 16](16-subuser-folder-permissions-20260729.md)). Folder scope is checked; the
per-action `access.campaigns.*` map apparently is not.

**Recommended:** re-open 86d3v07h8 as a security issue, or raise BUG-RT-01 separately at S1.
Enforce `access.campaigns.update` server-side on `/campaign/update`, and audit `create`/`delete`
for the same gap.
**Coverage:** `86d3v07h8 · the API must REFUSE an update from a role without update permission`.

---

## 3. ❌ Shipped but still reproducing

### 86d3ux0pq — BUG-CMP-01 "Zero-item Campaign Accepted **by API**"

| Layer | Result |
|---|---|
| UI | ✅ blocked — Create button disabled, `title="Add at least one media item."` |
| API | ❌ `POST /campaign/create` with `data: []` → **`200`**, for the admin **and** the sub-user |

The UI guard was already present when the bug was first raised — the ticket title names the
**API** explicitly. Shipping it on the UI behaviour leaves the reported defect open.

### 86d3ux0ru — BUG-CMP-04 "Campaign Duration Accepts 0 and Negative Values"

Partially fixed. The original report identified the **per-item** duration input as the one
missing a `min` attribute; that is the half still outstanding.

| Layer | Result |
|---|---|
| UI — `#defaultDuration` | ✅ now `min="1"` |
| UI — per-item duration input | ❌ **no `min` attribute**; typing `0` leaves `0` and the Create button stays **enabled** |
| API — `defaultDuration: 0` / `-5` | ❌ `200` |
| API — item `duration: 0` / `-5` / `2.5` | ❌ `200` |

---

## 4. Still `in development` — unchanged verdicts

| ClickUp | Task | Verdict |
|---|---|---|
| 86d3ux0vh | BUG-CMP-08 max name length | ❌ **still open** — 255 → `200`, **256 → `200`**, 1000 → `200` |
| 86d3vbqer | Unique names within folder | ✅ fixed for campaigns · ⚠️ **widgets still not covered** |
| 86d3uz4py | Sub-user unique-per-folder | ✅ fixed |
| 86d3v7wyw | Campaign log folder context | ✅ fixed — safe to ship |
| 86d3vb5nn | Campaign filter on logs | ✅ fixed at API · ⚠️ UI (Team Logs / Account Logs) unverified |
| 86d3v0d58 | Breadcrumbs all user types | 🚫 no acceptance criteria — still not retestable |
| 86d3tz251 | Version-1 with RBAC (epic) | ➖ covered by existing suites |

86d3v7wyw, 86d3vbqer and 86d3uz4py all pass and look ready to move to `shipped` — the opposite
problem to §3.

---

## 5. Suite status

19 tests · 13 pass · 6 fail. Every failure is a real product defect asserted against the
ticket's own expected result:

| Failing test | Ticket |
|---|---|
| name over the limit is rejected | 86d3ux0vh |
| API must refuse update without permission | 86d3v07h8 / BUG-RT-01 |
| zero-item campaign must be rejected | 86d3ux0pq |
| item duration zero must be rejected | 86d3ux0ru |
| item duration negative must be rejected | 86d3ux0ru |
| defaultDuration zero/negative must be rejected | 86d3ux0ru |

```bash
npm run cms2 -- tests/cms2/campaigns/retest/ --project=chromium
```

The suite is **not** `describe.serial` — a retest run must produce a verdict for every ticket,
and serial mode would skip everything after the first failure.

---

## 6. Method note

The first pass recorded 86d3v07h8 as BLOCKED with an assertion on the live claim
(`access.campaigns.update === true`) rather than a silent skip. When the role changed, that
assertion **failed on its own** and surfaced the change immediately — which is how the critical
finding in §2 was reached. A `test.skip()` would have stayed quiet and the gap would still be
unknown.
