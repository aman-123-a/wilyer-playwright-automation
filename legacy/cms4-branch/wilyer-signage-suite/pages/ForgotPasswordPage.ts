// =============================================================================
//  ForgotPasswordPage — OTP-request screen at `/forget`.
// =============================================================================
//  Selectors verified live against cms.wilyersignage.com:
//    • heading  "Forgot Password?"
//    • textbox  "Enter your email"   (placeholder carries a trailing space —
//      see bug list; the role/name match below is space-tolerant)
//    • button   "Send OTP"
//    • link     "Sign Up"  → /signup
//  Observed behaviour:
//    • Blank email  → submit is a silent no-op (no request, no message).
//    • Malformed email → round-trips to the API; backend Joi message
//      `"email" must be a valid email` surfaces as a toast (no client-side
//      format check — see bug list).
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';
import { BasePage, step } from './BasePage';
import { ROUTES } from '../config/routes';

export class ForgotPasswordPage extends BasePage {
  readonly heading: Locator;
  readonly email: Locator;
  readonly sendOtpButton: Locator;
  readonly signUpLink: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /forgot password/i });
    this.email = page.getByRole('textbox', { name: /enter your email/i });
    this.sendOtpButton = page.getByRole('button', { name: /send otp/i });
    this.signUpLink = page.getByRole('link', { name: /^sign up$/i });
  }

  async open(): Promise<this> {
    await this.goto(ROUTES.forgotPassword);
    await expect(this.email).toBeVisible({ timeout: 20_000 });
    return this;
  }

  async fillEmail(email: string): Promise<this> {
    await this.email.fill(email);
    return this;
  }

  async sendOtp(): Promise<this> {
    await this.sendOtpButton.click();
    return this;
  }

  /** Fill + submit in one step. */
  async requestOtp(email: string): Promise<this> {
    step(`request OTP for ${email}`);
    await this.fillEmail(email);
    await this.sendOtp();
    return this;
  }

  async expectStillOnForgotPassword(): Promise<void> {
    await expect(this.sendOtpButton).toBeVisible({ timeout: 10_000 });
    await expect(this.page).toHaveURL(/\/forget/);
  }

  async expectError(text: RegExp = /valid email|required|not found|must be/i): Promise<void> {
    await this.expectToast(text);
  }
}

export default ForgotPasswordPage;
