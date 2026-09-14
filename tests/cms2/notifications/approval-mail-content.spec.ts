// =============================================================================
//  Approval notifications — does the mail that arrives match the v2 design?
//
//  Target: cms2.pocsample.in. Scope: the file-upload, content-publish and
//  playlist-publish threads (gallery templates 21-29 and 37-40).
//
//  ── What this file does, and what it deliberately does not ──────────────────
//  It reads the two live mailboxes and grades each mail against
//  test-data/emailTemplates.data.ts. It does NOT trigger anything — that is
//  approval-flows.spec.ts, which runs first in the same project. Splitting them
//  matters because mail is sent out of band: a body assertion that also had to
//  drive the CMS would fail for two unrelated reasons and tell you neither.
//
//  ── The subject cases are expected failures ─────────────────────────────────
//  All ten subjects drift from the design and every one is marked test.fail().
//  They are not skipped: when the backend is fixed these turn red as "passed
//  unexpectedly", which is the signal to delete the marker. The body cases are
//  ordinary assertions — the layout, copy and links largely DO match.
// =============================================================================

import { test, expect, type Page } from '@playwright/test';
import { ENV } from '../../../config/env';
import { listInbox, readMail, type Mail } from '../../../helpers/mail/yopmail';
import { EMAIL_CASES, COMMON_FOOTER } from '../../../test-data/emailTemplates.data';

/** yopmail inbox names — the local part of each address. */
const INBOX = {
  maker: ENV.MAKER.email.split('@')[0],
  checker: ENV.CHECKER.email.split('@')[0],
} as const;

/** How far back to look. Older mail belongs to earlier runs of the flows. */
const SCAN_DEPTH = 25;

test.describe('Approval notifications · design contract', () => {
  test.skip(
    !ENV.MAKER.email || !ENV.CHECKER.email,
    'Needs CMS_MAKER_* and CMS_CHECKER_* in .env — see config/env.ts.',
  );

  // Mail suites read ONE pair of yopmail inboxes. Two workers is enough to trip
  // yopmail's CAPTCHA, so these must run with --workers=1 (npm run mail). They
  // are NOT serial: each test finds its own mail, and serial mode would let the
  // first drifted template skip every case behind it — which is the opposite of
  // what a contract suite is for.
  test.describe.configure({ mode: 'default' });

  /** Newest mail in `inbox` whose subject matches, read in full. */
  const findMail = async (
    page: Page,
    inbox: string,
    subject: RegExp,
  ): Promise<Mail> => {
    const rows = await listInbox(page, inbox, SCAN_DEPTH);
    const hit = rows.find((r) => subject.test(r.subject));
    expect(
      hit,
      `No mail matching ${subject} in ${inbox}@yopmail.com. Run approval-flows.spec.ts first. ` +
        `Subjects seen: ${rows.map((r) => r.subject).join(' | ')}`,
    ).toBeTruthy();
    return readMail(page, inbox, hit!.id);
  };

  for (const c of EMAIL_CASES) {
    const inbox = INBOX[c.to];

    // ── body: layout, copy and links ────────────────────────────────────────
    test(`T${c.template} · ${c.id} · body matches the design @email @ui`, async ({ page }) => {
      const mail = await findMail(page, inbox, c.observedSubject);

      await test.step('eyebrow and headline', async () => {
        // Live renders the eyebrow upper-cased; the design sets it in caps via
        // CSS, so compare case-insensitively rather than call that a defect.
        expect(mail.text.toLowerCase()).toContain(c.eyebrow.toLowerCase());
        expect(mail.text).toMatch(c.headline);
      });

      await test.step('required copy', async () => {
        for (const fragment of c.requires) {
          if (typeof fragment === 'string') expect(mail.text).toContain(fragment);
          else expect(mail.text).toMatch(fragment);
        }
      });

      await test.step('nothing forbidden', async () => {
        for (const pattern of c.forbids ?? []) expect(mail.text).not.toMatch(pattern);
      });

      await test.step('footer', async () => {
        for (const fragment of COMMON_FOOTER) {
          if (typeof fragment === 'string') expect(mail.text).toContain(fragment);
          else expect(mail.text).toMatch(fragment);
        }
      });

      if (c.linkTarget) {
        await test.step('primary link lands on the right screen', async () => {
          expect(mail.linkTargets.join(' ')).toMatch(c.linkTarget!);
        });
      }
    });

    // ── subject: known drift, kept red on purpose ───────────────────────────
    test(`T${c.template} · ${c.id} · subject matches the design @email`, async ({ page }) => {
      test.fail(
        true,
        `Known drift (cms2, app v3.5.25, seen 2026-09-09): the design specifies ` +
          `"${c.subject}" and the server sends ${c.observedSubject}. Delete this ` +
          `marker when the backend adopts the designed subject line.`,
      );
      const rows = await listInbox(page, inbox, SCAN_DEPTH);
      const subjects = rows.map((r) => r.subject);
      expect(subjects).toContain(c.subject);
    });
  }

  // ── cross-cutting checks ──────────────────────────────────────────────────

  test('no request mail is labelled "Escalation" on its first send @email', async ({ page }) => {
    test.fail(
      true,
      'Both request threads ship as "… Approval Escalation - Action Required" on the ' +
        'FIRST notification, before any escalation window has elapsed.',
    );
    const rows = await listInbox(page, INBOX.checker, SCAN_DEPTH);
    expect(rows.filter((r) => /Escalation/i.test(r.subject))).toHaveLength(0);
  });

  test('the publish request greets the checker by name @email', async ({ page }) => {
    test.fail(
      true,
      'Content-publish request opens "Hi there," while the upload request in the same ' +
        'thread opens "Hi un checker," — the recipient name is available and unused.',
    );
    const mail = await findMail(page, INBOX.checker, /Content Approval Escalation/);
    expect(mail.text).not.toContain('Hi there,');
  });

  test('the upload request names the uploader in its header @email', async ({ page }) => {
    test.fail(
      true,
      'The "Uploaded by" slot in the header renders empty; the same name is printed ' +
        'correctly in the per-file "By" row further down the mail.',
    );
    const mail = await findMail(page, INBOX.checker, /New File Awaiting Your Approval/);
    expect(mail.text).toMatch(/Uploaded by \S+/);
  });

  test('the publish rejection credits the requester, not the reviewer @email', async ({ page }) => {
    test.fail(
      true,
      'The rejected item row reads "BY <checker>". The mail goes TO the maker about ' +
        'the maker\'s own submission, so the reviewer\'s name in that slot is wrong.',
    );
    const mail = await findMail(page, INBOX.maker, /Contents? Rejected/);
    const by = /BY\s*(.+)/.exec(mail.text)?.[1]?.trim();
    expect(by).not.toBe(ENV.CHECKER.email.split('@')[0]);
  });
});
