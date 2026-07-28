// =============================================================================
//  ScreenDetailPage — per-screen config: volume, rotation, player controls.
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ScreenDetailPage extends BasePage {
  readonly volumeInput: Locator;
  readonly rotationControl: Locator;
  readonly saveButton: Locator;
  readonly restartButton: Locator;
  readonly transferLicenseButton: Locator;

  constructor(page: Page) {
    super(page);
    this.volumeInput = page.getByTestId('volume').or(page.locator('input[type="range"], input[name*="volume" i], input[aria-label*="volume" i]')).first();
    this.rotationControl = page.getByTestId('rotation').or(page.locator('select[name*="rotation" i], [aria-label*="rotation" i]')).first();
    this.saveButton = page.getByTestId('save-config').or(page.getByRole('button', { name: /^(save|apply|update)$/i })).first();
    this.restartButton = page.getByTestId('restart-player').or(page.getByRole('button', { name: /restart/i })).first();
    this.transferLicenseButton = page.getByTestId('transfer-license').or(page.getByRole('button', { name: /transfer licen[cs]e/i })).first();
  }

  async setVolume(value: number): Promise<void> {
    await this.volumeInput.fill(String(value)).catch(async () => {
      // range inputs: use keyboard/JS fallback
      await this.volumeInput.evaluate((el: HTMLInputElement, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
    });
  }

  async setRotation(value: number): Promise<void> {
    const tag = await this.rotationControl.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'div');
    if (tag === 'select') {
      await this.rotationControl.selectOption(String(value)).catch(() => {});
    } else {
      // option-button style
      await this.page.getByRole('button', { name: new RegExp(`^${value}°?$`) }).first().click().catch(() => {});
    }
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  async restart(): Promise<void> {
    await this.restartButton.click();
    await this.confirm().catch(() => {});
  }

  async transferLicense(): Promise<void> {
    await this.transferLicenseButton.click();
  }

  /** Read back the effective volume value (clamped by the app). */
  async currentVolume(): Promise<number> {
    const v = await this.volumeInput.inputValue().catch(() => '0');
    return Number(v);
  }
}
