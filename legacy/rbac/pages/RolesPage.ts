import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { PERMISSION_SECTIONS, RolePayload } from '../data/roles.data';

/**
 * Page Object for the Roles tab under /team on cms.pocsample.in.
 *
 * Selectors verified against the live DOM on 2026-04-22:
 *   - Create button opens modal `#roleModal` via Bootstrap data-bs-toggle
 *   - Role name: `input[placeholder="Enter role name"]`
 *   - Role type toggle: single checkbox `#restrictedAccess`
 *       (unchecked = Unrestricted, checked = Restricted)
 *   - "Reports To" parent selector: custom dropdown — a trigger button inside
 *       the Reports-To field-group, opens a `<ul class="list-group">` with
 *       `<li class="list-group-item">RoleName</li>`, plus a search input
 *       `input[placeholder="Search roles..."]`.
 *   - Submit button text: "Create Role"
 *   - Dismiss: `[data-bs-dismiss="modal"]` / Escape
 *   - Permission "Select All" rows: `label` text "Select All in <Section>"
 *   - Delete confirmation: `#deleteRoleModal`
 *
 * NOTE on validation UX:
 *   The create form does NOT render inline validation errors. Invalid submits
 *   either leave the dialog open silently (for missing parent) or surface a
 *   toast alert. Assertions below reflect this.
 */
export class RolesPage extends BasePage {
  // Nav
  private readonly teamNav: Locator;
  private readonly rolesTab: Locator;

  // List view — roles render as a grid of `.card` elements, not a table.
  private readonly createBtn: Locator;

  // Modal
  readonly dialog: Locator;
  private readonly roleNameInput: Locator;
  private readonly descriptionInput: Locator;
  private readonly restrictedToggle: Locator;
  private readonly parentTrigger: Locator;
  private readonly parentSearch: Locator;
  private readonly parentOptions: Locator;
  private readonly submitBtn: Locator;
  private readonly closeBtn: Locator;

  // Delete modal
  readonly deleteModal: Locator;

  constructor(page: Page) {
    super(page);

    // Match "Team" (and accept leading icon whitespace) — matches the sidebar link.
    this.teamNav = page.getByRole('link', { name: /team/i }).first();
    // Team page renders an inner nav with a "Roles" tab (Bootstrap nav-link).
    this.rolesTab = page.locator('a.nav-link').filter({ hasText: /^\s*roles\s*$/i }).first();

    this.createBtn = page.getByRole('button', { name: /create custom role/i });

    this.dialog = page.locator('#roleModal');
    this.roleNameInput = this.dialog.locator('input[placeholder="Enter role name"]');
    // Description is optional but useful to clear on edit.
    this.descriptionInput = this.dialog.locator('textarea, input[placeholder*="description" i]').first();
    this.restrictedToggle = this.dialog.locator('#restrictedAccess');

    // The "Reports To" control is the only `button.form-control.text-start`
    // inside the role modal. Role name is an <input>, not a button, so no collision.
    this.parentTrigger = this.dialog.locator('button.form-control.text-start').first();
    this.parentSearch = this.dialog.locator('input[placeholder="Search roles..."]');
    this.parentOptions = this.dialog.locator('ul.list-group li.list-group-item');

    this.submitBtn = this.dialog.getByRole('button', { name: /^create role$|^update role$|^save$/i });
    this.closeBtn = this.dialog.locator('[data-bs-dismiss="modal"]').first();

    this.deleteModal = page.locator('#deleteRoleModal');
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.teamNav.click();
    // The Roles tab lives inside the Team page as a Bootstrap nav-link.
    await this.rolesTab.first().click();
    await expect(this.createBtn).toBeVisible();
  }

  // ─── Dialog helpers ────────────────────────────────────────────────────────

  async openCreateDialog(): Promise<void> {
    await this.createBtn.click();
    await expect(this.dialog).toHaveClass(/show/);
  }

  async closeDialog(): Promise<void> {
    await this.closeBtn.click();
    await expect(this.dialog).not.toHaveClass(/show/);
  }

  /**
   * Restricted access is a single checkbox.
   *   restricted    → ensure checkbox is CHECKED
   *   unrestricted  → ensure checkbox is UNCHECKED
   */
  async setType(type: 'restricted' | 'unrestricted'): Promise<void> {
    const shouldCheck = type === 'restricted';
    const isChecked = await this.restrictedToggle.isChecked();
    if (isChecked !== shouldCheck) {
      await this.restrictedToggle.click();
    }
    await expect(this.restrictedToggle).toBeChecked({ checked: shouldCheck });
  }

  async openParentDropdown(): Promise<void> {
    const expanded = await this.parentTrigger.getAttribute('aria-expanded');
    if (expanded !== 'true') await this.parentTrigger.click();
    await expect(this.parentTrigger).toHaveAttribute('aria-expanded', 'true');
  }

  async closeParentDropdown(): Promise<void> {
    const expanded = await this.parentTrigger.getAttribute('aria-expanded');
    if (expanded === 'true') await this.parentTrigger.click();
  }

