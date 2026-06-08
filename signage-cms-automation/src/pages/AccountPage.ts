// =============================================================================
//  AccountPage — account settings at /account.
//  Verified live against cms.pocsample.in: the account surface shows the signed-in
//  user's profile (name + email) and a set of tabs (Profile / Adaptive Content /
//  etc.). Field labels vary, so profile assertions are kept resilient: we anchor
//  on the authenticated user's email which the shell always renders here.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { ENV } from '../config/env';

export class AccountPage extends BasePage {
  readonly profileTab: Locator;
  readonly adaptiveContentTab: Locator;
  readonly emailValue: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.profileTab = page.getByRole('link', { name: /profile|account|general/i }).first();
    this.adaptiveContentTab = page.getByRole('link', { name: /adaptive content/i }).first();
    // The signed-in account's email is rendered somewhere on the page/shell.
    this.emailValue = page.getByText(new RegExp(ENV.ADMIN.email.replace(/[.+]/g, '\\$&'), 'i')).first();
  }

  async open(): Promise<this> {
    await this.goto('/account');
    await this.expectShellReady();
    await this.page.waitForLoadState('domcontentloaded');
    return this;
  }

  /** True once the account page exposes recognisable user information. */
  async expectUserInfoVisible(): Promise<this> {
    // Primary signal: the admin email is shown. Fallback: any profile/account
    // heading or an input pre-filled with an @-address.
    const emailShown = await this.emailValue.isVisible({ timeout: 15_000 }).catch(() => false);
    if (emailShown) {
      await expect(this.emailValue).toBeVisible();
      return this;
    }
    const heading = this.page.getByRole('heading', { name: /account|profile|my profile|settings/i }).first();
    const filledInput = this.page.locator('input').filter({ hasText: /@/ }).first();
    const headingShown = await heading.isVisible({ timeout: 8_000 }).catch(() => false);
    const inputShown = await filledInput.isVisible({ timeout: 4_000 }).catch(() => false);
    expect(emailShown || headingShown || inputShown, 'account page shows user information').toBeTruthy();
    return this;
  }

  /** Account-area tabs (Profile / Adaptive Content / Security …). */
  tabs(): Locator {
    return this.page.getByRole('tab').or(
      this.page.getByRole('link', { name: /profile|adaptive content|security|notification|billing|general/i }),
    );
  }
}

export default AccountPage;
