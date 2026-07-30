# Content Scheduling (Cases A–F) — Test Report

**Environment:** `https://cms2.pocsample.in` · API `https://v3-5api2.pocsample.in/v3/cms`
**Date:** 2026-07-29 · **Account:** admin
**Suite:** `tests/cms2/campaigns/scheduling/campaign-scheduling.spec.ts` — 15 tests, all passing,
two consecutive clean runs, no flakes.
**Method:** driven against the live cms2 build with real media and a real campaign.
Persistence is proven by API read-back, never by a toast. Every claim below was
observed on the wire; nothing is inferred from the requirement text.

---

## 1. Where a schedule actually lives

The requirement is written as though a schedule is a property of a campaign. It is not.
Mapped by reading the server and by capturing the editor's own save request:

```
playlist.layouts[].schedule                        → a whole layout          (Case E)
playlist.layouts[].zones[].schedule                → a zone                  (unreachable, §4)
playlist.layouts[].zones[].array.data[].schedule   → one item in a zone      (Cases A–D)
```

A zone item is **either** `{file, duration, schedule}` **or** `{campaign, duration}`, and both
kinds sit in the same `array.data`. That is what makes "a scheduled file next to a campaign"
expressible at all.

Schedule shape (`null` means no schedule, i.e. always on):

```json
{ "startDate": "2026-12-01", "endDate": "2026-12-31",
  "startTime": "09:00",     "endTime": "17:00",
  "isRoutineEnabled": true,
  "days": { "sunday": false, "monday": true, ..., "saturday": false } }
```

The campaign document itself (`/campaign/read/{id}`) has **no schedule field at any depth**.

---

## 2. Case-by-case verdict

| Case | Requirement | Verdict | Evidence |
|------|-------------|---------|----------|
| **A** | Scheduled file next to a normal campaign | ✅ **Works** | SCH-A1/A2 — date + time + Mon–Fri set in the editor, persisted exactly, round-trips back into the UI |
| **B** | A whole campaign scheduled for a date range | ⚠️ **Storage yes, UI no** | SCH-B1/B2 — persists when written via API; the editor exposes no schedule control on a campaign item |
| **C** | Different files inside one campaign, different schedules | ❌ **Not supported** | SCH-C1/C2 — API rejects `data[].schedule` (400); campaign form has zero date/time fields |
| **D** | Two campaigns, only one scheduled | ⚠️ **Blocked by B** | Same missing control — cannot be authored |
| **E** | A whole layout scheduled for a season | ✅ **Works** | SCH-E1 — layout date range persists; zone contents untouched |
| **F** | Nothing currently in schedule | ✅ **Representable** | SCH-F1 — all items scheduled into a past window; saves cleanly |
| — | "Scheduling never breaks the play order" | ✅ **Holds** | SCH-ORD — scheduling the middle item leaves the order identical |

**The headline:** the statement "everything above is handled and working end to end" does not
hold. **Case C is not implemented anywhere in the product**, and **Cases B and D cannot be
performed by a user** — only by someone posting to the API directly.

---

## 3. Defects

| ID | Severity | Title | UI? |
|----|----------|-------|-----|
| BUG-SCHED-01 | **High / S2** | A campaign in a zone has no Schedule control — Cases B and D unauthorable | **Yes** |
| BUG-SCHED-02 | **High / S2** | Campaign items cannot carry a schedule — Case C unimplemented | **Yes** |
| BUG-SCHED-03 | Medium / S3 | Server stores an end-before-start date range unchallenged | No |
| BUG-SCHED-04 | Medium / S3 | Routine enabled with zero days selected is accepted and stored | No |
| BUG-SCHED-05 | Medium / S3 | Playlist read model ≠ write model; an unmodified round-trip is rejected | No |

### BUG-SCHED-01 — a campaign zone item has no Schedule control

A file item in the Slides strip renders **Replace File · Schedule · Change Position · Remove**.
A campaign item renders **Edit Campaign · Change Position · Remove** — the Schedule badge is
absent, and no hover or context interaction reveals one.

The storage layer *does* support it: writing a schedule onto the campaign item via
`POST /playlist/update/{id}` is accepted and reads back intact (SCH-B2). So this is a missing
UI affordance over a working model — the cheapest of the two possible fixes.

**Impact:** Cases B and D of the specification are unreachable for every user.

### BUG-SCHED-02 — Case C is not implemented

`POST /campaign/create` is strict-validated and rejects a schedule at item level:

```
{"message":"\"data[1].schedule\" is not allowed"}
```

