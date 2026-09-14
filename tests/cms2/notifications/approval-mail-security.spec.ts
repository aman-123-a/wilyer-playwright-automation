// =============================================================================
//  Approval notifications — the security properties of the mail and its link.
//
//  Target: cms2.pocsample.in. Reads the live maker and checker inboxes; nothing
//  here creates content, so the suite is safe to run unattended.
//
//  ── Why this is separate from approval-mail-links.spec.ts ───────────────────
//  That file asks "does the link work". This one asks "what else does the link
//  let someone do". An approval mail is a bearer credential sent in cleartext to
//  an inbox: whoever holds the URL holds the decision. So the questions here are
//  the ones that only matter when the holder is not the intended checker —
//  guessability, tampering, replay, how far the session it opens reaches, and
//  what the mail body discloses to anyone who ever receives or forwards it.
//
//  ── The threat model, stated plainly ────────────────────────────────────────
//  A magic-approval link may be read by: a forwarded-mail recipient, anyone on
//  a shared mailbox, a mail gateway that logs URLs, and any site the review page
//  later links out to (via Referer). None of them are the checker. Each test
//  below names which of those it stands for.
//
//  ── What is asserted vs. what is only recorded ──────────────────────────────
//  Entropy, transport, disclosure and session scope are hard assertions. The
//  7-day expiry cannot be observed inside a run and stays a dated manual check,
//  as in the links spec. Nothing here answers a CAPTCHA or sprays for tokens:
//  the tamper cases mutate ONE token the test already legitimately holds.
// =============================================================================

import { test, expect, request, type Browser, type Page } from '@playwright/test';
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

/** Request-stage mails are the only ones carrying a decision credential. */
const REQUESTS = EMAIL_CASES.filter((c) => c.stage === 'request');

/**
 * Anything that must never appear in a mail body. Device keys are on this list
 * because readPlaylistPublishHistory already returns screen authKey/secretKey
 * pairs elsewhere in this product — the same fields reaching an inbox would put
 * them in every forwarded copy.
 */
