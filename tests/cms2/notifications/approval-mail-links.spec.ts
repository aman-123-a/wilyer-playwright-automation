// =============================================================================
//  Approval notifications — every link in the mail, and where it lands.
//
//  Target: cms2.pocsample.in. Scope: the same ten cases as
//  approval-mail-content.spec.ts (gallery templates 21-29 and 37-40), read from
//  the live maker and checker inboxes.
//
//  ── Why this is its own file ────────────────────────────────────────────────
//  The content spec grades the words in the body. This one only cares about the
//  hrefs: that every anchor points somewhere absolute and real, that the primary
//  button lands on the case the mail is about, and that "Review & Decide"
//  behaves the way the design says it does.
//
//  ── What the design promises about Review & Decide ──────────────────────────
//  Quoting the gallery, verbatim: "Opens without a sign-in. The link is valid
//  for 7 days and works once - and opening it starts a 15-minute session."
//  Three claims, and each is a separate test below:
//    • no sign-in — a clean context (no storageState) must reach the review
//                   page, not the login screen;
//    • works once — a second clean context must NOT;
//    • 7 days     — not assertable inside a run, so the copy is asserted here
//                   and the expiry itself left to a dated manual check.
//
//  Burning a one-time token is a real side effect on a real queue, so the
//  "works once" case is gated on CMS_ALLOW_DESTRUCTIVE.
// =============================================================================

import { test, expect, request, type Page } from '@playwright/test';
import { ENV } from '../../../config/env';
import { listInbox, readMail, type Mail } from '../../../helpers/mail/yopmail';
import { EMAIL_CASES } from '../../../test-data/emailTemplates.data';

const INBOX = {
  maker: ENV.MAKER.email.split('@')[0],
  checker: ENV.CHECKER.email.split('@')[0],
} as const;

const SCAN_DEPTH = 25;

/** The magic link the "Review & Decide" button carries. */
const MAGIC_LINK = /\/publish\/magic-approval\?token=/;

/** Anything matching this in an href means the template rendered with a hole. */
const BROKEN_HREF = /\{\{|undefined|null|\/#$|^#$/;

test.describe('Approval notifications · links', () => {
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

  const findMail = async (page: Page, inbox: string, subject: RegExp): Promise<Mail> => {
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

    test(`T${c.template} · ${c.id} · every link resolves @email @links`, async ({ page }) => {
      const mail = await findMail(page, inbox, c.observedSubject);

      // Unsubscribe / preference footers are legitimately off-app; they still
      // have to be absolute and reachable, so nothing is excluded here.
      const targets = [...new Set(mail.linkTargets.filter(Boolean))];
      expect(targets.length, 'the mail carries no links at all').toBeGreaterThan(0);

      await test.step('no href rendered with a hole in it', async () => {
        for (const href of targets) {
          expect(href, `unrendered or dead href: ${href}`).not.toMatch(BROKEN_HREF);
          expect(href, `relative href — an inbox has no base URL: ${href}`).toMatch(/^https?:\/\//);
        }
      });

      await test.step('the primary button lands on this case', async () => {
        if (!c.linkTarget) return;
        expect(
          targets.some((h) => c.linkTarget!.test(h)),
          `no link matching ${c.linkTarget} — hrefs were:\n${targets.join('\n')}`,
        ).toBe(true);
      });

      // A dead CMS link in an approval mail wastes the whole mail, so every one
      // is fetched. No auth is attached: this host serves the SPA shell for
      // unknown paths and redirects client-side, so the assertion is "not a
      // server error", not "not a redirect".
      await test.step('every link answers', async () => {
        const api = await request.newContext({ ignoreHTTPSErrors: true });
        try {
          for (const href of targets) {
            const res = await api.get(href, { maxRedirects: 5, timeout: 20_000 });
            expect(res.status(), `${href} answered ${res.status()}`).toBeLessThan(400);
          }
        } finally {
          await api.dispose();
        }
      });
    });
  }

  // ── Review & Decide ───────────────────────────────────────────────────────
  //
  // Only the request-stage mails carry it; a decision mail links into the CMS
  // proper, because by then there is nothing left to decide.
  const REQUESTS = EMAIL_CASES.filter((c) => c.stage === 'request');

  for (const c of REQUESTS) {
    test(`T${c.template} · Review & Decide opens without a sign-in @email @links`, async ({
      page,
      browser,
    }) => {
      const mail = await findMail(page, INBOX[c.to], c.observedSubject);
      const magic = mail.linkTargets.find((h) => MAGIC_LINK.test(h));

      test.skip(
        !magic,
        `T${c.template} carries no magic-approval link — it links straight into the CMS instead.`,
      );

      expect(
        mail.text,
        'the design states the terms of the link in the mail itself',
      ).toMatch(/valid for 7 days and works once/i);

      // A fresh context: no storageState, so nothing is signed in. That is the
      // whole point of the link — the checker is in their mail client on a
      // phone, with no CMS session anywhere.
      const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const anon = await fresh.newPage();
        const res = await anon.goto(magic!, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        expect(res?.status(), 'magic link did not answer').toBeLessThan(400);

        await expect(
          anon.locator('body'),
          'the magic link landed on the sign-in screen — the point of it is that it does not',
        ).not.toContainText(/sign in|log in|password/i, { timeout: 10_000 });

        expect(anon.url(), 'redirected away from the review page').toMatch(
          /magic-approval|approval|review/i,
        );
      } finally {
        await fresh.close();
      }
    });

    test(`T${c.template} · Review & Decide works only once @email @links`, async ({
      page,
      browser,
    }) => {
      test.skip(
        !ENV.ALLOW_DESTRUCTIVE,
        'Consuming a one-time token burns a real approval link — set CMS_ALLOW_DESTRUCTIVE=true.',
      );

      const mail = await findMail(page, INBOX[c.to], c.observedSubject);
      const magic = mail.linkTargets.find((h) => MAGIC_LINK.test(h));
      test.skip(!magic, `T${c.template} carries no magic-approval link.`);

      const open = async (): Promise<string> => {
        const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        try {
          const p = await ctx.newPage();
          await p.goto(magic!, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await p.waitForTimeout(1_500);
          return (await p.locator('body').innerText()).replace(/\s+/g, ' ').trim();
        } finally {
          await ctx.close();
        }
      };

      const first = await open();
      const second = await open();

      expect(
        second,
        'the second open behaved exactly like the first — a one-time approval link that is not ' +
          'one-time is a link anyone who ever saw the mail can keep using',
      ).not.toBe(first);
      expect(second).toMatch(/expired|already (been )?used|no longer valid|invalid/i);
    });
  }
});
