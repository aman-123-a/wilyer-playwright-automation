# Bug Report — Content Scheduling & Sub-user Folder Permissions

**Environment:** `https://cms2.pocsample.in` · API `https://v3-5api2.pocsample.in/v3/cms`
**Date:** 2026-07-29
**Identities:** admin `dev@wilyer.com` (unrestricted) · sub-user `manager12348@yopmail.com`
(restricted, scoped to one folder). Credentials live only in the local gitignored `.env`.
**Method:** driven against the live cms2 build with real media, real campaigns and real
playlists. Every persistence claim is settled by an **API read-back**, never by a toast. Every
"was it really blocked?" claim is settled by an **admin read-back**, never by the error alone.
Each request is made as an explicit identity — the RBAC suite clears `storageState` and logs in
per identity, so no assertion can pass by inheriting the admin session.

**Regression coverage:** 46 tests, all passing, no flakes.
`tests/cms2/campaigns/scheduling/campaign-scheduling.spec.ts` (15) ·
`tests/cms2/campaigns/rbac/subuser-folder-campaigns.spec.ts` (31)

Open defects are encoded as assertions on the **current, wrong** behaviour, so each suite stays
green today and turns **red the moment a fix lands** and the expectation needs flipping.

---

## Summary — 7 open

| ID | Severity | Title | UI? | Status |
|----|----------|-------|-----|--------|
| BUG-SCHED-01 | **High / S2** | A campaign in a zone has no Schedule control — scheduling cases B and D are unauthorable | **Yes** | **OPEN** |
| BUG-SCHED-02 | **High / S2** | Per-file schedules inside a campaign are not implemented — case C impossible | **Yes** | **OPEN** |
| BUG-SUBF-01 | **High / S2** | Campaign items may reference media outside the folder fence — cross-scope disclosure | No | **OPEN** |
| BUG-SCHED-03 | Medium / S3 | Server stores an end-before-start date range unchallenged | No | **OPEN** |
| BUG-SCHED-04 | Medium / S3 | "Repeat on selected days" with zero days selected is accepted and stored | No | **OPEN** |
| BUG-SCHED-05 | Medium / S3 | Playlist read model ≠ write model; an unmodified round-trip is rejected, and zone scheduling is unreachable | No | **OPEN** |
| BUG-SUBF-02 | Medium / S3 | A campaign item may point at a media id that does not exist | No | **OPEN** |

**The dominant pattern from the campaigns V1 work is unchanged:** validation lives in the
browser, not on the server. Every boundary the UI blocks, the API accepts (BUG-SCHED-03, -04).
**Folder authorization is again the exception** — it is enforced server-side, per-record, and
held up under direct-id attack and privilege-escalation attempts. The one place it does *not*
reach is the media a campaign item points at (BUG-SUBF-01).

---

## Open defects

### BUG-SCHED-01 — Campaign zone item has no Schedule control · High / S2 · **UI-reproducible**

**Steps (UI):** playlist editor → select a zone → Slides strip. Compare a **file** entry with a
**campaign** entry.
**Actual:** a file entry renders `Replace File · Schedule · Change Position · Remove`. A
campaign entry renders `Edit Campaign · Change Position · Remove` — **no Schedule control**, at
rest or on hover.
**Expected:** a campaign in a zone can be given a schedule, per the specification:
- *Case B* — "File1 + Campaign(A,B,C) (only 1 Dec to 31 Dec)"
- *Case D* — "Campaign A (no schedule) + Campaign B (Mon to Fri)"

**Evidence that the model supports it:** writing a schedule onto the campaign zone item via
`POST /playlist/update/{id}` is accepted and reads back intact:

```json
{ "campaign": {...}, "duration": 10,
  "schedule": { "startDate": "2026-12-01", "endDate": "2026-12-31", ... } }
```

**Impact:** two of the six specified scheduling cases cannot be performed by any user. Only
someone posting directly to the API can author them — which also means anything authored that
way is invisible and uneditable in the editor.
**Fix:** render the existing schedule badge on campaign zone items. This is a missing UI
affordance over a working model — the cheaper of the two possible fixes.
**Coverage:** SCH-B1 (asserts the control is absent), SCH-B2 (asserts the model persists it).

---

### BUG-SCHED-02 — Per-file schedules inside a campaign are not implemented · High / S2 · **UI-reproducible**

**Steps (API):**
```
POST /campaign/create
{"name":"X","defaultDuration":10,"folderId":null,
 "data":[{"file":"<id>","duration":10},
         {"file":"<id>","duration":10,"schedule":{"startDate":"2026-12-01"}}]}
```
**Actual:** `400 {"message":"\"data[1].schedule\" is not allowed"}`
**Steps (UI):** campaign create/update form — contains **no date or time input of any kind**
(`input[type=date], input[type=time]` count is 0).
**Expected:** *Case C* — "Campaign( A: always, B: weekends only, C: always )".

**Scope of the probe:** every plausible spelling was tried at both campaign level and item
level — `schedule`, `startDate`, `endDate`, `startTime`, `endTime`, `days`, `weekdays`,
`scheduleEnabled`, `isScheduled`, `validFrom`, `validTo`, `recurrence`, `timing`. **All 20
combinations returned 400.** The campaign schema is strict and has no schedule slot at any depth.

