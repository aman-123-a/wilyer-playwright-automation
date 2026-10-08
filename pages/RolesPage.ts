// =============================================================================
//  RolesPage — Team → Roles permission editor.
//
//  Owns the role-card grid and the "Edit role" dialog, including the permission
//  accordions (bulk ALL/NONE sections and Enable switches) and the Update Role
//  save. The RBAC matrix suite drives this object; it holds no test data of its
//  own, so the same object serves any role name / section id.
//
//  Selectors verified live on cms.pocsample.in:
//   • Team → "Roles" tab, then a card per role whose <h5> is the role name.
//   • The Edit dialog renders one accordion per permission section, addressed
//     by `[id="section-accordion-<slug>"]`.
//   • Saving PUTs /role/update/<id> — the only reliable "persisted" signal.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/** The API the "Update Role" button hits — awaited before we trust a save. */
export const ROLE_SAVE_API = /\/role\/update\//;

/** How a permission is toggled: a bulk section (ALL/NONE) or an Enable switch. */
export type PermissionKind = 'section' | 'switch';

export class RolesPage extends BasePage {
  readonly teamMenu: Locator;
  readonly rolesTab: Locator;
  readonly dialog: Locator;
  readonly updateRoleBtn: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.teamMenu = page.getByRole('link', { name: /team/i }).first();
    this.rolesTab = page.getByRole('link', { name: /^roles$/i });
    this.dialog = page.getByRole('dialog');
    this.updateRoleBtn = page.getByRole('button', { name: /update role/i });
  }

  /** The role card whose <h5> heading equals `name`. */
  roleCard(name: string): Locator {
    return this.page
      .getByRole('heading', { level: 5, name, exact: true })
      .locator('xpath=ancestor::*[.//button[contains(.,"Edit")]][1]');
  }

  /** A permission section accordion, addressed by its slug id. */
  section(sectionId: string): Locator {
    return this.page.locator(`[id="section-accordion-${sectionId}"]`);
  }

  /** Open the Edit dialog for `roleName` from Team → Roles. */
  async openRoleEditor(roleName: string): Promise<this> {
    await this.teamMenu.click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.rolesTab.click();
    await this.page.waitForTimeout(1_200); // role cards re-render
    const card = this.roleCard(roleName).first();
    await expect(card, `role card "${roleName}" should exist`).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: /edit/i }).click();
    await expect(this.dialog).toBeVisible({ timeout: 10_000 });
    return this;
  }

  /**
   * Set one permission to a desired state and save.
   *
   * The PUT save response is awaited inside Promise.all so this does not resolve
   * — and the caller does not log out — until the backend has actually persisted
   * the change. Without that, the next login races the save.
   */
  async setPermission(
    roleName: string,
    permission: { sectionId: string; kind: PermissionKind },
    grant: boolean,
  ): Promise<this> {
    await this.openRoleEditor(roleName);
    const section = this.section(permission.sectionId);
    await expect(section).toBeVisible({ timeout: 10_000 });

    if (permission.kind === 'section') {
      await section.getByRole('button', { name: grant ? 'ALL' : 'NONE' }).click();
    } else {
      // Toggle switch: only click when its checked-state differs from desired.
      const sw = section.getByRole('switch');
      const isOn =
        (await sw.getAttribute('aria-checked')) === 'true' ||
        (await sw.isChecked().catch(() => false));
      if (isOn !== grant) await sw.click();
    }

    const [resp] = await Promise.all([
      this.page.waitForResponse(
        (r) => ROLE_SAVE_API.test(r.url()) && r.request().method() === 'PUT',
        { timeout: 20_000 },
      ),
      this.updateRoleBtn.click(),
    ]);
    expect(resp.status(), 'Update Role save must return 2xx before we continue').toBeLessThan(300);
    await this.dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    return this;
  }
}

export default RolesPage;
