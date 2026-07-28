// =============================================================================
//  CrudModule — generic list/create/edit/delete page object.
// =============================================================================
//  Most CMS modules (Groups, Clusters, Playlists, Rollouts, Roles, Notification
//  settings) share the same shape: a list with search, an "add" button that
//  opens a modal with a name field + submit, and per-row edit/delete. This base
//  captures that so each concrete page only declares its route + label nuances.
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export interface CrudConfig {
  route: string;
  /** Regex for the "add/new/create" entry button. */
  addLabel: RegExp;
  /** Regex for the submit/save button in the create/edit modal. */
  submitLabel?: RegExp;
  /** data-testid hints (used first when present). */
  testIds?: { add?: string; name?: string; submit?: string; search?: string };
  /** Confirm-button label for delete (Continue/Delete/Yes…). */
}

export class CrudModule extends BasePage {
  readonly cfg: CrudConfig;
  readonly searchBox: Locator;
  readonly addButton: Locator;
  readonly nameInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page, cfg: CrudConfig) {
    super(page);
    this.cfg = cfg;
    const t = cfg.testIds ?? {};
    this.searchBox = (t.search ? page.getByTestId(t.search) : page.getByRole('textbox', { name: /search/i }))
      .or(page.locator('input[placeholder*="search" i]')).first();
    this.addButton = (t.add ? page.getByTestId(t.add) : page.getByRole('button', { name: cfg.addLabel }))
      .or(page.getByRole('link', { name: cfg.addLabel })).first();
    this.nameInput = (t.name ? page.getByTestId(t.name) : page.getByRole('textbox', { name: /name|title/i })).first();
    this.submitButton = (t.submit ? page.getByTestId(t.submit) : page.getByRole('button', { name: cfg.submitLabel ?? /^(save|create|add|submit|continue)$/i })).first();
  }

  async open(): Promise<void> {
    await this.goto(this.cfg.route);
    await expect(this.addButton).toBeVisible({ timeout: 20_000 });
  }

  async openCreate(): Promise<void> {
    await this.addButton.click();
    await expect(this.openModal().or(this.nameInput)).toBeVisible({ timeout: 10_000 });
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async create(name: string): Promise<void> {
    await this.openCreate();
    await this.fillName(name);
    await this.submit();
  }

  async edit(name: string, newName: string): Promise<void> {
    await this.search(this.searchBox, name);
    const row = this.rowWith(name).first();
    await row.getByRole('button', { name: /edit|pencil/i }).first().click().catch(() => row.click());
    await this.nameInput.fill(newName);
    await this.submit();
  }

  async delete(name: string): Promise<void> {
    await this.search(this.searchBox, name);
    const row = this.rowWith(name).first();
    await row.getByRole('button', { name: /delete|remove|trash/i }).first().click();
    await this.confirm();
  }
}
