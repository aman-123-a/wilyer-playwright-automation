// =============================================================================
//  LibraryPage — media library at /library.
//  Selectors verified live against cms.pocsample.in:
//   • Upload trigger: button "Upload Files" → dialog with #uploadFileInput
//     (accept .jpg/.jpeg/.png/.mp4, multiple). setInputFiles auto-starts upload;
//     there is no separate confirm button — closing the dialog == done.
//   • Type filters: buttons All / Videos / Photos.   Search: placeholder "Search...".
//   • Tabs are LINKS: Media / Widgets / Media publish History / Media Sets.
//   • Pagination: "Load More" button (no numbered pages).
//   • Per-card: text IMAGE|VIDEO, a[href^="/file-details/"], a "Delete" button.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LibraryPage extends BasePage {
  readonly heading: Locator;
  readonly uploadFilesBtn: Locator;
  readonly createFolderBtn: Locator;
  readonly filterAll: Locator;
  readonly filterVideos: Locator;
  readonly filterPhotos: Locator;
  readonly mediaSearch: Locator;
  readonly mediaTab: Locator;
  readonly widgetsTab: Locator;
  readonly publishHistoryTab: Locator;
  readonly mediaSetsTab: Locator;
  readonly loadMoreBtn: Locator;
  readonly fileInput: Locator;
  readonly dropzone: Locator;
  readonly uploadDialogClose: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.heading = page.getByRole('heading', { name: /^library$/i });
    this.uploadFilesBtn = page.getByRole('button', { name: /upload files/i });
    this.createFolderBtn = page.getByRole('button', { name: /create folder/i });

    this.filterAll = page.getByRole('button', { name: /^all$/i });
    this.filterVideos = page.getByRole('button', { name: /^videos$/i });
    this.filterPhotos = page.getByRole('button', { name: /^photos$/i });

    this.mediaSearch = page.getByPlaceholder(/^search\.{0,3}$/i).first();

    this.mediaTab = page.getByRole('link', { name: /^media$/i });
    this.widgetsTab = page.getByRole('link', { name: /^widgets$/i });
    this.publishHistoryTab = page.getByRole('link', { name: /media publish history/i });
    this.mediaSetsTab = page.getByRole('link', { name: /media sets/i });

    this.loadMoreBtn = page.getByRole('button', { name: /load more/i });

    this.fileInput = page.locator('#uploadFileInput');
    this.dropzone = page.getByRole('heading', { name: /drop files here|click to browse/i });
    this.uploadDialogClose = page.getByRole('button', { name: /^close$/i });
  }

  async open(): Promise<this> {
    await this.goto('/library');
    await this.expectShellReady();
    await expect(this.heading).toBeVisible({ timeout: 20_000 });
    return this;
  }

  /** Every media card surfaces an IMAGE / VIDEO type label. */
  mediaCards(): Locator {
    return this.page.getByText(/^(IMAGE|VIDEO)$/);
  }

  /** Detail links — one per card; a stable hook for counting / opening media. */
  detailLinks(): Locator {
    return this.page.locator('a[href^="/file-details/"]');
  }

  async cardCount(): Promise<number> {
    return this.detailLinks().count();
  }

  /** Library always shows media OR an explicit empty state — never blank. */
  async expectGridLoaded(): Promise<this> {
    // The grid mounts a "Loading media files..." status while fetching; wait for
    // it to clear before deciding between a populated grid and an empty state.
    await this.page
      .getByText(/loading media files/i)
      .first()
      .waitFor({ state: 'hidden', timeout: 30_000 })
      .catch(() => {});

    const hasCards = await this.mediaCards().first().isVisible({ timeout: 15_000 }).catch(() => false);
    if (!hasCards) {
      const empty = await this.page.getByText(/no (file|media|data|result)|no more files/i).first()
        .isVisible().catch(() => false);
      expect(hasCards || empty, 'library shows media or an empty state').toBeTruthy();
    }
    return this;
  }

  /** Wait for the in-grid "Loading media files..." overlay to clear. */
  private async waitForGridSettled(): Promise<void> {
    await this.page
      .getByText(/loading media files/i)
      .first()
      .waitFor({ state: 'hidden', timeout: 30_000 })
      .catch(() => {});
  }

  async searchMedia(term: string): Promise<this> {
    // The search is debounced on keystroke — type character-by-character so the
    // React onChange handler fires (a bulk fill() can be missed). Do NOT press
    // Enter (that submits and resets the query, repopulating the full grid).
    await this.mediaSearch.click();
    await this.mediaSearch.fill('');
    await this.mediaSearch.pressSequentially(term, { delay: 60 });
    await this.page.waitForTimeout(1_200); // debounce window
    await this.waitForGridSettled();
    return this;
  }

  async applyFilter(kind: 'all' | 'videos' | 'photos'): Promise<this> {
    const map = { all: this.filterAll, videos: this.filterVideos, photos: this.filterPhotos };
    // The loading overlay intercepts pointer events, so settle the grid first.
    await this.waitForGridSettled();
    await map[kind].first().click();
    await this.waitForGridSettled();
    return this;
  }

  async openUploadDialog(): Promise<this> {
    await this.uploadFilesBtn.click();
    await expect(this.dropzone).toBeVisible({ timeout: 10_000 });
    return this;
  }

  /**
   * Upload one or more files via the hidden input (auto-starts). setInputFiles
   * bypasses the OS dialog AND the `accept` filter, so this also drives the
   * unsupported-format rejection path.
   */
  async uploadFiles(paths: string | string[]): Promise<this> {
    await this.openUploadDialog();
    await this.fileInput.setInputFiles(paths);
    return this;
  }

  async closeUploadDialog(): Promise<this> {
    if (await this.uploadDialogClose.isVisible().catch(() => false)) {
      await this.uploadDialogClose.click();
    }
    return this;
  }

  /** Click "Load More" if present; returns whether it was clicked. */
  async loadMore(): Promise<boolean> {
    if (await this.loadMoreBtn.isVisible().catch(() => false)) {
      await this.loadMoreBtn.click();
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.page.waitForTimeout(800);
      return true;
    }
    return false;
  }

  async openFirstDetails(): Promise<this> {
    const link = this.detailLinks().first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();
    await this.page.waitForURL(/\/file-details\//, { timeout: 20_000 });
    return this;
  }
}

export default LibraryPage;
