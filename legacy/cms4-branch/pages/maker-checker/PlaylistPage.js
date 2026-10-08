import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { DEFAULT_FOLDER } from '../../utils/maker-checker/testData.js';

// PlaylistPage — mirrors the real CMS UI:
//   /playlists                    → folder list
//   click <folder> row            → enters folder (shows "+ New Playlist")
//   + New Playlist (modal)        → name + description + Add-to-Folder breadcrumb
//   Create Playlist               → redirects to /playlist-settings/{id}
//   Cards: Publish / Edit / ⋯ menu
//   /playlists/unapproved         → maker's submitted queue
export class PlaylistPage extends BasePage {
  constructor(page) {
    super(page);

    // Top bar + folder nav
    this.unapprovedLink   = page.getByRole('link', { name: /unapproved playlists/i });
    this.newPlaylistBtn   = page.getByRole('button', { name: /\+\s*new playlist/i });
    this.newFolderBtn     = page.getByRole('button', { name: /\+\s*new folder/i });
    this.backBtn          = page.getByRole('button', { name: /back/i });
    this.allFoldersBtn    = page.getByRole('button', { name: /all folders/i });

    // Create modal
    this.createModal      = page.locator('.modal.show').filter({ hasText: /create new playlist/i });
    this.updateModal      = page.locator('.modal.show').filter({ hasText: /update playlist/i });
    this.deleteModal      = page.locator('.modal.show').filter({ hasText: /delete playlist/i });
    this.nameInput        = page.getByRole('textbox', { name: /playlist name/i });
    this.descriptionInput = page.getByRole('textbox', { name: /description/i });
    this.createSubmitBtn  = page.getByRole('button', { name: /^create playlist$/i });
    this.updateSubmitBtn  = page.getByRole('button', { name: /^update playlist$/i });
    this.confirmContinue  = page.getByRole('button', { name: /continue/i });

    // Inline playlist-settings page
    this.publishBtn       = page.getByRole('button', { name: /^publish$/i });
    this.submitForApprovalBtn = page.getByRole('button', { name: /submit for approval|send for approval/i });

    // Toast / errors
    this.toast            = page.locator('.toast, .toast-body, [role="status"]');
    this.errorText        = page.locator('.error-message, [role="alert"], .invalid-feedback');
  }

  async open() {
    await this.page.goto('/playlists', { waitUntil: 'domcontentloaded' });
    await expect(this.newPlaylistBtn.first()).toBeVisible({ timeout: 20_000 });
  }

  // Enter the folder that hosts automation playlists
  async openFolder(folderName = DEFAULT_FOLDER) {
    // Already inside a folder? The Back button is visible → skip re-enter
    if (await this.backBtn.first().isVisible().catch(() => false)) return;

    // The clickable folder tile has joined text like "test22 Playlists"
    // (folder name + playlist count collapsed). Match both parts in one regex.
    const pattern = new RegExp(`${escapeRegex(folderName)}\\s*\\d+\\s*Playlists?`, 'i');
    const folderCard = this.page.getByText(pattern).first();

    await expect(folderCard).toBeVisible({ timeout: 20_000 });
    await folderCard.click();

    // Once inside the folder, Back button + New Playlist button both appear
    await expect(this.backBtn.first()).toBeVisible({ timeout: 15_000 });
  }

  // Locate a playlist card by its exact visible name
  playlistCard(name) {
    return this.page
      .locator('div.card-body, .playlist-card, [class*="card"]')
      .filter({ hasText: new RegExp(`^\\s*${escape(name)}\\s*$`, 'm') })
      .first();
  }

  // Text-level locator — substring match is safer because the card wraps the
  // name inside a container that also holds the description text.
  playlistByText(name) {
    return this.page.getByText(name).first();
  }

