import { logger } from './logger.js';

/**
 * Agent — a thin wrapper around a Playwright Page that adds:
 *   • step logging (before/after every action)
 *   • automatic retries with backoff
 *   • dynamic selector resolution (string | Locator | { role, name } | { testId } | { label })
 *   • web-first waits so you don't hand-roll sleeps
 *
 * Usage:
 *   const agent = new Agent(page);
 *   await agent.goto('https://cms.pocsample.in/');
 *   await agent.fill({ role: 'textbox', name: /email/i }, 'dev@wilyer.com');
 *   await agent.click({ role: 'button', name: /log in/i });
 *   await agent.expectVisible({ testId: 'dashboard' });
 */
export class Agent {
  constructor(page, { retries = 2, timeout = 15_000 } = {}) {
    this.page = page;
    this.retries = retries;
    this.timeout = timeout;
  }

  // ── internal helpers ──────────────────────────────────────────────────────

  async _withRetry(stepName, action) {
    let lastErr;
    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      try {
        logger.step(`${stepName}${attempt > 1 ? ` (retry ${attempt - 1})` : ''}`);
        const result = await action();
        logger.pass(stepName);
        return result;
      } catch (err) {
        lastErr = err;
        logger.fail(`${stepName} — ${err.message.split('\n')[0]}`);
        if (attempt > this.retries) break;
        await this.page.waitForTimeout(500 * attempt); // simple linear backoff
      }
    }
    throw lastErr;
  }

  // Resolve a dynamic selector into a Playwright Locator.
  _resolve(selector) {
    if (!selector) throw new Error('Agent: selector is required');
    if (typeof selector === 'string') return this.page.locator(selector);
    if (selector.constructor?.name === 'Locator') return selector;
    if (selector.role)     return this.page.getByRole(selector.role, { name: selector.name });
    if (selector.testId)   return this.page.getByTestId(selector.testId);
    if (selector.label)    return this.page.getByLabel(selector.label);
    if (selector.text)     return this.page.getByText(selector.text);
    if (selector.placeholder) return this.page.getByPlaceholder(selector.placeholder);
    throw new Error(`Agent: unsupported selector shape: ${JSON.stringify(selector)}`);
  }

  _describe(selector) {
    if (typeof selector === 'string') return selector;
    try { return JSON.stringify(selector); } catch { return '[locator]'; }
  }

  // ── public actions ────────────────────────────────────────────────────────

  async goto(url) {
    return this._withRetry(`Navigate → ${url}`, async () => {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeout });
    });
  }

  async click(selector) {
    return this._withRetry(`Click ${this._describe(selector)}`, async () => {
      const loc = this._resolve(selector);
      await loc.waitFor({ state: 'visible', timeout: this.timeout });
      await loc.click();
    });
  }

  async fill(selector, value) {
    return this._withRetry(`Fill ${this._describe(selector)} = "${value}"`, async () => {
      const loc = this._resolve(selector);
      await loc.waitFor({ state: 'visible', timeout: this.timeout });
      await loc.fill(value);
    });
  }

  async type(selector, value, { delay = 50 } = {}) {
    return this._withRetry(`Type into ${this._describe(selector)}`, async () => {
      const loc = this._resolve(selector);
      await loc.waitFor({ state: 'visible', timeout: this.timeout });
      await loc.pressSequentially(value, { delay });
    });
  }

  async expectVisible(selector) {
    return this._withRetry(`Assert visible ${this._describe(selector)}`, async () => {
      const loc = this._resolve(selector);
      await loc.waitFor({ state: 'visible', timeout: this.timeout });
    });
  }

  async expectHidden(selector) {
    return this._withRetry(`Assert hidden ${this._describe(selector)}`, async () => {
      const loc = this._resolve(selector);
      await loc.waitFor({ state: 'hidden', timeout: this.timeout });
    });
  }

  async expectText(selector, expected) {
    return this._withRetry(`Assert text "${expected}" in ${this._describe(selector)}`, async () => {
      const loc = this._resolve(selector);
      await loc.waitFor({ state: 'visible', timeout: this.timeout });
      const actual = (await loc.innerText()).trim();
      const ok = expected instanceof RegExp ? expected.test(actual) : actual.includes(expected);
      if (!ok) throw new Error(`Expected "${expected}", got "${actual}"`);
    });
  }

  async scrollTo(selector) {
    return this._withRetry(`Scroll to ${this._describe(selector)}`, async () => {
      const loc = this._resolve(selector);
      await loc.scrollIntoViewIfNeeded({ timeout: this.timeout });
    });
  }

  async waitForUrl(urlRegex) {
    return this._withRetry(`Wait for URL ${urlRegex}`, async () => {
      await this.page.waitForURL(urlRegex, { timeout: this.timeout });
    });
  }
}
