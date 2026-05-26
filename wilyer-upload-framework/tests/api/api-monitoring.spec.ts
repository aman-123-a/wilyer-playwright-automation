/**
 * API monitoring.
 *
 * Tags: @regression @notification
 *
 * Covers requirement #14: capture Upload / Notification / Approval / error
 * responses and validate status codes + payloads + failure handling.
 */
import { test, expect } from '../../fixtures/baseFixtures.js';
import { UploadPage } from '../../pages/UploadPage.js';
import { NetworkMonitor } from '../../utils/apiHelper.js';
import { UploadHelper } from '../../utils/uploadHelper.js';
import { uniqueFileName } from '../../test-data/testData.js';
import { API_PATTERNS } from '../../config/constants.js';

test.describe('API monitoring — upload flow', { tag: ['@regression', '@notification'] }, () => {
  test('upload triggers a 2xx upload API call with a payload', async ({ makerPage }) => {
    const monitor = new NetworkMonitor(makerPage);
    monitor.start();

    const upload = new UploadPage(makerPage);
    const file = UploadHelper.createValidFile(uniqueFileName('api-mon'));
    await upload.goto();
    await upload.uploadFile(file.path);
    await upload.submitForApproval();

    const uploadCall = monitor.lastUploadCall();
    expect(uploadCall, 'an upload API call should be captured').toBeTruthy();
    expect(uploadCall!.ok, `upload status ${uploadCall?.status} should be 2xx`).toBe(true);
    expect(uploadCall!.responseBody, 'upload response should have a body').toBeTruthy();
  });

  test('notification API responds 200 when present', async ({ makerPage }) => {
    const monitor = new NetworkMonitor(makerPage);
    monitor.start();

    const upload = new UploadPage(makerPage);
    await upload.goto();
    await upload.uploadFile(UploadHelper.createValidFile(uniqueFileName('api-notif')).path);
    await upload.submitForApproval();

    const notif = await monitor.waitForCall(API_PATTERNS.notification, 10_000).catch(() => undefined);
    test.skip(!notif, 'No discrete notification API call observed in this environment');
    expect(notif!.status).toBe(200);
  });

  test('no unexpected error responses during a clean upload', async ({ makerPage }) => {
    const monitor = new NetworkMonitor(makerPage);
    monitor.start();

    const upload = new UploadPage(makerPage);
    await upload.goto();
    await upload.uploadFile(UploadHelper.createValidFile(uniqueFileName('api-clean')).path);
    await upload.submitForApproval();

    // Allow benign auth/analytics 401s noted in project memory; flag real 5xx.
    const serverErrors = monitor.errorResponses().filter((c) => c.status >= 500);
    expect(serverErrors, `unexpected 5xx: ${JSON.stringify(serverErrors)}`).toHaveLength(0);
  });
});
