import { test, expect } from '../../fixtures/auth.fixture';
import { RolesPage } from '../../pages/RolesPage';
import { uniqueRoleName } from '../../data/roles.data';

test.describe('RBAC — role hierarchy', () => {
  let roles: RolesPage;
  const created: string[] = [];

  test.beforeEach(async ({ authedPage }) => {
    roles = new RolesPage(authedPage);
    await roles.goto();
  });

  // Best-effort cleanup — keeps the tenant tidy across runs.
  test.afterEach(async () => {
    for (const name of created.splice(0)) {
      await roles.deleteRole(name).catch(() => {});
    }
  });

  // TC-1 ─────────────────────────────────────────────────────────────────────
  test('restricted role without parent is rejected on submit', async () => {
    const name = uniqueRoleName('R_NoParent');
    await roles.fillCreateForm({ name, type: 'restricted' /* parent omitted */ });
    await roles.submit();
    // App either silently blocks (dialog stays open) or toasts — either is OK.
    await roles.expectSubmitRejected(/parent|reports to|required/i);
  });

  // TC-2 ─────────────────────────────────────────────────────────────────────
  test('restricted role with valid parent is created', async () => {
    const parent = uniqueRoleName('Parent_U');
    const child = uniqueRoleName('Child_R');
    created.push(child, parent); // child first so parent deletes last

    await roles.createRole({
      name: parent,
      type: 'unrestricted',
      permissions: ['Screens Management'],
    });
    await roles.expectRoleRow(parent);

    await roles.createRole({
      name: child,
      type: 'restricted',
      parent,
      permissions: ['Screens Management'],
    });
    await roles.expectRoleRow(child);
  });

  // TC-3 ─────────────────────────────────────────────────────────────────────
  test('prevents circular hierarchy (A→B→A)', async () => {
    const a = uniqueRoleName('Cyc_A');
    const b = uniqueRoleName('Cyc_B');
    created.push(b, a);

    await roles.createRole({ name: a, type: 'unrestricted', permissions: ['Screens Management'] });
    await roles.createRole({
      name: b,
      type: 'restricted',
      parent: a,
      permissions: ['Screens Management'],
    });

    // Editing A and trying to make it report to B must fail — B is a descendant.
    await roles.editRole(a);
    await roles.setType('restricted');
    await roles.expectParentOptionAbsent(b);
    await roles.closeDialog();
  });

  // TC-4 ─────────────────────────────────────────────────────────────────────
  test('prevents self-parent assignment', async () => {
    const name = uniqueRoleName('Self');
    created.push(name);

    await roles.createRole({ name, type: 'unrestricted', permissions: [] });
    await roles.editRole(name);
    await roles.setType('restricted');
    await roles.expectParentOptionAbsent(name);
    await roles.closeDialog();
  });
});
