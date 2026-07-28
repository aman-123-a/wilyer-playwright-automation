// =============================================================================
//  BasePage — shared building blocks for every page object.
// =============================================================================
//  Encapsulates the app-specific quirks learned on the real CMS:
//   • NEVER wait on 'networkidle' (long-lived analytics connections never
//     settle) — wait on concrete UI signals instead.
//   • Search inputs need pressSequentially (debounced, not value-bound).
//   • Toasts come from react-toastify / bootstrap alert containers.
//   • Confirm dialogs use varying button labels (Continue / Confirm / Delete / Yes).
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';

export const step = (msg: string) => console.log(`▶ ${msg}`);

export class BasePage {
  constructor(public readonly page: Page) {}

  /** Navigate to a path and wait for DOM (not network) to be ready. */
  async goto(pathname: string): Promise<void> {
    step(`goto ${pathname}`);
    await this.page.goto(pathname, { waitUntil: 'domcontentloaded' });
  }

  /** Reload without waiting on networkidle. */
  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
  }

  /** Type into a debounced search box character-by-character. */
  async search(input: Locator, text: string): Promise<void> {
    await input.click();
    await input.fill('');
    await input.pressSequentially(text, { delay: 40 });
    await this.page.waitForTimeout(600); // let debounce settle
  }

  /** A toast/alert matching `text`, scoped to common container classes. */
  toast(text: string | RegExp): Locator {
    return this.page
      .locator('.toast, .Toastify__toast, [role="alert"], [class*="alert"]')
      .filter({ hasText: text });
  }

  async expectToast(text: string | RegExp, timeout = 8_000): Promise<void> {
    await expect(this.toast(text).first()).toBeVisible({ timeout });
  }

  async toastVisible(text: string | RegExp, timeout = 6_000): Promise<boolean> {
    return this.toast(text).first().isVisible({ timeout }).catch(() => false);
  }

  /** Click the first available confirm button in an open dialog/modal. */
  async confirm(): Promise<void> {
    const btn = this.page
      .getByRole('button', { name: /^(continue|confirm|delete|yes|ok|remove|proceed|save)$/i })
      .first();
    await btn.click();
  }

  /** A visible Bootstrap-style modal (`.show`) or generic dialog/role. */
  openModal(id?: string): Locator {
    if (id) return this.page.locator(`#${id}.show, #${id}[style*="display: block"]`);
    return this.page.locator('[role="dialog"], .modal.show, [class*="modal"][class*="open"]').first();
  }

  async waitForModalClosed(id?: string, timeout = 15_000): Promise<void> {
    if (id) {
      await expect(this.page.locator(`#${id}.show`)).toBeHidden({ timeout });
    } else {
      await expect(this.openModal()).toBeHidden({ timeout });
    }
  }

  /** Prefer a data-testid; fall back to role+name. */
  byTestId(id: string): Locator {
    return this.page.getByTestId(id);
  }

  /** Resilient action button lookup: testid → role-button → text. */
  action(name: string | RegExp, testId?: string): Locator {
    if (testId) {
      const t = this.page.getByTestId(testId);
      return t;
    }
    return this.page.getByRole('button', { name }).first();
  }

  /** Wait until a row containing `text` appears in any table/list. */
  rowWith(text: string | RegExp): Locator {
    return this.page
      .locator('tr, [role="row"], [class*="list-item"], [class*="card"]')
      .filter({ hasText: text });
  }

  async expectRow(text: string | RegExp, timeout = 12_000): Promise<void> {
    await expect(this.rowWith(text).first()).toBeVisible({ timeout });
  }

  async expectNoRow(text: string | RegExp, timeout = 12_000): Promise<void> {
    await expect(this.rowWith(text).first()).toBeHidden({ timeout });
  }
}
