import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

// LoginPage: handles auth for both Maker (sub-user) and Checker (parent) roles
export class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    this.emailInput    = page.getByRole('textbox', { name: /email|phone/i });
    this.passwordInput = page.getByRole('textbox', { name: /password/i });
    this.loginButton   = page.getByRole('button', { name: /log\s*in/i });
    this.errorToast    = page.locator('.toast, .error-message, [role="alert"]');
  }

  async open(baseUrl) {
    await this.goto(baseUrl);
    await expect(this.emailInput).toBeVisible({ timeout: 15_000 });
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async loginExpectingSuccess(email, password) {
    await this.login(email, password);
    // Successful login → login button disappears and dashboard link shows
    await expect(this.loginButton).toBeHidden({ timeout: 20_000 });
  }

  async loginExpectingFailure(email, password) {
    await this.login(email, password);
    await expect(this.loginButton).toBeVisible({ timeout: 10_000 });
  }
}
