# Approval notification emails vs the v2 design — cms2

**Scope** — file upload, content publish (publish to screen) and playlist publish, every case.
**Design** — `email-notifications-v2.html`, templates 21–29 and 37–40 (`docs/email-templates-v2/file-approval/notification.html`).
**Environment** — cms2.pocsample.in, app v3.5.25, API `v3-5api2.pocsample.in`.
**Identities** — `unmaker@yopmail.com` (maker), `unchecker@yopmail.com` (checker), same account.
**Run** — 2026-09-09, end to end: requests raised as the maker, decided as the checker, mail read from both inboxes.

## Coverage

All ten in-scope cases were triggered and the resulting mail read.

| # | Case | Triggered | Mail arrived |
|---|------|-----------|--------------|
| 21 | File upload (single) — request | yes | yes |
| 22 | File upload (batch) — request | yes | yes |
| 23 | File upload (single) — approved | yes | yes |
| 24 | File upload (single) — rejected | yes | yes |
| 25 | File upload (batch) — approved | yes | yes |
| 26 | File upload (batch) — rejected | **not reachable** | no — see D2 |
| 27 | Content publish — request | yes | yes |
| 28 | Content publish — approved | yes | yes |
| 29 | Content publish — rejected | yes | yes |
| 38 | Playlist publish (first time) — request | yes | yes |
| 39 | Playlist publish — approved | yes | yes |
| 40 | Playlist publish — rejected | yes | yes |

The overall verdict is that **the body of every mail is the v2 design** — eyebrow, headline, tiles, item tables, "Where this would land" screen list and footer all render as drawn, with no placeholder leaks. The defects are in the subject lines, in three data slots the backend leaves empty or fills wrongly, and in one template that cannot fire.

---

## D1 — Every subject line differs from the design (10/10 cases)

Not one sent subject matches. The pattern is consistent: no status emoji, no file name, no count where the design carries one, no schedule date.

| # | Designed | Sent |
|---|----------|------|
| 21 | `⏳ Upload approval needed - 1 file` | `New File Awaiting Your Approval` |
| 22 | `⏳ Action Required - 4 files awaiting approval` | `4 New Files Awaiting Your Approval` |
| 23 | `✅ fresh-produce-promo.jpg approved` | `1 File Approved Successfully` |
| 24 | `⚠️ Action needed - fresh-produce-promo.jpg rejected` | `1 File Rejected` |
| 25 | `✅ 2 files approved` | `2 Files Approved Successfully` |
| 27 | `⏳ Action Required - 3 items awaiting publish approval` | `Content Approval Escalation - Action Required` |
| 28 | `✅ Publish approved - going live 2 Aug` | `3 Contents Published Successfully` |
| 29 | `⚠️ Action needed - publish rejected` | `1 Content Rejected` |
| 38 | `⏳ Action Required - new playlist awaiting approval` | `Playlist Approval Escalation - Action Required` |
| 39 | `✅ Playlist approved - 6 changes applied` | `Playlist Approved Successfully` |
| 40 | `⚠️ Action needed - playlist rejected` | `Playlist Rejected` |

**Severity: medium.** The subject is the only part of the mail an approver reads in a list view, and the design's whole point is that it carries the count and the file name.

### D1a — Both request threads say "Escalation" on the *first* send

`Content Approval Escalation - Action Required` and `Playlist Approval Escalation - Action Required` are sent as the **initial** request notification, seconds after the maker submits. Nothing has escalated. The design has no escalation subject for the first send, and the body of the same mail correctly renders the ordinary request layout — only the subject claims escalation.

**Severity: high** for a checker who triages by subject: every routine request looks overdue.

---

## D2 — Template 26 (batch rejection) cannot fire

Rejection in `/library?tab=unapprovedFiles` is per file, and each click sends its own mail. Rejecting two files of one upload request produced **two** `1 File Rejected` mails, not one `2 Files Rejected`. The batch-approval counterpart works — approving two files of a request produced a single `2 Files Approved Successfully`, so the grouping exists on the approve path only.

The approval mail is aware of the split and says so: *"The other one file in this request was rejected and is covered in their own mail."* — so the intended design is one mail per outcome, and the rejection half of it is missing.

**Severity: medium.** A maker who has ten files rejected receives ten emails.

---

## D3 — Empty and wrong data slots

| Where | Expected | Actual |
|-------|----------|--------|
| Upload request header (T21/T22) | `Uploaded by Ananya Sharma · Content Manager` | `Uploaded by ` — nothing after it. The same name renders correctly further down in the per-file `By` row. |
| Content publish request greeting (T27) | `Hi Rahul Verma,` | `Hi there,` — while the upload request in the same thread correctly opens `Hi un checker,` |
| Content publish rejection item row (T29) | `BY <requester>` | `BY un checker` — the **reviewer's** name. This mail goes to the maker about the maker's own submission. |
| Single rejection body (T24) | caption `This is the version that was refused.` | heading `Rejected File` followed by a blank caption line |

**Severity: medium** (T29 is the worst of the four — it misattributes the submission).

---

## D4 — Inconsistent labels and footers between mails in one thread

- The folder tile is labelled three different ways for the same field: `Uploaded into` (T21 request), `Now in` (T23 approved), `Folder name` (T24 rejected). The design uses `Folder name` throughout.
- Decision mails add a `Decision / Approved` tile that restates the H1 immediately above it. The design gallery explicitly removed a panel that did this in the cluster set (see the `screensWarn` comment in the template source) — the same anti-pattern is back here.
- The playlist request (T38) closes with `Automated notification from Wilyer Partner / Please do not reply to this email.` while every other mail closes with `Automated message from <brand> • Generated <timestamp>`. The playlist request is the only one with no generated stamp in the footer.
- Playlist decision mails put the footer *above* the automated-message note; the upload and publish mails put it below.

**Severity: low**, but it is visible: a maker reading the thread sees three different footers for one workflow.

---

## D5 — Blockers found on the way (not email defects, but they gate the flows)

1. **No media-upload control exists on `/library` for a folder-fenced maker**, even with `media.upload: true` in the role. `/library?action=uploadContent` renders no modal, and the dashboard's *Add Media* tile links to that same dead route. The only upload entry that works is `+ Upload` inside the **playlist editor**.
2. **`+ New Playlist` on `/playlists` does nothing** on a fresh page load; `/playlists?action=createPlaylist` opens the same modal reliably.
3. **`/library` and `/playlists` show counts they cannot list** for this maker: *Total Files - 23 / No Files Found*, *Total Playlists 2 / No playlists found!*, *Folders ( 1 )* expanding to an empty panel. The counts are account-wide, the lists are folder-scoped, and the folder the maker owns (`sector28`) has a parent the maker cannot see, so it never appears at root. The same media *is* visible inside the playlist editor.
4. Pending upload cards render every file as `0.00MB` regardless of size.

---

## Reproducing

```
npm run cms2 -- tests/cms2/notifications/approval-flows.spec.ts        # raise + decide everything
npm run cms2 -- tests/cms2/notifications/approval-mail-content.spec.ts # grade the mail
```

`approval-flows.spec.ts` needs `CMS_ALLOW_DESTRUCTIVE=true`; both need `CMS_MAKER_*` and `CMS_CHECKER_*` in `.env`.

The design contract lives in `test-data/emailTemplates.data.ts` — one entry per case, with the designed subject beside the one actually sent. Every defect above has a test: the ten subject cases and the four cross-cutting checks are marked `test.fail()`, so they turn red as *passed unexpectedly* the moment the backend is fixed, which is the cue to delete the marker.
