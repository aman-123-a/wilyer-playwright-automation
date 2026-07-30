# Retest — ClickUp "Campaigns" list, status **in development**

**ClickUp list:** [Campaigns · 901616106811](https://app.clickup.com/9016764704/v/l/li/901616106811)
**Environment:** `https://cms2.pocsample.in` · API `https://v3-5api2.pocsample.in/v3/cms`
**Date:** 2026-07-29 · **Identities:** admin `dev@wilyer.com` · sub-user `manager12348@yopmail.com`
**Suite:** `tests/cms2/campaigns/retest/clickup-in-development.spec.ts` — 14 tests,
**13 pass / 1 fail**, result identical across three consecutive runs, no residue left behind.

Each test asserts the **ticket's own expected result**, so a genuinely fixed task passes and an
unfixed one fails with the evidence attached. Test names carry the ClickUp id.

```bash
npm run cms2 -- tests/cms2/campaigns/retest/ --project=chromium
```

---

## Verdicts — 12 tasks in development

| ClickUp | Task | Verdict |
|---|---|---|
| 86d3ux0q0 | BUG-CMP-02 — Regex injection in campaign search | ✅ **FIXED** |
| 86d3ux0r0 | BUG-CMP-03 — Campaign read API 500 without sort/order | ✅ **FIXED** |
| 86d3ux0vh | BUG-CMP-08 — No maximum campaign name length | ❌ **NOT FIXED** |
| 86d3vbqer | Enforce unique names within folder (campaigns & widgets) | ✅ **FIXED** for campaigns · ⚠️ widgets not covered |
| 86d3uz4py | Sub-user — campaign names unique within same folder only | ✅ **FIXED** |
| 86d3v9yhr | Admin can find/access a sub-user's campaign inside a folder | ✅ **FIXED** |
| 86d3v7wyw | Sub-user campaign creation log missing folder context | ✅ **FIXED** |
| 86d3v88q0 | Playlist creation log does not display the folder name | ✅ **FIXED** |
| 86d3vb5nn | Campaign filter in Team Logs and Account Logs | ✅ **FIXED at API** · ⚠️ UI not verified |
| 86d3v07h8 | Sub-user — Edit button visible without Update permission | 🚫 **BLOCKED** — no suitable fixture role |
| 86d3v0d58 | Breadcrumb name correct for all user types | 🚫 **NOT RETESTABLE** — no acceptance criteria |
| 86d3tz251 | Version-1 with RBAC (epic) | ➖ Covered by the existing campaign suites |

**Eight of twelve are verifiably fixed. One is confirmed still open. Three cannot be retested as
written** — reasons and what each needs are below.

---

## ❌ 86d3ux0vh — BUG-CMP-08 still open · **High**

The only regression in the batch. The ticket's expected result is *"Campaign name should be
restricted to the maximum allowed length (for example, 255 characters) with an appropriate
validation message."*

| Name length | Expected | Actual |
|---|---|---|
| 255 characters | `200` | `200` ✅ |
| 256 characters | `400` + validation message | **`200 {"message":"Campaign created successfully."}`** |
| 1000 characters (the ticket's own repro) | `400` | **`200`** |

No cap on the server and none in the input (`maxLength = -1`). Reproduced identically on three
runs. Note the other two bug tickets raised alongside it — BUG-CMP-02 and BUG-CMP-03 — **are**
fixed, so this one looks simply missed rather than deliberately deferred.

**Impact:** overflows the picker card and pushes page layout, and flows into playlist slot
labels and approval email bodies.
**Fix:** cap in the Joi schema and set `maxlength` on the input.

---

## ✅ Confirmed fixed

### 86d3ux0q0 — regex injection in search
Search now escapes metacharacters. `.*`, `^QA`, `.+` and `[a-z]` each return **`totalDocs: 0`**
against an account holding 43 campaigns, while a literal substring still matches exactly one.
Treated as plain text, as the ticket asked.

### 86d3ux0r0 — 500 without sort/order
`GET /campaign/read?limit=50&page=1` now returns **`200`** with default sorting applied. Also
verified with only `sort` and only `order` supplied.

### 86d3vbqer / 86d3uz4py — name uniqueness scoped to the folder
Implemented exactly to the stated business rules, and the rule is enforced **server-side**:

| Case | Result |
|---|---|
| duplicate in the **same** folder | `400` "A campaign named 'X' already exists in this folder (case-insensitive)." |
| same name in a **different** folder | `200` |
| same name at the **root** | `200` |
| case variant in the same folder | `400` — the rule is case-insensitive |
| **rename** onto a taken name in the same folder | `400`, and the campaign keeps its old name |
| sub-user, duplicate in its own folder | `400` — same rule, same message |

Covers both required operations ("Create and Rename/Edit"). The validation message names the
folder scope and states the case-insensitivity, which is better than the ticket asked for.

⚠️ **Widgets are not covered.** Ticket 86d3vbqer covers *"Widgets and Campaigns"*. Only the
campaign half was retested — a widget equivalent needs its own fixture and endpoint mapping.
Treat the widget half as untested, not passed.

### 86d3v9yhr — admin can find a sub-user's foldered campaign
Following the ticket's repro (*"search for the campaign created by the Sub User"*), the admin's
search now reaches **across folders** from the unfiltered scope and returns the campaign; the
admin can then read it and see its `folderId`.

One behaviour worth not mistaking for a bug: the admin's **unfiltered list** still does not
include foldered campaigns (43 at root, the sub-user's campaign not among them). That is folder
navigation working as designed — *search* is the cross-folder tool, and that is what the ticket
specified.

### 86d3v7wyw — campaign log carries folder context
```json
{ "type": "campaign",
  "msg": "Campaign 'QA_RT_LogCamp_…' created in folder 'Meerut'.",
  "user": "manager12348@yopmail.com" }
```
Folder named, and correctly attributed to the sub-user rather than the parent account.

### 86d3v88q0 — playlist log carries the folder name
```json
{ "type": "playlist", "msg": "Playlist QA_RT_LogPl_… created in folder 'UP'." }
```
Also discovered while retesting: `POST /playlist/create` now accepts a `folderId` field and
answers `201` with the created id — that is how a playlist is filed into a folder
(`playlistFolder` and `parentFolder` are both rejected).

### 86d3vb5nn — campaign filter on logs
`GET /log/read?type=campaign` returns campaign activity only (1 764 entries, single distinct
type) against a mixed unfiltered feed. The sub-user can reach the same filtered feed, matching
its `access.logs.view`.

⚠️ **API only.** The ticket says the filter should be available in *"both Team Logs and Account
Logs"* — i.e. two UI surfaces. The backing filter works; whether the control is rendered in both
places was not verified and should be checked by hand before closing.

---

## 🚫 Could not be retested

### 86d3v07h8 — Edit button visible without Update permission · **needs a fixture**
The ticket's precondition is a sub-user **without** `campaigns.update`. The available test
sub-user's JWT carries `access.campaigns = {view: true, create: true, update: true, delete: true}`,
so the Edit button is legitimately visible and any UI check here would prove nothing.

**To retest:** create a role with `campaigns = {view: true, update: false}`, assign it to a test
sub-user, and supply those credentials. The suite records this blocker explicitly rather than
skipping silently, so it stays visible in every run.

### 86d3v0d58 — breadcrumb name for all user types · **needs acceptance criteria**
The ticket has an empty description and asks that breadcrumbs be *"displayed correctly …
providing consistent navigation"*. There is no statement of the expected breadcrumb string per
page and per role, so there is nothing to assert against — any test would encode a guess.

**To retest:** list the expected breadcrumb text for each page and each of Main User / Sub User /
Unrestricted User.

### 86d3tz251 — Version-1 with RBAC
An epic describing the whole feature rather than a discrete fix. Its RBAC and scheduling content
is already covered by
[`subuser-folder-campaigns.spec.ts`](16-subuser-folder-permissions-20260729.md) (31 tests) and
[`campaign-scheduling.spec.ts`](../scheduling/01-content-scheduling-cases-a-f-20260729.md) (15).

---

## Environment drift noticed during this run

Worth flagging because it changes what a fixture can assume, and it silently invalidated an
assumption from yesterday's session:

- The sub-user's assigned folder changed from **"Noida"** (2026-07-28) to **"Meerut"**
  (2026-07-29), and the new folder contains **no media files**.
- Consequently a sub-user can no longer pick media from its own folder in the campaign create
  modal. Campaign creation still succeeds only because item media is not scope-checked —
  **BUG-SUBF-01**, reported separately.

Neither this suite nor the RBAC suite hardcodes the folder or its media; both resolve them at
run time, so they survive the next reassignment.

---

## Still open from the previous session, not in this ClickUp list

These were reported on 2026-07-29 and have no ticket in the list yet — worth raising so they are
not lost:

| ID | Severity | Title |
|---|---|---|
| BUG-SUBF-01 | High / S2 | Campaign items may reference media outside the folder fence — cross-scope disclosure |
| BUG-SCHED-01 | High / S2 | Campaign zone item has no Schedule control — scheduling cases B and D unauthorable |
| BUG-SCHED-02 | High / S2 | Per-file schedules inside a campaign not implemented — case C impossible |
| BUG-SCHED-03/04/05 | Medium / S3 | Unsatisfiable schedules accepted; playlist read model ≠ write model |
| BUG-SUBF-02 | Medium / S3 | Campaign item may point at a non-existent media id |

Full detail: [BUG-REPORT-20260729](../BUG-REPORT-20260729.md).