const MUST_NOT_DISCLOSE: readonly { readonly what: string; readonly pattern: RegExp }[] = [
  { what: 'a password', pattern: /\bpassword\s*[:=]\s*\S+/i },
  { what: 'a device auth key', pattern: /\b(auth|secret)[_-]?key\b/i },
  { what: 'a JWT in the body text', pattern: /\beyJ[A-Za-z0-9_-]{10,}\./ },
  { what: 'an API key', pattern: /\b(api[_-]?key|x-api-key)\b/i },
  { what: 'a stack trace', pattern: /(\bat\s+\w+\.\w+\s*\(|Traceback \(most recent)/ },
  {
    what: 'an internal host or private address',
    pattern: /\b(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)\b/,
  },
  { what: 'a raw database id field', pattern: /\b_id\s*[:=]/ },
];

/** Pages a 15-minute review session has no business reaching. */
const OFF_LIMITS = ['/team', '/roles', '/settings', '/billing'] as const;

/** Wording any of these pages uses when it refuses. */
const REFUSED = /invalid|expired|required|not (found|valid|allowed|permitted)|unauthor|no longer|no access|permission|sign in|log in/i;

test.describe('Approval notifications · security', () => {
  test.skip(
    !ENV.MAKER.email || !ENV.CHECKER.email,
    'Needs CMS_MAKER_* and CMS_CHECKER_* in .env — see config/env.ts.',
  );

  // One pair of yopmail inboxes, so --workers=1 (npm run mail). Not serial:
  // each test finds its own mail, and a serial skip cascade would hide every
  // case behind the first drifted template.
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

  const magicLinkOf = (mail: Mail): string | undefined =>
    mail.linkTargets.find((h) => MAGIC_LINK.test(h));

  const tokenOf = (href: string): string => {
    try {
      return new URL(href).searchParams.get('token') ?? '';
    } catch {
      return '';
    }
  };

  /** Open a URL with nothing signed in — the forwarded-mail reader's position. */
  const openAnonymously = async (
    browser: Browser,
    url: string,
  ): Promise<{ status: number; url: string; body: string }> => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const p = await ctx.newPage();
      const res = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await p.waitForTimeout(1_500);
      return {
        status: res?.status() ?? 0,
        url: p.url(),
        body: (await p.locator('body').innerText()).replace(/\s+/g, ' ').trim(),
      };
    } finally {
      await ctx.close();
    }
  };

  // ── Disclosure ────────────────────────────────────────────────────────────
  //
  // Stands for: anyone the mail is forwarded to, and any gateway that archives
  // it. Applies to every case, not only the ones carrying a token.
  for (const c of EMAIL_CASES) {
    test(`T${c.template} · ${c.id} · the body discloses nothing privileged @email @security`, async ({
      page,
    }) => {
      const mail = await findMail(page, INBOX[c.to], c.observedSubject);

      for (const { what, pattern } of MUST_NOT_DISCLOSE) {
        expect(
          mail.text,
          `the mail body contains ${what} — every forwarded copy carries it too`,
        ).not.toMatch(pattern);
      }

      await test.step('no credential rides in a query string either', async () => {
        for (const href of mail.linkTargets) {
          expect(
            href,
            `a link carries a password/secret parameter, which mail gateways log: ${href}`,
          ).not.toMatch(/[?&](password|pwd|secret|api[_-]?key)=/i);
        }
      });
    });

    test(`T${c.template} · ${c.id} · every link is https @email @security`, async ({ page }) => {
      const mail = await findMail(page, INBOX[c.to], c.observedSubject);
      const targets = [...new Set(mail.linkTargets.filter(Boolean))];
      expect(targets.length, 'the mail carries no links at all').toBeGreaterThan(0);

      for (const href of targets) {
        expect(
          href,
          `plaintext http link — a token on this URL is readable on the wire: ${href}`,
        ).toMatch(/^https:\/\//);
      }
    });
  }

  // ── Delivery scoping ──────────────────────────────────────────────────────
  //
  // Stands for: a notification routed to the wrong principal. A request mail
  // carries a decision credential; it belongs in the checker's inbox only, and
  // the maker must never receive a copy of one addressed to the checker.
  test('a decision credential reaches only the addressed inbox @email @security', async ({
    page,
  }) => {
    const checkerOnly = REQUESTS.filter((c) => c.to === 'checker');
    test.skip(checkerOnly.length === 0, 'No checker-addressed request cases to scope.');

    const makerRows = await listInbox(page, INBOX.maker, SCAN_DEPTH);
    for (const c of checkerOnly) {
      expect(
        makerRows.some((r) => c.observedSubject.test(r.subject)),
        `T${c.template} ("${c.id}") was also delivered to the maker — the maker could then ` +
          `approve their own request from their own inbox`,
      ).toBe(false);
    }
  });

  // ── The token itself ──────────────────────────────────────────────────────
  for (const c of REQUESTS) {
    test(`T${c.template} · the approval token is not guessable @email @security`, async ({
      page,
    }) => {
      const mail = await findMail(page, INBOX[c.to], c.observedSubject);
      const magic = magicLinkOf(mail);
      test.skip(!magic, `T${c.template} carries no magic-approval link.`);

      const token = tokenOf(magic!);
      expect(token, 'no token parameter on the magic link').not.toBe('');

      await test.step('long enough that guessing is not a strategy', async () => {
        // 32 chars of a URL-safe alphabet is ~190 bits — the floor below which
        // an unauthenticated approval endpoint becomes worth spraying.
        expect(
          token.length,
          `token is only ${token.length} chars long`,
        ).toBeGreaterThanOrEqual(32);
      });

      await test.step('not a counter, an object id, or an encoded address', async () => {
        expect(
          token,
          'the token is a plain number — a neighbouring request is one increment away',
        ).not.toMatch(/^\d+$/);
        expect(
          token,
          'the token is a bare 24-char hex object id: time-ordered, and not a secret',
        ).not.toMatch(/^[0-9a-f]{24}$/i);

        // A token that merely encodes who it is for is forgeable by anyone who
        // knows an address. Decode what is decodable and look for one.
        const decoded = (() => {
          try {
            return Buffer.from(
              token.replace(/-/g, '+').replace(/_/g, '/'),
              'base64',
            ).toString('utf8');
          } catch {
            return '';
          }
        })();
        for (const probe of [token, decoded]) {
          expect(
            probe,
            'the token contains the recipient address — it encodes identity, not a secret',
          ).not.toContain(ENV.CHECKER.email.split('@')[0]);
        }
      });
    });

    test(`T${c.template} · a tampered token is refused, not honoured @email @security`, async ({
      page,
      browser,
    }) => {
      const mail = await findMail(page, INBOX[c.to], c.observedSubject);
      const magic = magicLinkOf(mail);
      test.skip(!magic, `T${c.template} carries no magic-approval link.`);

      const token = tokenOf(magic!);
      const base = magic!.split('?')[0];

      // One held token, mutated three ways. No sweeping and no guessing at
      // anyone else's token — each of these is this test's own credential,
      // broken on purpose.
      const mutations: readonly { readonly how: string; readonly value: string }[] = [
        {
          how: 'last character flipped',
          value: token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a'),
        },
        { how: 'truncated by four characters', value: token.slice(0, -4) },
        {
          how: 'signature stripped from a JWT-shaped token',
          value: token.includes('.') ? token.split('.').slice(0, 2).join('.') : '',
        },
      ];

      for (const { how, value } of mutations) {
        if (!value || value === token) continue;
        const seen = await openAnonymously(browser, `${base}?token=${encodeURIComponent(value)}`);

        expect(
          seen.status,
          `${how}: the server answered ${seen.status} — a malformed token must be rejected, ` +
            `not crash the handler`,
        ).toBeLessThan(500);

        expect(
          seen.body,
          `${how}: the review page rendered anyway. An approval token that survives mutation is ` +
            `a token that can be forged`,
        ).toMatch(REFUSED);

        expect(
          seen.body,
          `${how}: the error page echoes the tampered token back, which reflects attacker-chosen ` +
            `text into a shareable URL`,
        ).not.toContain(value);
      }
    });

    test(`T${c.template} · an empty or absent token is refused @email @security`, async ({
      page,
      browser,
    }) => {
      const mail = await findMail(page, INBOX[c.to], c.observedSubject);
      const magic = magicLinkOf(mail);
      test.skip(!magic, `T${c.template} carries no magic-approval link.`);

      const base = magic!.split('?')[0];
      for (const url of [base, `${base}?token=`]) {
        const seen = await openAnonymously(browser, url);
        expect(seen.status, `${url} answered ${seen.status}`).toBeLessThan(500);
        expect(seen.body, `${url} rendered a usable review page with no token at all`).toMatch(
          REFUSED,
        );
      }
    });

    // ── Blast radius of the session the link opens ──────────────────────────
    //
    // Stands for: the forwarded-mail reader who follows the link and then walks
    // the app. The design sells a 15-minute session for ONE decision; if that
    // session is an ordinary signed-in session, the mail is an account takeover
    // in a forwardable URL.
    test(`T${c.template} · the link's session reaches only that one decision @email @security`, async ({
      page,
      browser,
    }) => {
      const mail = await findMail(page, INBOX[c.to], c.observedSubject);
      const magic = magicLinkOf(mail);
      test.skip(!magic, `T${c.template} carries no magic-approval link.`);

      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const p = await ctx.newPage();
        await p.goto(magic!, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await p.waitForTimeout(2_000);

        for (const path of OFF_LIMITS) {
          await p.goto(`${ENV.BASE_URL}${path}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          });
          await p.waitForTimeout(1_500);
          const body = (await p.locator('body').innerText()).replace(/\s+/g, ' ').trim();

          expect(
            body,
            `${path} rendered its real content to a magic-link session — the approval link is ` +
              `carrying general account access, not one decision`,
          ).toMatch(REFUSED);
        }
      } finally {
        await ctx.close();
      }
    });

    test(`T${c.template} · the token does not leak off-site via Referer @email @security`, async ({
      page,
      browser,
    }) => {
      const mail = await findMail(page, INBOX[c.to], c.observedSubject);
      const magic = magicLinkOf(mail);
      test.skip(!magic, `T${c.template} carries no magic-approval link.`);

      const token = tokenOf(magic!);
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      try {
        const p = await ctx.newPage();

        // Every request the review page makes, including the ones it fires at
        // fonts, analytics and error reporters. Any of them that receives the
        // URL receives the approval credential.
        const leaks: string[] = [];
        p.on('request', (req) => {
          const referer = req.headers()['referer'] ?? '';
          const external = !req.url().startsWith(ENV.BASE_URL);
          if (external && (referer.includes(token) || req.url().includes(token))) {
            leaks.push(`${req.method()} ${req.url()} (referer: ${referer})`);
          }
        });

        await p.goto(magic!, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => undefined);
        await p.waitForTimeout(2_000);

        expect(
          leaks,
          'the approval token was sent to a third-party origin. A referrer policy of ' +
            '`strict-origin-when-cross-origin`, or consuming the token out of the URL on ' +
            'arrival, fixes this',
        ).toEqual([]);
      } finally {
        await ctx.close();
      }
    });
  }

  // ── Two requests, two credentials ─────────────────────────────────────────
  //
  // A token shared across requests means one leaked link decides everything it
  // covers, and revoking it is impossible without revoking all of them.
  test('no two approval mails carry the same token @email @security', async ({ page }) => {
    const seen = new Map<string, string>();

    for (const c of REQUESTS) {
      const rows = await listInbox(page, INBOX[c.to], SCAN_DEPTH);
      const hit = rows.find((r) => c.observedSubject.test(r.subject));
      if (!hit) continue;

      const magic = magicLinkOf(await readMail(page, INBOX[c.to], hit.id));
      if (!magic) continue;

      const token = tokenOf(magic);
      const owner = seen.get(token);
      expect(
        owner,
        `T${c.template} ("${c.id}") carries the same token as "${owner}" — one link decides both`,
      ).toBeUndefined();
      seen.set(token, c.id);
    }

    test.skip(seen.size === 0, 'No magic-approval links in either inbox to compare.');
  });

  // ── Transport of the review page itself ───────────────────────────────────
  test('the review page is not cacheable by shared proxies @email @security', async ({ page }) => {
    const c = REQUESTS[0];
    test.skip(!c, 'No request-stage case to read a magic link from.');

    const mail = await findMail(page, INBOX[c.to], c.observedSubject);
    const magic = magicLinkOf(mail);
    test.skip(!magic, 'No magic-approval link in the newest request mail.');

    const api = await request.newContext({ ignoreHTTPSErrors: true });
    try {
      const res = await api.get(magic!, { maxRedirects: 5, timeout: 20_000 });
      const headers = res.headers();

      expect(
        headers['strict-transport-security'],
        'no HSTS on the host serving approval links',
      ).toBeTruthy();

      // The SPA shell is legitimately cacheable; what must not happen is a
      // shared cache storing a token-bearing response for the next requester.
      const cache = headers['cache-control'] ?? '';
      expect(
        cache,
        `Cache-Control was "${cache}" — a token-bearing URL stored by a shared proxy is served ` +
          `to whoever asks for it next`,
      ).not.toMatch(/\bpublic\b/);
    } finally {
      await api.dispose();
    }
  });
});
