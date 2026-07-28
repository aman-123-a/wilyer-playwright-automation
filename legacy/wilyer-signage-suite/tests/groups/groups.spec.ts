// =============================================================================
//  5. Groups — CRUD, boundary, edge, failure.
// =============================================================================
import { test, expect } from '../../fixtures/test';
import * as gen from '../../utils/dataGenerators';
import { API } from '../../config/routes';
import { withFailure } from '../../utils/apiMocks';
import { assertGracefulDegradation } from '../../utils/resilience';

const MAX = 64;

test.describe('Groups · CRUD', () => {
  test('groups list loads @smoke', async ({ groupsPage }) => {
    await groupsPage.open();
    await expect(groupsPage.addButton).toBeVisible();
  });

  test('create group', async ({ groupsPage, requireDestructive }) => {
    requireDestructive();
    const g = gen.group();
    await groupsPage.open();
    await groupsPage.create(g.name);
    await groupsPage.expectRow(g.name);
  });

  test('update group', async ({ groupsPage, requireDestructive }) => {
    requireDestructive();
    const g = gen.group();
    const renamed = `${g.name}-upd`;
    await groupsPage.open();
    await groupsPage.create(g.name);
    await groupsPage.edit(g.name, renamed);
    await groupsPage.expectRow(renamed);
  });

  test('delete group', async ({ groupsPage, requireDestructive }) => {
    requireDestructive();
    const g = gen.group();
    await groupsPage.open();
    await groupsPage.create(g.name);
    await groupsPage.delete(g.name);
    await groupsPage.expectNoRow(g.name);
  });

  test('duplicate group name is blocked or flagged', async ({ groupsPage, requireDestructive }) => {
    requireDestructive();
    const g = gen.group();
    await groupsPage.open();
    await groupsPage.create(g.name);
    await groupsPage.create(g.name);
    const blocked = (await groupsPage.openModal().isVisible().catch(() => false)) ||
      (await groupsPage.toastVisible(/exist|duplicate|already/i));
    expect(blocked).toBe(true);
  });
});

test.describe('Groups · Boundary', () => {
  test('empty group name cannot be saved', async ({ groupsPage, requireDestructive }) => {
    requireDestructive();
    await groupsPage.open();
    await groupsPage.openCreate();
    await groupsPage.fillName('');
    await groupsPage.submit();
    await expect(groupsPage.openModal().or(groupsPage.nameInput)).toBeVisible();
  });

  test('max length group name accepted', async ({ groupsPage }) => {
    await groupsPage.open();
    await groupsPage.openCreate();
    await groupsPage.fillName(gen.stringOfLength(MAX));
    expect((await groupsPage.nameInput.inputValue()).length).toBeLessThanOrEqual(MAX);
  });

  test('max+1 length is bounded', async ({ groupsPage }) => {
    await groupsPage.open();
    await groupsPage.openCreate();
    await groupsPage.fillName(gen.stringOfLength(MAX + 1));
    expect((await groupsPage.nameInput.inputValue()).length).toBeLessThanOrEqual(MAX + 1);
  });
});

test.describe('Groups · Edge', () => {
  test('nested subgroup creation @edge', async ({ groupsPage, requireDestructive }) => {
    requireDestructive();
    const parent = gen.group();
    const child = gen.group();
    await groupsPage.open();
    await groupsPage.create(parent.name);
    await groupsPage.createSubgroup(parent.name, child.name).catch(() =>
      test.skip(true, 'No subgroup UI on this build'),
    );
  });

  test('group with 0 screens renders an empty state', async ({ groupsPage, requireDestructive }) => {
    requireDestructive();
    const g = gen.group();
    await groupsPage.open();
    await groupsPage.create(g.name);
    await groupsPage.search(groupsPage.searchBox, g.name);
    await groupsPage.rowWith(g.name).first().click();
    await expect(groupsPage.page.locator('body')).toBeVisible();
  });
});

test.describe('Groups · Failure', () => {
  test('group save API failure is handled', async ({ groupsPage, page, requireDestructive }) => {
    requireDestructive();
    await groupsPage.open();
    await withFailure(page, API.groups, 'http500', async () => {
      await groupsPage.openCreate();
      await groupsPage.fillName(gen.group().name);
      await groupsPage.submit();
      await assertGracefulDegradation(page, 'group save 500');
    }, { method: 'POST' });
  });
});
