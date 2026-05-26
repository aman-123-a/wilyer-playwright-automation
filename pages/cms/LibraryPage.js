// =============================================================================
//  LibraryPage — media library: grid of media cards, folder sidebar, filters,
//  search, upload dialog, per-card actions (delete / details / preview),
//  pagination ("Load More") and the media-detail surface (/file-details/<id>).
//
//  Selectors verified live against cms.pocsample.in (see project module map):
//   • Upload trigger: button "Upload Files" → dialog with #uploadFileInput
//     (accept .jpg/.jpeg/.png/.mp4, multiple). setInputFiles auto-starts upload.
//   • Filters: buttons All / Videos / Photos.   Media search: placeholder "Search...".
//   • Tabs are LINKS (Media / Widgets / Media publish History / Media Sets).
//   • Pagination: "Load More" button (no numbered pages).
//   • Per-card: text IMAGE|VIDEO, a[href^="/file-details/"], a "Delete" button.
// =============================================================================

import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class LibraryPage extends BasePage {
  constructor(page) {
    super(page);

    // ── Header / toolbar ──────────────────────────────────────────────────
    this.heading = page.getByRole('heading', { name: /^library$/i });
    this.uploadFilesBtn = page.getByRole('button', { name: /upload files/i });
    this.createFolderBtn = page.getByRole('button', { name: /create folder/i });

    // ── Type filters ──────────────────────────────────────────────────────
    this.filterAll = page.getByRole('button', { name: /^all$/i });
    this.filterVideos = page.getByRole('button', { name: /^videos$/i });
    this.filterPhotos = page.getByRole('button', { name: /^photos$/i });

    // ── Search boxes ──────────────────────────────────────────────────────
    // Media search uses the generic "Search..." placeholder; the folder search
    // is a distinct, explicitly-labelled box.
    this.mediaSearch = page.getByPlaceholder(/^search\.{0,3}$/i).first();
    this.folderSearch = page.getByPlaceholder(/search folder/i);

    // ── Tabs (rendered as links, all pointing at /library) ────────────────
    this.mediaTab = page.getByRole('link', { name: /^media$/i });
    this.widgetsTab = page.getByRole('link', { name: /^widgets$/i });
    this.publishHistoryTab = page.getByRole('link', { name: /media publish history/i });
    this.mediaSetsTab = page.getByRole('link', { name: /media sets/i });

    // ── Counts / status text ──────────────────────────────────────────────
    this.totalFiles = page.getByText(/total files\s*-\s*\d+/i);
    this.pendingApprovals = page.getByText(/pending approvals/i);

    // ── Pagination ────────────────────────────────────────────────────────
    this.loadMoreBtn = page.getByRole('button', { name: /load more/i });

    // ── Upload dialog ─────────────────────────────────────────────────────
    // The hidden <input type=file> auto-starts the upload when files are set;
    // there is no separate "confirm" button.
    this.fileInput = page.locator('#uploadFileInput');
    this.dropzone = page.getByRole('heading', { name: /drop files here|click to browse/i });
    this.browseFilesBtn = page.getByRole('button', { name: /browse files/i });
    this.uploadDialogClose = page.getByRole('button', { name: /^close$/i });
  }

  async open() {
    await this.goto('/library');
    await this.expectShellReady();
    await expect(this.heading).toBeVisible({ timeout: 20_000 });
    return this;
  }

  // ── Media cards ───────────────────────────────────────────────────────────
  /** Every media card surfaces an IMAGE / VIDEO type label. */
  mediaCards() {
    return this.page.getByText(/^(IMAGE|VIDEO)$/i);
  }

  /** Detail links — one per card; a stable hook for counting/opening media. */
  detailLinks() {
    return this.page.locator('a[href^="/file-details/"]');
  }

  async cardCount() {
    return this.detailLinks().count();
  }

  async expectGridLoaded() {
    // Either media is present, or an explicit empty state renders — never blank.
    await expect(this.page.locator('body')).toBeVisible();
    const hasCards = await this.mediaCards().first().isVisible({ timeout: 15_000 }).catch(() => false);
    if (!hasCards) {
      const empty = await this.page.getByText(/no (file|media|data|result)/i).first().isVisible().catch(() => false);
      expect(hasCards || empty, 'library shows media or an empty state').toBeTruthy();
    }
    return this;
  }

  // ── Search ──────────────────────────────────────────────────────────────
  async searchMedia(term) {
    await this.mediaSearch.fill(term);
    // Wait for the app's debounce/refetch rather than a fixed long sleep.
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(1200);
    return this;
  }

  async clearSearch() {
    await this.mediaSearch.fill('');
    await this.page.waitForLoadState('networkidle').catch(() => {});
    return this;
  }

  // ── Folders (used by subuser scoping) ─────────────────────────────────────
  async listFolders() {
    const sidebar = this.page.locator('[class*="folder" i]');
    const names = await sidebar.getByRole('button').allInnerTexts().catch(() => []);
    return names.map((n) => n.trim()).filter(Boolean);
  }

  async openFolder(name) {
    await this.page.getByText(name, { exact: true }).first().click();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    return this;
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  async applyFilter(kind) {
    const map = { all: this.filterAll, videos: this.filterVideos, photos: this.filterPhotos };
    const btn = map[String(kind).toLowerCase()];
    if (btn) {
      await btn.click();
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.page.waitForTimeout(800);
    }
    return this;
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  /** Open the upload dialog and confirm the dropzone rendered. */
  async openUploadDialog() {
    await this.uploadFilesBtn.click();
    await expect(this.dropzone).toBeVisible({ timeout: 10_000 });
    return this;
  }

  /**
   * Upload one or more files via the hidden input. Returns immediately after the
   * files are set (upload auto-starts). Caller waits for the resulting card /
   * toast. setInputFiles bypasses the OS dialog AND the `accept` filter, so this
   * also lets us push an *unsupported* file to test client/server rejection.
   */
  async uploadFiles(paths) {
    await this.openUploadDialog();
    await this.fileInput.setInputFiles(paths);
    return this;
  }

  async closeUploadDialog() {
    if (await this.uploadDialogClose.isVisible().catch(() => false)) {
      await this.uploadDialogClose.click();
    }
    return this;
  }

  // ── Pagination ──────────────────────────────────────────────────────────────
  /** Click "Load More" if present; returns whether it was clicked. */
  async loadMore() {
    if (await this.loadMoreBtn.isVisible().catch(() => false)) {
      await this.loadMoreBtn.click();
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.page.waitForTimeout(800);
      return true;
    }
    return false;
  }

  // ── Per-card actions ─────────────────────────────────────────────────────
  /**
   * The card element that contains `nameFragment`. Card markup has no semantic
   * role, so we anchor on the detail link and walk up to a container that holds
   * both the name and a Delete button.
   */
  cardByName(nameFragment) {
    return this.page
      .locator('div')
      .filter({ has: this.page.locator('a[href^="/file-details/"]') })
      .filter({ hasText: nameFragment })
      .last();
  }

  /** Open the media-detail page for the first (or named) card. */
  async openFirstDetails() {
    const link = this.detailLinks().first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();
    await this.page.waitForURL(/\/file-details\//, { timeout: 20_000 });
    return this;
  }

  /**
   * Delete the media card matching `nameFragment`. Clicks the card's Delete
   * button then confirms ("Continue"/"Yes"/"Delete"). Returns true if a delete
   * was initiated.
   */
  async deleteByName(nameFragment) {
    const card = this.cardByName(nameFragment);
    const del = card.getByRole('button', { name: /^delete$/i }).first();
    if (!(await del.isVisible().catch(() => false))) return false;
    await del.click();
    await this.confirmDestructive();
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.page.waitForTimeout(800);
    return true;
  }

  /** Click the confirm button on the shared "Are you sure?" dialog. */
  async confirmDestructive() {
    const confirm = this.page
      .getByRole('button', { name: /^(continue|yes|confirm|delete)$/i })
      .filter({ hasNot: this.page.locator(':scope:has-text("Go back")') });
    const btn = confirm.last();
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btn.click();
      return true;
    }
    return false;
  }
}

export default LibraryPage;
