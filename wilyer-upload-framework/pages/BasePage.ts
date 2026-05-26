/**
 * Base Page Object.
 *
 * Holds the Playwright `Page`, common navigation/wait utilities, and a shared
 * toast helper. Every concrete page extends this so behaviour (waits, logging)
 * is consistent and selectors stay DRY.
 *
 * Selector strategy: prefer Playwright's user-facing, role/label/text-based
 * locators (`getByRole`, `getByLabel`, `getByText`) and fall back to
 * `data-testid` / stable CSS only where the DOM offers nothing better. Avoid
 * brittle nth-child / generated-class selectors.
 */
import type { Locator, Page } from '@playwright/test';
import { env } from '../config/env.js';
import { createLogger, type Logger } from '../utils/logger.js';

export abstract class BasePage {
  protected readonly log: Logger;

  protected constructor(
    protected readonly page: Page,
    scope: string,
  ) {
    this.log = createLogger(scope);
  }

  /** Navigate to a path relative to BASE_URL and wait for the DOM. */
  async navigate(pathOrUrl: string): Promise<void> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${env.app.baseURL}${pathOrUrl}`;
    this.log.info(`Navigate -> ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: env.exec.navTimeoutMs });
  }

  /** Wait for the network to go idle (no in-flight requests). */
  async waitForNetworkIdle(timeoutMs = env.exec.navTimeoutMs): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: timeoutMs });
  }

  /**
   * Generic toast/notification reader. The CMS surfaces success/error toasts;
   * this locator is intentionally broad (role=alert OR common toast classes)
   * and returns the first visible match's text.
   */
  toast(): Locator {
    return this.page
      .locator('[role="alert"], .toast, .Toastify__toast, .ant-message, .notification, [class*="toast" i]')
      .filter({ hasText: /.+/ });
  }

  /** Wait for a toast to appear and return its trimmed text. */
  async getToastText(timeoutMs = env.exec.actionTimeoutMs): Promise<string> {
    const toast = this.toast().first();
    await toast.waitFor({ state: 'visible', timeout: timeoutMs });
    const text = (await toast.innerText()).trim();
    this.log.info(`Toast: "${text}"`);
    return text;
  }

  /** True if any element with the given visible text is present. */
  async hasText(text: string | RegExp): Promise<boolean> {
    return (await this.page.getByText(text).count()) > 0;
  }

  /** Current page URL. */
  url(): string {
    return this.page.url();
  }

  /** Attach a screenshot to the current state (used by failure hooks). */
  async screenshot(name: string): Promise<Buffer> {
    return this.page.screenshot({ path: undefined, fullPage: true }).then((buf) => {
      this.log.debug(`Captured screenshot "${name}"`);
      return buf;
    });
  }
}
