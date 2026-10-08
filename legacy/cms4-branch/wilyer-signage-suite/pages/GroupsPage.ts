import { Page } from '@playwright/test';
import { CrudModule } from './CrudModule';
import { ROUTES } from '../config/routes';

export class GroupsPage extends CrudModule {
  constructor(page: Page) {
    super(page, {
      route: ROUTES.groups,
      addLabel: /add group|new group|create group|add|new/i,
      submitLabel: /^(save|create|add|continue|submit)$/i,
      testIds: { add: 'add-group', name: 'group-name', submit: 'group-submit' },
    });
  }

  /** Create a subgroup nested under an existing parent group. */
  async createSubgroup(parent: string, name: string): Promise<void> {
    await this.search(this.searchBox, parent);
    const row = this.rowWith(parent).first();
    await row.getByRole('button', { name: /add subgroup|sub-?group|add child|\+/i }).first().click()
      .catch(() => row.click());
    await this.nameInput.fill(name);
    await this.submit();
  }
}
