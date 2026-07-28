import { Page, expect } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** Wait for a named toast/alert; useful because the CMS stacks multiple alerts. */
  async expectToast(text: string | RegExp): Promise<void> {
    const toast = this.page.getByRole('alert').filter({ hasText: text }).first();
    await expect(toast).toBeVisible();
  }

  async dismissToasts(): Promise<void> {
    const closeBtns = this.page.getByRole('button', { name: /close/i });
    const count = await closeBtns.count();
    for (let i = 0; i < count; i++) {
      await closeBtns.nth(0).click().catch(() => {});
    }
  }
}
