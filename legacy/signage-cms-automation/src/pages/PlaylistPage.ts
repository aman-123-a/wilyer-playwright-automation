// =============================================================================
//  PlaylistPage — playlists at /playlists (card + folder layout, no table).
//  Selectors verified live against cms.pocsample.in:
//   • Toolbar: button "+ New Playlist", button "+ New Folder".
//   • Folder panel header: "Folders ( n )".
//   • Create modal heading: "Create New Playlist".
//   • Each playlist card links to a[href^="/playlist-settings/<id>"].
//   • Search: placeholder "Search.." (scope to the visible one).
//   • Delete confirm uses the shared "Continue" button (see BasePage).
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class PlaylistPage extends BasePage {
  readonly newPlaylistBtn: Locator;
  readonly newFolderBtn: Locator;
  readonly foldersHeader: Locator;
  readonly search: Locator;
  readonly createDialog: Locator;
  readonly createHeading: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.newPlaylistBtn = page.getByRole('button', { name: /new playlist/i });
    this.newFolderBtn = page.getByRole('button', { name: /new folder/i });
    this.foldersHeader = page.getByRole('heading', { name: /folders\s*\(/i });
    this.search = page.locator('input[placeholder^="Search"]:visible').first();
    this.createDialog = page.getByRole('dialog').filter({ hasText: /create new playlist/i });
    this.createHeading = page.getByRole('heading', { name: /create new playlist/i });
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
      const empty = await this.page
        .getByText(/no (playlist|data|result)/i)
        .first()
        .isVisible()
        .catch(() => false);
      expect(empty, 'playlists shows cards or an empty state').toBeTruthy();
    }
    return this;
  }

  async openCreateModal(): Promise<this> {
    await this.newPlaylistBtn.click();
    await expect(this.createHeading).toBeVisible({ timeout: 10_000 });
    return this;
  }

  /** The create-modal "Name" field — falls back to the first modal textbox. */
  private nameField(): Locator {
    const byLabel = this.page.getByRole('textbox', { name: /name/i });
    return byLabel.or(this.page.getByPlaceholder(/name/i)).first();
  }

  /** The create-modal "Description" field. */
  private descField(): Locator {
    const byRole = this.page.getByRole('textbox', { name: /description/i });
    return byRole.or(this.page.getByPlaceholder(/description/i)).or(this.page.locator('textarea')).first();
  }

  /**
   * Create a playlist end-to-end: open modal, fill name + description, submit.
   * Returns true if the create modal closed (creation accepted).
   */
  async createPlaylist(name: string, description: string): Promise<boolean> {
    await this.openCreateModal();
    await this.nameField().fill(name);
    await this.descField().fill(description).catch(() => {
      /* some builds omit description — tolerate */
    });
    const submit = this.page
      .getByRole('button', { name: /^(create|save|submit|add|create playlist)$/i })
      .last();
    await submit.click();
    // Success = the create modal goes away (app navigates to settings or list).
    await this.createHeading.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
    return (await this.createHeading.count()) === 0;
  }

  async searchPlaylists(term: string): Promise<this> {
    await this.search.click();
    await this.search.fill('');
    await this.search.pressSequentially(term, { delay: 60 });
    await this.page.waitForTimeout(1_200);
    return this;
  }

  /** Open the first playlist's settings page (edit / add-media surface). */
  async openFirstPlaylist(): Promise<this> {
    const link = this.playlistCards().first();
    await expect(link).toBeVisible({ timeout: 20_000 });
    await link.click();
    await this.page.waitForURL(/\/playlist-settings\//, { timeout: 20_000 });
    await this.page.waitForLoadState('domcontentloaded');
    return this;
  }

  /** True when the playlist-settings editor surface is showing. */
  async isOnSettings(): Promise<boolean> {
    return /\/playlist-settings\//.test(this.page.url());
  }

  /**
   * Section switchers inside the full-screen playlist editor. Verified live —
   * these are BUTTONS (not tabs/links): Media / Widgets / Sequences / Design /
   * Settings / Triggers.
   */
  editorTabs(): Locator {
    return this.page.getByRole('button', {
      name: /^(media|widgets|sequences|design|settings|triggers)$/i,
    });
  }

  /** The editor chrome stays mounted while sections switch — a "no crash" hook. */
  editorChrome(): Locator {
    return this.page.getByRole('button', { name: /^(save|exit)$/i }).first();
  }

  /** The add-media surface inside the editor: the Media panel + Upload control. */
  addMediaSurface(): { mediaPanelBtn: Locator; uploadBtn: Locator } {
    return {
      mediaPanelBtn: this.page.getByRole('button', { name: /^media$/i }).first(),
      uploadBtn: this.page.getByRole('button', { name: /\+?\s*upload/i }).first(),
    };
  }
}

export default PlaylistPage;
