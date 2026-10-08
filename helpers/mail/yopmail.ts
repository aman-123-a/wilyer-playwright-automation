// =============================================================================
//  Yopmail reader — the only way this project can read a mail it just caused.
//
//  Yopmail has no API. Its web client is three nested frames and the mail body
//  is served from a per-mail URL that needs one identifier the inbox frame
//  holds. This helper does exactly two things:
//
//      listInbox(page, 'unmaker')   -> [{ id, subject, when }, …] newest first
//      readMail(page, 'unmaker', id) -> { subject, text, links }
//
//  ── Rate limiting, and why the pacing below is not decoration ───────────────
//  Fetching mail bodies back-to-back trips yopmail's bot check and every
//  subsequent body comes back as a CAPTCHA page instead of the mail. Tests must
//  never answer that, so the reader avoids provoking it: bodies are fetched by
//  navigating the page (not by XHR), one at a time, with a pause between. Keep
//  READ_PACING_MS where it is unless you have re-measured it.
//
//  If a CAPTCHA page is served anyway, readMail throws rather than returning
//  the CAPTCHA markup as if it were the mail — a silent empty body would look
//  like a missing notification and send someone chasing a defect that is not
//  there.
// =============================================================================

import type { Page } from '@playwright/test';

/** Pause between two mail-body navigations. Below ~1.2s yopmail starts
 *  answering with its bot check instead of the mail. */
const READ_PACING_MS = 2500;

/** How long to let the inbox frame populate before reading rows out of it. */
const INBOX_SETTLE_MS = 4000;

export interface MailSummary {
  /** Yopmail's row id, e.g. `e_ZwLj…`. Pass straight to readMail. */
  readonly id: string;
  /** Subject as the LIST renders it — yopmail prefixes unread rows with `*`. */
  readonly subject: string;
  /** The time column, e.g. `17:48` or `Monday`. */
  readonly when: string;
}

export interface Mail {
  /** Subject from the mail header, without the unread marker. */
  readonly subject: string;
  /** Body as plain text, whitespace collapsed. */
  readonly text: string;
  /** Anchor labels in the body, in order. Hrefs are SES redirects, so the
   *  label is the stable half; assert destinations via linkTargets(). */
  readonly links: readonly string[];
  /** Decoded href of each anchor, with the SES click-tracking wrapper peeled
   *  off where one is present, so `/library?tab=…` is assertable. */
  readonly linkTargets: readonly string[];
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True when yopmail served its bot check instead of a mail. */
const isCaptcha = (text: string): boolean => /Complete the CAPTCHA to continue/i.test(text);

/**
 * Open `inbox`'s mailbox and return its rows, newest first.
 *
 * `inbox` is the local part only — `unmaker`, not `unmaker@yopmail.com`.
 */
export async function listInbox(page: Page, inbox: string, limit = 25): Promise<MailSummary[]> {
  await page.goto('https://yopmail.com/en/');
  await page.locator('input#login').fill(inbox);
  await page.locator('input#login').press('Enter');
  await wait(INBOX_SETTLE_MS);

  return page.evaluate((max) => {
    const frame = document.querySelector<HTMLIFrameElement>('#ifinbox');
    const doc = frame?.contentDocument;
    if (!doc) return [];
    return [...doc.querySelectorAll('div.m')].slice(0, max).map((row) => {
      const parts = (row as HTMLElement).innerText.split('\n').map((s) => s.trim());
      return {
        id: row.id,
        // [0] time, [1] sender, [2] subject — the subject may carry a leading
        // '*' meaning unread, which is yopmail's marker and not the subject.
        when: parts[0] ?? '',
        subject: (parts[2] ?? '').replace(/^\*\s*/, ''),
      };
    });
  }, limit);
}

/**
 * Read one mail body. `id` is a row id from listInbox.
 *
 * Throws if yopmail answers with its CAPTCHA page — see the header note.
 */
export async function readMail(page: Page, inbox: string, id: string): Promise<Mail> {
  await page.goto(`https://yopmail.com/en/mail?b=${inbox}&id=m${id}`);
  await wait(2000);

  const mail = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('#mail') ?? document.body;
    const anchors = [...body.querySelectorAll('a')];
    return {
      subject: (document.querySelector<HTMLElement>('.ellipsis')?.innerText ?? '').trim(),
      text: body.innerText.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim(),
      links: anchors.map((a) => a.textContent?.trim() ?? ''),
      hrefs: anchors.map((a) => a.getAttribute('href') ?? ''),
    };
  });

  if (isCaptcha(mail.text)) {
    throw new Error(
      `yopmail served its CAPTCHA instead of mail ${id}. Reads are going out too ` +
        `fast — raise READ_PACING_MS in helpers/mail/yopmail.ts, or wait a minute and retry.`,
    );
  }

  await wait(READ_PACING_MS);

  return {
    subject: mail.subject,
    text: mail.text,
    links: mail.links,
    linkTargets: mail.hrefs.map(unwrapTrackingLink),
  };
}

/**
 * Peel the SES click-tracking wrapper off a link.
 *
 * Sent mail rewrites every href to
 *   https://<id>.r.<region>.awstrack.me/L0/<url-encoded destination>/1/<ids>/<sig>
 * so a test asserting "this button points at the pending-approvals tab" has to
 * look through the wrapper. A plain URL is returned unchanged.
 */
export function unwrapTrackingLink(href: string): string {
  const wrapped = /awstrack\.me\/L0\/(.+?)\/\d+\//.exec(href);
  const raw = wrapped ? wrapped[1] : href;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Wait until a mail whose subject matches `pattern` appears in `inbox`.
 *
 * Notifications are queued and sent out of band, so a decision taken in the UI
 * shows up in the mailbox seconds later, not immediately.
 */
export async function waitForMail(
  page: Page,
  inbox: string,
  pattern: RegExp,
  { timeoutMs = 90_000, pollMs = 10_000 }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<MailSummary> {
  const deadline = Date.now() + timeoutMs;
  let seen: MailSummary[] = [];
  for (;;) {
    seen = await listInbox(page, inbox, 15);
    const hit = seen.find((m) => pattern.test(m.subject));
    if (hit) return hit;
    if (Date.now() > deadline) break;
    await wait(pollMs);
  }
  throw new Error(
    `No mail matching ${pattern} reached ${inbox}@yopmail.com within ${timeoutMs}ms. ` +
      `Newest subjects were: ${seen.map((m) => m.subject).join(' | ') || '(inbox empty)'}`,
  );
}