**Impact:** the campaign is the one place a schedule cannot be expressed, despite the
specification treating it as the primary place. A user wanting "this file only on weekends"
must split the campaign, which changes rotation behaviour.
**Fix:** schema work, not just a UI control — add `schedule` to the campaign item model, then
surface it in the campaign editor.
**Coverage:** SCH-C1 (API), SCH-C2 (UI).

---

### BUG-SUBF-01 — Campaign items escape the folder fence · High / S2 · NEW

The folder fence covers where a campaign is **filed**. It does not cover what a campaign item
**points at**.

**Steps (all as the restricted sub-user):**
1. Confirm file `6a6335c662dca4bcc662d41d` is **not** in the sub-user's library —
   `GET /file/read` for that identity does not return it.
2. `POST /campaign/create` with `folderId` = the assigned folder and
   `data: [{"file":"6a6335c662dca4bcc662d41d","duration":10}]`
3. `GET /campaign/read/{id}` as the sub-user.

**Actual:** step 2 returns `200`; step 3 returns the foreign file's **name, type and a working
CDN thumbnail URL**:
```json
{"file":{"id":"6a6335c662dca4bcc662d41d",
         "name":"sample_1784886700341.jpg","type":"image",
         "thumb":"https://d2o2gp3gd28xa2.cloudfront.net/.../thumb-sample_1784886700341.png"}}
```
**Expected:** `403` — a campaign item must reference media within the caller's folder scope.
**Impact:** cross-scope data disclosure. The sub-user obtains metadata and a fetchable asset URL
for media it is not entitled to see, and can place that media on screens it controls. 24-hex
ObjectIds are not secret and leak through exports and URLs, so this is enumerable rather than a
one-off.
**Fix:** validate every `data[].file` against the caller's folder scope on write, exactly as
`folderId` already is. Apply to create **and** update.
**Coverage:** SUBF-026 (asserts the precondition that the file is invisible, then the leak).

---

### BUG-SCHED-03 — Unsatisfiable date range accepted by the server · Medium / S3

**Steps:** `POST /playlist/update/{id}` with an item schedule of
`{"startDate":"2026-12-31","endDate":"2026-12-01"}`
**Actual:** `200`, stored verbatim and returned on read.
**Expected:** `400` — an end-before-start window can never be satisfied.
**Note:** the **editor constrains this correctly** — the From input carries `max=<to>` and the
To input carries `min=<from>` (verified in SCH-V1). The rule exists only on the client, so
anything that is not the editor bypasses it.
**Impact:** the item silently never plays and nothing tells the author why. Indistinguishable
from a playback bug when reported by a customer.
**Fix:** server-side `endDate >= startDate` (and the same for `endTime` within a single day).
**Coverage:** SCH-V1 (UI constraint holds), SCH-V2 (server does not).

---

### BUG-SCHED-04 — Routine enabled with zero days selected · Medium / S3

**Steps:** store an item schedule of `{"isRoutineEnabled":true,"days":{all seven false}}`
**Actual:** `200`, stored and returned.
**Expected:** `400`, or the day set coerced to "every day".
**Impact:** same class as BUG-SCHED-03 — a representable but unsatisfiable state. No day can
ever match, so the content is permanently hidden with no warning.
**Note:** proven at the API. Whether the editor allows deselecting all seven day buttons was
**not** verified, so the UI column is marked No conservatively rather than assumed.
**Fix:** reject `isRoutineEnabled: true` with an empty day set.
**Coverage:** SCH-V3.

---

### BUG-SCHED-05 — Playlist read model ≠ write model · Medium / S3

`GET /playlist/read/{id}` returns a document that `POST /playlist/update/{id}` refuses.

| Field | Read returns | Write demands |
|-------|--------------|---------------|
| `zones[].schedule` | `null` or an object | **an array** |
| `array.data[].file` | expanded object | **id string** |
| `array.data[].campaign` | expanded object | **id string** |

**Steps:** read a playlist and POST it back unmodified.
**Actual:** `400 {"message":"\"layouts[0].zones[0].schedule\" must be an array"}`, then
`"...file" must be a string` once the first is fixed.
**Expected:** an unmodified round-trip is accepted — the most basic contract a REST resource
can have.
**Impact:** two consequences.
1. Every API consumer must special-case all three fields. The editor never trips over this
   because it holds its own client-side model and sends the collapsed shape, so the mismatch is
   invisible until someone integrates.
2. **Zone-level scheduling is unreachable.** The read model carries `zone.schedule`, but the
   only shape the writer accepts for it is an array — which is not what a schedule is. There is
   no way to set one.
**Fix:** align the writer's schema with the reader's projection (or document a distinct write
DTO). Decide whether `zone.schedule` is a real feature; if so, give it an object schema.
**Coverage:** SCH-Z1. The workaround lives in one place —
`PlaylistService.normaliseForWrite()` — so it can be deleted when this is fixed.

---

