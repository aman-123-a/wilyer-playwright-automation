import { Locator, expect } from '@playwright/test';
import { BasePage, step } from './BasePage';

export type Orientation = 'landscape' | 'portrait';

/**
 * Wraps the `#mediaSetModal` Create / Edit dialog and the per-card actions in
 * the Media Sets list view.
 */
export class MediaSetPage extends BasePage {
  get modal() { return this.page.locator('#mediaSetModal.show'); }
  get nameInput() {
    return this.modal.getByPlaceholder(/Media set name/i);
  }
  get searchAssets() {
    return this.modal.getByPlaceholder(/Search files/i);
  }
  get createButton() {
    return this.modal.getByRole('button', { name: /^Create$/ });
  }
  get updateButton() {
    return this.modal.getByRole('button', { name: /^Update$/ });
  }
  get cancelButton() {
    return this.modal.getByRole('button', { name: /^Cancel$/ });
  }
  get clearZonesButton() {
    return this.modal.getByRole('button', { name: /clear zones/i });
  }

  /** Drop zone matching the requested orientation. Empty-state friendly. */
  zone(orient: Orientation): Locator {
    return this.modal
      .locator('.ms-drop-zone')
      .filter({ hasText: new RegExp(`drag a ${orient} file`, 'i') })
      .first();
  }

  /** Picks the first asset tile whose dimensions match `orient`. */
  async pickTile(orient: Orientation): Promise<Locator> {
    step(`pick a ${orient} tile from asset grid`);
    const tiles = this.modal.locator('.ms-media-tile');
    await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
    const count = await tiles.count();
    for (let i = 0; i < count; i++) {
      const t = tiles.nth(i);
      const title = (await t.getAttribute('title')) || '';
      const m = title.match(/(\d+)\s*[×x]\s*(\d+)/);
      if (!m) continue;
      const w = +m[1], h = +m[2];
      if (orient === 'landscape' && w > h) return t;
      if (orient === 'portrait'  && h > w) return t;
    }
    throw new Error(`No ${orient} asset found in current grid`);
  }

  async dragAssetToZone(tile: Locator, orient: Orientation) {
    step(`drag tile -> ${orient} zone`);
    const target = this.zone(orient);
    await target.scrollIntoViewIfNeeded();
    await tile.scrollIntoViewIfNeeded();
    await tile.dragTo(target);
  }

  async fillName(name: string) {
    step(`fill media set name "${name}"`);
    await this.nameInput.fill(name);
  }

  async submitCreate() {
    step('click Create');
    await this.createButton.click();
  }

  async submitUpdate() {
    step('click Update');
    await this.updateButton.click();
  }

  /** True when the modal has the validation/error state on the name field. */
  async nameFieldHasInvalidState(): Promise<boolean> {
    const cls = (await this.nameInput.getAttribute('class')) || '';
    const aria = await this.nameInput.getAttribute('aria-invalid');
    return /is-invalid|invalid|error/.test(cls) || aria === 'true';
  }

  /** Locator for a Media Set card in the list, matched by visible name. */
  card(name: string): Locator {
    return this.page
      .locator('.ms-media-card, [class*="ms-card"], .col-12')
      .filter({ hasText: name })
      .first();
  }

  /** Open the per-card menu and click Edit; relies on the card menu UX. */
  async openEditFor(name: string) {
    step(`open edit menu for "${name}"`);
    const card = this.card(name);
    // Try a button labelled Edit on the card, then fall back to overflow menu
    const directEdit = card.getByRole('button', { name: /edit/i });
    if (await directEdit.count()) {
      await directEdit.first().click();
    } else {
      await card.locator('button').first().click();
      const edit = this.page.getByRole('menuitem', { name: /edit/i })
        .or(this.page.getByRole('button', { name: /^Edit$/ }));
      await edit.first().click();
    }
    await expect(this.modal).toBeVisible({ timeout: 10_000 });
  }

  /** Open a Media Set in view-mode (click the card itself, not the menu). */
  async openView(name: string) {
    step(`open media set "${name}" in view mode`);
    await this.card(name).click();
  }

  /** Click the in-modal "Clear zones" button when it is enabled. */
  async clearZones() {
    step('click Clear zones');
    if (await this.clearZonesButton.isEnabled().catch(() => false)) {
      await this.clearZonesButton.click();
    }
  }

  /** True when both drop zones currently show their empty-state placeholder. */
  async zonesAreEmpty(): Promise<boolean> {
    const lEmpty = await this.zone('landscape').isVisible().catch(() => false);
    const pEmpty = await this.zone('portrait').isVisible().catch(() => false);
    return lEmpty && pEmpty;
  }

  /** Open the per-card menu and click Delete, then confirm. */
  async deleteFromList(name: string) {
    step(`delete media set "${name}"`);
    const card = this.card(name);
    if (!(await card.count())) return false;
    // Try a direct trash button first
    const trash = card.locator('button[aria-label*="delete" i], button[title*="delete" i]')
      .or(card.getByRole('button', { name: /delete|trash/i }));
    if (await trash.count()) {
      await trash.first().click();
    } else {
      await card.locator('button').first().click();
      const del = this.page.getByRole('menuitem', { name: /delete/i })
        .or(this.page.getByRole('button', { name: /^Delete$/ }));
      if (!(await del.count())) return false;
      await del.first().click();
    }
    const confirm = this.page.getByRole('button', { name: /^(Delete|Confirm|Yes)$/ });
    if (await confirm.count()) await confirm.first().click().catch(() => {});
    return true;
  }
}
