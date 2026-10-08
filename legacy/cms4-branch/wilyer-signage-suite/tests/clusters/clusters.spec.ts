// =============================================================================
//  6. Clusters — CRUD, actions (restart/sync/live data), edge, failure.
// =============================================================================
import { test, expect } from '../../fixtures/test';
import * as gen from '../../utils/dataGenerators';
import { API } from '../../config/routes';
import { withFailure } from '../../utils/apiMocks';
import { assertNoWhiteScreen, assertGracefulDegradation } from '../../utils/resilience';

test.describe('Clusters · CRUD', () => {
  test('clusters list loads @smoke', async ({ clustersPage }) => {
    await clustersPage.open();
    await expect(clustersPage.addButton).toBeVisible();
  });

  test('create cluster', async ({ clustersPage, requireDestructive }) => {
    requireDestructive();
    const c = gen.cluster();
    await clustersPage.open();
    await clustersPage.create(c.name);
    await clustersPage.expectRow(c.name);
  });

  test('edit cluster', async ({ clustersPage, requireDestructive }) => {
    requireDestructive();
    const c = gen.cluster();
    const renamed = `${c.name}-edit`;
    await clustersPage.open();
    await clustersPage.create(c.name);
    await clustersPage.edit(c.name, renamed);
    await clustersPage.expectRow(renamed);
  });

  test('delete cluster', async ({ clustersPage, requireDestructive }) => {
    requireDestructive();
    const c = gen.cluster();
    await clustersPage.open();
    await clustersPage.create(c.name);
    await clustersPage.delete(c.name);
    await clustersPage.expectNoRow(c.name);
  });
});

test.describe('Clusters · Edge', () => {
  test('cluster with 0 screens renders empty state', async ({ clustersPage, requireDestructive }) => {
    requireDestructive();
    const c = gen.cluster();
    await clustersPage.open();
    await clustersPage.create(c.name);
    await clustersPage.search(clustersPage.searchBox, c.name);
    await clustersPage.rowWith(c.name).first().click();
    await assertNoWhiteScreen(clustersPage.page, 'empty cluster');
  });

  test('mixed online/offline screens render without crash @edge', async ({ clustersPage }) => {
    await clustersPage.open();
    const firstRow = clustersPage.rowWith(/.+/).first();
    test.skip(!(await firstRow.isVisible().catch(() => false)), 'No clusters to open');
    await firstRow.click();
    await assertNoWhiteScreen(clustersPage.page, 'mixed status cluster');
  });
});

test.describe('Clusters · Actions', () => {
  test.beforeEach(async ({ clustersPage }) => {
    await clustersPage.open();
    const firstRow = clustersPage.rowWith(/.+/).first();
    test.skip(!(await firstRow.isVisible().catch(() => false)), 'No clusters to act on');
    await firstRow.click();
  });

  test('restart screens action available', async ({ clustersPage, requireDestructive }) => {
    requireDestructive();
    test.skip(!(await clustersPage.restartAllButton.isVisible().catch(() => false)), 'No restart action');
    await clustersPage.restartScreens();
    await assertNoWhiteScreen(clustersPage.page, 'cluster restart');
  });

  test('sync toggle works', async ({ clustersPage, requireDestructive }) => {
    requireDestructive();
    test.skip(!(await clustersPage.syncToggle.isVisible().catch(() => false)), 'No sync toggle');
    await clustersPage.toggleSync();
    await assertNoWhiteScreen(clustersPage.page, 'sync toggle');
  });

  test('live data toggle works', async ({ clustersPage, requireDestructive }) => {
    requireDestructive();
    test.skip(!(await clustersPage.liveDataToggle.isVisible().catch(() => false)), 'No live-data toggle');
    await clustersPage.toggleLiveData();
    await assertNoWhiteScreen(clustersPage.page, 'live data toggle');
  });
});

test.describe('Clusters · Failure', () => {
  test('restart API failure is handled', async ({ clustersPage, page, requireDestructive }) => {
    requireDestructive();
    await clustersPage.open();
    const firstRow = clustersPage.rowWith(/.+/).first();
    test.skip(!(await firstRow.isVisible().catch(() => false)), 'No clusters');
    await firstRow.click();
    test.skip(!(await clustersPage.restartAllButton.isVisible().catch(() => false)), 'No restart action');
    await withFailure(page, API.clusters, 'http500', async () => {
      await clustersPage.restartScreens();
      await assertGracefulDegradation(page, 'cluster restart 500');
    });
  });

  test('sync API failure is handled', async ({ clustersPage, page, requireDestructive }) => {
    requireDestructive();
    await clustersPage.open();
    const firstRow = clustersPage.rowWith(/.+/).first();
    test.skip(!(await firstRow.isVisible().catch(() => false)), 'No clusters');
    await firstRow.click();
    test.skip(!(await clustersPage.syncToggle.isVisible().catch(() => false)), 'No sync toggle');
    await withFailure(page, API.clusters, 'http500', async () => {
      await clustersPage.toggleSync();
      await assertNoWhiteScreen(page, 'cluster sync 500');
    });
  });
});
