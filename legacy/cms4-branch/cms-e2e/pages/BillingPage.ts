// =============================================================================
//  BillingPage — purchase & billing at /billing (plan-card layout, no table).
//  Selectors verified live against cms.pocsample.in (2026-05-25):
//   • Page heading: "Purchase & Billing".
//   • Tabs (buttons): "My Plans", "Buy Plan", "My Purchases", "Expiring Soon".
//   • Plan cards each render an "Available Licenses: n" sub-heading.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class BillingPage extends BasePage {
  readonly heading: Locator;
  readonly myPlansTab: Locator;
  readonly buyPlanTab: Locator;
  readonly myPurchasesTab: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.heading = page.getByRole('heading', { name: /purchase & billing/i });
    this.myPlansTab = page.getByRole('button', { name: /my plans/i });
    this.buyPlanTab = page.getByRole('button', { name: /buy plan/i });
    this.myPurchasesTab = page.getByRole('button', { name: /my purchases/i });
  }

  async open(): Promise<this> {
    await this.goto('/billing');
    await this.expectShellReady();
    await expect(this.heading).toBeVisible({ timeout: 20_000 });
    return this;
  }

  /** Plan cards — surfaced via their "Available Licenses" sub-heading. */
  planCards(): Locator {
    return this.page.getByText(/available licenses/i);
  }

  async planCount(): Promise<number> {
    return this.planCards().count();
  }

  async expectPlansLoaded(): Promise<this> {
    const loaded = await expect
      .poll(async () => (await this.planCount()) > 0, { timeout: 30_000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (!loaded) {
      const empty = await this.page.getByText(/no (plan|purchase|data)/i).first()
        .isVisible().catch(() => false);
      expect(empty, 'billing shows plans or an empty state').toBeTruthy();
    }
    return this;
  }

  async openTab(tab: 'plans' | 'buy' | 'purchases'): Promise<this> {
    const map = { plans: this.myPlansTab, buy: this.buyPlanTab, purchases: this.myPurchasesTab };
    await map[tab].first().click();
    await this.page.waitForLoadState('domcontentloaded');
    return this;
  }
}

export default BillingPage;
