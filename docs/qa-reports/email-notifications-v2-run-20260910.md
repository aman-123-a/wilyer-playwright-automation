# Approval notification emails (v2) — cms2 run, 2026-09-10

Second pass over the maker–checker approval mails, one day after the
[2026-09-09 bug list](./email-notifications-v2-bugs.md).

| | |
|---|---|
| Environment | cms2.pocsample.in · API `v3-5api2.pocsample.in` |
| Accounts | `unmaker@yopmail.com` (maker) / `unchecker@yopmail.com` (checker), same account |
| Design source | `email-notifications-v2.html`, templates 21–29 / 37–40 |
| Suites | `tests/cms2/notifications/` — flows, design contract, **links (new)** |
| Command | `npm run mail` (cms2, chromium, `--workers=1`) |

New this run: `approval-mail-links.spec.ts`, which audits every href in every
approval mail and the "Review & Decide" magic link.

---

## 1. New findings

### BUG-MAIL-08 · The count has been dropped from every approval subject
**Severity: Medium** · Regression against 2026-09-09 · Both recipients

Yesterday every subject carried a leading count. Today none do.

| Template | Design | Sent 2026-09-09 | Sent 2026-09-10 |
|---|---|---|---|
| 22 | `⏳ Action Required - 4 files awaiting approval` | `4 New Files Awaiting Your Approval` | `New Files Awaiting Your Approval` |
| 23 | `✅ fresh-produce-promo.jpg approved` | `1 File Approved Successfully` | `File Approved Successfully` |
| 25 | `✅ 2 files approved` | `2 Files Approved Successfully` | `Files Approved Successfully` |
| 28 | `✅ Publish approved - going live 2 Aug` | `3 Contents Published Successfully` | `Contents Published Successfully` |
| 29 | `⚠️ Action needed - publish rejected` | `1 Content Rejected` | `Content Rejected` |

**Impact** — the design puts the count in the subject on purpose; the subject is
the only part an approver reads in a list view. This moves BUG-MAIL-02 in the
wrong direction: the sent subjects now carry *less* than they did yesterday.
The singular/plural noun still varies, so the template still knows the count —
it simply no longer prints it.

---

### BUG-MAIL-09 · Request mails are missing the automated-message footer line
**Severity: Low** · Templates 21, 38 · Both recipients

Decision mails (39, 40 verified) close with `This is an automated message …`
above the brand line. The request mails do not — they end at
`Automated message from Wilyer Partner • Generated …` only.

**Impact** — inconsistent footer across a set that is otherwise one template
engine, and the missing line is the one that tells a recipient not to reply.

---

### BUG-MAIL-10 · Stray `··` after the tile labels
**Severity: Low** · Templates 21, 27 · Both recipients

The count tiles render their label with two trailing middots:

```
1
FILE PENDING··          (T21)
1
ITEM PENDING··          (T27)
```

The playlist template renders the same tile clean (`ITEMS PENDING`, T38), so
this is the file-approval / content-publish layout specifically — most likely a
separator character that should only appear *between* tiles leaking onto the
last one.

---

### BUG-MAIL-11 · Two different timestamp formats in one mail set
**Severity: Low** · Templates 21, 27 vs 38

- T21 / T27: `Generated 9/10/2026, 3:37:37 PM` — raw locale output, seconds included
- T38: `Generated Sep 10, 2026, 3:02 PM`

**Impact** — T38's is the human format the design shows; the other two look like
an un-formatted `toLocaleString()` fell through. Seconds are noise in an email.

---

### BUG-MAIL-12 · The Review & Decide disclaimer is punctuated two ways
**Severity: Cosmetic** · Templates 21, 27 vs 38

`…valid for 7 days and works once **-** and opening it…` (T21, T27) against
`…works once**,** and opening it…` (T38). Same sentence, two templates, two
punctuations.

---

## 2. Confirmed still open

- **BUG-MAIL-01** (request mails labelled "Escalation" on first send) — the
  checker inbox holds seven consecutive `Playlist Approval Escalation - Action
  Required` and two `Content Approval Escalation - Action Required`, all from
  routine first sends.
- **BUG-MAIL-02** (subjects drift from the design) — every case, now worse; see
  BUG-MAIL-08.

## 3. Verified good

- **Every link in T21 and T22 resolves.** No `{{…}}` holes, no relative hrefs,
  every href absolute and answering < 400, and the primary button lands on
  `/library?tab=unapprovedFiles&subtab=pending` as the design specifies.
- **The magic link is present and correctly described.** Request mails carry
  `/publish/magic-approval?token=…` behind "Review & Decide", with the 7-day /
  single-use / 15-minute-session copy the gallery promises.
- **T39 and T40 bodies match the design** in full, footer included.
- Two cases that failed on 2026-09-09 now pass: the upload request names the
  uploader in its header, and the publish rejection credits the requester rather
  than the reviewer. Their `test.fail()` markers in
  `approval-mail-content.spec.ts` are stale and should come off.

## 4. Not established this run

| Area | Why |
|---|---|
| T23–T29 body and link cases | No fresh mail: the flows spec aborted before raising those requests (slow cms2 — a 15s login fill and a 30s wait for `/playlist-settings/{id}` both timed out; the login form itself was probed and is unchanged, so this is environment latency, not selector drift) |
| Review & Decide opens without sign-in | Never executed — every case blocked on the mail lookup above |
| Review & Decide is single-use | Same, and gated on `CMS_ALLOW_DESTRUCTIVE` because it burns a real token |
| 7-day expiry | Not assertable inside a run. Needs a dated manual check: keep one token and re-open it on day 8 |
| 4 mail reads | yopmail served its CAPTCHA — read pacing has since been raised |

## 5. Framework changes made for this run

| Change | Why |
|---|---|
| `playwright.config.ts` — new `MAIL_SPECS`, chromium only | The suite was fanning one serial maker/checker flow across 5 browser projects against one account and one inbox pair; 10 of the previous run's failures were the projects colliding, not the product |
| `approval-flows.spec.ts` — `fileURLToPath` instead of `__dirname` | ESM project: the file failed to load, so nothing in it ran at all |
| Contract specs — `mode: 'serial'` → `'default'` | One drifted template was skipping the other 45 cases. Tests are independent; single-worker is enforced by `npm run mail` |
| `helpers/mail/yopmail.ts` — `READ_PACING_MS` 1500 → 2500 | yopmail CAPTCHA |
| `emailTemplates.data.ts` — caps section labels matched case-insensitively | `FILE PENDING`, `SCREENS AFFECTED` etc. are styling, not contract; the case-sensitive patterns were masking the real body results |
| `package.json` — `npm run mail` | cms2 + chromium + `--workers=1` in one command |

## 6. Re-run

```bash
npm run mail
```

Raise the flows timeouts or re-run when cms2 is quieter to close out section 4.
