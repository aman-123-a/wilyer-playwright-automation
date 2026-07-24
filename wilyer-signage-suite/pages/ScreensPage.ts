// =============================================================================
//  ScreensPage — list + CRUD for the Screens module.
// =============================================================================
//  Selectors are layered: data-testid first, then role/label, then text. Where
//  the live attribute is unconfirmed the fallback chain keeps the test running;
//  tighten to a single testid once the app exposes one.
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { ROUTES } from '../config/routes';
import type { ScreenData } from '../utils/dataGenerators';

export class ScreensPage extends BasePage {
  readonly searchBox: Locator;
  readonly addButton: Locator;
  readonly nameInput: Locator;
  readonly pairingInput: Locator;
  readonly tagsInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.searchBox = page.getByRole('textbox', { name: /search/i }).or(page.locator('input[placeholder*="search" i]')).first();
    this.addButton = page.getByTestId('add-screen').or(page.getByRole('button', { name: /add screen|new screen|pair|create/i })).first();
    this.nameInput = page.getByTestId('screen-name').or(page.getByRole('textbox', { name: /name/i })).first();
    this.pairingInput = page.getByTestId('pairing-code').or(page.getByRole('textbox', { name: /pair|code/i })).first();
    this.tagsInput = page.getByTestId('screen-tags').or(page.locator('input[placeholder*="tag" i]')).first();
    this.submitButton = page.getByTestId('screen-submit').or(page.getByRole('button', { name: /^(save|create|add|pair|submit)$/i })).first();
  }

  async open(): Promise<void> {
    await this.goto(ROUTES.screens);
    await expect(this.addButton).toBeVisible({ timeout: 20_000 });
  }

  async openCreate(): Promise<void> {
    await this.addButton.click();
    await expect(this.openModal().or(this.nameInput)).toBeVisible({ timeout: 10_000 });
  }

  /** Fill the create form. Does not submit — lets boundary tests assert pre-submit. */
  async fillForm(data: Partial<ScreenData>): Promise<void> {
    if (data.name !== undefined) await this.nameInput.fill(data.name);
    if (data.pairingCode !== undefined && (await this.pairingInput.count())) {
      await this.pairingInput.fill(data.pairingCode).catch(() => {});
    }
    if (data.tags?.length && (await this.tagsInput.count())) {
      for (const tag of data.tags) {
        await this.tagsInput.fill(tag);
        await this.tagsInput.press('Enter').catch(() => {});
      }
    }
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async create(data: ScreenData): Promise<void> {
    await this.openCreate();
    await this.fillForm(data);
    await this.submit();
  }

  async openDetail(name: string): Promise<void> {
    await this.search(this.searchBox, name);
    await this.rowWith(name).first().click();
  }

  async edit(name: string, newName: string): Promise<void> {
    await this.search(this.searchBox, name);
    const row = this.rowWith(name).first();
    await row.getByRole('button', { name: /edit/i }).first().click().catch(async () => {
      await row.click();
    });
    await this.nameInput.fill(newName);
    await this.submit();
  }

  async delete(name: string): Promise<void> {
    await this.search(this.searchBox, name);
    const row = this.rowWith(name).first();
    await row.getByRole('button', { name: /delete|remove|trash/i }).first().click();
    await this.confirm();
  }

  /** Restore from a deleted/trash tab if the app exposes one. */
  async restore(name: string): Promise<void> {
    const trashTab = this.page.getByRole('tab', { name: /deleted|trash|archive/i }).or(
      this.page.getByRole('link', { name: /deleted|trash|archive/i }),
    ).first();
    await trashTab.click();
    await this.search(this.searchBox, name);
    await this.rowWith(name).first().getByRole('button', { name: /restore|recover/i }).first().click();
    await this.confirm().catch(() => {});
  }
}
