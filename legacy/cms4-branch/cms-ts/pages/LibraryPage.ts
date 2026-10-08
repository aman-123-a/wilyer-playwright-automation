import { expect } from '@playwright/test';
import { BasePage, step } from './BasePage';
// step() also re-exported below for callers that import via this file
export { step };

export class LibraryPage extends BasePage {
  /** Sidebar link to the Library workspace. */
  get sidebarLibrary() {
    return this.page.locator('a[href="/library"]').first();
  }

  /** Tab inside Library that switches to the Media Sets list. */
  get mediaSetsTab() {
    return this.page.getByRole('link', { name: /Media Sets/i });
  }

  /** "+ New" button at the top of the Media Sets list. */
  get newMediaSetButton() {
    // Title-attr fallback handles cases where the icon eats the accessible name
    return this.page
      .locator('button')
      .filter({ hasText: /^\s*\+?\s*New\s*$/i })
      .first();
  }

  /**
   * Search box for the Media Sets list. Scoped to visible inputs because hidden
   * Bootstrap modals also expose "Search files..." inputs that would otherwise
   * win the locator race.
   */
  get mediaSetsSearch() {
    return this.page.locator('input[placeholder^="Search"]:visible').first();
  }

  async open() {
    step('open Library page');
    await this.goto('/library');
    // Page is ready when the Media Sets tab link is rendered
    await expect(this.mediaSetsTab).toBeVisible({ timeout: 30_000 });
  }

  async openMediaSets() {
    step('switch to Media Sets tab');
    await this.mediaSetsTab.click();
    await expect(this.newMediaSetButton).toBeVisible({ timeout: 15_000 });
  }

  async searchMediaSet(name: string) {
    step(`search media sets for "${name}"`);
    await this.mediaSetsSearch.fill(name);
  }

  /** Card locator for the named Media Set in the list. */
  mediaSetCard(name: string) {
    return this.page.locator('.ms-media-card, [class*="ms-card"], [class*="card"]')
      .filter({ hasText: name }).first();
  }

  /**
   * Performance check via `performance.mark` / `performance.measure`.
   * Marks "thumbs:start" and "thumbs:end" around the wait for every
   * thumbnail's `naturalWidth > 0`. The PerformanceMeasure entry is logged
   * to the console so it appears in the trace and HTML report.
   */
  async measureThumbnailLoad(): Promise<{ count: number; elapsedMs: number }> {
    const result = await this.page.evaluate(async () => {
      performance.mark('thumbs:start');
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(
        '.ms-media-card img, [class*="ms-card"] img, .ms-media-tile img'
      ));
      await Promise.all(
        imgs.map(img =>
          img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : new Promise<void>(resolve => {
                img.addEventListener('load',  () => resolve(), { once: true });
                img.addEventListener('error', () => resolve(), { once: true });
              })
        )
      );
      performance.mark('thumbs:end');
      const measure = performance.measure('thumbs:load', 'thumbs:start', 'thumbs:end');
      return { count: imgs.length, elapsedMs: Math.round(measure.duration) };
    });
    step(`PerformanceMeasure thumbs:load = ${result.elapsedMs}ms over ${result.count} thumbs`);
    return result;
  }
}
