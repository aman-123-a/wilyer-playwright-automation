// =============================================================================
//  PlaylistsPage — playlist list + create/edit/delete + the playlist editor
//  (/playlist-settings/<id>) where layouts, media and TRIGGERS live.
//
//  Selectors verified live against cms.pocsample.in (see project module map):
//   • Create modal: heading "Create New Playlist", textbox "Playlist Name *",
//     textbox "Description", combobox "Add to Folder", button "Create Playlist".
//     Empty-name submit is a SILENT no-op (modal stays open, no toast).
//   • Card kebab: "Duplicate Playlist" / "Update Playlist" / "Delete Playlist".
//   • Delete confirm dialog: heading "Delete Playlist", buttons "Go back" /
//     "Continue".
//   • Editor right panel: "Settings" / "Triggers" tabs; "Add New Trigger" form
//     with TRIGGER NAME, ACTION, then a condition Type→Key→Operator chain.
// =============================================================================

import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class PlaylistsPage extends BasePage {
  constructor(page) {
    super(page);
    // "+ New Playlist" renders more than once (header + sidebar); scope to first.
    this.newPlaylistBtn = page.getByRole('button', { name: /\+?\s*new playlist/i }).first();
    this.newFolderBtn = page.getByRole('button', { name: /\+?\s*new folder/i }).first();
    this.search = page.getByPlaceholder(/^search\.{0,3}$/i).first();
    this.sortControl = page.getByText(/sort by/i).first();
    this.totalCount = page.getByText(/total playlists/i);
    this.publishRequestsLink = page.getByRole('link', { name: /publish requests/i });
  }

  async open() {
    await this.goto('/playlists');
    await this.expectShellReady();
    return this;
  }

  cards() {
    // Each playlist card carries an Edit link to its settings page.
    return this.page.locator('div').filter({
      has: this.page.locator('a[href^="/playlist-settings/"]'),
    });
  }

  editLinks() {
    return this.page.locator('a[href^="/playlist-settings/"]');
  }

  /** The "<n> screens" badge text rendered on cards — the screens-field under test. */
  screenCountBadges() {
    return this.page.getByText(/\d+\s*screen/i);
  }

  async expectListLoaded() {
    await expect(this.newPlaylistBtn).toBeVisible({ timeout: 20_000 });
    return this;
  }

  // ── Create ──────────────────────────────────────────────────────────────
  async openCreateModal() {
    await this.newPlaylistBtn.click();
    const modal = this.page.locator('[role="dialog"], .modal.show').first();
    await expect(modal).toBeVisible({ timeout: 10_000 });
    return modal;
  }

  /** Fill the create modal without submitting (for validation tests). */
  async fillCreateModal(name, description = '') {
    const modal = await this.openCreateModal();
    if (name !== undefined) await modal.getByRole('textbox', { name: /playlist name/i }).fill(name);
    if (description) await modal.getByRole('textbox', { name: /description/i }).fill(description).catch(() => {});
    return modal;
  }

  /**
   * Create a playlist and wait until the editor opens. The app navigates to
   * /playlist-settings/<id> on success.
   */
  async create(name, description = '') {
    const modal = await this.fillCreateModal(name, description);
    await modal.getByRole('button', { name: /create playlist/i }).click();
    await this.page.waitForURL(/\/playlist-settings\//, { timeout: 20_000 });
    return this;
  }

  /** Submit the create modal as-is and return the modal locator (still open on failure). */
  async submitCreateModal(modal) {
    await modal.getByRole('button', { name: /create playlist/i }).click();
    return modal;
  }

  // ── Card kebab actions ─────────────────────────────────────────────────────
  cardByName(name) {
    return this.cards().filter({ hasText: name }).last();
  }

  /** Open a card's kebab/dropdown so its menu items become clickable. */
  async openCardMenu(name) {
    const card = this.cardByName(name);
    // The kebab is an icon-only button; clicking the first small button in the
    // card opens the dropdown that holds Duplicate/Update/Delete.
    const kebab = card.getByRole('button').first();
    await kebab.click().catch(() => {});
    return card;
  }

  /**
   * Delete a playlist by name. Search filters the grid server-side, so we narrow
   * to the (uniquely-named) target first, then click its red delete button — the
   * `btn-danger` with data-bs-toggle="modal" that opens the confirm dialog. This
   * avoids ambiguous card scoping and is safe: a unique TEST_ name matches only
   * our own playlist.
   */
  async deleteByName(name) {
    await this.search.fill(name);
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(1200);
    if ((await this.editLinks().count()) === 0) return false; // nothing matched
    const delBtn = this.page.locator('button.btn-danger[data-bs-toggle="modal"]').first();
    if (!(await delBtn.isVisible().catch(() => false))) {
      // Fallback: any danger-styled button in the filtered result.
      const alt = this.page.locator('button[class*="danger" i]').first();
      if (!(await alt.isVisible().catch(() => false))) return false;
      await alt.click();
    } else {
      await delBtn.click();
    }
    await this.confirmDelete();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(1000);
    return true;
  }

  async duplicateByName(name) {
    const card = this.cardByName(name);
    const item = card.getByRole('button', { name: /duplicate playlist/i }).first();
    await item.click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(1000);
    return this;
  }

  /** Confirm the "Delete … → Are you sure?" dialog (Continue). */
  async confirmDelete() {
    const dialog = this.page
      .locator('[role="dialog"], .modal.show, .modal[style*="block"]')
      .filter({ hasText: /are you sure|delete/i })
      .last();
    const cont = dialog.getByRole('button', { name: /^continue$/i }).first();
    if (await cont.isVisible({ timeout: 6000 }).catch(() => false)) {
      await cont.click();
      return true;
    }
    // Fallback: a visible Continue anywhere.
    const any = this.page.getByRole('button', { name: /^continue$/i }).last();
    if (await any.isVisible({ timeout: 2000 }).catch(() => false)) {
      await any.click();
      return true;
    }
    return false;
  }

  // ── Editor (/playlist-settings/<id>) ──────────────────────────────────────
  /**
   * Open the Triggers tab in the editor's right-hand Layout Settings panel.
   * Tolerant: returns true only if a Triggers control was found and clicked
   * (the panel can depend on a layout existing). Callers skip-with-reason on false.
   */
  async openTriggersTab() {
    const candidates = [
      this.page.getByRole('button', { name: /^\s*triggers\s*$/i }),
      this.page.getByRole('tab', { name: /triggers/i }),
      this.page.locator('button:has-text("Triggers"), [role="tab"]:has-text("Triggers")'),
    ];
    for (const c of candidates) {
      const el = c.first();
      if (await el.isVisible({ timeout: 4000 }).catch(() => false)) {
        await el.click();
        await this.page.waitForTimeout(600);
        return true;
      }
    }
    return false;
  }

  async addNewTrigger() {
    const btn = this.page.getByRole('button', { name: /add new trigger/i }).first();
    if (!(await btn.isVisible({ timeout: 4000 }).catch(() => false))) return false;
    await btn.click();
    await this.page.waitForTimeout(600);
    return true;
  }

  /** Add a condition row inside the open trigger form. */
  async addCondition() {
    const btn = this.page.getByRole('button', { name: /^add condition$/i }).first();
    if (!(await btn.isVisible({ timeout: 4000 }).catch(() => false))) return false;
    await btn.click();
    await this.page.waitForTimeout(600);
    return true;
  }

  /** All visible <select> elements in the trigger form (Action, Type, Key, Operator). */
  triggerSelects() {
    return this.page.locator('select:visible');
  }
}

export default PlaylistsPage;
