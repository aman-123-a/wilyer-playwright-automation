// =============================================================================
//  PlaylistsPage — playlists at /playlists (card + folder layout, no table).
//  Selectors verified live against cms.pocsample.in (2026-05-25):
//   • Toolbar: button "+ New Playlist", button "+ New Folder".
//   • Folder panel header: "Folders ( n )".
//   • Each playlist card links to a[href^="/playlist-settings/<id>"].
//   • Search: placeholder "Search.." (scope to the visible one).
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class PlaylistsPage extends BasePage {
  readonly newPlaylistBtn: Locator;
  readonly newFolderBtn: Locator;
  readonly foldersHeader: Locator;
  readonly search: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.newPlaylistBtn = page.getByRole('button', { name: /new playlist/i });
    this.newFolderBtn = page.getByRole('button', { name: /new folder/i });
    this.foldersHeader = page.getByRole('heading', { name: /folders\s*\(/i });
    this.search = page.locator('input[placeholder^="Search"]:visible').first();
  }

  async open(): Promise<this> {
    await this.goto('/playlists');
    await this.expectShellReady();
    await expect(this.newPlaylistBtn).toBeVisible({ timeout: 20_000 });
    return this;
  }

  /** Playlist cards — one settings link per playlist; a stable count hook. */
  playlistCards(): Locator {
    return this.page.locator('a[href^="/playlist-settings/"]');
  }

  async cardCount(): Promise<number> {
    return this.playlistCards().count();
  }

  /** The listing always shows playlist cards OR an explicit empty state. */
  async expectListLoaded(): Promise<this> {
    const loaded = await expect
      .poll(async () => (await this.cardCount()) > 0, { timeout: 30_000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (!loaded) {
      const empty = await this.page.getByText(/no (playlist|data|result)/i).first()
        .isVisible().catch(() => false);
      expect(empty, 'playlists shows cards or an empty state').toBeTruthy();
    }
    return this;
  }

  async openCreateModal(): Promise<this> {
    await this.newPlaylistBtn.click();
    await expect(this.page.getByRole('heading', { name: /create new playlist/i })).toBeVisible({ timeout: 10_000 });
    return this;
  }

  async searchPlaylists(term: string): Promise<this> {
    await this.search.click();
    await this.search.fill('');
    await this.search.pressSequentially(term, { delay: 60 });
    await this.page.waitForTimeout(1_200);
    return this;
  }
}

export default PlaylistsPage;
