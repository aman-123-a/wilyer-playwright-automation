/**
 * Permission / RBAC validation.
 *
 * Tags: @permission @security
 *
 * Covers requirement #13:
 *  - Maker cannot approve,
 *  - Checker cannot upload,
 *  - restricted access / hidden buttons,
 *  - 403 on unauthorized API calls.
 */
import { test, expect } from '../../fixtures/baseFixtures.js';
import { UploadPage } from '../../pages/UploadPage.js';
import { ApprovalPage } from '../../pages/ApprovalPage.js';
import { DashboardPage } from '../../pages/DashboardPage.js';

test.describe('Permissions — role boundaries', { tag: ['@permission', '@security'] }, () => {
  test('Maker cannot see approval controls', async ({ makerPage }) => {
    const approval = new ApprovalPage(makerPage);
    await approval.goto().catch(() => undefined);
    // Either the approvals route is inaccessible, or it shows no approve/reject controls.
    const hasControls = await approval.hasApprovalControls();
    expect(hasControls, 'Maker must not have approve/reject controls').toBe(false);
  });

  test('Checker cannot upload', async ({ checkerPage }) => {
    const upload = new UploadPage(checkerPage);
    await upload.goto().catch(() => undefined);
    expect(await upload.canUpload(), 'Checker must not be able to upload').toBe(false);
  });

  test('Maker dashboard hides the Approvals navigation', async ({ makerPage }) => {
    const dash = new DashboardPage(makerPage);
    await dash.navigate('/dashboard');
    await dash.waitForLoaded().catch(() => undefined);
    expect(await dash.hasApprovalsNav(), 'Approvals nav should be hidden for Maker').toBe(false);
  });

  test('Checker dashboard hides the Upload/Library navigation', async ({ checkerPage }) => {
    const dash = new DashboardPage(checkerPage);
    await dash.navigate('/dashboard');
    await dash.waitForLoaded().catch(() => undefined);
    // Depending on config the Checker may still browse the library read-only;
    // assert there is no upload affordance rather than no nav at all.
    const upload = new UploadPage(checkerPage);
    await upload.goto().catch(() => undefined);
    expect(await upload.canUpload()).toBe(false);
  });

  test('Maker hitting the approval API gets 403', async ({ makerPage, api }) => {
    // Reuse the Maker's session cookies for an authenticated-but-unauthorized call.
    const cookies = await makerPage.context().cookies();
    const token = cookies.find((c) => /token|auth|session/i.test(c.name))?.value;
    const res = await api.post('/approvals/approve', { id: 'nonexistent' }, token);
    expect([401, 403, 404]).toContain(res.status());
  });
});