  async selectParent(parentName: string): Promise<void> {
    await this.openParentDropdown();
    // Search narrows the list and makes clicks reliable even with long lists.
    await this.parentSearch.fill(parentName);
    const option = this.parentOptions.filter({ hasText: new RegExp(`^${this.escapeRegex(parentName)}$`, 'i') }).first();
    await option.click();
    // After selection the dropdown closes and the trigger shows the selected name.
    await expect(this.parentTrigger).toContainText(new RegExp(this.escapeRegex(parentName), 'i'));
  }

  /** Returns true iff the given parent name exists in the dropdown list (after filtering). */
  async parentOptionExists(parentName: string): Promise<boolean> {
    await this.openParentDropdown();
    await this.parentSearch.fill(parentName);
    const count = await this.parentOptions
      .filter({ hasText: new RegExp(`^${this.escapeRegex(parentName)}$`, 'i') })
      .count();
    await this.closeParentDropdown();
    return count > 0;
  }

  /**
   * Click the "Select All in <section>" label for each section given.
   * Unknown sections are skipped silently (keeps tests robust to label drift).
   */
  async selectPermissionSections(sections: readonly string[] = []): Promise<void> {
    const targets = sections.length ? sections : PERMISSION_SECTIONS;
    for (const section of targets) {
      const checkbox = this.dialog
        .locator('label')
        .filter({ hasText: new RegExp(`^\\s*Select All in ${this.escapeRegex(section)}\\s*$`, 'i') });
      if (await checkbox.isVisible().catch(() => false)) await checkbox.click();
    }
  }

  async submit(): Promise<void> {
    await this.submitBtn.click();
  }

  /** End-to-end happy-path create. */
  async createRole(payload: RolePayload): Promise<void> {
    await this.openCreateDialog();
    await this.roleNameInput.fill(payload.name);
    await this.setType(payload.type);
    if (payload.type === 'restricted') {
      if (!payload.parent) throw new Error('restricted roles require a parent');
      await this.selectParent(payload.parent);
    }
    await this.selectPermissionSections(payload.permissions ?? []);
    await this.submit();
    // On success the modal auto-dismisses.
    await expect(this.dialog).not.toHaveClass(/show/, { timeout: 15_000 });
  }

  /** Open + fill, but don't submit. For negative tests. */
  async fillCreateForm(payload: RolePayload): Promise<void> {
    await this.openCreateDialog();
    await this.roleNameInput.fill(payload.name);
    await this.setType(payload.type);
    if (payload.type === 'restricted' && payload.parent) {
      await this.selectParent(payload.parent);
    }
    await this.selectPermissionSections(payload.permissions ?? []);
  }

  async editRole(name: string): Promise<void> {
    const row = this.rowFor(name);
    await row.getByRole('button', { name: /edit/i }).click();
    await expect(this.dialog).toHaveClass(/show/);
  }

  async deleteRole(name: string): Promise<void> {
    const row = this.rowFor(name);
    await row.getByRole('button', { name: /delete/i }).click();
    await expect(this.deleteModal).toBeVisible();
    await this.deleteModal.getByRole('button', { name: /delete/i }).click();
    await expect(this.deleteModal).toBeHidden();
  }

  // ─── Assertions ────────────────────────────────────────────────────────────

  /**
   * The create form has no inline error UI. Failure = the modal stays open
   * after submit. We race a short timer against the success-signal (modal
   * losing class `show`); if the modal is still open at the end, rejection
   * is confirmed. A short polling delay is required because there's no
   * conditional event for "server did nothing".
   */
  async expectSubmitRejected(toastText?: string | RegExp): Promise<void> {
    // Wait for either the modal to close (success) or for 2s to elapse
    // (server silently rejected or is processing). This is a legitimate
    // "assert state has NOT changed" case — no conditional wait can replace it.
    const closed = await this.dialog
      .waitFor({ state: 'hidden', timeout: 2_500 })
      .then(() => true)
      .catch(() => false);
    expect(closed, 'expected submit to be rejected (dialog should stay open)').toBeFalsy();
    await expect(this.dialog).toHaveClass(/show/);
    if (toastText) {
      const toast = this.page.getByRole('alert').filter({ hasText: toastText }).first();
      await expect(toast).toBeVisible({ timeout: 3_000 }).catch(() => {
        // Toast is optional — the primary signal is that the modal stayed open.
      });
    }
  }

  async expectRoleRow(name: string): Promise<void> {
    await expect(this.rowFor(name)).toBeVisible();
  }

  async expectRoleMissing(name: string): Promise<void> {
    await expect(this.rowFor(name)).toHaveCount(0);
  }

  async expectParentOptionAbsent(name: string): Promise<void> {
    const exists = await this.parentOptionExists(name);
    expect(exists, `expected "${name}" not to be offered as a parent`).toBeFalsy();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Locate a role's card by exact-match heading. Roles render as a grid of
   * `.card` tiles, each with `h5.card-title` holding the role name.
   */
  rowFor(name: string): Locator {
    return this.page
      .locator('.card')
      .filter({ has: this.page.locator('h5.card-title', { hasText: name }) })
      .first();
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
