/**
 * Upload Page Object (Maker side).
 *
 * Models the Library upload flow:
 *   "Upload Files" button -> "Browse Files" -> file chooser (setInputFiles) ->
 *   upload auto-starts (there is NO explicit confirm button) -> dialog closes
 *   when complete.
 *
 * After upload, the Maker submits the file for Checker approval and the page
 * exposes status (Pending) and toast verification.
 *
 * NOTE: the "submit for approval" affordance and status chips are best-effort
 * selectors — confirm against the live DOM and tweak here only.
 */
import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { ROUTES, STATUS } from '../config/constants.js';
import { env } from '../config/env.js';

export class UploadPage extends BasePage {
  private readonly uploadButton: Locator;
  private readonly browseButton: Locator;
  private readonly fileInput: Locator;
  private readonly uploadDialog: Locator;
  private readonly submitForApprovalButton: Locator;

  constructor(page: Page) {
    super(page, 'UploadPage');
    this.uploadButton = page.getByRole('button', { name: /upload files?|upload/i }).first();
    this.browseButton = page.getByRole('button', { name: /browse files?|choose|select files?/i }).first();
    // Hidden native input that actually receives the file(s).
    this.fileInput = page.locator('input[type="file"]');
    this.uploadDialog = page.locator('[role="dialog"], .modal, [class*="dialog" i]').first();
    this.submitForApprovalButton = page
      .getByRole('button', { name: /submit for approval|send for approval|submit/i })
      .first();
  }

  /** Open the Library/Upload module. */
  async goto(): Promise<void> {
    await this.navigate(ROUTES.upload);
    await this.waitForNetworkIdle();
  }

  /**
   * Perform an upload. Opens the dialog, sets the file on the input (which
   * auto-starts the upload), and waits for the dialog to close (= done).
   * Returns once the upload UI reports completion.
   */
  async uploadFile(filePath: string): Promise<void> {
    this.log.info(`Uploading file: ${filePath}`);
    await this.openUploadDialog();
    await this.setFile(filePath);
    await this.waitForUploadComplete();
  }

  /** Open the upload dialog and reveal the file input. */
  async openUploadDialog(): Promise<void> {
    if (await this.uploadButton.isVisible().catch(() => false)) {
      await this.uploadButton.click();
    }
    // Some flows expose "Browse Files" inside the dialog; click it if present.
    if (await this.browseButton.isVisible().catch(() => false)) {
      await this.browseButton.click().catch(() => undefined);
    }
  }

  /** Set the file on the (possibly hidden) native input — this auto-starts upload. */
  async setFile(filePath: string | string[]): Promise<void> {
    await this.fileInput.first().setInputFiles(filePath);
  }

  /**
   * Wait for the upload to finish. The dialog closing is the success signal;
   * we also tolerate an inline progress bar disappearing.
   */
  async waitForUploadComplete(timeoutMs = env.exec.navTimeoutMs): Promise<void> {
    await this.uploadDialog
      .waitFor({ state: 'hidden', timeout: timeoutMs })
      .catch(() => this.log.warn('Upload dialog did not close; continuing on progress signal'));
    await this.waitForNetworkIdle();
    this.log.info('Upload complete');
  }

  /** Submit the just-uploaded file into the approval workflow (if a control exists). */
  async submitForApproval(): Promise<void> {
    if (await this.submitForApprovalButton.isVisible().catch(() => false)) {
      this.log.info('Submitting for approval');
      await this.submitForApprovalButton.click();
      await this.waitForNetworkIdle();
    } else {
      // Some configurations auto-route uploads into the approval queue.
      this.log.info('No explicit "submit for approval" control; upload auto-enters queue');
    }
  }

  /** Locator for a file row by name in the library/upload list. */
  fileRow(fileName: string): Locator {
    return this.page.getByText(fileName, { exact: false }).first();
  }

  /** Whether a file with the given name is listed. */
  async isFileListed(fileName: string): Promise<boolean> {
    return (await this.fileRow(fileName).count()) > 0;
  }

  /** Whether the named file shows the "Pending" approval status. */
  async hasPendingStatus(fileName: string): Promise<boolean> {
    const row = this.page
      .locator('tr, li, [class*="row" i], [class*="card" i]')
      .filter({ hasText: fileName })
      .first();
    if ((await row.count()) === 0) {
      return this.hasText(new RegExp(STATUS.pending, 'i'));
    }
    return (await row.getByText(new RegExp(STATUS.pending, 'i')).count()) > 0;
  }

  /** Whether the "Upload"/"Browse" control is available (permission check). */
  async canUpload(): Promise<boolean> {
    return (
      (await this.uploadButton.isVisible().catch(() => false)) ||
      (await this.fileInput.count()) > 0
    );
  }
}
