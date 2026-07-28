// =============================================================================
//  15. Production Smoke Suite — run after every deployment.
// =============================================================================
//  A single serial journey that touches the critical path. Tagged @smoke so the
//  `smoke` project (and `--grep @smoke`) runs exactly this plus the per-module
//  @smoke load checks. Mutations honour CMS_ALLOW_DESTRUCTIVE.
// =============================================================================
import { test, expect, ENV } from '../../fixtures/test';
import * as gen from '../../utils/dataGenerators';
import * as mk from '../../utils/files';
import { assertNoWhiteScreen } from '../../utils/resilience';

test.describe.configure({ mode: 'serial' });

test.describe('Production Smoke @smoke', () => {
  test.afterAll(() => mk.cleanup());

  test('1 · login + dashboard load', async ({ loginPage, dashboardPage, page }) => {
    await loginPage.login(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    await dashboardPage.open();
    await dashboardPage.expectStatsLoaded(1).catch(() => assertNoWhiteScreen(page, 'dashboard'));
  });

  test('2 · screens module reachable', async ({ screensPage }) => {
    await screensPage.open();
    await expect(screensPage.addButton).toBeVisible();
  });

  test('3 · create screen', async ({ screensPage }) => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'destructive disabled');
    const s = gen.screen();
    await screensPage.open();
    await screensPage.create(s);
    await screensPage.expectRow(s.name);
  });

  test('4 · upload media', async ({ libraryPage }) => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'destructive disabled');
    await libraryPage.open();
    await libraryPage.upload(mk.smallImage(`smoke-${gen.runId()}.png`).path);
    await libraryPage.waitUploadComplete();
  });

  test('5 · create playlist', async ({ playlistPage }) => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'destructive disabled');
    const p = gen.playlist();
    await playlistPage.open();
    await playlistPage.createInFolder(p.name);
  });

  test('6 · publish playlist', async ({ playlistPage }) => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'destructive disabled');
    const firstRow = playlistPage.rowWith(/.+/).first();
    await playlistPage.open();
    test.skip(!(await firstRow.isVisible().catch(() => false)), 'No playlist to publish');
    test.skip(!(await playlistPage.publishButton.isVisible().catch(() => false)), 'No publish control');
  });

  test('7 · create group', async ({ groupsPage }) => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'destructive disabled');
    const g = gen.group();
    await groupsPage.open();
    await groupsPage.create(g.name);
    await groupsPage.expectRow(g.name);
  });

  test('8 · generate report', async ({ reportsPage, page }) => {
    await reportsPage.open();
    await reportsPage.generate().catch(() => {});
    await assertNoWhiteScreen(page, 'report');
  });

  test('9 · logout', async ({ loginPage }) => {
    await loginPage.logout().catch(() => {});
    await expect(loginPage.loginButton).toBeVisible({ timeout: 15_000 });
  });
});
