/**
 * Approval Page Object (Checker side).
 *
 * Models the pending-approvals queue where the Checker approves or rejects
 * Maker uploads. Rejection requires a reason. Selectors are resilient
 * (role/text based) and scoped to the row matching the target file name.
 */
import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { ROUTES, STATUS } from '../config/constants.js';
import { env } from '../config/env.js';

export class ApprovalPage extends BasePage {
  /** The pending-approvals queue container (table / list / cards). */
  readonly queueContainer: Locator;

  constructor(page: Page) {
    super(page, 'ApprovalPage');
    this.queueContainer = page.locator('table, [class*="list" i], [class*="queue" i]').first();
  }

  /** Open the pending approvals queue. */
  async goto(): Promise<void> {
    await this.navigate(ROUTES.approvals);
    await this.waitForNetworkIdle();
  }

  /** The row (table row / list item / card) for a given file name. */
  private row(fileName: string): Locator {
    return this.page
      .locator('tr, li, [class*="row" i], [class*="card" i]')
      .filter({ hasText: fileName })
      .first();
  }

  /** Whether a pending item for the file exists in the queue. */
  async hasPendingItem(fileName: string): Promise<boolean> {
    return (await this.row(fileName).count()) > 0;
  }

  /** Approve the named file. Clicks the row-scoped Approve control. */
  async approve(fileName: string): Promise<void> {
    this.log.info(`Approving "${fileName}"`);
    const row = this.row(fileName);
    await row.waitFor({ state: 'visible', timeout: env.exec.actionTimeoutMs });
    await row.getByRole('button', { name: /approve|accept/i }).first().click();
    await this.confirmIfPrompted();
    await this.waitForNetworkIdle();
  }

  /**
   * Reject the named file with a mandatory reason. Opens the reject dialog,
   * fills the reason, and confirms.
   */
  async reject(fileName: string, reason: string): Promise<void> {
    this.log.info(`Rejecting "${fileName}" — reason: ${reason}`);
    const row = this.row(fileName);
    await row.waitFor({ state: 'visible', timeout: env.exec.actionTimeoutMs });
    await row.getByRole('button', { name: /reject|decline/i }).first().click();

    // A dialog asking for the rejection reason typically appears.
    const reasonField = this.page
      .locator('textarea, input[type="text"]')
      .filter({ hasNot: this.page.locator('[type="hidden"]') })
      .last();
    await reasonField.waitFor({ state: 'visible', timeout: env.exec.actionTimeoutMs });
    await reasonField.fill(reason);

    await this.page
      .getByRole('button', { name: /confirm|reject|submit|ok/i })
      .last()
      .click();
    await this.waitForNetworkIdle();
  }

  /** Click a generic confirm button if the action prompts for confirmation. */
  private async confirmIfPrompted(): Promise<void> {
    const confirm = this.page.getByRole('button', { name: /confirm|continue|yes|ok/i }).last();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click().catch(() => undefined);
    }
  }

  /** Current status text shown for the file (e.g. Approved/Rejected). */
  async statusOf(fileName: string): Promise<string> {
    const row = this.row(fileName);
    if ((await row.count()) === 0) return '';
    return (await row.innerText()).trim();
  }

  /** Whether the Approve/Reject controls are visible (permission check). */
  async hasApprovalControls(): Promise<boolean> {
    return (
      (await this.page.getByRole('button', { name: /approve|accept/i }).count()) > 0 ||
      (await this.page.getByRole('button', { name: /reject|decline/i }).count()) > 0
    );
  }

  /** Whether the queue shows the item as approved. */
  async isApproved(fileName: string): Promise<boolean> {
    return new RegExp(STATUS.approved, 'i').test(await this.statusOf(fileName));
  }

  /** Whether the queue shows the item as rejected. */
  async isRejected(fileName: string): Promise<boolean> {
    return new RegExp(STATUS.rejected, 'i').test(await this.statusOf(fileName));
  }
}
