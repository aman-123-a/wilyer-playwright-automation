import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

// ApprovalPage — Checker surface at /playlists/unapproved.
// Layout:
//   Heading "Playlist Approval Requests"
//   Filter buttons: Pending / Approved / Rejected
//   Table columns: # | Playlist Name | Requester | Date | Tags | Screens | Status | Actions
//   Actions per row (icon-only buttons):
//     View     — btn-primary (eye icon)
//     Approve  — btn-success (green check)
//     Edit     — a.btn-warning (yellow pencil, links to /playlist-settings/{id})
//     Reject   — btn-secondary (gray X)
export class ApprovalPage extends BasePage {
  constructor(page) {
    super(page);
    this.heading       = page.getByRole('heading', { name: /playlist approval requests/i });
    this.pendingTab    = page.getByRole('button', { name: /^pending$/i });
    this.approvedTab   = page.getByRole('button', { name: /^approved$/i });
    this.rejectedTab   = page.getByRole('button', { name: /^rejected$/i });
    this.searchInput   = page.getByRole('textbox', { name: /search by playlist/i });
    this.confirmBtn    = page.getByRole('button', { name: /confirm|submit|continue|yes/i });
    this.reasonInput   = page.getByRole('textbox', { name: /reason|comment|remark/i });
  }

  async openUnapprovedPlaylists() {
    await this.page.goto('/playlists/unapproved', { waitUntil: 'domcontentloaded' });
    await expect(this.heading).toBeVisible({ timeout: 20_000 });
  }

  async openPending()  { await this.pendingTab.click();  await this.waitForIdle(); }
  async openApproved() { await this.approvedTab.click(); await this.waitForIdle(); }
  async openRejected() { await this.rejectedTab.click(); await this.waitForIdle(); }

  // Locate a table row by playlist name (case-sensitive, table cell).
  rowFor(name) {
    return this.page.locator('tbody tr').filter({
      has: this.page.getByRole('cell', { name, exact: true }),
    }).first();
  }

  async assertVisible(name) {
    await expect(this.rowFor(name)).toBeVisible({ timeout: 20_000 });
  }

  async approve(name) {
    await this.openPending();
    const row = this.rowFor(name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Approve = green check button (btn-success)
    await row.locator('button.btn-success').click();
    // Confirmation dialog, if any
    if (await this.confirmBtn.count()) {
      await this.confirmBtn.first().click().catch(() => {});
    }
    await this.waitForIdle();
  }

  async reject(name, reason) {
    await this.openPending();
    const row = this.rowFor(name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Reject = gray X button (btn-secondary)
    await row.locator('button.btn-secondary').click();
    if (await this.reasonInput.count()) {
      await this.reasonInput.first().fill(reason);
    }
    await this.confirmBtn.first().click();
    await this.waitForIdle();
  }

  async editBeforeApproval(name, newName) {
    await this.openPending();
    const row = this.rowFor(name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Edit = yellow pencil link (a.btn-warning) → /playlist-settings/{id}
    await row.locator('a.btn-warning').click();
    // On the playlist-settings page, rename via the page heading's edit
    await this.page.waitForURL(/\/playlist-settings\//, { timeout: 15_000 });
    // Many CMS builds expose a rename-in-place pencil next to the title.
    const renameTrigger = this.page.getByRole('button', { name: /rename|edit name/i }).first();
    if (await renameTrigger.isVisible().catch(() => false)) {
      await renameTrigger.click();
      const nameBox = this.page.getByRole('textbox', { name: /name/i }).first();
      await nameBox.fill(newName);
      await this.page.getByRole('button', { name: /^save$|update/i }).first().click();
    }
    await this.waitForIdle();
  }
}
