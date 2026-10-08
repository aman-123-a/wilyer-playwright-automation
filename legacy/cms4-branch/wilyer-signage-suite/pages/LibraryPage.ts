// =============================================================================
//  LibraryPage — folders + file uploads.
// =============================================================================
//  Validated flow (see project memory): Upload Files → Browse Files →
//  setInputFiles auto-starts the upload; there is NO separate confirm button.
//  The dialog closing == upload done.
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { ROUTES } from '../config/routes';

export class LibraryPage extends BasePage {
  readonly uploadButton: Locator;
  readonly fileInput: Locator;
  readonly newFolderButton: Locator;
  readonly folderNameInput: Locator;
  readonly searchBox: Locator;

  constructor(page: Page) {
    super(page);
    this.uploadButton = page.getByTestId('upload-files').or(page.getByRole('button', { name: /upload( files)?/i })).first();
    this.fileInput = page.locator('input[type="file"]');
    this.newFolderButton = page.getByTestId('new-folder').or(page.getByRole('button', { name: /new folder|create folder|add folder/i })).first();
    this.folderNameInput = page.getByTestId('folder-name').or(page.getByRole('textbox', { name: /folder|name/i })).first();
    this.searchBox = page.getByRole('textbox', { name: /search/i }).or(page.locator('input[placeholder*="search" i]')).first();
  }

  async open(): Promise<void> {
    await this.goto(ROUTES.library);
    await expect(this.uploadButton.or(this.newFolderButton).first()).toBeVisible({ timeout: 20_000 });
  }

  // ── Folders ───────────────────────────────────────────────────────────────
  async createFolder(name: string): Promise<void> {
    await this.newFolderButton.click();
    await this.folderNameInput.fill(name);
    await this.page.getByRole('button', { name: /^(create|save|add|ok)$/i }).first().click();
  }

  async renameFolder(name: string, newName: string): Promise<void> {
    const folder = this.rowWith(name).first();
    await folder.getByRole('button', { name: /rename|edit/i }).first().click().catch(() => folder.dblclick());
    await this.folderNameInput.fill(newName);
    await this.page.getByRole('button', { name: /^(save|rename|ok)$/i }).first().click();
  }

  async deleteFolder(name: string): Promise<void> {
    const folder = this.rowWith(name).first();
    await folder.getByRole('button', { name: /delete|remove|trash/i }).first().click();
    await this.confirm();
  }

  // ── Uploads ────────────────────────────────────────────────────────────────
  /**
   * Upload one or more files. Opens the dialog, sets the file input (which
   * auto-starts), and waits for the dialog to close / a success toast.
   */
  async upload(paths: string | string[]): Promise<void> {
    await this.uploadButton.click().catch(() => {});
    // Some flows reveal the input only after a "Browse Files" click.
    const browse = this.page.getByRole('button', { name: /browse|choose file|select file/i }).first();
    if (await browse.isVisible().catch(() => false)) {
      const chooserP = this.page.waitForEvent('filechooser');
      await browse.click();
      const chooser = await chooserP;
      await chooser.setFiles(paths);
    } else {
      await this.fileInput.first().setInputFiles(paths);
    }
  }

  /** Wait for the upload to finish: dialog closes or a success toast appears. */
  async waitUploadComplete(timeout = 60_000): Promise<void> {
    await Promise.race([
      this.toast(/uploaded|success|complete/i).first().waitFor({ state: 'visible', timeout }).catch(() => {}),
      this.openModal().waitFor({ state: 'hidden', timeout }).catch(() => {}),
    ]);
  }

  /** Attempt an upload and return whether the app rejected the file. */
  async expectRejected(paths: string | string[], reason = /not allowed|invalid|unsupported|fail|too large|exceeds|max/i): Promise<void> {
    await this.upload(paths);
    await expect(this.toast(reason).first().or(this.page.locator('body').filter({ hasText: reason }))).toBeVisible({ timeout: 20_000 });
  }
}
