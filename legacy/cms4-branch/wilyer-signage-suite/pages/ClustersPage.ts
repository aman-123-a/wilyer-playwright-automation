import { Page, Locator } from '@playwright/test';
import { CrudModule } from './CrudModule';
import { ROUTES } from '../config/routes';

export class ClustersPage extends CrudModule {
  readonly restartAllButton: Locator;
  readonly syncToggle: Locator;
  readonly liveDataToggle: Locator;

  constructor(page: Page) {
    super(page, {
      route: ROUTES.clusters,
      addLabel: /add cluster|new cluster|create cluster|add|new/i,
      submitLabel: /^(save|create|add|submit)$/i,
      testIds: { add: 'add-cluster', name: 'cluster-name', submit: 'cluster-submit' },
    });
    this.restartAllButton = page.getByTestId('restart-screens').or(page.getByRole('button', { name: /restart( screens| all)?/i })).first();
    this.syncToggle = page.getByTestId('sync-toggle').or(page.getByRole('switch', { name: /sync/i })).or(page.locator('[class*="toggle" i]').filter({ hasText: /sync/i })).first();
    this.liveDataToggle = page.getByTestId('live-data-toggle').or(page.getByRole('switch', { name: /live( data)?/i })).first();
  }

  async restartScreens(): Promise<void> {
    await this.restartAllButton.click();
    await this.confirm().catch(() => {});
  }

  async toggleSync(): Promise<void> {
    await this.syncToggle.click();
  }

  async toggleLiveData(): Promise<void> {
    await this.liveDataToggle.click();
  }
}
