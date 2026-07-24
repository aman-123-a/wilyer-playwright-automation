// =============================================================================
//  PlaylistPage — CRUD + publish. Create modal requires a folder (silent no-op
//  if unset, per project memory). Delete confirm button is "Continue".
// =============================================================================
import { Page, Locator } from '@playwright/test';
import { CrudModule } from './CrudModule';
import { ROUTES } from '../config/routes';

export class PlaylistPage extends CrudModule {
  readonly folderSelect: Locator;
  readonly publishButton: Locator;

  constructor(page: Page) {
    super(page, {
      route: ROUTES.playlists,
      addLabel: /add playlist|new playlist|create playlist|add|new|create/i,
      submitLabel: /^(create|save|add|continue)$/i,
      testIds: { add: 'add-playlist', name: 'playlist-name', submit: 'playlist-submit' },
    });
    this.folderSelect = page.getByTestId('playlist-folder').or(page.locator('select[name*="folder" i], [aria-label*="folder" i]')).first();
    this.publishButton = page.getByTestId('publish-playlist').or(page.getByRole('button', { name: /publish/i })).first();
  }

  /** Select the required folder (create is a silent no-op without it). */
  async selectFolder(name?: string): Promise<void> {
    if (!(await this.folderSelect.count())) return;
    if (name) {
      await this.folderSelect.selectOption({ label: name }).catch(() => this.folderSelect.click());
    } else {
      // pick the first real option
      await this.folderSelect.selectOption({ index: 1 }).catch(() => {});
    }
  }

  async createInFolder(name: string, folder?: string): Promise<void> {
    await this.openCreate();
    await this.fillName(name);
    await this.selectFolder(folder);
    await this.submit();
  }

  async publish(name: string): Promise<void> {
    await this.search(this.searchBox, name);
    await this.rowWith(name).first().click();
    await this.publishButton.click();
    await this.confirm().catch(() => {});
  }
}
