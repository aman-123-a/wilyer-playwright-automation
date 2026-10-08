// Base page — shared navigation + wait helpers for Maker/Checker POM classes
export class BasePage {
  constructor(page) {
    this.page = page;
  }

  async goto(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  // Wait for network + any spinners to settle, but never block forever
  async waitForIdle(timeout = 15_000) {
    await this.page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  }

  async screenshot(name) {
    await this.page.screenshot({ path: `reports/screenshots/${name}-${Date.now()}.png`, fullPage: true });
  }
}
