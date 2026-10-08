/**
 * Login Page Object.
 *
 * Encapsulates the authentication form. Selectors use multiple resilient
 * strategies (label, placeholder, type) so minor markup changes don't break
 * the suite. Adjust the fallbacks here if the real DOM differs.
 */
import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { ROUTES } from '../config/constants.js';
import { env } from '../config/env.js';

export class LoginPage extends BasePage {
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly submitButton: Locator;
  private readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page, 'LoginPage');
    // Email: prefer an explicit email-type input, fall back to common labels.
    this.emailInput = page
      .locator('input[type="email"], input[name="email" i], input[placeholder*="email" i]')
      .first();
    this.passwordInput = page
      .locator('input[type="password"], input[name="password" i]')
      .first();
    this.submitButton = page
      .getByRole('button', { name: /log\s?in|sign\s?in|continue/i })
      .first();
    this.errorMessage = page
      .locator('[role="alert"], .error, .invalid-feedback, [class*="error" i]')
      .filter({ hasText: /.+/ });
  }

  /** Open the login page. */
  async goto(): Promise<void> {
    await this.navigate(ROUTES.login);
    await this.emailInput.waitFor({ state: 'visible', timeout: env.exec.navTimeoutMs });
  }

  /** Fill credentials and submit. Does not wait for post-login navigation. */
  async login(email: string, password: string): Promise<void> {
    this.log.info(`Submitting credentials for ${email}`);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /** Whether an inline login error is currently displayed. */
  async hasError(): Promise<boolean> {
    return (await this.errorMessage.count()) > 0 && (await this.errorMessage.first().isVisible());
  }

  /** The displayed login error text (empty string if none). */
  async errorText(): Promise<string> {
    if (!(await this.hasError())) return '';
    return (await this.errorMessage.first().innerText()).trim();
  }

  /** True while still on the login screen (used after invalid-login attempts). */
  async isOnLoginPage(): Promise<boolean> {
    return this.url().includes(ROUTES.login) || (await this.emailInput.isVisible().catch(() => false));
  }
}
