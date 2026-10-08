// =============================================================================
//  LoginPage — authentication, mirrors the proven loginHelper selectors.
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';
import { BasePage, step } from './BasePage';
import { ENV } from '../config/env';

export class LoginPage extends BasePage {
  readonly email: Locator;
  readonly password: Locator;
  readonly loginButton: Locator;
  readonly dashboardLink: Locator;

  constructor(page: Page) {
    super(page);
    this.email = page.getByRole('textbox', { name: /email|phone/i });
    this.password = page.getByRole('textbox', { name: /password/i });
    this.loginButton = page.getByRole('button', { name: /log ?in|sign ?in/i });
    this.dashboardLink = page.getByRole('link', { name: /dashboard/i });
  }

  async open(): Promise<void> {
    await this.page.goto(ENV.BASE_URL, { waitUntil: 'domcontentloaded' });
    await this.page
      .waitForSelector('input[type="email"], input[placeholder*="email" i], input[name="email"]', { timeout: 15_000 })
      .catch(() => {});
  }

  /** Are we already past auth (dashboard shell visible, no login form)? */
  async isAuthenticated(): Promise<boolean> {
    if (await this.dashboardLink.isVisible().catch(() => false)) return true;
    return (await this.loginButton.count()) === 0 && !/login|signin/i.test(this.page.url());
  }

  /** Fill + submit without asserting success — callers decide. */
  async fill(email: string, password: string): Promise<void> {
    await this.open();
    await this.email.fill(email);
    await this.password.fill(password);
    await this.loginButton.click();
  }

  /** Full login that reaches the dashboard. Idempotent + one retry for 429. */
  async login(email = ENV.ADMIN_EMAIL, password = ENV.ADMIN_PASSWORD): Promise<void> {
    step(`login as ${email}`);
    await this.page.goto(ENV.BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    if (await this.isAuthenticated()) {
      if (
        (await this.dashboardLink.isVisible().catch(() => false)) ||
        (await this.dashboardLink.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false))
      ) {
        return;
      }
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.fill(email, password);
      try {
        await this.dashboardLink.waitFor({ state: 'visible', timeout: 25_000 });
        await expect(this.loginButton).toHaveCount(0, { timeout: 10_000 });
        return;
      } catch (err) {
        if (attempt === 1 && (await this.loginButton.count()) > 0) {
          await this.page.waitForTimeout(4000);
          continue;
        }
        throw err;
      }
    }
  }

  /** Expect login to FAIL — still on the form, optionally with an error. */
  async expectLoginRejected(): Promise<void> {
    await expect(this.loginButton).toBeVisible({ timeout: 10_000 });
    await expect(this.dashboardLink).toHaveCount(0);
  }

  async logout(): Promise<void> {
    const link = this.page.getByRole('link', { name: /logout|log ?out|sign ?out/i }).first();
    const btn = this.page.getByRole('button', { name: /logout|log ?out|sign ?out/i }).first();
    if (await link.isVisible().catch(() => false)) await link.click();
    else await btn.click();
    await expect(this.loginButton).toBeVisible({ timeout: 15_000 });
  }
}
