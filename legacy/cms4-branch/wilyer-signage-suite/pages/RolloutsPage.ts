// =============================================================================
//  RolloutsPage — content rollouts: create, add rows, content, save, publish.
// =============================================================================
import { Page, Locator } from '@playwright/test';
import { CrudModule } from './CrudModule';
import { ROUTES } from '../config/routes';

export class RolloutsPage extends CrudModule {
  readonly descriptionInput: Locator;
  readonly addRowButton: Locator;
  readonly saveButton: Locator;
  readonly publishButton: Locator;

  constructor(page: Page) {
    super(page, {
      route: ROUTES.rollouts,
      addLabel: /add rollout|new rollout|create rollout|add|new|create/i,
      submitLabel: /^(create|save|next|continue)$/i,
      testIds: { add: 'add-rollout', name: 'rollout-name', submit: 'rollout-submit' },
    });
    this.descriptionInput = page.getByTestId('rollout-desc').or(page.getByRole('textbox', { name: /description/i })).first();
    this.addRowButton = page.getByTestId('add-row').or(page.getByRole('button', { name: /add row|new row|\+ row/i })).first();
    this.saveButton = page.getByTestId('rollout-save').or(page.getByRole('button', { name: /^(save|save draft)$/i })).first();
    this.publishButton = page.getByTestId('rollout-publish').or(page.getByRole('button', { name: /publish|go live/i })).first();
  }

  async createRollout(name: string, description = ''): Promise<void> {
    await this.openCreate();
    await this.fillName(name);
    if (description && (await this.descriptionInput.count())) await this.descriptionInput.fill(description);
    await this.submit();
  }

  async addRow(code = ''): Promise<void> {
    await this.addRowButton.click();
    if (code) {
      const codeCell = this.page.getByRole('textbox', { name: /code|name/i }).last();
      await codeCell.fill(code).catch(() => {});
    }
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  async publish(): Promise<void> {
    await this.publishButton.click();
    await this.confirm().catch(() => {});
  }
}
