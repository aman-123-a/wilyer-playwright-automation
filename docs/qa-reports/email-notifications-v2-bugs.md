# Bug list — approval notification emails (v2), cms2

Filed against `email-notifications-v2.html` templates 21–29 / 37–40.
Environment: cms2.pocsample.in, app **v3.5.25**, API `v3-5api2.pocsample.in`.
Accounts: `unmaker@yopmail.com` (maker) / `unchecker@yopmail.com` (checker), same account, password `12345`.
Observed: **2026-09-09**, end to end. Evidence: both yopmail inboxes.

Full analysis: [email-notifications-v2-approval-threads.md](./email-notifications-v2-approval-threads.md).
Automated coverage: `tests/cms2/notifications/` — every bug below has a test marked `test.fail()`.

---

## BUG-MAIL-01 · Request emails are labelled "Escalation" on the first send
**Severity: High** · Templates 27, 38 · Recipient: checker

**Steps**
1. Sign in as `unmaker`, publish content to screens (or send a playlist for approval).
2. Open `unchecker@yopmail.com` immediately.

**Expected** — `⏳ Action Required - 3 items awaiting publish approval` (T27) / `⏳ Action Required - new playlist awaiting approval` (T38).
**Actual** — `Content Approval Escalation - Action Required` / `Playlist Approval Escalation - Action Required`, sent seconds after submission, before any escalation window has elapsed.

**Impact** — a checker who triages by subject sees every routine request as already overdue; a genuine escalation becomes indistinguishable from a new request.
**Note** — the mail *body* renders the ordinary request layout correctly; only the subject claims escalation.

---

## BUG-MAIL-02 · Every subject line differs from the design (10/10 cases)
**Severity: Medium** · Templates 21–29, 38–40 · Recipients: both

Sent subjects carry no status emoji, no file name, and no count/date where the design has one.

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

**Impact** — the subject is the only part an approver reads in a list view, and carrying the count and file name there is the point of the v2 subjects.

---

## BUG-MAIL-03 · Batch-rejection email (T26) can never be sent
**Severity: Medium** · Template 26 · Recipient: maker

**Steps**
1. As `unmaker`, upload 2 files in one request.
2. As `unchecker`, reject both from `/library?tab=unapprovedFiles&subtab=pending`.
3. Open `unmaker@yopmail.com`.

**Expected** — one `⚠️ 2 Files Rejected` mail (T26).
**Actual** — two separate `1 File Rejected` mails. Rejection is per file and each click sends its own mail.

**Evidence that this is unintended** — the batch *approval* path groups correctly (`2 Files Approved Successfully`), and that mail even references the split: *"The other one file in this request was rejected and is covered in their own mail."*
**Impact** — ten rejected files produce ten emails.

---

## BUG-MAIL-04 · Publish rejection credits the reviewer as the submitter
**Severity: Medium** · Template 29 · Recipient: maker

**Steps** — as `unchecker`, reject a content-publish request; open the `1 Content Rejected` mail in `unmaker@yopmail.com`.

**Expected** — the item's `BY` row names the requester (`un maker`).
**Actual** — `BY un checker`.

**Impact** — the mail goes *to* the maker about the maker's *own* submission, so it reads as if the checker had submitted it. Misleading in any audit of who raised what.

---

## BUG-MAIL-05 · "Uploaded by" renders empty in the upload-request header
**Severity: Medium** · Templates 21, 22 · Recipient: checker

**Expected** — `Uploaded by Ananya Sharma · Content Manager` (design).
**Actual** — `Uploaded by ` with nothing after it.

**Note** — the same name renders correctly further down the same mail, in the per-file `By un maker` row, so the data is available and only the header slot is unbound.
**Impact** — the checker cannot see who raised the request without scrolling to the item table.

---

## BUG-MAIL-06 · Content-publish request greets "Hi there," instead of the checker
**Severity: Low** · Template 27 · Recipient: checker

**Expected** — `Hi Rahul Verma,` (design) — i.e. `Hi un checker,`.
**Actual** — `Hi there,`.
**Note** — the upload request in the *same thread, same recipient* correctly opens `Hi un checker,`.

---

## BUG-MAIL-07 · Rejected-file section renders an empty caption
**Severity: Low** · Template 24 · Recipient: maker

**Expected** — heading `Rejected File` followed by `This is the version that was refused.`
**Actual** — the heading, then a blank caption line, then the file.

---

## BUG-MAIL-08 · Inconsistent labels and footers within one thread
**Severity: Low** · Templates 21–29, 38–40

- The folder tile is labelled three ways for the same field: `Uploaded into` (T21), `Now in` (T23), `Folder name` (T24). Design uses `Folder name` throughout.
- Decision mails add a `Decision / Approved` tile that restates the H1 directly above it — the same restating-panel pattern the design explicitly removed from the cluster set (see the `screensWarn` note in the template source).
- The playlist request (T38) closes `Automated notification from Wilyer Partner / Please do not reply to this email.` while every other mail closes `Automated message from <brand> • Generated <timestamp>`. T38 is the only mail with no generated stamp.
- Playlist decision mails place the footer *above* the automated-message note; upload and publish mails place it below.

---

# Blockers found while driving the flows (CMS, not email)

## BUG-LIB-01 · No media-upload control on `/library` for a folder-fenced maker
**Severity: High**

The role grants `media.upload: true`, `makerAndChecker.maker: true`, `isRestrictedAccess: true`. Yet:
- `/library` renders no upload button at any level, including inside the maker's own folder (only *Create Folder*, rename, delete).
- `/library?action=uploadContent` renders **no modal at all** — no `input[type=file]` is ever mounted.
- The dashboard *Add Media* tile links to that same dead route.

**Only working path** — `+ Upload` inside the **playlist editor** (`/playlist-settings/<id>`).
**Impact** — a maker cannot upload from the place uploads belong; the entire file-upload approval thread is unreachable from the Library UI.

## BUG-LIB-02 · Counts are shown that the same page cannot list
**Severity: Medium**

For the folder-fenced maker: `Total Files - 23` beside *No Files Found*; `Total Playlists 2` beside *No playlists found!*; `Folders ( 1 )` expanding to an empty panel. Counts are account-wide, lists are folder-scoped, and the maker's folder (`sector28`) has a parent the maker cannot see, so it never appears at root. The same media **is** listed inside the playlist editor.

## BUG-PL-01 · `+ New Playlist` is a no-op on a fresh load
**Severity: Medium**

Clicking *+ New Playlist* on `/playlists` does nothing — no modal, no network call. Navigating to `/playlists?action=createPlaylist` opens the same modal reliably.

## BUG-LIB-03 · Pending upload cards show every file as `0.00MB`
**Severity: Low**

`/library?tab=unapprovedFiles&subtab=pending` renders `0.00MB` for files of any size (600×400 PNGs and multi-MB videos alike).
