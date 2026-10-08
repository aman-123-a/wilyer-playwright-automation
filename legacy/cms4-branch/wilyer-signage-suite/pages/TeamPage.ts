// =============================================================================
//  TeamPage — members + roles. Roles modal is `#roleModal` under /team
//  (project memory). NO inline validation errors on invalid submit — the modal
//  simply stays open, which the tests assert against.
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { ROUTES } from '../config/routes';
import type { MemberData } from '../utils/dataGenerators';

export class TeamPage extends BasePage {
  readonly addMemberButton: Locator;
  readonly memberName: Locator;
  readonly memberEmail: Locator;
  readonly memberPassword: Locator;
  readonly roleSelect: Locator;
  readonly submitButton: Locator;
  readonly rolesTab: Locator;
  readonly addRoleButton: Locator;
  readonly roleNameInput: Locator;
  readonly searchBox: Locator;

  constructor(page: Page) {
    super(page);
    this.addMemberButton = page.getByTestId('add-member').or(page.getByRole('button', { name: /add member|add user|new member|invite|add team/i })).first();
    this.memberName = page.getByTestId('member-name').or(page.getByRole('textbox', { name: /name/i })).first();
    this.memberEmail = page.getByTestId('member-email').or(page.getByRole('textbox', { name: /email/i })).first();
    this.memberPassword = page.getByTestId('member-password').or(page.locator('input[type="password"]')).first();
    this.roleSelect = page.getByTestId('member-role').or(page.locator('select[name*="role" i], [aria-label*="role" i]')).first();
    this.submitButton = page.getByRole('button', { name: /^(save|create|add|submit|invite)$/i }).first();
    this.rolesTab = page.getByRole('tab', { name: /roles/i }).or(page.getByRole('link', { name: /roles/i })).first();
    this.addRoleButton = page.getByTestId('add-role').or(page.getByRole('button', { name: /add role|new role|create role/i })).first();
    this.roleNameInput = page.locator('#roleModal').getByRole('textbox', { name: /name/i }).or(page.getByRole('textbox', { name: /role name|name/i })).first();
    this.searchBox = page.getByRole('textbox', { name: /search/i }).or(page.locator('input[placeholder*="search" i]')).first();
  }

  async open(): Promise<void> {
    await this.goto(ROUTES.team);
    await expect(this.addMemberButton.or(this.rolesTab)).toBeVisible({ timeout: 20_000 });
  }

  // ── Members ────────────────────────────────────────────────────────────────
  async openAddMember(): Promise<void> {
    await this.addMemberButton.click();
    await expect(this.memberEmail).toBeVisible({ timeout: 10_000 });
  }

  async fillMember(data: Partial<MemberData> & { role?: string }): Promise<void> {
    if (data.name !== undefined) await this.memberName.fill(data.name).catch(() => {});
    if (data.email !== undefined) await this.memberEmail.fill(data.email);
    if (data.password !== undefined && (await this.memberPassword.count())) await this.memberPassword.fill(data.password);
    if (data.role && (await this.roleSelect.count())) await this.roleSelect.selectOption({ label: data.role }).catch(() => {});
  }

  async createMember(data: MemberData & { role?: string }): Promise<void> {
    await this.openAddMember();
    await this.fillMember(data);
    await this.submitButton.click();
  }

  async deleteMember(email: string): Promise<void> {
    await this.search(this.searchBox, email);
    const row = this.rowWith(email).first();
    await row.getByRole('button', { name: /delete|remove|trash/i }).first().click();
    await this.confirm();
  }

  // ── Roles ──────────────────────────────────────────────────────────────────
  async openRoles(): Promise<void> {
    await this.rolesTab.click();
    await expect(this.addRoleButton).toBeVisible({ timeout: 15_000 });
  }

  async createRole(name: string): Promise<void> {
    await this.addRoleButton.click();
    await this.roleNameInput.fill(name);
    await this.page.locator('#roleModal').getByRole('button', { name: /^(save|create|add)$/i })
      .or(this.page.getByRole('button', { name: /^(save|create|add)$/i })).first().click();
  }

  async deleteRole(name: string): Promise<void> {
    await this.search(this.searchBox, name);
    const row = this.rowWith(name).first();
    await row.getByRole('button', { name: /delete|remove/i }).first().click();
    await this.confirm();
  }

  /** True if the create modal is still open (used to assert silent validation). */
  async memberModalStillOpen(): Promise<boolean> {
    return this.memberEmail.isVisible().catch(() => false);
  }
}
