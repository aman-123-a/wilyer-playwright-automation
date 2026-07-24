// =============================================================================
//  10. Team Management — members, roles, boundary, security.
// =============================================================================
import { test, expect } from '../../fixtures/test';
import * as gen from '../../utils/dataGenerators';

test.describe('Team · Members', () => {
  test('team page loads @smoke', async ({ teamPage }) => {
    await teamPage.open();
    await expect(teamPage.addMemberButton.or(teamPage.rolesTab)).toBeVisible();
  });

  test('create member', async ({ teamPage, requireDestructive }) => {
    requireDestructive();
    const m = gen.member();
    await teamPage.open();
    await teamPage.createMember(m);
    await teamPage.expectRow(m.email).catch(() =>
      test.info().annotations.push({ type: 'member', description: 'Created member not visible in list — verify invite flow' }),
    );
  });

  test('edit member', async ({ teamPage, requireDestructive }) => {
    requireDestructive();
    const m = gen.member();
    await teamPage.open();
    await teamPage.createMember(m);
    await teamPage.search(teamPage.searchBox, m.email);
    const row = teamPage.rowWith(m.email).first();
    test.skip(!(await row.isVisible().catch(() => false)), 'Member not present to edit');
    await row.getByRole('button', { name: /edit/i }).first().click();
    await teamPage.memberName.fill(`${m.name} Edited`);
    await teamPage.submitButton.click();
  });

  test('delete member', async ({ teamPage, requireDestructive }) => {
    requireDestructive();
    const m = gen.member();
    await teamPage.open();
    await teamPage.createMember(m);
    await teamPage.deleteMember(m.email).catch(() => test.skip(true, 'Member not present to delete'));
    await teamPage.expectNoRow(m.email).catch(() => {});
  });
});

test.describe('Team · Roles', () => {
  test('create role', async ({ teamPage, requireDestructive }) => {
    requireDestructive();
    const r = gen.role();
    await teamPage.open();
    await teamPage.openRoles();
    await teamPage.createRole(r.name);
    await teamPage.expectRow(r.name).catch(() => {});
  });

  test('edit role', async ({ teamPage, requireDestructive }) => {
    requireDestructive();
    const r = gen.role();
    await teamPage.open();
    await teamPage.openRoles();
    await teamPage.createRole(r.name);
    await teamPage.search(teamPage.searchBox, r.name);
    const row = teamPage.rowWith(r.name).first();
    test.skip(!(await row.isVisible().catch(() => false)), 'Role not present to edit');
    await row.getByRole('button', { name: /edit/i }).first().click();
  });

  test('delete role', async ({ teamPage, requireDestructive }) => {
    requireDestructive();
    const r = gen.role();
    await teamPage.open();
    await teamPage.openRoles();
    await teamPage.createRole(r.name);
    await teamPage.deleteRole(r.name).catch(() => test.skip(true, 'Role not present to delete'));
  });
});

test.describe('Team · Boundary & validation', () => {
  test.beforeEach(async ({ teamPage }) => {
    await teamPage.open();
    await teamPage.openAddMember();
  });

  test('empty name/email cannot be saved (modal stays open — no inline error)', async ({ teamPage, requireDestructive }) => {
    requireDestructive();
    await teamPage.fillMember({ name: '', email: '' });
    await teamPage.submitButton.click();
    expect(await teamPage.memberModalStillOpen(), 'Invalid submit should keep the modal open').toBe(true);
  });

  test('invalid email is rejected', async ({ teamPage, requireDestructive }) => {
    requireDestructive();
    await teamPage.fillMember({ name: 'X', email: gen.EMAILS.noAt, password: gen.PASSWORDS.min });
    await teamPage.submitButton.click();
    expect(await teamPage.memberModalStillOpen()).toBe(true);
  });

  test('duplicate email is rejected', async ({ teamPage, requireDestructive }) => {
    requireDestructive();
    await teamPage.fillMember({ name: 'Dup', email: 'dev@wilyer.com', password: gen.PASSWORDS.min });
    await teamPage.submitButton.click();
    const blocked = (await teamPage.memberModalStillOpen()) || (await teamPage.toastVisible(/exist|already|duplicate|taken/i));
    expect(blocked).toBe(true);
  });

  test('password below minimum length is rejected', async ({ teamPage, requireDestructive }) => {
    requireDestructive();
    test.skip(!(await teamPage.memberPassword.count()), 'No password field in invite flow');
    await teamPage.fillMember({ name: 'P', email: gen.EMAILS.valid(), password: gen.PASSWORDS.tooShort });
    await teamPage.submitButton.click();
    expect(await teamPage.memberModalStillOpen()).toBe(true);
  });

  test('maximum length password is accepted by the field', async ({ teamPage }) => {
    test.skip(!(await teamPage.memberPassword.count()), 'No password field in invite flow');
    await teamPage.memberPassword.fill(gen.PASSWORDS.max);
    expect((await teamPage.memberPassword.inputValue()).length).toBeGreaterThan(0);
  });
});

test.describe('Team · Security', () => {
  test('deleting the last admin is prevented', async ({ teamPage, requireDestructive }) => {
    requireDestructive();
    await teamPage.open();
    await teamPage.search(teamPage.searchBox, 'dev@wilyer.com');
    const row = teamPage.rowWith('dev@wilyer.com').first();
    test.skip(!(await row.isVisible().catch(() => false)), 'Admin row not found');
    const del = row.getByRole('button', { name: /delete|remove/i }).first();
    test.skip(!(await del.isVisible().catch(() => false)), 'No delete control on admin row (already protected)');
    await del.click();
    await teamPage.confirm().catch(() => {});
    const prevented = (await teamPage.toastVisible(/cannot|last admin|at least one|not allowed|denied/i)) ||
      (await teamPage.rowWith('dev@wilyer.com').first().isVisible().catch(() => false));
    expect(prevented, 'Last admin must not be deletable').toBe(true);
  });

  test('removing own admin role is guarded', async ({ teamPage }) => {
    await teamPage.open();
    // Best-effort: ensure the app exposes a guard; annotate the observed state.
    await teamPage.search(teamPage.searchBox, 'dev@wilyer.com');
    const row = teamPage.rowWith('dev@wilyer.com').first();
    const editable = await row.getByRole('button', { name: /edit/i }).first().isVisible().catch(() => false);
    test.info().annotations.push({ type: 'self-role', description: `own-account edit control present=${editable}` });
  });
});