### BUG-SUBF-02 — No referential integrity on campaign media ids · Medium / S3

**Steps:** `POST /campaign/create` with `data: [{"file":"000000000000000000000000","duration":10}]`
**Actual:** `200`. The dangling item is stored and returned on read.
**Expected:** `400` — the media id must resolve.
**Impact:** the player receives an item it cannot resolve. Related to BUG-CMP-01 (an item-less
campaign): both produce a campaign that occupies a loop slot with nothing to show.
**Fix:** validate media ids exist on create and update.
**Coverage:** SUBF-034.

---

## Previously-known defects, newly confirmed on the sub-user path

Not new, but recorded only for the admin until now. All reproduce for the **restricted
sub-user inside its own folder**, so no role gates them:

| Case | Result | Existing id |
|---|---|---|
| zero media items | `200` — UI blocks it, API does not | BUG-CMP-01 |
| `defaultDuration` 0 / −5 / 2.5 / 999999 | all `200` | BUG-CMP-04 |
| name 256 / 1000 characters | `200` — no maximum length | BUG-CMP-08 |
| whitespace-only name | `200` — no trim | BUG-CMP-09 |
| **empty** name | `400` `"name" is not allowed to be empty` | *the only field rule enforced* |

**One divergence worth acting on:** BUG-CMP-10 records that an invalid `folderId` is silently
coerced to `null` for the **admin**. For a restricted sub-user the folder is resolved first, so
the request is rejected outright (`403`, or `400 "Folder not found."` for a well-formed unknown
id) — the safer behaviour, and the one the admin path should adopt.

---

## Verified as working correctly

Recorded so a future regression is attributable, and so the report is not read as
"scheduling and RBAC are broken".

**Folder authorization (sub-user).** Enforced server-side and per-record:

| Attempt | Result |
|---|---|
| create inside an assigned folder | `200` |
| create in an unassigned folder | `403` "Access denied to this folder." |
| create at root — `null` / `""` / omitted | `403` "You can only create campaigns inside a folder you have access to." |
| create with a well-formed unknown folder id | `400` "Folder not found." |
| read / update / delete a campaign in an unassigned folder | `403` "You don't have access to this campaign." |
| move own campaign out of scope, or to root | `403`, and `folderId` is unchanged on re-read |
| no token | `401` |

Notably: **privilege escalation is blocked** (a sub-user cannot move its own campaign into a
folder it does not own), and **IDOR is blocked** with the *same* message for read, update and
delete — authorization runs **before** the lookup, so the response does not distinguish "exists
but forbidden" from "does not exist". All three spellings of "no folder" plus a malformed id hit
the same rule; none silently defaults to the root.

**Scheduling cases that do work.** *Case A* (a scheduled file beside a campaign — date, time and
a Mon–Fri weekday subset all persist exactly and round-trip back into the editor), *Case E* (a
whole layout scheduled for a date range), *Case F* (every item scheduled out at once is a legal
authoring state), and the cross-cutting invariant that **scheduling never reorders a zone**.

---

## Retracted during investigation

Recorded per the Doc 10 convention, so the same false trail is not re-walked.

**"The Set Schedule panel has no weekday selector."** First probe reported zero day checkboxes
after enabling *Repeat on selected days*, and the saved result had all seven days `true` —
which reads as "Mon–Fri cannot be expressed". **False.** The day pickers are round **buttons**
carrying `title="monday"` etc., not checkboxes; selected state is the `btn-primary` class, and
they default to all-on. A weekday subset does persist correctly (SCH-A1/A2).

---

## Not covered — and what would close it

The scheduling suite proves the **authoring** half end to end: what the editor lets a user
express, what the API accepts, and what the server stores.

It does **not** prove runtime playback — that a player skips an out-of-schedule item at 3pm on a
Sunday, that a campaign rotates one file per loop, or that two campaigns in a zone stay fair.
No screen-facing endpoint is reachable from a CMS session: `/screen/read` returns device rows
and a playlist *name*, never resolved content. This was left unasserted rather than approximated
with a proxy check.

To close it, cheapest first:
1. a player/device endpoint returning resolved content for a screen at a given timestamp — then
   schedule evaluation becomes directly assertable with an injectable clock;
2. a CMS-side preview reporting which items are in schedule *now*;
3. a device emulator in the test rig.

Until one exists, the claim "editor, publish and the live screen all stay in sync" is **verified
for the editor and the stored document only**.

---

## Reproduction

```bash
# Scheduling (15)
npm run cms2 -- tests/cms2/campaigns/scheduling/ --project=chromium

# Sub-user folder permissions (31)
npm run cms2 -- tests/cms2/campaigns/rbac/ --project=chromium
```

Both require `CMS_ALLOW_DESTRUCTIVE=true`. Each suite creates and removes its own artefacts and
leaves no residue on the shared server (verified after the final run: the sub-user's folder
returns to its 4 pre-existing campaigns, the root to 42).

**Detail reports:**
[Content scheduling](scheduling/01-content-scheduling-cases-a-f-20260729.md) ·
[Sub-user folder permissions](campaigns-v1-rbac/16-subuser-folder-permissions-20260729.md)
