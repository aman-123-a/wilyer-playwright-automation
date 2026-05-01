import { test, expect } from '@playwright/test';
import { LibraryPage } from '../pages/LibraryPage';
import { MediaSetPage } from '../pages/MediaSetPage';
import { RolloutPage } from '../pages/RolloutPage';
import { step } from '../pages/BasePage';

const RUN_TAG       = `${Date.now().toString().slice(-6)}`;
const MEDIA_NAME    = `Smoke_MediaSet_${RUN_TAG}`;
const ROLLOUT_NAME  = `Smoke_Rollout_${RUN_TAG}`;
const ROLLOUT_DESC  = 'Automated smoke rollout';
const ROW_CODE      = `S${RUN_TAG}`;
const PREFERRED_GROUP = 'Main PPI';
const FALLBACK_GROUP  = 'India';

test.describe('CMS Smoke', () => {
  test('Media Set: create with landscape + portrait assets', async ({ page }) => {
    step(`smoke run tag = ${RUN_TAG}`);
    const lib = new LibraryPage(page);
    const ms  = new MediaSetPage(page);

    await lib.open();
    await lib.openMediaSets();
    await lib.newMediaSetButton.click();
    await expect(ms.modal).toBeVisible({ timeout: 10_000 });

    await ms.fillName(MEDIA_NAME);
    const ltile = await ms.pickTile('landscape');
    const ptile = await ms.pickTile('portrait');
    await ms.dragAssetToZone(ltile, 'landscape');
    await ms.dragAssetToZone(ptile, 'portrait');

    await ms.submitCreate();
    await ms.waitForModalClosed('mediaSetModal');

    await ms.toastVisible(/created|success/i);
    await expect(page.getByText(MEDIA_NAME).first()).toBeVisible({ timeout: 15_000 });
  });

  test('Rollout: create, choose group, add row, content, save, publish', async ({ page }) => {
    const ro = new RolloutPage(page);
    await ro.openList();
    await ro.createRollout(ROLLOUT_NAME, ROLLOUT_DESC);

    const groupChosen = await ro.setMainGroup(PREFERRED_GROUP, FALLBACK_GROUP);
    console.log(`✅ main group = ${groupChosen}`);

    await ro.addRow(ROW_CODE);
    await ro.addContentColumn();
    await ro.save();
    await ro.publish();

    await ro.toastVisible(/publish|success|live/i);
    await expect(page).toHaveURL(/\/content-rollout\/[a-f0-9]+/i);
  });
});
