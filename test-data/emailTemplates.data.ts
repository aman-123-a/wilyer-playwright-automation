// =============================================================================
//  Approval-notification contract — the ten cases in the file-upload, content-
//  publish and playlist-publish threads.
//
//  Source of truth: docs/email-templates-v2/file-approval/notification.html, as
//  rendered in the v2 gallery (email-notifications-v2.html, templates 21-29 and
//  37-40). The gallery is the design; this file is that design written down as
//  something a test can assert.
//
//  ── What each case pins ─────────────────────────────────────────────────────
//  `subject`   the subject line the design specifies. Live subjects currently
//              differ on every single case (see KNOWN_SUBJECT_DRIFT), so the
//              subject assertions are the ones marked test.fail() in the spec.
//  `eyebrow`   the small caps label above the headline. Live renders these in
//              upper case; matching is case-insensitive so that is not a fail.
//  `headline`  the H1. This is the line that carries the emoji and the count.
//  `requires`  fragments that MUST appear in the body. Kept to sentences the
//              design owns — not sample data, which changes per account.
//  `forbids`   fragments that must NOT appear. Mostly the placeholder leaks
//              ({{…}}) and the empty-name case where a template slot renders
//              blank because the backend passed nothing.
//  `linkTarget` where the primary button has to land once the SES click-tracking
//              wrapper is peeled off.
//
//  Nothing here encodes brand name or timestamps: `brandName` is per account
//  (this account renders "Wilyer Partner", the gallery samples "Wilyer Signage")
//  and the generated stamp is per send.
// =============================================================================

export type MailThread = 'upload' | 'publish' | 'playlist';
export type MailStage = 'request' | 'approved' | 'rejected';

export interface EmailCase {
  /** Gallery number, so a finding can be traced back to the design. */
  readonly template: number;
  /** Stable id used in the test title. */
  readonly id: string;
  readonly thread: MailThread;
  readonly stage: MailStage;
  /** Who the mail is addressed to. */
  readonly to: 'maker' | 'checker';
  /** Subject the design specifies. */
  readonly subject: string;
  /** Subject the server actually sends today, as observed on cms2 2026-09-09. */
  readonly observedSubject: RegExp;
  readonly eyebrow: string;
  readonly headline: RegExp;
  readonly requires: readonly (string | RegExp)[];
  readonly forbids?: readonly RegExp[];
  readonly linkTarget?: RegExp;
}

/** Placeholder leaks — a rendered mail must never show template syntax. */
export const PLACEHOLDER_LEAK = /\{\{[^}]+\}\}/;

/**
 * Every mail in the set closes with the same two lines: an automated-message
 * note and the brand footer carrying the generated stamp.
 */
export const COMMON_FOOTER: readonly (string | RegExp)[] = [
  'This is an automated message',
  /Automated message from .+ [•·] Generated/,
];

