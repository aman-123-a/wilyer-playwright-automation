import { Page, expect, Locator } from '@playwright/test';

/** Step logger — surfaces structured progress in the test output. */
export const step = (msg: string) => console.log(`▶ ${msg}`);

export class BasePage {
  constructor(public readonly page: Page) {}

  async goto(pathname: string) {
    step(`goto ${pathname}`);
    await this.page.goto(pathname, { waitUntil: 'domcontentloaded' });
  }

  /** Returns true when a toast matching `text` surfaces within `timeout`. */
  async toastVisible(text: string | RegExp, timeout = 5_000): Promise<boolean> {
    const t = this.page
      .locator('.toast, .Toastify__toast, [class*="alert"]')
      .filter({ hasText: text });
    try {
      await expect(t.first()).toBeVisible({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  /** Wait until a Bootstrap modal (`#id`) is fully closed (no .show class). */
  async waitForModalClosed(modalId: string, timeout = 15_000) {
    await expect(this.page.locator(`#${modalId}.show`)).toBeHidden({ timeout });
  }

  /** Returns a locator for an open Bootstrap modal by id. */
  modal(modalId: string): Locator {
    return this.page.locator(`#${modalId}.show`);
  }
}
