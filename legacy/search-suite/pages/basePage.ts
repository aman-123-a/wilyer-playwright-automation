// =============================================================================
//  BasePage — shared navigation + resilience primitives every page object uses.
//  Waits are signal-based (this app keeps long-lived connections, so we never
//  rely on 'networkidle').
// =============================================================================

import { type Page, type Locator, expect } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * Persistent chrome that MUST survive every error scenario. Scope to the
   * VISIBLE shell — this app ships a hidden mobile navbar (Bootstrap
   * `d-md-none`) that must not be matched at desktop widths.
   */
  get shell(): Locator {
    return this.page
      .locator('aside:visible, nav:visible, header:visible, [class*="sidebar" i]:visible')
      .first();
  }

  async goto(route: string): Promise<void> {
    await this.page.goto(route, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Assert the page is not a blank white screen. We check rendered text AND
   * DOM weight so a spinner-only or empty-state page still passes (those are
   * "rendered"), while a truly blank <body> fails.
   */
  async verifyNoWhiteScreen(context = 'page'): Promise<void> {
    const text = (await this.page.locator('body').innerText().catch(() => '')) ?? '';
    const domLen = (await this.page.content().catch(() => '')).length;
    expect(
      text.trim().length > 0 || domLen > 2_000,
      `blank white screen detected (${context})`,
    ).toBeTruthy();
  }

  /** App shell rendered and non-blank — the baseline "not crashed" assertion. */
  async expectShellReady(context = 'shell'): Promise<void> {
    await expect(this.page.locator('body')).toBeVisible();
    await this.verifyNoWhiteScreen(context);
  }
}

export default BasePage;
