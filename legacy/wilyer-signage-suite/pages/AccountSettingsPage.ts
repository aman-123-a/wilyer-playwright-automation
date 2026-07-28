// =============================================================================
//  AccountSettingsPage — notification settings CRUD + interval boundaries.
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { ROUTES } from '../config/routes';

export class AccountSettingsPage extends BasePage {
  readonly notificationsTab: Locator;
  readonly addSettingButton: Locator;
  readonly intervalInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.notificationsTab = page.getByRole('tab', { name: /notification/i }).or(page.getByRole('link', { name: /notification/i })).first();
    this.addSettingButton = page.getByTestId('add-notification').or(page.getByRole('button', { name: /add( setting| notification)?|new|create/i })).first();
    this.intervalInput = page.getByTestId('interval').or(page.locator('input[name*="interval" i], input[type="number"]')).first();
    this.saveButton = page.getByRole('button', { name: /^(save|create|add|update)$/i }).first();
  }

  async open(): Promise<void> {
    await this.goto(ROUTES.account);
    await expect(this.page.getByRole('heading', { name: /account|settings/i }).first().or(this.notificationsTab)).toBeVisible({ timeout: 20_000 });
  }

  async openNotifications(): Promise<void> {
    if (await this.notificationsTab.isVisible().catch(() => false)) await this.notificationsTab.click();
  }

  async createSetting(interval: number): Promise<void> {
    await this.addSettingButton.click();
    await this.intervalInput.fill(String(interval)).catch(() => {});
    await this.saveButton.click();
  }

  async setInterval(value: number): Promise<void> {
    await this.intervalInput.fill(String(value));
  }
}
