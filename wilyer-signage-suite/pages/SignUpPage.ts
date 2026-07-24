// =============================================================================
//  SignUpPage — "Create your account." registration screen at `/signup`.
// =============================================================================
//  Selectors verified live against cms.wilyersignage.com:
//    • heading  "Create your account."  (rendered as <h4> — inconsistent with
//      the <h2> on Sign In / Forgot — see bug list)
//    • textbox  "Enter your full name"          (Name *)
//    • textbox  "Enter your email"              (Email *)
//    • country dial-code button "+91" + country <select> (combobox) + a numeric
//      phone <input> (spinbutton, placeholder "Enter your phone number")
//    • textbox  "Enter your oganization name"   (Company Name *  — placeholder
//      is mis-spelt "oganization"; matcher below is typo-tolerant)
//    • textbox  "Enter your password"  + unlabelled show/hide toggle
//    • checkbox "I agree to the Terms of Service and Privacy Policy"
//    • link     "Terms of Service"  → /signup   (placeholder href — see bug list)
//    • link     "Privacy Policy"    → /signup   (placeholder href — see bug list)
//    • PRIMARY SUBMIT BUTTON IS LABELLED "Sign In" (should be Sign Up / Create
//      Account — see bug list). The matcher is intentionally tolerant so the
//      POM keeps working once the label is fixed.
//    • link     "Log In"  → /
//  Observed behaviour:
//    • Missing mandatory fields → submit blocked, but no visible message.
//    • Terms unchecked → submit is a silent no-op (no request, no message).
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';
import { BasePage, step } from './BasePage';
import { ROUTES } from '../config/routes';

export interface SignUpData {
  name: string;
  email: string;
  phone: string;
  company: string;
  password: string;
  /** Country name as shown in the dial-code dropdown, e.g. "India". */
  country?: string;
}

export class SignUpPage extends BasePage {
  readonly heading: Locator;
  readonly name: Locator;
  readonly email: Locator;
  readonly countryCodeButton: Locator;
  readonly countrySelect: Locator;
  readonly phone: Locator;
  readonly company: Locator;
  readonly password: Locator;
  readonly passwordToggle: Locator;
  readonly termsCheckbox: Locator;
  readonly termsLink: Locator;
  readonly privacyLink: Locator;
  readonly submitButton: Locator;
  readonly logInLink: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /create your account/i });
    this.name = page.getByRole('textbox', { name: /full name/i });
    this.email = page.getByRole('textbox', { name: /^enter your email$/i });
    this.countryCodeButton = page.getByRole('button', { name: /^\+\d+/ });
    this.countrySelect = page.getByRole('combobox');
    this.phone = page.getByRole('spinbutton');
    // Tolerant of the "oganization" typo AND a future correctly-spelt fix.
    this.company = page.getByRole('textbox', { name: /o.?ganization name/i });
    this.password = page.getByRole('textbox', { name: /enter your password/i });
    this.passwordToggle = this.password.locator('xpath=following-sibling::*[1]');
    this.termsCheckbox = page.getByRole('checkbox', { name: /i agree to the terms/i });
    this.termsLink = page.getByRole('link', { name: /terms of service/i });
    this.privacyLink = page.getByRole('link', { name: /privacy policy/i });
    // Currently mis-labelled "Sign In"; tolerate the correct labels too. Scoped
    // to button role so it never matches the "+91" code button or "Log In" link.
    this.submitButton = page.getByRole('button', { name: /^(sign ?up|create account|sign ?in)$/i });
    this.logInLink = page.getByRole('link', { name: /^log in$/i });
  }

  async open(): Promise<this> {
    await this.goto(ROUTES.signUp);
    await expect(this.name).toBeVisible({ timeout: 20_000 });
    return this;
  }

  /** Fill every text field. Phone is the numeric input only (no country code). */
  async fillForm(data: SignUpData): Promise<this> {
    await this.name.fill(data.name);
    await this.email.fill(data.email);
    await this.phone.fill(data.phone);
    await this.company.fill(data.company);
    await this.password.fill(data.password);
    if (data.country) {
      await this.countrySelect.selectOption({ label: data.country }).catch(() => {});
    }
    return this;
  }

  async acceptTerms(): Promise<this> {
    await this.termsCheckbox.check();
    return this;
  }

  async submit(): Promise<this> {
    await this.submitButton.click();
    return this;
  }

  /** Full registration. `acceptTerms` defaults true; pass false to test the gate. */
  async signUp(data: SignUpData, opts: { acceptTerms?: boolean } = {}): Promise<this> {
    const { acceptTerms = true } = opts;
    step(`sign up ${data.email} (terms=${acceptTerms})`);
    await this.fillForm(data);
    if (acceptTerms) await this.acceptTerms();
    await this.submit();
    return this;
  }

  async expectStillOnSignUp(): Promise<void> {
    await expect(this.submitButton).toBeVisible({ timeout: 10_000 });
    await expect(this.page).toHaveURL(/\/signup/);
  }

  async expectError(text: RegExp = /required|must|valid|terms|agree/i): Promise<void> {
    await this.expectToast(text);
  }
}

export default SignUpPage;