  /**
   * Create a playlist inside the automation folder.
   * 1. Navigate to /playlists (unless already there)
   * 2. Open the default folder
   * 3. Click "+ New Playlist"
   * 4. Fill name + description, click "Create Playlist"
   * 5. Wait for redirect to /playlist-settings/{id}
   */
  async createPlaylist(name, description = 'created by automation', { folder = DEFAULT_FOLDER } = {}) {
    if (!this.page.url().includes('/playlists')) await this.open();
    else await this.open(); // ensure folder-list view even if already on /playlists
    await this.openFolder(folder);

    await this.newPlaylistBtn.click();
    await expect(this.createModal).toBeVisible({ timeout: 10_000 });

    await this.createModal.getByRole('textbox', { name: /playlist name/i }).fill(name);
    const descBox = this.createModal.getByRole('textbox', { name: /description/i });
    if (await descBox.count()) await descBox.fill(description.slice(0, 50));

    await this.createModal.getByRole('button', { name: /^create playlist$/i }).click();

    // On success the app redirects to /playlist-settings/{id}
    await this.page.waitForURL(/\/playlist-settings\//, { timeout: 20_000 }).catch(() => {});
  }

  async openPlaylistByName(name, { folder = DEFAULT_FOLDER } = {}) {
    await this.open();
    await this.openFolder(folder);
    await expect(this.playlistByText(name)).toBeVisible({ timeout: 15_000 });
    await this.playlistByText(name).click();
    await this.waitForIdle();
  }

  /**
   * Upload an image inside the open playlist-settings page.
   * Flow: Media panel has a "+ Upload" button → clicking opens the native file
   * chooser directly (no intermediate "Browse" dialog on this surface).
   */
  async uploadFile(filePath) {
    // Ensure we're on the playlist-settings page. If not (e.g. caller ran open()
    // first and we're back on the folder list), the Upload button won't exist.
    if (!/\/playlist-settings\//.test(this.page.url())) {
      throw new Error(`uploadFile must be called from /playlist-settings/{id}; got ${this.page.url()}`);
    }

    // Make sure the Media tab is active (it is by default after create)
    const mediaTab = this.page.getByRole('button', { name: /^media$/i });
    if (await mediaTab.isVisible().catch(() => false)) {
      await mediaTab.click().catch(() => {});
    }

    const uploadBtn = this.page.getByRole('button', { name: /^\+\s*upload$/i }).first();
    await expect(uploadBtn).toBeVisible({ timeout: 15_000 });

    const [chooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      uploadBtn.click(),
    ]);
    await chooser.setFiles(filePath);

    // Upload auto-starts; wait for the new media tile to appear by its filename
    const fileName = filePath.split(/[\\/]/).pop() || '';
    const stem = fileName.replace(/\.[^.]+$/, '');
    await expect(
      this.page.locator(`[aria-label*="${stem}"], [title*="${stem}"]`).first()
    ).toBeVisible({ timeout: 60_000 }).catch(() => {});
  }

  /**
   * Locate the playlist card container for a given name. The card holds the
   * checkbox, dropdown menu button, Publish button, Edit link, name + desc.
   * We match by the visible name text and then go up to the common card div.
   */
  cardFor(name) {
    return this.page
      .locator('div')
      .filter({ has: this.page.getByText(name, { exact: true }) })
      .filter({ has: this.page.getByRole('button', { name: /^publish$/i }) })
      .last();
  }

  /**
   * Open the per-card action menu (3-dot dropdown) and click an item.
   * The dropdown exposes "Update Playlist", "View History", "Delete Playlist".
   */
  async openCardMenu(name) {
    const card = this.cardFor(name);
    await expect(card).toBeVisible({ timeout: 15_000 });
    // First empty-named button inside the card = dropdown trigger
    await card.getByRole('button', { name: '' }).first().click();
  }

  async editPlaylist(oldName, newName, { folder = DEFAULT_FOLDER } = {}) {
    await this.open();
    await this.openFolder(folder);
    await this.openCardMenu(oldName);
    await this.page.getByRole('button', { name: /update playlist/i }).click();
    await expect(this.updateModal).toBeVisible({ timeout: 10_000 });
    // The Update modal's name input has no aria-label — it's the first textbox
    const nameBox = this.updateModal.getByRole('textbox').first();
    await nameBox.fill(newName);
    await this.updateModal.getByRole('button', { name: /^update playlist$/i }).click();
    await expect(this.updateModal).toBeHidden({ timeout: 15_000 });
  }

  async deletePlaylist(name, { folder = DEFAULT_FOLDER } = {}) {
    await this.open();
    await this.openFolder(folder);
    await this.openCardMenu(name);
    await this.page.getByRole('button', { name: /delete playlist/i }).click();
    await expect(this.deleteModal).toBeVisible({ timeout: 10_000 });
    await this.deleteModal.getByRole('button', { name: /continue/i }).click();
    await expect(this.deleteModal).toBeHidden({ timeout: 15_000 });
  }

  /**
   * Submit a playlist for approval. The CMS exposes this as "Publish" on the
   * card (or "Submit for Approval" inside playlist-settings for some tenants).
   */
  async submitForApproval(name, { folder = DEFAULT_FOLDER } = {}) {
    await this.open();
    await this.openFolder(folder);
    const card = this.page
      .locator('div.card-body')
      .filter({ has: this.page.getByText(name, { exact: true }) });
    await card.getByRole('button', { name: /^publish$/i }).click();
    if (await this.confirmContinue.count()) {
      await this.confirmContinue.first().click().catch(() => {});
    }
    await this.waitForIdle();
  }

  async isVisible(name, { folder = DEFAULT_FOLDER } = {}) {
    await this.open();
    await this.openFolder(folder);
    try {
      await expect(this.playlistByText(name)).toBeVisible({ timeout: 10_000 });
      return true;
    } catch { return false; }
  }

  async getStatus(name) {
    const row = this.page.locator(`div.card-body:has-text("${name}")`).first();
    const badge = row.locator('.badge, .status, [class*="status"]').first();
    return (await badge.textContent().catch(() => ''))?.trim() ?? '';
  }
}

// Escape regex-meaningful characters so names with punctuation are safe
function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const escape = escapeRegex;
