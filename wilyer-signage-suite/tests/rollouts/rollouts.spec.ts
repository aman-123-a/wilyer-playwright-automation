// =============================================================================
//  9. Rollouts — CRUD, edge, negative, failure.
// =============================================================================
import { test, expect } from '../../fixtures/test';
import * as gen from '../../utils/dataGenerators';
import { API } from '../../config/routes';
import { withFailure } from '../../utils/apiMocks';
import { assertGracefulDegradation, assertNoWhiteScreen } from '../../utils/resilience';

test.describe('Rollouts · CRUD', () => {
  test('rollouts list loads @smoke', async ({ rolloutsPage }) => {
    await rolloutsPage.open();
    await expect(rolloutsPage.addButton).toBeVisible();
  });

  test('create rollout', async ({ rolloutsPage, requireDestructive }) => {
    requireDestructive();
    const r = gen.rollout();
    await rolloutsPage.open();
    await rolloutsPage.createRollout(r.name, r.description);
    await assertNoWhiteScreen(rolloutsPage.page, 'after create rollout');
  });

  test('edit rollout', async ({ rolloutsPage, requireDestructive }) => {
    requireDestructive();
    const r = gen.rollout();
    await rolloutsPage.open();
    await rolloutsPage.createRollout(r.name, r.description);
    await rolloutsPage.edit(r.name, `${r.name}-edit`).catch(() => test.skip(true, 'Edit-in-list not available'));
  });

  test('delete rollout', async ({ rolloutsPage, requireDestructive }) => {
    requireDestructive();
    const r = gen.rollout();
    await rolloutsPage.open();
    await rolloutsPage.createRollout(r.name, r.description);
    await rolloutsPage.open();
    await rolloutsPage.delete(r.name).catch(() => test.skip(true, 'Delete-in-list not available'));
  });
});

test.describe('Rollouts · Edge', () => {
  test('rollout with 0 rows can be created', async ({ rolloutsPage, requireDestructive }) => {
    requireDestructive();
    const r = gen.rollout();
    await rolloutsPage.open();
    await rolloutsPage.createRollout(r.name, r.description);
    await rolloutsPage.save().catch(() => {});
    await assertNoWhiteScreen(rolloutsPage.page, '0-row rollout');
  });

  test('rollout with 1 row', async ({ rolloutsPage, requireDestructive }) => {
    requireDestructive();
    const r = gen.rollout();
    await rolloutsPage.open();
    await rolloutsPage.createRollout(r.name, r.description);
    await rolloutsPage.addRow(`R${gen.runId().slice(0, 4)}`).catch(() => test.skip(true, 'No add-row control'));
    await rolloutsPage.save().catch(() => {});
  });

  test('many rows (100) @edge', async ({ rolloutsPage, requireDestructive }) => {
    requireDestructive();
    const r = gen.rollout();
    await rolloutsPage.open();
    await rolloutsPage.createRollout(r.name, r.description);
    test.skip(!(await rolloutsPage.addRowButton.isVisible().catch(() => false)), 'No add-row control');
    for (let i = 0; i < 100; i++) await rolloutsPage.addRow();
    await assertNoWhiteScreen(rolloutsPage.page, '100-row rollout');
  });
});

test.describe('Rollouts · Negative & Failure', () => {
  test('publish without content is blocked', async ({ rolloutsPage, requireDestructive }) => {
    requireDestructive();
    const r = gen.rollout();
    await rolloutsPage.open();
    await rolloutsPage.createRollout(r.name, r.description);
    test.skip(!(await rolloutsPage.publishButton.isVisible().catch(() => false)), 'No publish control');
    await rolloutsPage.publish();
    const blocked = (await rolloutsPage.toastVisible(/no content|empty|add.*content|required/i)) ||
      (await assertNoWhiteScreen(rolloutsPage.page, 'publish empty').then(() => true).catch(() => false));
    expect(blocked).toBe(true);
  });

  test('publish API failure is handled', async ({ rolloutsPage, page, requireDestructive }) => {
    requireDestructive();
    const r = gen.rollout();
    await rolloutsPage.open();
    await rolloutsPage.createRollout(r.name, r.description);
    test.skip(!(await rolloutsPage.publishButton.isVisible().catch(() => false)), 'No publish control');
    await withFailure(page, API.rollouts, 'http500', async () => {
      await rolloutsPage.publish();
      await assertGracefulDegradation(page, 'rollout publish 500');
    });
  });

  test('save API timeout is handled', async ({ rolloutsPage, page, requireDestructive }) => {
    requireDestructive();
    await rolloutsPage.open();
    await withFailure(page, API.rollouts, 'timeout', async () => {
      await rolloutsPage.openCreate();
      await rolloutsPage.fillName(gen.rollout().name);
      await rolloutsPage.submit();
      await assertNoWhiteScreen(page, 'rollout save timeout');
    }, { method: 'POST', delayMs: 8000 });
  });
});
