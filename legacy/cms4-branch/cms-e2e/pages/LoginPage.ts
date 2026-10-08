// =============================================================================
//  LoginPage — CMS authentication screen (cms.pocsample.in).
//  Selectors verified live:
//    • textbox "Enter your email or phone"
//    • textbox "Enter your password"
//    • button  "Log In"
//    • A reCAPTCHA badge is present (passive) — no challenge for these creds.
//  On success the app stays on "/" and swaps in the dashboard shell.
// =============================================================================

import { type Page, type Locator, expect } from '@playwright/test';
import { ENV, type Credentials } from '../config/env';

export class LoginPage {
  readonly page: Page;
  readonly email: Locator;
  readonly password: Locator;
  readonly passwordToggle: Locator;
  readonly loginBtn: Locator;
  readonly forgotPasswordLink: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.email = page.getByRole('textbox', { name: /email or phone/i });
    this.password = page.getByRole('textbox', { name: /password/i });
    this.passwordToggle = page.locator('input[type="password"], input[type="text"]')
      .locator('xpath=following-sibling::*[1]').first();
    this.loginBtn = page.getByRole('button', { name: /^log in$/i });
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });
    this.errorMessage = page.getByText(
      /invalid|incorrect|wrong|failed|not found|doesn'?t match|unauthori[sz]ed|required|enter/i,
    );
  }

  async goto(): Promise<this> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(this.email).toBeVisible({ timeout: 20_000 });
    return this;
  }

  async fill(email?: string, password?: string): Promise<this> {
    if (email !== undefined) await this.email.fill(email);
    if (password !== undefined) await this.password.fill(password);
    return this;
  }

  async submit(): Promise<this> {
    await this.loginBtn.click();
    return this;
  }

  async login(creds: Credentials = ENV.ADMIN): Promise<this> {
    await this.fill(creds.email, creds.password);
    await this.submit();
    return this;
  }

  /** Resolve true once the dashboard shell replaces the login form. */
  async isAuthenticated(timeout = 25_000): Promise<boolean> {
    await this.page
      .getByRole('link', { name: /dashboard/i })
      .first()
      .waitFor({ state: 'visible', timeout })
      .catch(() => {});
    return (await this.loginBtn.count()) === 0;
  }

  async expectStillOnLogin(): Promise<void> {
    await expect(this.loginBtn).toBeVisible({ timeout: 10_000 });
  }

  async expectError(): Promise<void> {
    await expect(this.errorMessage.first()).toBeVisible({ timeout: 10_000 });
  }

  /** The current input `type` of the password field ("password" = masked). */
  async passwordFieldType(): Promise<string | null> {
    return this.password.getAttribute('type');
  }
}

export default LoginPage;
