import { test, expect } from '../../fixtures/auth.fixture';
import { RolesPage } from '../../pages/RolesPage';
import { uniqueRoleName } from '../../data/roles.data';

test.describe('RBAC — deletion with dependents', () => {
  let roles: RolesPage;
  const created: string[] = [];

  test.beforeEach(async ({ authedPage }) => {
    roles = new RolesPage(authedPage);
    await roles.goto();
  });

  test.afterEach(async () => {
    for (const name of created.splice(0)) {
      await roles.deleteRole(name).catch(() => {});
    }
  });

  // TC-8 ─────────────────────────────────────────────────────────────────────
  test('deleting a parent that has children is blocked (or prompts reassignment)', async () => {
    const parent = uniqueRoleName('DelParent');
    const child = uniqueRoleName('DelChild');
    created.push(child, parent);

    await roles.createRole({
      name: parent,
      type: 'unrestricted',
      permissions: ['Screens Management'],
    });
    await roles.createRole({
      name: child,
      type: 'restricted',
      parent,
      permissions: ['Screens Management'],
    });

    await roles.rowFor(parent).getByRole('button', { name: /delete/i }).click();
    await expect(roles.deleteModal).toBeVisible();
    // Expect either a blocker message or a reassignment UI in the modal.
    await expect(roles.deleteModal).toContainText(/child|dependent|reassign|cannot|assigned/i);
  });
});
