// =============================================================================
//  SignInPage — "Welcome Back!" login screen at the site root (`/`).
// =============================================================================
//  Selectors verified live against cms.wilyersignage.com:
//    • heading  "Welcome Back!"
//    • textbox  "Enter your email or phone"   (accessible name = placeholder)
//    • textbox  "Enter your password"
//    • password show/hide toggle = an unlabelled icon that is the input's next
//      sibling (NO accessible name — see bug list). We reach it structurally.
//    • button   "Log In"
//    • link     "Forgot Password?"  → /forget
//    • link     "Sign Up"           → /signup
//    • A passive reCAPTCHA badge is present (no interactive challenge).
//  On success the SPA swaps in the dashboard shell (a "Dashboard" nav link).
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';
import { BasePage, step } from './BasePage';
import { ROUTES } from '../config/routes';
import { ENV } from '../config/env';

export class SignInPage extends BasePage {
  readonly heading: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly passwordToggle: Locator;
  readonly loginButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly signUpLink: Locator;
  readonly dashboardLink: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /welcome back/i });
    this.email = page.getByRole('textbox', { name: /email or phone/i });
    this.password = page.getByRole('textbox', { name: /password/i });
    // The eye/visibility toggle has no accessible name; it is rendered as the
    // element immediately following the password <input> inside its wrapper.
    this.passwordToggle = this.password.locator('xpath=following-sibling::*[1]');
    this.loginButton = page.getByRole('button', { name: /^log in$/i });
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });
    this.signUpLink = page.getByRole('link', { name: /^sign up$/i });
    this.dashboardLink = page.getByRole('link', { name: /dashboard/i });
  }

  /** Open the Sign In screen and wait for the form to mount. */
  async open(): Promise<this> {
    await this.goto(ROUTES.signIn);
    await expect(this.email).toBeVisible({ timeout: 20_000 });
    return this;
  }

  /** Fill the credentials without submitting. */
  async fill(email: string, password: string): Promise<this> {
    await this.email.fill(email);
    await this.password.fill(password);
    return this;
  }

  async submit(): Promise<this> {
    await this.loginButton.click();
    return this;
  }

  /** Fill + submit. Callers decide what success/failure looks like. */
  async login(email = ENV.ADMIN_EMAIL, password = ENV.ADMIN_PASSWORD): Promise<this> {
    step(`sign in as ${email}`);
    await this.fill(email, password);
    await this.submit();
    return this;
  }

  /** Toggle password visibility via the eye icon. */
  async togglePasswordVisibility(): Promise<this> {
    await this.passwordToggle.click();
    return this;
  }

  /** Current input type of the password field ("password" = masked). */
  async passwordInputType(): Promise<string | null> {
    return this.password.getAttribute('type');
  }

  /** Resolve true once the authenticated dashboard shell replaces the form. */
  async isAuthenticated(timeout = 25_000): Promise<boolean> {
    await this.dashboardLink
      .first()
      .waitFor({ state: 'visible', timeout })
      .catch(() => {});
    return (await this.loginButton.count()) === 0;
  }

  /** Assert we are still on the Sign In form (login did not succeed). */
  async expectStillOnSignIn(): Promise<void> {
    await expect(this.loginButton).toBeVisible({ timeout: 10_000 });
    await expect(this.dashboardLink).toHaveCount(0);
  }

  /** Assert an error toast surfaced (any auth/validation failure message). */
  async expectError(text: RegExp = /invalid|incorrect|wrong|must be|required|not found|valid/i): Promise<void> {
    await this.expectToast(text);
  }
}

export default SignInPage;
