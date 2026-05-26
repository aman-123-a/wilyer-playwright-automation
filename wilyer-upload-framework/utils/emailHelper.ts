/**
 * IMAP email-validation helper built on `imapflow` + `mailparser`.
 *
 * Responsibilities:
 *  - Connect to a Gmail (or any IMAP) mailbox.
 *  - Poll for a message matching a subject pattern / sender within a timeout.
 *  - Parse the message into a structured, assertable shape (subject, text,
 *    html, from, date) and expose content-validation helpers.
 *
 * The notification workflow can deliver mail seconds-to-minutes late, so every
 * fetch uses bounded polling (default 60s timeout, poll every 5s) rather than a
 * single read.
 */
import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { env } from '../config/env.js';
import { createLogger } from './logger.js';

const log = createLogger('emailHelper');

export interface ParsedEmail {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: Date | null;
  text: string;
  html: string;
  /** True if the message carried an HTML part (used for HTML-format checks). */
  hasHtml: boolean;
}

export interface EmailSearchCriteria {
  /** Subject substring or regex the message subject must satisfy. */
  subject?: string | RegExp;
  /** Sender substring the From header must contain. */
  from?: string;
  /** Only consider mail received at/after this time (defaults to "now"). */
  since?: Date;
  /** A string/regex that must appear in the message body (text or html). */
  bodyContains?: string | RegExp;
}

export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

/**
 * Wrapper around a single IMAP connection. Designed to be opened once per test
 * (or shared via fixture), used for several polls, then closed in teardown.
 */
export class EmailHelper {
  private client: ImapFlow | null = null;

  constructor(
    private readonly config = env.email,
    private readonly logger = log,
  ) {}

  /** Whether IMAP credentials are configured; tests should skip gracefully if not. */
  get isConfigured(): boolean {
    return this.config.isConfigured;
  }

  /** Open the IMAP connection and select the mailbox. Idempotent. */
  async connect(): Promise<void> {
    if (this.client) return;
    if (!this.isConfigured) {
      throw new Error('IMAP is not configured (IMAP_USER / IMAP_PASSWORD missing).');
    }
    this.logger.info(`Connecting to IMAP ${this.config.host}:${this.config.port}`);
    this.client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: { user: this.config.user, pass: this.config.password },
      logger: false, // silence imapflow's own pino logging
    });
    await this.client.connect();
    await this.client.mailboxOpen(this.config.mailbox);
    this.logger.info(`Connected; mailbox "${this.config.mailbox}" open`);
  }

  /** Close the IMAP connection. Safe to call multiple times. */
  async disconnect(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.logout();
    } catch (err) {
      this.logger.warn('IMAP logout failed (ignored)', String(err));
    } finally {
      this.client = null;
    }
  }

  /**
   * Poll the mailbox until a message matching `criteria` is found or the
   * timeout elapses. Returns the parsed email, or null on timeout.
   */
  async waitForEmail(
    criteria: EmailSearchCriteria,
    options: PollOptions = {},
  ): Promise<ParsedEmail | null> {
    if (!this.client) await this.connect();
    const timeoutMs = options.timeoutMs ?? this.config.pollTimeoutMs;
    const intervalMs = options.intervalMs ?? this.config.pollIntervalMs;
    const since = criteria.since ?? new Date(Date.now() - 60_000);
    const deadline = Date.now() + timeoutMs;

    this.logger.info('Polling for email', { subject: String(criteria.subject), timeoutMs });

    while (Date.now() < deadline) {
      const match = await this.findOnce({ ...criteria, since });
      if (match) {
        this.logger.info(`Email found: "${match.subject}"`);
        return match;
      }
      await this.sleep(intervalMs);
    }
    this.logger.warn('Email not found within timeout', { subject: String(criteria.subject) });
    return null;
  }

  /** Single search pass over the mailbox (no polling). */
  private async findOnce(criteria: EmailSearchCriteria): Promise<ParsedEmail | null> {
    const client = this.client!;
    // Server-side narrow by date + optional sender; subject/body filtered client-side
    // because IMAP SUBJECT search cannot do regex.
    const searchQuery: Record<string, unknown> = {};
    if (criteria.since) searchQuery.since = criteria.since;
    if (criteria.from) searchQuery.from = criteria.from;

    const uids = (await client.search(searchQuery, { uid: true })) || [];
    if (uids.length === 0) return null;

    // Inspect newest first.
    const ordered = [...uids].sort((a, b) => b - a);
    for (const uid of ordered) {
      const msg = (await client.fetchOne(String(uid), { source: true }, { uid: true })) as
        | FetchMessageObject
        | false;
      if (!msg || !msg.source) continue;
      const parsed = await simpleParser(msg.source as Buffer);
      const email = this.toParsedEmail(uid, parsed);
      if (this.matches(email, criteria)) return email;
    }
    return null;
  }

  private toParsedEmail(uid: number, mail: ParsedMail): ParsedEmail {
    const html = typeof mail.html === 'string' ? mail.html : '';
    return {
      uid,
      subject: mail.subject ?? '',
      from: mail.from?.text ?? '',
      to: Array.isArray(mail.to) ? mail.to.map((a) => a.text).join(', ') : mail.to?.text ?? '',
      date: mail.date ?? null,
      text: mail.text ?? '',
      html,
      hasHtml: Boolean(html),
    };
  }

  private matches(email: ParsedEmail, criteria: EmailSearchCriteria): boolean {
    if (criteria.subject && !this.test(email.subject, criteria.subject)) return false;
    if (criteria.from && !email.from.toLowerCase().includes(criteria.from.toLowerCase())) {
      return false;
    }
    if (criteria.bodyContains) {
      const body = `${email.text}\n${email.html}`;
      if (!this.test(body, criteria.bodyContains)) return false;
    }
    return true;
  }

  private test(value: string, matcher: string | RegExp): boolean {
    return matcher instanceof RegExp
      ? matcher.test(value)
      : value.toLowerCase().includes(matcher.toLowerCase());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Content-validation helpers — pure functions so they're trivially unit-testable
 * and reusable across the email spec assertions.
 */
export const EmailValidators = {
  hasSubject(email: ParsedEmail, matcher: string | RegExp): boolean {
    return matcher instanceof RegExp
      ? matcher.test(email.subject)
      : email.subject.toLowerCase().includes(matcher.toLowerCase());
  },

  bodyContains(email: ParsedEmail, matcher: string | RegExp): boolean {
    const body = `${email.text}\n${email.html}`;
    return matcher instanceof RegExp ? matcher.test(body) : body.includes(matcher);
  },

  /** A filename appears anywhere in the body (text or html). */
  containsFileName(email: ParsedEmail, fileName: string): boolean {
    return this.bodyContains(email, fileName);
  },

  /** The maker's display name is present in the body. */
  containsMakerName(email: ParsedEmail, makerName: string): boolean {
    return this.bodyContains(email, makerName);
  },

  /** A timestamp-like token exists in the body (date or time pattern). */
  hasTimestamp(email: ParsedEmail): boolean {
    const body = `${email.text}\n${email.html}`;
    return /\d{1,2}[:/-]\d{1,2}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(
      body,
    );
  },

  /** Message carried HTML and that HTML contains real markup. */
  isHtmlFormatted(email: ParsedEmail): boolean {
    return email.hasHtml && /<\s*(html|body|table|div|p|a)\b/i.test(email.html);
  },
};
