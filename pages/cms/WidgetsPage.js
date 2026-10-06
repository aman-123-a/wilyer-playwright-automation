// =============================================================================
//  WidgetsPage — Library → Widgets → AQI / Weather (list, create, reopen, preview).
//  API base + auth token are learned from the app's own traffic, so the page
//  object follows whichever CMS environment BASE_URL points at.
// =============================================================================

import { BasePage } from './BasePage.js';

export class WidgetsPage extends BasePage {
  constructor(page) {
    super(page);
    this.apiBase = null;
    this.token = null;
    this.lastCreate = null; // { status, id, body }
    page.on('request', (r) => {
      const m = r.url().match(/^(https:\/\/[^/]+)\/v3\/cms\//);
      if (m && r.headers()['authorization']) {
        this.apiBase = m[1];
        this.token = r.headers()['authorization'];
      }
    });
    page.on('response', async (r) => {
      if (r.request().method() === 'POST' && /\/v3\/cms\/widget\/create/.test(r.url())) {
        let j = null;
        try { j = await r.json(); } catch { /* non-JSON */ }
        this.lastCreate = { sent: r.request().postData(), status: r.status(), id: j?.id || j?._id || j?.data?._id || j?.data?.id || null, body: j };
      }
    });
  }

  /** Open Library → Widgets → <AQI|Weather> list. */
  async openType(label) {
    await this.page.goto(this.url('/library'), { waitUntil: 'domcontentloaded' });
    await this.page.getByText(/^Widgets \(\d+\)$/).first().click({ timeout: 60_000 });
    await this.page.getByText(new RegExp(`^${label} \\(\\d+\\)$`)).first().click({ timeout: 20_000 });
  }

  get dialog() { return this.page.getByRole('dialog'); }

  async openCreateDialog() {
    await this.page.getByRole('button', { name: /add new/i }).click();
    await this.dialog.waitFor({ timeout: 10_000 });
    return this.dialog;
  }

  /** Type into city field `idx` and take the first Google Places suggestion. */
  async pickCity(idx, text) {
    const input = this.dialog.locator('input[name="city1"]').nth(idx);
    await input.click();
    await input.pressSequentially(text, { delay: 60 });
    const first = this.page.locator('.pac-item').first();
    await first.waitFor({ timeout: 10_000 });
    // The form only stores cities/coordinates once Google's place-details call
    // resolves after the click; saving earlier sends cities:[] (-> "No city found.").
    const details = this.page.waitForResponse((r) => /maps\.googleapis\.com|places/i.test(r.url()), { timeout: 5_000 }).catch(() => null);
    await first.click();
    await details;
    await this.page.waitForTimeout(800);
  }

  /** Fill name + city, Save, and return the create response. */
  async createWidget(name, city) {
    this.lastCreate = null;
    const d = await this.openCreateDialog();
    await d.locator('input[name="name"]').fill(name);
    await this.pickCity(0, city);
    const created = this.page.waitForResponse((r) => /\/widget\/create/.test(r.url()), { timeout: 20_000 });
    await d.getByRole('button', { name: /^save$/i }).click();
    await created;
    await this.page.waitForTimeout(300); // let the response handler record the body
    return this.lastCreate;
  }

  async searchList(name) {
    const box = this.page.getByRole('textbox', { name: /^search/i }).last();
    await box.fill(name);
    return this.page.locator('p', { hasText: new RegExp(`^${name}$`) }).first();
  }

  async rowEditButton(row) {
    await row.locator('xpath=..').getByRole('button').first().click();
    await this.dialog.waitFor({ timeout: 10_000 });
    return this.dialog;
  }

  // ── API helpers (use the session's own token) ────────────────────────────
  async api(method, route) {
    const res = await this.page.request.fetch(`${this.apiBase}${route}`, {
      method,
      headers: { authorization: this.token },
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status(), json };
  }

  async findByName(type, name) {
    const r = await this.api(
      'GET',
      `/v3/cms/widget/read?page=1&limit=50&type=${type}&search=${encodeURIComponent(name)}&sort=createdAt&order=-1&folderId=`,
    );
    return (r.json?.docs || []).find((d) => d.name === name) || null;
  }

  async deleteById(id) {
    return this.api('DELETE', `/v3/cms/widget/delete/${id}`);
  }
}
