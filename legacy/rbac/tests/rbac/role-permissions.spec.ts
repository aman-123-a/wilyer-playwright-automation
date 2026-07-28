import { test, expect } from '../../fixtures/auth.fixture';
import { RolesPage } from '../../pages/RolesPage';
import { uniqueRoleName } from '../../data/roles.data';

test.describe('RBAC — permission constraints', () => {
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

  // TC-5 ─────────────────────────────────────────────────────────────────────
  test('child cannot receive permissions the parent lacks (escalation blocked)', async () => {
    const parent = uniqueRoleName('PermParent');
    const child = uniqueRoleName('PermChild');
    created.push(child, parent);

    // Parent has ONLY "Screens Management". Child attempts "Team Administration" too.
    await roles.createRole({
      name: parent,
      type: 'unrestricted',
      permissions: ['Screens Management'],
    });

    await roles.fillCreateForm({
      name: child,
      type: 'restricted',
      parent,
      permissions: ['Screens Management', 'Team Administration'], // escalation attempt
    });
    await roles.submit();
    await roles.expectSubmitRejected(/permission|exceed|not allowed/i);
  });

  // TC-7 ─────────────────────────────────────────────────────────────────────
  test('converting unrestricted → restricted enforces parent + permission subset', async () => {
    const role = uniqueRoleName('Convert');
    const parent = uniqueRoleName('Convert_Parent');
    created.push(role, parent);

    await roles.createRole({
      name: parent,
      type: 'unrestricted',
      permissions: ['Screens Management'],
    });
    await roles.createRole({
      name: role,
      type: 'unrestricted',
      permissions: ['Screens Management', 'Team Administration'],
    });

    await roles.editRole(role);
    await roles.setType('restricted');
    // No parent yet — submit should be rejected.
    await roles.submit();
    await roles.expectSubmitRejected(/parent|reports to|required/i);

    // Assign parent — should still be rejected because child has "Team Administration"
    // but parent does not.
    await roles.selectParent(parent);
    await roles.submit();
    await roles.expectSubmitRejected(/permission|exceed|not allowed/i);
    await roles.closeDialog();
  });
});
