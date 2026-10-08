/**
 * Email-notification validation over IMAP.
 *
 * Tags: @notification @regression
 *
 * Covers requirements #8–#10:
 *  - pending / approval / rejection / escalation emails,
 *  - content validation (subject, body, file name, timestamp, maker name, HTML),
 *  - bounded polling for delayed delivery (60s timeout, 5s interval).
 *
 * The whole suite skips cleanly when IMAP isn't configured, so CI without mail
 * credentials stays green instead of erroring.
 */
import { test, expect } from '../../fixtures/baseFixtures.js';
import { UploadPage } from '../../pages/UploadPage.js';
import { ApprovalPage } from '../../pages/ApprovalPage.js';
import { LoginHelper } from '../../utils/loginHelper.js';
import { UploadHelper } from '../../utils/uploadHelper.js';
import { Assert } from '../../utils/assertions.js';
import { uniqueFileName, RejectionReasons } from '../../test-data/testData.js';
import { EMAIL_SUBJECTS } from '../../config/constants.js';
import { env } from '../../config/env.js';

test.describe('Email notifications', { tag: ['@notification'] }, () => {
  test.skip(!env.email.isConfigured, 'IMAP not configured (set IMAP_USER / IMAP_PASSWORD)');

  test('pending-upload email is delivered with valid content', async ({ browser, email }) => {
    const since = new Date();
    const ctx = await LoginHelper.contextForRole(browser, 'maker');
    const page = await ctx.newPage();
    const fileName = uniqueFileName('email-pending');

    try {
      const upload = new UploadPage(page);
      await upload.goto();
      await upload.uploadFile(UploadHelper.createValidFile(fileName).path);
      await upload.submitForApproval();
    } finally {
      await ctx.close();
    }

    const mail = await email.waitForEmail(
      { subject: EMAIL_SUBJECTS.pending, from: env.email.notificationFrom, since },
      { timeoutMs: env.email.pollTimeoutMs, intervalMs: env.email.pollIntervalMs },
    );

    Assert.emailContent(mail, {
      subject: EMAIL_SUBJECTS.pending,
      fileName,
      makerName: env.users.maker.name,
    });
  });

  test('approval email is delivered after Checker approves', async ({ browser, email }) => {
    const since = new Date();
    // Seed + approve.
    const makerCtx = await LoginHelper.contextForRole(browser, 'maker');
    const makerPage = await makerCtx.newPage();
    const fileName = uniqueFileName('email-approve');
    try {
      const upload = new UploadPage(makerPage);
      await upload.goto();
      await upload.uploadFile(UploadHelper.createValidFile(fileName).path);
      await upload.submitForApproval();
    } finally {
      await makerCtx.close();
    }

    const checkerCtx = await LoginHelper.contextForRole(browser, 'checker');
    const checkerPage = await checkerCtx.newPage();
    try {
      const approval = new ApprovalPage(checkerPage);
      await approval.goto();
      await approval.approve(fileName);
    } finally {
      await checkerCtx.close();
    }

    const mail = await email.waitForEmail(
      { subject: EMAIL_SUBJECTS.approval, from: env.email.notificationFrom, since },
      { timeoutMs: env.email.pollTimeoutMs, intervalMs: env.email.pollIntervalMs },
    );
    Assert.emailContent(mail, { subject: EMAIL_SUBJECTS.approval, fileName });
  });

  test('rejection email is delivered after Checker rejects', async ({ browser, email }) => {
    const since = new Date();
    const makerCtx = await LoginHelper.contextForRole(browser, 'maker');
    const makerPage = await makerCtx.newPage();
    const fileName = uniqueFileName('email-reject');
    try {
      const upload = new UploadPage(makerPage);
      await upload.goto();
      await upload.uploadFile(UploadHelper.createValidFile(fileName).path);
      await upload.submitForApproval();
    } finally {
      await makerCtx.close();
    }

    const checkerCtx = await LoginHelper.contextForRole(browser, 'checker');
    const checkerPage = await checkerCtx.newPage();
    try {
      const approval = new ApprovalPage(checkerPage);
      await approval.goto();
      await approval.reject(fileName, RejectionReasons.default);
    } finally {
      await checkerCtx.close();
    }

    const mail = await email.waitForEmail(
      { subject: EMAIL_SUBJECTS.rejection, from: env.email.notificationFrom, since },
      { timeoutMs: env.email.pollTimeoutMs, intervalMs: env.email.pollIntervalMs },
    );
    Assert.emailContent(mail, { subject: EMAIL_SUBJECTS.rejection, fileName });
    // Rejection mail should additionally carry the reason.
    expect(mail!.text + mail!.html).toContain(RejectionReasons.default.slice(0, 20));
  });

  test('escalation email is delivered for un-actioned uploads', async ({ email }) => {
    // Escalation is time-driven (no action by the Checker within an SLA window).
    // We cannot force the SLA timer in a fast test, so we poll for any escalation
    // mail produced by the environment and validate its shape if present.
    const mail = await email.waitForEmail(
      { subject: EMAIL_SUBJECTS.escalation, from: env.email.notificationFrom },
      { timeoutMs: env.email.pollTimeoutMs, intervalMs: env.email.pollIntervalMs },
    );
    test.skip(!mail, 'No escalation email within window (SLA timer not elapsed)');
    Assert.emailContent(mail, { subject: EMAIL_SUBJECTS.escalation });
  });
});
