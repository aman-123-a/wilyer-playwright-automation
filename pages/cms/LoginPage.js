// =============================================================================
//  LoginPage — CMS authentication screen (cms.pocsample.in).
//  Distinct from the repo's existing pages/LoginPage.js, which targets a
//  different app (app.wilyer.com).
// =============================================================================

import { expect } from '@playwright/test';
import { ENV } from '../../utils/cms/env.js';

export class LoginPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.email = page.getByRole('textbox', { name: /email|phone/i });
    this.password = page.getByRole('textbox', { name: /password/i });
    this.loginBtn = page.getByRole('button', { name: /log in/i });
    this.errorMessage = page.getByText(
      /invalid|incorrect|wrong|failed|not found|doesn'?t match|unauthori[sz]ed|required/i
    );
  }

  async goto() {
    await this.page.goto(ENV.BASE_URL, { waitUntil: 'domcontentloaded' });
    await this.page.waitForSelector(
      'input[type="email"], input[placeholder*="email" i], input[name="email"]',
      { timeout: 15_000 }
    );
    return this;
  }

  async fill(email, password) {
    if (email !== undefined) await this.email.fill(email);
    if (password !== undefined) await this.password.fill(password);
    return this;
  }

  async submit() {
    await this.loginBtn.click();
    return this;
  }

  async login(email, password) {
    await this.fill(email, password);
    await this.submit();
    return this;
  }

  /** True once we've left the login screen (signal-based, no networkidle). */
  async isAuthenticated() {
    // Wait for the dashboard shell to appear; tolerate it never showing (negative tests).
    await this.page.getByRole('link', { name: /dashboard/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {});
    return (await this.loginBtn.count()) === 0;
  }

  async expectStillOnLogin() {
    await expect(this.loginBtn).toBeVisible({ timeout: 10_000 });
    expect(this.page.url()).toContain('pocsample.in');
  }

  async expectError() {
    await expect(this.errorMessage.first()).toBeVisible({ timeout: 10_000 });
  }
}

export default LoginPage;
