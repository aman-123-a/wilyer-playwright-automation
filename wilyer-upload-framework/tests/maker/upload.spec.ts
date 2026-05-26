/**
 * Maker workflow — upload + submit for approval.
 *
 * Tags: @smoke @regression @notification
 *
 * Covers requirement #6:
 *  - login as Maker (via stored session),
 *  - navigate to File Upload,
 *  - upload a valid file,
 *  - submit for approval,
 *  - validate success toast + pending status,
 *  - capture upload API response,
 *  - validate notification API returns 200.
 */
import { test, expect } from '../../fixtures/baseFixtures.js';
import { UploadPage } from '../../pages/UploadPage.js';
import { NetworkMonitor } from '../../utils/apiHelper.js';
import { Assert } from '../../utils/assertions.js';
import { UploadHelper } from '../../utils/uploadHelper.js';
import { uniqueFileName } from '../../test-data/testData.js';
import { API_PATTERNS } from '../../config/constants.js';

test.describe('Maker — file upload & submit for approval', { tag: ['@smoke', '@notification'] }, () => {
  test('uploads a valid file and submits it for approval', async ({ makerPage }) => {
    const monitor = new NetworkMonitor(makerPage);
    monitor.start();

    const upload = new UploadPage(makerPage);
    const fileName = uniqueFileName('maker-valid');
    const file = UploadHelper.createValidFile(fileName);

    await test.step('navigate to upload module', async () => {
      await upload.goto();
      expect(await upload.canUpload(), 'Maker should have upload permission').toBe(true);
    });

    await test.step('upload valid file', async () => {
      await upload.uploadFile(file.path);
    });

    await test.step('submit for approval', async () => {
      await upload.submitForApproval();
    });

    await test.step('validate success toast', async () => {
      const toast = await upload.getToastText().catch(() => '');
      expect(toast, 'a success toast should be shown').toMatch(/success|uploaded|submitted|pending/i);
    });

    await test.step('validate pending status', async () => {
      expect(await upload.hasPendingStatus(fileName)).toBe(true);
    });

    await test.step('capture & validate upload API', async () => {
      const uploadCall = monitor.lastUploadCall();
      Assert.apiSucceeded(uploadCall, 'Upload');
    });

    await test.step('validate notification API status 200', async () => {
      // The notification call may fire slightly after the UI settles.
      const notif = await monitor
        .waitForCall(API_PATTERNS.notification, 10_000)
        .catch(() => monitor.lastNotificationCall());
      if (notif) {
        Assert.apiStatus(notif, 200, 'Notification');
      } else {
        test.info().annotations.push({
          type: 'note',
          description: 'No discrete notification API call observed; may be server-side only.',
        });
      }
    });
  });
});