Every plausible spelling was probed at both campaign and item level — `schedule`, `startDate`,
`endDate`, `startTime`, `endTime`, `days`, `weekdays`, `scheduleEnabled`, `isScheduled`,
`validFrom`, `validTo`, `recurrence`, `timing` — and all 20 combinations returned 400. The
campaign create/update form contains no date or time input of any kind.

**Impact:** "Campaign( A: always, B: weekends only, C: always )" cannot be expressed. This needs
schema work, not just a UI control.

### BUG-SCHED-03 — unsatisfiable date range accepted

The editor constrains the range correctly (the From input carries `max=<to>`, the To input
carries `min=<from>` — SCH-V1), but the server does not. Posting
`startDate: 2026-12-31, endDate: 2026-12-01` returns 200 and stores it. The window can never be
satisfied, so the item silently never plays and nothing tells the author why. Client-only
validation is bypassable by anything that is not the editor.

### BUG-SCHED-04 — routine on, no days selected

`isRoutineEnabled: true` with all seven days `false` is accepted and stored. No day can ever
match, so the content is permanently hidden with no warning. Same class of failure as
BUG-SCHED-03: a state that is representable but unsatisfiable.

### BUG-SCHED-05 — read model and write model disagree

`GET /playlist/read/{id}` returns a document that `POST /playlist/update/{id}` refuses:

| Field | Read returns | Write demands |
|-------|--------------|---------------|
| `zones[].schedule` | `null` or an object | **an array** |
| `array.data[].file` | expanded object | **id string** |
| `array.data[].campaign` | expanded object | **id string** |

An unmodified read → write round-trip fails with
`"layouts[0].zones[0].schedule" must be an array`. The editor never hits this because it holds
its own client-side model; any API consumer must special-case all three. A consequence is that
**zone-level scheduling is unreachable** — the only shape the writer accepts for `zone.schedule`
is an array, which is not what a schedule is, even though the read model carries the field.

`PlaylistService.normaliseForWrite()` encapsulates the workaround so the suite can do
read-modify-write; SCH-Z1 asserts the defect so the workaround is removed when it is fixed.

---

## 4. What this suite does **not** prove

It covers the authoring half end to end: what the editor lets a user express, what the API
accepts, and what the server actually stores.

It does **not** prove runtime playback — that a player skips an out-of-schedule item at 3pm on a
Sunday, that a campaign rotates one file per loop, or that two campaigns in a zone stay fair.
No screen-facing endpoint is reachable from a CMS session: `/screen/read` returns device rows
and a playlist *name*, never resolved content. Rather than fake this with a proxy assertion, it
is left unasserted and called out here.

**To close the gap**, one of:

1. a documented player/device endpoint that returns resolved content for a screen at a given
   timestamp — then schedule evaluation becomes directly assertable with an injectable clock;
2. a CMS-side preview that reports which items are in schedule *now*;
3. a device emulator in the test rig.

Option 1 is the cheapest and would make the whole of Cases A–F verifiable end to end.

---

## 5. Suite contents

| Test | Case | Type |
|------|------|------|
| SCH-000 | fixture | a zone holds 2 files + 1 campaign together |
| SCH-A1 | A | file takes date + time + weekday schedule via the UI |
| SCH-A2 | A | the saved weekday set round-trips back into the editor |
| SCH-B1 | B/D | campaign item offers no schedule control (defect) |
| SCH-B2 | B | API accepts and persists a campaign-item schedule |
| SCH-Z1 | — | read-back verbatim is rejected by the writer (defect) |
| SCH-C1 | C | per-file schedule inside a campaign rejected (defect) |
| SCH-C2 | C | campaign editor exposes no schedule fields (defect) |
| SCH-E1 | E | layout date-range schedule persists |
| SCH-F1 | F | all items scheduled out at once still saves |
| SCH-ORD | — | scheduling does not reorder the zone |
| SCH-V1 | boundary | editor constrains the range so it cannot invert |
| SCH-V2 | boundary | API accepts an inverted range (defect) |
| SCH-V3 | boundary | routine on with zero days is storable (defect) |

Run with:

```bash
npm run cms2 -- tests/cms2/campaigns/scheduling/ --project=chromium
```

Requires `CMS_ALLOW_DESTRUCTIVE=true`; the suite creates and removes its own playlist and
campaign and leaves no residue (verified).

**Note on the defect tests.** SCH-B1, SCH-V2, SCH-V3 and SCH-Z1 assert the *current, wrong*
behaviour so the suite stays green today and turns **red the moment a fix lands** and the
expectation needs flipping. Each names its BUG-SCHED id.
