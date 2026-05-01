import { Page, Locator, expect } from '@playwright/test';

export type ScreenStatus = 'online' | 'offline' | 'unknown';

export interface PairScreenInput {
  pairingCode: string;
  name: string;
  group?: string;
}

export interface ScreenSettings {
  orientation?: 'landscape' | 'portrait';
  resolution?: string;
  timezone?: string;
  volume?: number;
}

export interface CustomField {
  key: string;
  value: string;
}

export class ScreensPage {
  readonly page: Page;

  // Top-level / list view
  readonly pairScreenButton: Locator;
  readonly searchInput: Locator;
  readonly filterButton: Locator;
  readonly screensGrid: Locator;
  readonly deletedTab: Locator;
  readonly activeTab: Locator;

  // Pair-screen modal
  readonly pairModal: Locator;
  readonly pairCodeInput: Locator;
  readonly pairNameInput: Locator;
  readonly pairGroupSelect: Locator;
  readonly pairSubmit: Locator;

  // Detail page tabs
  readonly tabOverview: Locator;
  readonly tabSchedules: Locator;
  readonly tabSettings: Locator;
  readonly tabDownloads: Locator;
  readonly tabUptime: Locator;
  readonly tabPlayer: Locator;
  readonly tabCustomFields: Locator;

  constructor(page: Page) {
    this.page = page;

    // Real DOM: button reads "+ New Screen" (no data-testid attributes on this app)
    this.pairScreenButton = page
      .getByTestId('pair-screen-btn')
      .or(page.getByRole('button', { name: /\+\s*New Screen/i }));

    this.searchInput = page
      .getByTestId('screens-search')
      .or(page.getByPlaceholder('Search...'));

    // Real DOM: "Filter" is a link rendered next to the search box
    this.filterButton = page
      .getByTestId('screens-filter')
      .or(page.getByRole('link', { name: /Filter/i }).last());

    // Real DOM: screens are rendered in a <table>, not cards
    this.screensGrid = page
      .getByTestId('screens-grid')
      .or(page.getByRole('table'));

    // Tabs are actually links: "All Screens (N)" / "Deleted Screens (N)"
    this.activeTab = page
      .getByTestId('tab-active-screens')
      .or(page.getByRole('link', { name: /All Screens/i }));

    this.deletedTab = page
      .getByTestId('tab-deleted-screens')
      .or(page.getByRole('link', { name: /Deleted Screens/i }));

    // Real DOM: pair modal is role="dialog" with heading "New Screen"
    this.pairModal = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /new screen/i }) });
    this.pairCodeInput = this.pairModal.getByRole('spinbutton');
    this.pairNameInput = this.pairModal.getByRole('textbox', { name: /enter screen name/i })
      .or(this.pairModal.getByPlaceholder('Enter screen name'));
    this.pairGroupSelect = this.pairModal.locator('select'); // no group field exists; kept for API compat
    this.pairSubmit = this.pairModal.getByRole('button', { name: /pair screen/i });

    this.tabOverview = page.getByTestId('tab-overview').or(page.getByRole('tab', { name: /overview/i }));
    this.tabSchedules = page.getByTestId('tab-schedules').or(page.getByRole('tab', { name: /schedules?/i }));
    this.tabSettings = page.getByTestId('tab-settings').or(page.getByRole('tab', { name: /settings/i }));
    this.tabDownloads = page.getByTestId('tab-downloads').or(page.getByRole('tab', { name: /downloads?|files?/i }));
    this.tabUptime = page.getByTestId('tab-uptime').or(page.getByRole('tab', { name: /uptime/i }));
    this.tabPlayer = page.getByTestId('tab-player').or(page.getByRole('tab', { name: /player/i }));
    this.tabCustomFields = page
      .getByTestId('tab-custom-fields')
      .or(page.getByRole('tab', { name: /custom fields?/i }));
  }

  async goto(): Promise<void> {
    await this.page.goto('/screens', { waitUntil: 'domcontentloaded' });
    await expect(this.pairScreenButton).toBeVisible();
    // The page polls 4370 screens for live status — networkidle never settles.
    // Wait for the first table body row (or empty state) instead.
    await expect(
      this.screensGrid.locator('tbody tr').first().or(this.page.getByText(/no screens/i)),
    ).toBeVisible({ timeout: 30_000 });
  }

  /** Row locator for a screen identified by visible name (substring match). */
  card(name: string): Locator {
    return this.screensGrid.locator('tbody tr').filter({ hasText: name }).first();
  }

  async openScreen(name: string): Promise<void> {
    const row = this.card(name);
    await expect(row).toBeVisible();
    await row.getByRole('link', { name: /view detail/i }).click();
    // Real detail URL is /screen-settings/<hex>, not /screens/<id>
    await this.page.waitForURL(/\/screen-settings\/[a-f0-9]+/i);
  }

  // ─── List operations ────────────────────────────────────────────────────────
  /** networkidle never settles on this page (live status polling) — debounce via short wait. */
  private async waitForListSettled(): Promise<void> {
    // Wait for either rows to update or empty-state — capped at 5s
    await this.page.waitForTimeout(800);
  }

  async searchScreens(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.waitForListSettled();
  }

  async clearSearch(): Promise<void> {
    await this.searchInput.fill('');
    await this.waitForListSettled();
  }

  /** Real DOM: chip-style filter — clicking a chip applies immediately, no Apply button. */
  filterDialog(): Locator {
    return this.page.getByRole('dialog').filter({ has: this.page.getByRole('heading', { name: /^filters$/i }) });
  }

  async openFilters(): Promise<Locator> {
    await this.filterButton.click();
    const dialog = this.filterDialog();
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async closeFilters(): Promise<void> {
    const dialog = this.filterDialog();
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.getByText('×').first().click().catch(() => this.page.keyboard.press('Escape'));
    }
  }

  /**
   * Apply a single filter chip — e.g. orientation: "Landscape", status: "Online".
   * Returns the chip locator that was clicked so callers can verify selected state.
   */
  async applyFilterChip(label: string): Promise<Locator> {
    const dialog = await this.openFilters();
    const chip = dialog.getByText(new RegExp(`^${label}$`, 'i'), { exact: false }).first();
    await expect(chip).toBeVisible();
    await chip.click();
    await this.waitForListSettled();
    return chip;
  }

  /** @deprecated Real UI has no "group" filter — use applyFilterChip instead. */
  async applyFilter(group: string, status?: ScreenStatus): Promise<void> {
    await this.applyFilterChip(group);
    if (status) await this.applyFilterChip(status);
  }

  /**
   * Returns the names visible in the current table page.
   * The Screen Name cell contains an <img alt="os"> followed by the actual name —
   * we strip the leading "os " so callers get clean names back.
   */
  async getVisibleScreenNames(): Promise<string[]> {
    const rows = await this.screensGrid.locator('tbody tr').all();
    const names: string[] = [];
    for (const row of rows) {
      // Column order: checkbox, #, Screen ID, Screen Name, Status, ...
      const cell = row.locator('td').nth(3);
      if (!(await cell.count())) continue;
      const raw = (await cell.innerText()).trim();
      const cleaned = raw.replace(/^os\s+/i, '').trim();
      if (cleaned) names.push(cleaned);
    }
    return names;
  }

  // ─── Pair / Delete / Recover ───────────────────────────────────────────────
  async pairScreen({ pairingCode, name, group }: PairScreenInput): Promise<void> {
    await this.pairScreenButton.click();
    await expect(this.pairModal).toBeVisible();
    await this.pairCodeInput.fill(pairingCode);
    await this.pairNameInput.fill(name);
    if (group) {
      const opts = await this.pairGroupSelect.locator('option').allTextContents();
      const match = opts.map(o => o.trim()).find(o => o.toLowerCase() === group.toLowerCase());
      if (match) await this.pairGroupSelect.selectOption({ label: match });
    }
    await this.pairSubmit.click();
    await expect(this.pairModal).toBeHidden();
    await expect(this.card(name)).toBeVisible();
  }

  async deleteScreen(name: string): Promise<void> {
    const card = this.card(name);
    await card.hover();
    const menu = card.getByTestId('screen-menu').or(card.getByRole('button', { name: /menu|options|more/i }).first());
    await menu.click();
    const del = this.page.getByTestId('menu-delete').or(this.page.getByRole('menuitem', { name: /delete|remove/i }));
    await del.click();
    const confirm = this.page.getByTestId('confirm-delete').or(this.page.getByRole('button', { name: /^(delete|confirm|yes)$/i }));
    await confirm.click();
    await expect(card).toBeHidden();
  }

  async openDeletedScreens(): Promise<void> {
    // The three tab links all point to /screens — toggle is via local state,
    // so we wait for the heading to reflect the deleted view instead of URL.
    await this.deletedTab.click();
    await expect(
      this.page.getByText(/deleted screens/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await this.waitForListSettled();
  }

  async recoverScreen(name: string): Promise<void> {
    await this.openDeletedScreens();
    const card = this.card(name);
    await expect(card).toBeVisible();
    const recover = card.getByTestId('recover-screen').or(card.getByRole('button', { name: /recover|restore/i }));
    await recover.click();
    const confirm = this.page.getByRole('button', { name: /^(recover|restore|confirm|yes)$/i });
    if (await confirm.count()) await confirm.click();
    await expect(card).toBeHidden();
    await this.activeTab.click();
    await expect(this.card(name)).toBeVisible();
  }

  // ─── Status (real-time) ────────────────────────────────────────────────────
  /** Status cell is the 5th column (index 4): checkbox, #, ScreenID, Name, Status, ... */
  private statusCell(row: Locator): Locator {
    return row.locator('td').nth(4);
  }

  async getScreenStatus(name: string): Promise<ScreenStatus> {
    const row = this.card(name);
    await expect(row).toBeVisible();
    const cell = this.statusCell(row);
    const text = (await cell.innerText()).trim().toLowerCase();
    if (text.includes('online')) return 'online';
    if (text.includes('offline')) return 'offline';
    return 'unknown';
  }

  /** Wait until the status cell transitions to the target value (no hard waits). */
  async waitForScreenStatus(name: string, expected: ScreenStatus, timeoutMs = 60_000): Promise<void> {
    const row = this.card(name);
    await expect(this.statusCell(row)).toHaveText(new RegExp(expected, 'i'), { timeout: timeoutMs });
  }

  // ─── Edit details ──────────────────────────────────────────────────────────
  async editScreenDetails(currentName: string, updates: { name?: string; description?: string; group?: string }): Promise<void> {
    await this.openScreen(currentName);
    const editBtn = this.page.getByTestId('edit-screen').or(this.page.getByRole('button', { name: /^edit$/i }));
    await editBtn.click();
    const modal = this.page.getByTestId('edit-screen-modal').or(this.page.locator('[role="dialog"]').last());
    await expect(modal).toBeVisible();

    if (updates.name) {
      const input = modal.getByTestId('edit-name').or(modal.getByLabel(/name/i));
      await input.fill(updates.name);
    }
    if (updates.description) {
      const input = modal.getByTestId('edit-description').or(modal.getByLabel(/description/i));
      await input.fill(updates.description);
    }
    if (updates.group) {
      const select = modal.getByTestId('edit-group').or(modal.locator('select'));
      await select.selectOption({ label: updates.group });
    }

    const save = modal.getByTestId('save-screen').or(modal.getByRole('button', { name: /^(save|update)$/i }));
    await save.click();
    await expect(modal).toBeHidden();
  }

  // ─── Assign media ──────────────────────────────────────────────────────────
  async assignMedia(screenName: string, mediaName: string): Promise<void> {
    await this.openScreen(screenName);
    const assignBtn = this.page.getByTestId('assign-media').or(this.page.getByRole('button', { name: /assign media|assign content/i }));
    await assignBtn.click();
    const modal = this.page.getByTestId('assign-media-modal').or(this.page.locator('[role="dialog"]').last());
    await expect(modal).toBeVisible();
    const search = modal.getByTestId('media-search').or(modal.getByPlaceholder(/search media/i));
    if (await search.count()) await search.fill(mediaName);
    const item = modal.getByTestId(`media-item-${mediaName}`).or(modal.getByText(mediaName, { exact: false }).first());
    await item.click();
    const confirm = modal.getByTestId('assign-confirm').or(modal.getByRole('button', { name: /^(assign|add|confirm)$/i }));
    await confirm.click();
    await expect(modal).toBeHidden();
    await expect(this.page.getByText(mediaName).first()).toBeVisible();
  }

  // ─── Schedules / Settings ──────────────────────────────────────────────────
  async openSchedules(screenName: string): Promise<void> {
    await this.openScreen(screenName);
    await this.tabSchedules.click();
    await expect(this.page.getByTestId('schedules-panel').or(this.page.getByRole('region', { name: /schedules?/i }))).toBeVisible();
  }

  async updateSettings(screenName: string, settings: ScreenSettings): Promise<void> {
    await this.openScreen(screenName);
    await this.tabSettings.click();
    const panel = this.page.getByTestId('settings-panel').or(this.page.getByRole('region', { name: /settings/i }));
    await expect(panel).toBeVisible();

    if (settings.orientation) {
      const radio = panel.getByRole('radio', { name: new RegExp(settings.orientation, 'i') });
      await radio.check();
    }
    if (settings.resolution) {
      const select = panel.getByTestId('setting-resolution').or(panel.getByLabel(/resolution/i));
      await select.selectOption({ label: settings.resolution });
    }
    if (settings.timezone) {
      const select = panel.getByTestId('setting-timezone').or(panel.getByLabel(/timezone/i));
      await select.selectOption({ label: settings.timezone });
    }
    if (settings.volume !== undefined) {
      const input = panel.getByTestId('setting-volume').or(panel.getByLabel(/volume/i));
      await input.fill(String(settings.volume));
    }

    const save = panel.getByTestId('save-settings').or(panel.getByRole('button', { name: /^(save|apply)$/i }));
    await save.click();
    await expect(panel.getByText(/saved|updated|success/i).first()).toBeVisible();
  }

  // ─── Apply update / Restart ────────────────────────────────────────────────
  async applyUpdateToScreen(screenName: string): Promise<void> {
    await this.openScreen(screenName);
    const updateBtn = this.page.getByTestId('apply-update').or(this.page.getByRole('button', { name: /apply update|update player/i }));
    await expect(updateBtn).toBeEnabled();
    await updateBtn.click();
    const confirm = this.page.getByRole('button', { name: /^(update|confirm|yes)$/i });
    if (await confirm.count()) await confirm.click();
    await expect(this.page.getByText(/updating|update queued|update sent/i).first()).toBeVisible();
  }

  async restartScreenAndPlayer(screenName: string): Promise<void> {
    await this.openScreen(screenName);
    const moreBtn = this.page.getByTestId('screen-actions').or(this.page.getByRole('button', { name: /actions|more/i }));
    await moreBtn.click();
    const restart = this.page.getByTestId('action-restart').or(this.page.getByRole('menuitem', { name: /restart (screen|player|both)/i }));
    await restart.click();
    const confirm = this.page.getByRole('button', { name: /^(restart|confirm|yes)$/i });
    if (await confirm.count()) await confirm.click();
    await expect(this.page.getByText(/restart (queued|sent|initiated)/i).first()).toBeVisible();
  }

  // ─── Sub-tabs: Downloads / Uptime / Player ─────────────────────────────────
  async getDownloadedFiles(screenName: string): Promise<string[]> {
    await this.openScreen(screenName);
    await this.tabDownloads.click();
    const panel = this.page.getByTestId('downloads-panel').or(this.page.getByRole('region', { name: /downloads?|files?/i }));
    await expect(panel).toBeVisible();
    const rows = await panel.locator('[data-testid^="download-row"], tr, [class*="row"]').all();
    const files: string[] = [];
    for (const r of rows) {
      const t = (await r.innerText()).trim();
      if (t) files.push(t);
    }
    return files;
  }

  async getUptimeReport(screenName: string): Promise<{ rangeLabel: string; metricVisible: boolean }> {
    await this.openScreen(screenName);
    await this.tabUptime.click();
    const panel = this.page.getByTestId('uptime-panel').or(this.page.getByRole('region', { name: /uptime/i }));
    await expect(panel).toBeVisible();
    const range = panel.getByTestId('uptime-range').or(panel.locator('[class*="range"], [class*="period"]').first());
    const metric = panel.getByTestId('uptime-metric').or(panel.locator('[class*="percent"], [class*="metric"]').first());
    return {
      rangeLabel: (await range.innerText().catch(() => '')).trim(),
      metricVisible: await metric.isVisible(),
    };
  }

  async getPlayerInfo(screenName: string): Promise<Record<string, string>> {
    await this.openScreen(screenName);
    await this.tabPlayer.click();
    const panel = this.page.getByTestId('player-info').or(this.page.getByRole('region', { name: /player/i }));
    await expect(panel).toBeVisible();
    const rows = panel.locator('[data-testid^="player-row"], dl > div, tr');
    const out: Record<string, string> = {};
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const k = (await row.locator('dt, th, [class*="label"], [class*="key"]').first().innerText().catch(() => '')).trim();
      const v = (await row.locator('dd, td, [class*="value"]').first().innerText().catch(() => '')).trim();
      if (k) out[k] = v;
    }
    return out;
  }

  // ─── Custom fields ─────────────────────────────────────────────────────────
  async addCustomField(screenName: string, field: CustomField): Promise<void> {
    await this.openScreen(screenName);
    await this.tabCustomFields.click();
    const panel = this.page.getByTestId('custom-fields-panel').or(this.page.getByRole('region', { name: /custom fields?/i }));
    await expect(panel).toBeVisible();

    const addBtn = panel.getByTestId('add-custom-field').or(panel.getByRole('button', { name: /add (field|custom)/i }));
    await addBtn.click();

    const keyInput = panel.getByTestId('cf-key').or(panel.getByLabel(/key|name/i)).last();
    const valInput = panel.getByTestId('cf-value').or(panel.getByLabel(/value/i)).last();
    await keyInput.fill(field.key);
    await valInput.fill(field.value);

    const save = panel.getByTestId('cf-save').or(panel.getByRole('button', { name: /^(save|add)$/i }));
    await save.click();
    await expect(panel.getByText(field.key, { exact: false }).first()).toBeVisible();
    await expect(panel.getByText(field.value, { exact: false }).first()).toBeVisible();
  }

  // ─── Transfer license ──────────────────────────────────────────────────────
  async transferLicense(screenName: string, targetEmail: string): Promise<void> {
    await this.openScreen(screenName);
    const moreBtn = this.page.getByTestId('screen-actions').or(this.page.getByRole('button', { name: /actions|more/i }));
    await moreBtn.click();
    const transfer = this.page.getByTestId('action-transfer').or(this.page.getByRole('menuitem', { name: /transfer (license|screen)/i }));
    await transfer.click();
    const modal = this.page.getByTestId('transfer-license-modal').or(this.page.locator('[role="dialog"]').last());
    await expect(modal).toBeVisible();
    const emailInput = modal.getByTestId('transfer-email').or(modal.getByLabel(/email/i));
    await emailInput.fill(targetEmail);
    const submit = modal.getByTestId('transfer-submit').or(modal.getByRole('button', { name: /^(transfer|submit|confirm)$/i }));
    await submit.click();
    await expect(modal).toBeHidden();
    await expect(this.page.getByText(/transfer (initiated|queued|sent|requested)/i).first()).toBeVisible();
  }
}

export class LoginPage {
  readonly page: Page;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.email = page.getByTestId('login-email').or(page.locator('input[name="email"]'));
    this.password = page.getByTestId('login-password').or(page.locator('input[name="password"]'));
    this.submit = page.getByTestId('login-submit').or(page.getByRole('button', { name: /log\s*in|sign\s*in/i }));
  }

  async login(email: string, password: string): Promise<void> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
    await expect(this.page.getByRole('link', { name: /screens|dashboard/i }).first()).toBeVisible({ timeout: 30_000 });
  }
}
