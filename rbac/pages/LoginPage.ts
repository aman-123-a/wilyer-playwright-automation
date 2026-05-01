import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly submitBtn: Locator;

  constructor(page: Page) {
    super(page);
    // Verified against the live login form on cms.pocsample.in.
    this.emailInput = page.getByPlaceholder(/email/i);
    this.passwordInput = page.getByPlaceholder(/password/i);
    this.submitBtn = page.getByRole('button', { name: /log in/i });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.submitBtn).toBeVisible();
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitBtn.click();
    // Login form unmounts on success — waiting for that is the most reliable signal.
    await expect(this.passwordInput).toBeHidden({ timeout: 30_000 });
  }
}