export const EMAIL_CASES: readonly EmailCase[] = [
  // ── File upload ───────────────────────────────────────────────────────────
  {
    template: 21,
    id: 'upload-request-single',
    thread: 'upload',
    stage: 'request',
    to: 'checker',
    subject: '⏳ Upload approval needed - 1 file',
    observedSubject: /^New File Awaiting Your Approval$/,
    eyebrow: 'Upload Approval',
    headline: /⏳ 1 File Awaiting Upload Approval/,
    requires: [
      'Review & Decide',
      'Open in the CMS',
      'The link is valid for 7 days and works once',
      /File pending/i,
      /a file has been uploaded into the .+ folder and is waiting on your review/,
      'File Awaiting Upload Approval',
    ],
    // "Uploaded by " with nothing after it is the header slot the backend
    // leaves empty — the uploader's name is known and is printed further down.
    forbids: [PLACEHOLDER_LEAK, /Uploaded by\s*\n/],
    linkTarget: /\/library\?tab=unapprovedFiles&subtab=pending/,
  },
  {
    template: 22,
    id: 'upload-request-batch',
    thread: 'upload',
    stage: 'request',
    to: 'checker',
    subject: '⏳ Action Required - 4 files awaiting approval',
    observedSubject: /^(\d+ )?New Files Awaiting Your Approval$/,
    eyebrow: 'Upload Approval',
    headline: /⏳ \d+ Files Awaiting Upload Approval/,
    requires: [
      'Review & Decide',
      /Files pending/i,
      /files were uploaded into the .+ folder and are waiting on your review/,
      'Files Awaiting Upload Approval',
    ],
    forbids: [PLACEHOLDER_LEAK, /Uploaded by\s*\n/],
    linkTarget: /\/library\?tab=unapprovedFiles&subtab=pending/,
  },
  {
    template: 23,
    id: 'upload-approved-single',
    thread: 'upload',
    stage: 'approved',
    to: 'maker',
    subject: '✅ fresh-produce-promo.jpg approved',
    observedSubject: /^1 File Approved Successfully$/,
    eyebrow: 'Upload Decision',
    headline: /✅ File Approved/,
    requires: [
      /Reviewed by \S+/,
      /your file has been approved and is now in the media library/,
      'Approved File',
      'The version that was approved. Recorded against your request of',
      'Open in the CMS',
    ],
    forbids: [PLACEHOLDER_LEAK],
    linkTarget: /\/library\?tab=unapprovedFiles&subtab=approved/,
  },
  {
    template: 24,
    id: 'upload-rejected-single',
    thread: 'upload',
    stage: 'rejected',
    to: 'maker',
    subject: '⚠️ Action needed - fresh-produce-promo.jpg rejected',
    observedSubject: /^1 File Rejected$/,
    eyebrow: 'Upload Decision',
    headline: /⚠️ File Rejected/,
    requires: [
      /Reviewed by \S+/,
      /your file was not approved and has not entered the media library/,
      'Rejected File',
      // The design gives this section a caption. Live renders the heading with
      // an empty caption line under it.
      'This is the version that was refused.',
    ],
    forbids: [PLACEHOLDER_LEAK],
    linkTarget: /\/library\?tab=unapprovedFiles&subtab=rejected/,
  },
  {
    template: 25,
    id: 'upload-approved-batch',
    thread: 'upload',
    stage: 'approved',
    to: 'maker',
    subject: '✅ 2 files approved',
    observedSubject: /^\d+ Files Approved Successfully$/,
    eyebrow: 'Upload Decision',
    headline: /✅ \d+ Files Approved/,
    requires: [
      /your files have been approved and are now in the media library|of the \w+ files in your request have been approved/,
      'Approved Files',
      'Recorded against your request of',
    ],
    forbids: [PLACEHOLDER_LEAK],
    linkTarget: /\/library\?tab=unapprovedFiles&subtab=approved/,
  },
  {
    template: 26,
    id: 'upload-rejected-batch',
    thread: 'upload',
    stage: 'rejected',
    to: 'maker',
    subject: '⚠️ Action needed - 2 files rejected',
    observedSubject: /^\d+ Files Rejected$/,
    eyebrow: 'Upload Decision',
    headline: /⚠️ \d+ Files Rejected/,
    requires: [
      /of the files in your request were not approved/,
      'Rejected Files',
      'These are the versions that were refused.',
    ],
    forbids: [PLACEHOLDER_LEAK],
    linkTarget: /\/library\?tab=unapprovedFiles&subtab=rejected/,
  },

  // ── Content publish (publish files to screens) ─────────────────────────────
  {
    template: 27,
    id: 'publish-request',
    thread: 'publish',
    stage: 'request',
    to: 'checker',
    subject: '⏳ Action Required - 3 items awaiting publish approval',
    observedSubject: /^Content Approval Escalation - Action Required$/,
    eyebrow: 'Publish Approval',
    headline: /⏳ \d+ Items? Awaiting Publish Approval/,
    requires: [
      /Requested by \S+/,
      'Review & Decide',
      'The link is valid for 7 days and works once',
      /Items? pending/i,
      /Screens affected/i,
      'Content Awaiting Publish Approval',
      'How It Lands',
      /Where This Would Land/i,
      // The greeting has to name the reviewer, the way the upload thread does.
      /Hi \S+ \S+,/,
    ],
    forbids: [PLACEHOLDER_LEAK, /Hi there,/],
    linkTarget: /\/publish\/magic-approval\?token=/,
  },
  {
    template: 28,
    id: 'publish-approved',
    thread: 'publish',
    stage: 'approved',
    to: 'maker',
    subject: '✅ Publish approved - going live 2 Aug',
    observedSubject: /^\d+ Contents? Published Successfully$/,
    eyebrow: 'Publish Decision',
    headline: /✅ Publish Approved/,
    requires: [
      /Reviewed by \S+/,
      /your publish request has been approved/,
      'Approved for Publish',
      'How It Landed',
      /Where This Goes Live/i,
      /Screens/,
    ],
    forbids: [PLACEHOLDER_LEAK],
    linkTarget: /\/library/,
  },
  {
    template: 29,
    id: 'publish-rejected',
    thread: 'publish',
    stage: 'rejected',
    to: 'maker',
    subject: '⚠️ Action needed - publish rejected',
    observedSubject: /^\d+ Contents? Rejected$/,
    eyebrow: 'Publish Decision',
    headline: /⚠️ Publish Rejected/,
    requires: [
      /Reviewed by \S+/,
      /your publish request was not approved, so nothing has gone to the screens/,
      'Rejected for Publish',
      'These did not go to any screen.',
      /Where This Would Have Landed/i,
    ],
    // The per-item "BY <name>" row must name the requester, never the reviewer:
    // this mail goes TO the requester, so "BY <checker>" reads as if the
    // checker submitted it.
    forbids: [PLACEHOLDER_LEAK],
    linkTarget: /\/library/,
  },

  // ── Playlist publish ──────────────────────────────────────────────────────
  {
    template: 38,
    id: 'playlist-request-first',
    thread: 'playlist',
    stage: 'request',
    to: 'checker',
    subject: '⏳ Action Required - new playlist awaiting approval',
    observedSubject: /^Playlist Approval Escalation - Action Required$/,
    eyebrow: 'Publish Approval',
    headline: /⏳ New Playlist Awaiting Approval/,
    requires: [
      /requested by \S+/,
      'Review & Decide',
      'The link is valid for 7 days and works once',
      /Items? pending/i,
      /a playlist is queued to publish with \d+ items? awaiting your review/i,
      /Where This Would Land/i,
    ],
    forbids: [PLACEHOLDER_LEAK],
    linkTarget: /\/publish\/magic-approval\?token=/,
  },
  {
    template: 39,
    id: 'playlist-approved',
    thread: 'playlist',
    stage: 'approved',
    to: 'maker',
    subject: '✅ Playlist approved - 6 changes applied',
    observedSubject: /^Playlist Approved Successfully$/,
    eyebrow: 'Playlist Decision',
    headline: /✅ Playlist Approved/,
    requires: [
      /reviewed by \S+/,
      /your playlist has been reviewed and approved/,
      /Changes applied/i,
      'Approved Changes',
      /Where This Goes Live/i,
    ],
    forbids: [PLACEHOLDER_LEAK],
    linkTarget: /\/playlists/,
  },
  {
    template: 40,
    id: 'playlist-rejected',
    thread: 'playlist',
    stage: 'rejected',
    to: 'maker',
    subject: '⚠️ Action needed - playlist rejected',
    observedSubject: /^Playlist Rejected$/,
    eyebrow: 'Playlist Decision',
    headline: /⚠️ Playlist Rejected/,
    requires: [
      /reviewed by \S+/,
      /your playlist was not approved/,
      /Changes not applied/i,
      /Where This Would Have Landed/i,
    ],
    forbids: [PLACEHOLDER_LEAK],
    linkTarget: /\/playlists/,
  },
];

/**
 * Subject drift, recorded 2026-09-09 against cms2 (app v3.5.25).
 *
 * Every one of the ten cases ships a subject the design does not specify. The
 * pattern is consistent: the sent subjects carry no status emoji, no file name
 * and no schedule date, and both request mails are labelled "Escalation" on the
 * FIRST send — before any escalation has happened.
 */
export const KNOWN_SUBJECT_DRIFT = EMAIL_CASES.map((c) => ({
  template: c.template,
  designed: c.subject,
  sent: c.observedSubject,
}));

export const caseById = (id: string): EmailCase => {
  const found = EMAIL_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown email case: ${id}`);
  return found;
};
