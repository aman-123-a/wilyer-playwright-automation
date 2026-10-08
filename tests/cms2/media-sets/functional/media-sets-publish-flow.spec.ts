// =============================================================================
//  MEDIA SETS — Publish ▸ screens flow (cms2.pocsample.in, admin dev@wilyer.com).
//  Card ▸ Publish → screen picker (Screens / Groups / Clusters) → "Publish Media
//  Set for Approval" modal (Append | Publish as new playlist) → Continue.
//
//  The only screens on cms2 are offline test screens; the end-to-end case targets
//  "aman2" and reverts (Unpublish) so the screen is left as found. Each case uses
//  its own ZZ_QA_MS_ set, swept afterwards.
// =============================================================================

import type { Page } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';

const TEST_SCREEN = 'aman2';

test.describe('Media Sets — Publish to screens @regression', () => {
  let files: ZoneFiles;

  const openPicker = async (page: Page, ms: { open(): Promise<unknown>; searchAndSettle(t: string, n: number): Promise<unknown>; cardByName(n: string): ReturnType<Page['locator']> }, name: string) => {
    await ms.open();
    await ms.searchAndSettle(name, 1);
    await ms.cardByName(name).locator('button[data-tooltip-content="Publish"]').click();
    await expect(page.getByText(/screens? selected/i).first()).toBeVisible({ timeout: 20_000 });
  };
  const pickScreen = async (page: Page, screen: string) => {
    const row = page.locator('tbody tr', { hasText: screen }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('input[type=checkbox]').check();
  };
  const publishBtn = (page: Page) => page.locator('button', { hasText: /^\s*Publish\s*$/ });
  const modal = (page: Page) => page.locator('.modal.show, [role=dialog]').first();

  test.beforeEach(async ({ mediaSetsPage, mediaSetApi }) => {
    test.skip(!(await mediaSetsPage.isAvailable()), 'Media Sets module is absent from this build');
    files ??= await mediaSetApi.pickZoneFiles();
  });

  test.afterEach(async ({ mediaSetApi }) => {
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  });

  test('PUB-01 · picker offers Screens / Groups / Clusters, a counter and a searchable screen list', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('pub01', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    await openPicker(page, mediaSetsPage, name);

    for (const tab of ['Screens', 'Groups', 'Clusters']) {
      await expect(page.getByText(tab, { exact: true }).first(), `${tab} tab`).toBeVisible();
    }
    await expect(page.getByText(/0 screens? selected/i).first()).toBeVisible();
    await pickScreen(page, TEST_SCREEN);
    await expect(page.getByText(/1 screens? selected/i).first()).toBeVisible();
  });

  test('PUB-02 · Publish with no screen selected does not open the approval modal', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('pub02', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    await openPicker(page, mediaSetsPage, name);

    const btn = publishBtn(page);
    if (await btn.isEnabled()) await btn.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
    await expect(modal(page).getByText(/Publish Media Set for Approval/i)).toHaveCount(0);
  });

  test('PUB-03 · approval modal: Append is default, 3 conflict options, 2 position options', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('pub03', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    await openPicker(page, mediaSetsPage, name);
    await pickScreen(page, TEST_SCREEN);
    await publishBtn(page).click();

    const m = modal(page);
    await expect(m.getByText(/Publish Media Set for Approval/i)).toBeVisible({ timeout: 10_000 });
    await expect(m.getByLabel(/Append data in existing playlist/i)).toBeChecked();
    for (const t of [
      /Overwrite and keep latest publish/i,
      /Ignore latest and keep older version/i,
      /Add files again/i,
      /Add to End/i,
      /Add to Start/i,
    ]) {
      await expect(m.getByText(t).first()).toBeVisible();
    }
    await expect(m.getByLabel(/Overwrite and keep latest/i)).toBeChecked();
    await expect(m.getByLabel(/Add to End/i)).toBeChecked();
  });

  test('PUB-04 · "Publish as new playlist" hides conflict and position options', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('pub04', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    await openPicker(page, mediaSetsPage, name);
    await pickScreen(page, TEST_SCREEN);
    await publishBtn(page).click();

    const m = modal(page);
    await m.getByLabel(/Publish as new playlist/i).check();
    await expect(m.getByText(/File Conflict Handling/i)).toHaveCount(0);
    await expect(m.getByText(/Publish Position/i)).toHaveCount(0);
    await expect(m.getByRole('button', { name: /view/i })).toBeVisible();
    await m.getByLabel(/Append data in existing playlist/i).check();
    await expect(m.getByText(/File Conflict Handling/i)).toBeVisible();
  });

  test('PUB-05 · Go back closes the modal and keeps the selected screen', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('pub05', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    await openPicker(page, mediaSetsPage, name);
    await pickScreen(page, TEST_SCREEN);
    await publishBtn(page).click();
    await modal(page).getByRole('button', { name: /go back/i }).click();
    await expect(modal(page).getByText(/Publish Media Set for Approval/i)).toHaveCount(0);
    await expect(page.getByText(/1 screens? selected/i).first()).toBeVisible();
  });

  test('PUB-06 · View opens the aspect-ratio assignment panel for the selected screen', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('pub06', testInfo.workerIndex);
    await mediaSetApi.create(MediaSetService.payload(name, files));
    await openPicker(page, mediaSetsPage, name);
    await pickScreen(page, TEST_SCREEN);
    await publishBtn(page).click();
    await page.locator('.modal.show button', { hasText: /^\s*View\s*$/ }).click();
    await expect(page.getByText(/aspect ratio/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(TEST_SCREEN).first()).toBeVisible();
  });

  test('PUB-07 · end to end: Continue publishes to the screen, the set shows it, Unpublish reverts', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }, testInfo) => {
    // BUG-MS-PUB-01: publishing to ONE screen reports screenCount 2, and unpublishing it leaves 1 (phantom screen).
    test.fail(true, 'screenCount is wrong after publish/unpublish on one screen');
    test.setTimeout(180_000);
    const name = mediaSetName('pub07', testInfo.workerIndex);
    const id = await mediaSetApi.create(MediaSetService.payload(name, files));
    expect(id).toBeTruthy();

    const writes: string[] = [];
    page.on('response', (r) => {
      if (r.request().method() !== 'GET' && r.url().includes('/v3/cms/')) {
        writes.push(`${r.request().method()} ${r.status()} ${r.url().replace(/.*\/v3\/cms/, '')}`);
      }
    });

    await openPicker(page, mediaSetsPage, name);
    await pickScreen(page, TEST_SCREEN);
    await publishBtn(page).click();
    await modal(page).getByRole('button', { name: /^continue$/i }).click();
    await page.waitForTimeout(6_000);

    expect(writes.some((w) => /\/(publish|mediaSet\/publish|screen\/publish)/i.test(w)), `a publish call was made: ${writes}`).toBe(true);
    expect(writes.every((w) => !/ 5\d\d /.test(w)), `no 5xx: ${writes}`).toBe(true);

    const count = async () =>
      ((await mediaSetApi.findByName(name)) as unknown as { screenCount?: number } | undefined)?.screenCount ?? 0;
    await expect.poll(count, { timeout: 20_000, message: 'screenCount after publish' }).toBe(1);
    console.log(`[PUB-07] screenCount after publishing to 1 screen = ${await count()}`);

    // Revert so the screen is left as found: bulk Unpublish, then the set is swept.
    await mediaSetsPage.open();
    await mediaSetsPage.searchAndSettle(name, 1);
    await mediaSetsPage.selectCard(name);
    await mediaSetsPage.bulkUnpublishBtn.click();
    // Unpublish opens its own screen picker ("Select screens to unpublish").
    await pickScreen(page, TEST_SCREEN);
    await page.locator('button', { hasText: /unpublish/i }).last().click();
    // The page then asks "Are you sure you want to unpublish the selected media...".
    await expect(page.getByText(/are you sure you want to unpublish/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('dialog').getByRole('button', { name: /^continue$/i }).click();
    await expect.poll(count, { timeout: 20_000, message: 'screenCount after unpublish' }).toBe(0);
  });
});
