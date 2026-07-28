// A Page Object Model (POM): wraps a page's locators + actions behind methods,
// so tests read like plain English and selectors live in ONE place.
// Docs: https://playwright.dev/docs/pom
export class LoginPage {
  constructor(page) {
    this.page = page;
    this.email = page.getByPlaceholder('Enter your email or phone');
    this.password = page.getByPlaceholder('Enter your password');
    this.loginButton = page.getByRole('button', { name: 'Log In' });
    this.recaptchaError = page.getByText('Could not connect to the reCAPTCHA');
  }

  async goto() {
    await this.page.goto('/');
  }

  // Fill + submit. Returns the /auth/login response (or null if it never fired —
  // which is exactly what happens when reCAPTCHA fails to load).
  async submit(email, password) {
    await this.email.fill(email);
    await this.password.fill(password);
    const loginResponse = this.page
      .waitForResponse(r => r.url().includes('/auth/login'), { timeout: 8000 })
      .catch(() => null);
    await this.loginButton.click();
    return loginResponse;
  }
}
