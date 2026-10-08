/**
 * Notification Page Object.
 *
 * Models the in-app notification centre (bell / notifications list). Used to
 * cross-check that the workflow surfaces in-app notifications alongside the
 * email notifications validated over IMAP.
 */
import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { ROUTES } from '../config/constants.js';
import { env } from '../config/env.js';

export class NotificationPage extends BasePage {
  private readonly bell: Locator;
  private readonly panel: Locator;
  private readonly items: Locator;

  constructor(page: Page) {
    super(page, 'NotificationPage');
    this.bell = page
      .locator('[aria-label*="notification" i], [class*="bell" i], button:has([class*="bell" i])')
      .first();
    this.panel = page.locator('[class*="notification" i][class*="panel" i], [role="menu"]').first();
    this.items = page.locator('[class*="notification" i] li, [role="menuitem"], [class*="notif-item" i]');
  }

  /** Open the notifications panel (via bell) or route to the page. */
  async open(): Promise<void> {
    if (await this.bell.isVisible().catch(() => false)) {
      await this.bell.click();
      await this.panel.waitFor({ state: 'visible', timeout: env.exec.actionTimeoutMs }).catch(() => undefined);
    } else {
      await this.navigate(ROUTES.notifications);
      await this.waitForNetworkIdle();
    }
  }

  /** Count of visible notification items. */
  async count(): Promise<number> {
    return this.items.count();
  }

  /** Whether any notification mentions the given text (e.g. a file name). */
  async hasNotificationFor(text: string | RegExp): Promise<boolean> {
    await this.open();
    return (await this.page.getByText(text).count()) > 0;
  }

  /** Text of the most recent notification (empty if none). */
  async latestText(): Promise<string> {
    if ((await this.items.count()) === 0) return '';
    return (await this.items.first().innerText()).trim();
  }
}
