/**
 * Reusable, domain-specific assertions.
 *
 * Wrapping common expectations in named helpers keeps specs declarative
 * ("expectUploadApiSucceeded") and centralises the matching logic so a single
 * fix propagates everywhere.
 */
import { expect } from '@playwright/test';
import type { CapturedCall } from './apiHelper.js';
import type { ParsedEmail } from './emailHelper.js';
import { EmailValidators } from './emailHelper.js';

export const Assert = {
  /** An API call exists and returned the expected status code. */
  apiStatus(call: CapturedCall | undefined, expectedStatus: number, label: string): void {
    expect(call, `${label} API call should have been captured`).toBeTruthy();
    expect(call!.status, `${label} API status`).toBe(expectedStatus);
  },

  /** A captured call's status is in the 2xx range. */
  apiSucceeded(call: CapturedCall | undefined, label: string): void {
    expect(call, `${label} API call should have been captured`).toBeTruthy();
    expect(call!.ok, `${label} API should be ok (got ${call?.status})`).toBe(true);
  },

  /** A captured call returned 403 Forbidden (security tests). */
  apiForbidden(call: CapturedCall | undefined, label: string): void {
    expect(call, `${label} API call should have been captured`).toBeTruthy();
    expect(call!.status, `${label} should be forbidden`).toBe(403);
  },

  /** A notification email satisfies all required content checks. */
  emailContent(
    email: ParsedEmail | null,
    opts: { subject: string | RegExp; fileName?: string; makerName?: string },
  ): void {
    expect(email, 'notification email should have been received').toBeTruthy();
    const e = email!;
    expect(EmailValidators.hasSubject(e, opts.subject), `subject "${e.subject}"`).toBe(true);
    if (opts.fileName) {
      expect(EmailValidators.containsFileName(e, opts.fileName), 'body contains filename').toBe(true);
    }
    if (opts.makerName) {
      expect(EmailValidators.containsMakerName(e, opts.makerName), 'body contains maker name').toBe(
        true,
      );
    }
    expect(EmailValidators.hasTimestamp(e), 'body contains a timestamp').toBe(true);
    expect(EmailValidators.isHtmlFormatted(e), 'email is HTML-formatted').toBe(true);
  },
};
