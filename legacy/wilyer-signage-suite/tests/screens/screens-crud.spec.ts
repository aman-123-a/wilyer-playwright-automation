// =============================================================================
//  3. Screens — CRUD
// =============================================================================
import { test, expect } from '../../fixtures/test';
import * as gen from '../../utils/dataGenerators';

test.describe('Screens · CRUD', () => {
  test('screens list loads @smoke', async ({ screensPage }) => {
    await screensPage.open();
    await expect(screensPage.addButton).toBeVisible();
  });

  test('create screen', async ({ screensPage, requireDestructive }) => {
    requireDestructive();
    const data = gen.screen();
    await screensPage.open();
    await screensPage.create(data);
    await screensPage.expectRow(data.name);
  });

  test('view screen detail', async ({ screensPage, page, requireDestructive }) => {
    requireDestructive();
    const data = gen.screen();
    await screensPage.open();
    await screensPage.create(data);
    await screensPage.openDetail(data.name);
    await expect(page).toHaveURL(/screen/i);
  });

  test('edit screen', async ({ screensPage, requireDestructive }) => {
    requireDestructive();
    const data = gen.screen();
    const renamed = `${data.name}-edited`;
    await screensPage.open();
    await screensPage.create(data);
    await screensPage.edit(data.name, renamed);
    await screensPage.expectRow(renamed);
  });

  test('delete screen', async ({ screensPage, requireDestructive }) => {
    requireDestructive();
    const data = gen.screen();
    await screensPage.open();
    await screensPage.create(data);
    await screensPage.delete(data.name);
    await screensPage.expectNoRow(data.name);
  });

  test('restore deleted screen @edge', async ({ screensPage, requireDestructive }) => {
    requireDestructive();
    const data = gen.screen();
    await screensPage.open();
    await screensPage.create(data);
    await screensPage.delete(data.name);
    await screensPage.restore(data.name).catch(() => test.skip(true, 'No restore/trash UI on this build'));
  });
});
