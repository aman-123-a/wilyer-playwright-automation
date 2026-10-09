// =============================================================================
//  MediaSetsPage — Library ▸ Media Sets (v3.5.20).
//  A media set groups files into orientation zones (Landscape / Portrait[ /
//  Square]) for multi-zone screen layouts. Reached from the Library page via the
//  "Media Sets" tab (the tab is a LINK that stays on /library and swaps the
//  panel — it does not change the route).
//
//  Surface (captured live 2026-07-14 against cms.pocsample.in — RE-VERIFY before
//  trusting):
//   • List: a "Search..." box (live-filter, debounced, no Enter), one card per
//     set with "Edit Media Set" / "Delete Media Set" buttons, and a dedicated
//     empty state ("No media sets match \"<query>\"").
//   • Create builder (inline, opened by "Create Media Set"): a "Media set name"
//     field, a "Search files..." box, All / Images / Videos type filters, a
//     "N of <total>" file counter, and drag-drop Landscape / Portrait zones.
//   • Aspect-Ratio filter ("Aspect Ratio" / "Choose Any" toggle + per-format
//     16:9 / 9:16 active state) is a cms2.pocsample.in build feature and is
//     absent on the default target — the page object feature-detects it so
//     aspect specs skip cleanly where it does not exist.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class MediaSetsPage extends BasePage {
  readonly libraryHeading: Locator;
  readonly mediaSetsTab: Locator;
  readonly searchInput: Locator;
  readonly createBtn: Locator;
  // Create builder
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly fileSearchInput: Locator;
  readonly filterAll: Locator;
  readonly filterImages: Locator;
  readonly filterVideos: Locator;
  readonly cancelBtn: Locator;
  readonly landscapeZone: Locator;
  readonly portraitZone: Locator;
  // Aspect-Ratio (cms2 build only)
  readonly aspectRatioToggle: Locator;
  readonly chooseAnyToggle: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.libraryHeading = page.getByRole('heading', { name: /^library$/i });
    this.mediaSetsTab = page.getByRole('link', { name: /media sets/i });
    // The list "Search..." box. The folder search reads "Search folders...", so
    // the {0,3}-dot anchor matches only the media-set filter (one on this panel).
    this.searchInput = page.getByPlaceholder(/^search\.{0,3}$/i).first();
    this.createBtn = page.getByRole('button', { name: /create media set/i }).first();

    this.nameInput = page.getByPlaceholder(/media set name/i).first();
    this.descriptionInput = page.getByPlaceholder(/^description/i).first();
    this.fileSearchInput = page.getByPlaceholder(/search files/i).first();
    this.filterAll = page.getByRole('button', { name: /^all$/i }).first();
    this.filterImages = page.getByRole('button', { name: /^images$/i }).first();
    this.filterVideos = page.getByRole('button', { name: /^videos$/i }).first();
    this.cancelBtn = page.getByRole('button', { name: /^cancel$/i }).first();
    // Format zones render as "Landscape · 16:9" / "Portrait · 9:16".
    this.landscapeZone = page.getByText(/landscape/i).first();
    this.portraitZone = page.getByText(/portrait/i).first();

    // The aspect control has shifted across builds: older builds exposed an
    // "Aspect Ratio" / "Choose Any" toggle; the current cms2 build uses a
    // "Change ratio" button. Match any of them.
    this.aspectRatioToggle = page
      .getByRole('button', { name: /aspect ratio|change ratio/i })
      .first();
    this.chooseAnyToggle = page.getByRole('button', { name: /choose any/i }).first();
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  /** Open Library and switch to the Media Sets panel. */
  async open(): Promise<this> {
    await this.goto('/library');
    await this.expectShellReady();
    await expect(this.libraryHeading).toBeVisible({ timeout: 20_000 });
    await this.mediaSetsTab.click();
    // The panel swaps in the search box + cards / empty state.
    await expect(this.searchInput).toBeVisible({ timeout: 15_000 });
    await this.page.waitForTimeout(800);
    return this;
  }

  /**
   * True when this build ships the Media Sets module at all.
   *
   * The live production build (cms.wilyersignage.com) has no "Media Sets" entry
   * in the Library nav — it exposes only Media Files / Widgets / Media publish
   * History / Create Design / Upload Requests / Publish Requests. The module is
   * ABSENT there, not broken, so specs skip rather than fail. Leaves the browser
   * on /library; callers that need the panel should still call open().
   */
  async isAvailable(): Promise<boolean> {
    await this.goto('/library');
    await this.expectShellReady();
    await expect(this.libraryHeading).toBeVisible({ timeout: 20_000 });
    return this.mediaSetsTab.isVisible({ timeout: 5_000 }).catch(() => false);
  }

  // ── List search ─────────────────────────────────────────────────────────────

  /** One card per media set on the CURRENT page. The list paginates at 20/page,
   *  so this is a page slice — use total() for the true match count. Filtered-out
   *  cards are removed from the DOM, so `:visible` and a plain count agree. */
  cards(): Locator {
    return this.page.locator('.ms-set-card:visible');
  }

  /** Visible card count on the current page (≤ page size). */
  async cardCount(): Promise<number> {
    return this.cards().count();
  }

  /** The "Total - N" header counter — the authoritative match count across all
   *  pages. Returns null when the counter is absent (the search feature is a
   *  cms2.pocsample.in build feature; the default cms build has no such list). */
  async total(): Promise<number | null> {
    const el = this.page.getByText(/total\s*-\s*\d+/i).first();
    if (!(await el.isVisible({ timeout: 3_000 }).catch(() => false))) return null;
    const m = (await el.innerText()).match(/total\s*-\s*(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  /**
   * True when this build exposes the FUNCTIONAL Media-Sets search (cms2) — keyed
   * on the "Total - N" list counter, which the default cms build does not render.
   * A read-only check with no side effects on search state.
   */
  async hasSearchFeature(): Promise<boolean> {
    return (await this.total()) !== null;
  }

  /** Poll the "Total - N" counter until it settles on `expected` — absorbs the
   *  search debounce so callers never read a stale pre-filter count. */
  async expectTotal(expected: number, timeout = 10_000): Promise<void> {
    await expect
      .poll(async () => this.total(), {
        timeout,
        message: `expected Total - ${expected} after filter`,
      })
      .toBe(expected);
  }

  /**
   * The visible name of the first card — used to build data-relative searches
   * so the suite survives the set list drifting from any hard-coded baseline.
   * Skips the "MMM DD YYYY" created-date and any "N files" line.
   */
  async firstCardName(): Promise<string> {
    const card = this.cards().first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    const lines = (await card.innerText())
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    return (
      lines.find(
        (l) => !/^[A-Za-z]{3,}\s+\d{1,2}[, ]+\d{4}$/.test(l) && !/^\d+\s+files?$/i.test(l),
      ) ??
      lines[0] ??
      ''
    );
  }

  /** The dedicated "no matches" empty state (echoes the escaped query). */
  emptyState(): Locator {
    return this.page.getByText(/no media sets? (match|found)/i).first();
  }

  /**
   * Drive the live-filter search. fill() fires the React onChange here (verified
   * live) and is instant even for long inputs; never press Enter (some builds
   * submit + reset on it). `settleMs` covers the filter debounce.
   */
  async search(term: string, settleMs = 1_200): Promise<this> {
    await this.searchInput.click();
    await this.searchInput.fill(term);
    await this.page.waitForTimeout(settleMs);
    return this;
  }

  async clearSearch(): Promise<this> {
    return this.search('');
  }

  /** The list always shows cards OR the empty state — never an indefinite blank. */
  async expectListResolved(): Promise<this> {
    const hasCards = await this.cards()
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!hasCards) {
      await expect(this.emptyState()).toBeVisible({ timeout: 10_000 });
    }
    return this;
  }

  /** Read the maxlength the search input enforces (-1 / absent = uncapped). */
  async searchMaxLength(): Promise<number> {
    const raw = await this.searchInput.getAttribute('maxlength');
    return raw === null ? -1 : Number(raw);
  }

  // ── Card actions (verified live on cms2 v3.5.25, 2026-10-07) ─────────────────
  //  Each card: a selection checkbox (top-left), a title `<div title="name">`,
  //  and four icon buttons identified by their tooltip — File Details, Edit
  //  media set, Publish, Delete Media Set.

  /** The card whose title is exactly `name`. */
  cardByName(name: string): Locator {
    return this.page
      .locator('.ms-set-card')
      .filter({ has: this.page.getByTitle(name, { exact: true }) });
  }

  cardCheckbox(name: string): Locator {
    return this.cardByName(name).locator('input[type="checkbox"]');
  }

  /** Tick the selection checkbox of the named card. */
  async selectCard(name: string): Promise<this> {
    await this.cardCheckbox(name).check();
    return this;
  }

  async deselectCard(name: string): Promise<this> {
    await this.cardCheckbox(name).uncheck();
    return this;
  }

  /** Narrow the list to `term` and wait for the "Total - N" counter to settle. */
  async searchAndSettle(term: string, expectedTotal: number): Promise<this> {
    await this.search(term);
    await this.expectTotal(expectedTotal);
    return this;
  }

  // ── Bulk bar — appears once at least one card is ticked ───────────────────────

  /** "Unpublish Media Set" (acts on the selection; carries no count). */
  get bulkUnpublishBtn(): Locator {
    return this.page.getByRole('button', { name: /unpublish media set/i });
  }

  /** "Publish Media Set (N)". The lookbehind keeps it off "Unpublish …". The
   *  buttons carry an icon, so the accessible name cannot be anchored with ^. */
  get bulkPublishBtn(): Locator {
    return this.page.getByRole('button', { name: /(?<!un)publish media set/i });
  }

  get bulkMoveBtn(): Locator {
    return this.page.getByRole('button', { name: /move to folder/i });
  }

  /** "Delete (N)" — the count is the number of ticked cards. */
  get bulkDeleteBtn(): Locator {
    // Only the bulk button carries a "(N)"; the per-card Delete buttons do not.
    return this.page.getByRole('button', { name: /delete\s*\(\d+\)/i });
  }

  /** The N in "Delete (N)", or null while the bulk bar is hidden. */
  async bulkDeleteCount(): Promise<number | null> {
    if (!(await this.bulkDeleteBtn.isVisible().catch(() => false))) return null;
    const m = (await this.bulkDeleteBtn.innerText()).match(/\((\d+)\)/);
    return m ? Number(m[1]) : null;
  }

  // ── Modals ───────────────────────────────────────────────────────────────────

  /** The Bootstrap modal currently open (single delete, bulk delete, move). */
  get openModal(): Locator {
    return this.page.locator('.modal.show');
  }

  /**
   * Confirm the open delete modal and wait for it to close. A bulk delete is one
   * DELETE per set, run back to back, so the modal stays open for roughly
   * 0.8s × N — pass a larger `timeout` for big selections.
   */
  async confirmDelete(timeout = 15_000): Promise<this> {
    await expect(this.openModal).toBeVisible({ timeout: 10_000 });
    await this.openModal.getByRole('button', { name: /^delete/i }).last().click();
    await expect(this.openModal).toBeHidden({ timeout });
    return this;
  }

  /** Dismiss the open modal via its Cancel button. */
  async cancelModal(): Promise<this> {
    await this.openModal.getByRole('button', { name: /^cancel$/i }).click();
    await expect(this.openModal).toBeHidden({ timeout: 10_000 });
    return this;
  }

  /** Click the card's Delete button (opens the confirm modal; does not confirm). */
  async clickDelete(name: string): Promise<this> {
    await this.cardByName(name).locator('button.bg-red-500').click();
    await expect(this.openModal).toBeVisible({ timeout: 10_000 });
    return this;
  }

  /** The Move modal's folder picker — a native <select>, options are folder names. */
  get moveFolderSelect(): Locator {
    return this.openModal.locator('select');
  }

  /**
   * Open the Move modal for the current selection and choose `folderName`.
   * Returns false (modal left open) when the account has no such folder.
   */
  async chooseMoveFolder(folderName: string): Promise<boolean> {
    await this.bulkMoveBtn.click();
    await expect(this.moveFolderSelect).toBeVisible({ timeout: 10_000 });
    // The <select> renders before its folders arrive; wait for more than the
    // placeholder option before concluding the folder is missing.
    await expect
      .poll(async () => this.moveFolderSelect.locator('option').count(), { timeout: 10_000 })
      .toBeGreaterThan(1)
      .catch(() => undefined);
    const option = this.moveFolderSelect.locator('option', { hasText: folderName });
    if ((await option.count()) === 0) return false;
    await this.moveFolderSelect.selectOption({ label: (await option.first().innerText()).trim() });
    return true;
  }

  /** Press Move in the open modal and wait for it to close. */
  async confirmMove(): Promise<this> {
    await this.openModal.getByRole('button', { name: /^move$/i }).click();
    await expect(this.openModal).toBeHidden({ timeout: 15_000 });
    return this;
  }

  // ── Edit view ────────────────────────────────────────────────────────────────

  get saveChangesBtn(): Locator {
    return this.page.getByRole('button', { name: /save changes/i });
  }

  get editHeading(): Locator {
    return this.page.getByText(/^edit media set$/i).first();
  }

  /** Open the edit view for the named card. */
  async openEdit(name: string): Promise<this> {
    await this.cardByName(name).locator('button.bg-orange-500').click();
    await expect(this.editHeading).toBeVisible({ timeout: 15_000 });
    await expect(this.nameInput).toHaveValue(name, { timeout: 15_000 });
    return this;
  }

  /** Rename in the edit view and save; resolves once the list is back. */
  async renameInEdit(newName: string): Promise<this> {
    await this.nameInput.fill(newName);
    await this.saveChangesBtn.click();
    await expect(this.searchInput).toBeVisible({ timeout: 20_000 });
    return this;
  }

  // ── Create builder ───────────────────────────────────────────────────────────

  /** Open the inline Create Media Set builder. */
  async openCreate(): Promise<this> {
    await this.createBtn.click();
    await expect(this.nameInput).toBeVisible({ timeout: 15_000 });
    await this.page.waitForTimeout(1_000);
    return this;
  }

  /** Close the builder without saving (Cancel). */
  async cancelCreate(): Promise<this> {
    if (await this.cancelBtn.isVisible().catch(() => false)) {
      await this.cancelBtn.click();
      await this.page.waitForTimeout(500);
    }
    return this;
  }

  /** Files currently shown in the builder browser — draggable tiles (50/page). */
  builderFiles(): Locator {
    return this.page.locator('[draggable="true"]:visible');
  }

  async builderFileCount(): Promise<number> {
    return this.builderFiles().count();
  }

  /** Parse the "N of <total>" file counter; null if not present. */
  async fileCounter(): Promise<{ shown: number; total: number } | null> {
    const el = this.page.getByText(/\d+\s+of\s+\d+/i).first();
    if (!(await el.isVisible().catch(() => false))) return null;
    const m = (await el.innerText()).match(/(\d+)\s+of\s+(\d+)/i);
    return m ? { shown: Number(m[1]), total: Number(m[2]) } : null;
  }

  async filterFiles(kind: 'all' | 'images' | 'videos'): Promise<this> {
    const map = { all: this.filterAll, images: this.filterImages, videos: this.filterVideos };
    const btn = map[kind];
    // The active filter renders disabled — clicking it would hang, so treat an
    // already-active filter as a no-op.
    if (await btn.isDisabled().catch(() => false)) {
      await this.page.waitForTimeout(300);
      return this;
    }
    await btn.click();
    // The "N of total" counter and the tiles lag the click by 1–2 s (observed on
    // cms2 v3.5.25: a 1 s wait read the previous filter's total). Wait it out.
    await this.page.waitForTimeout(2_500);
    return this;
  }

  /** Poll the "N of total" counter's total until it settles on `expected`. */
  async expectFileTotal(expected: number, timeout = 10_000): Promise<void> {
    await expect
      .poll(async () => (await this.fileCounter())?.total ?? null, {
        timeout,
        message: `expected file counter total ${expected}`,
      })
      .toBe(expected);
  }

  async searchFiles(term: string): Promise<this> {
    await this.fileSearchInput.click();
    await this.fileSearchInput.fill('');
    if (term) await this.fileSearchInput.pressSequentially(term, { delay: 40 });
    await this.page.waitForTimeout(1_200);
    return this;
  }

  // ── Aspect-Ratio (cms2 build) ─────────────────────────────────────────────────

  /** True when the Aspect-Ratio filter control exists on this build. */
  async hasAspectRatioFilter(): Promise<boolean> {
    return (
      (await this.aspectRatioToggle.isVisible({ timeout: 3_000 }).catch(() => false)) ||
      (await this.chooseAnyToggle.isVisible({ timeout: 1_000 }).catch(() => false))
    );
  }
  // ── Display-format zones + aspect-ratio filter (cms2 v3.5.25 builder) ──────────

  /** "Choose Any" / "Aspect Ratio" pills above the file grid (plain spans, not buttons). */
  aspectPill(): Locator {
    return this.page.locator('.msce-pill', { hasText: /^\s*Aspect Ratio\s*$/ });
  }

  chooseAnyPill(): Locator {
    return this.page.locator('.msce-pill', { hasText: /^\s*Choose Any\s*$/ });
  }

  /** The "Showing only 16:9 media - matching the active zone." note. */
  get aspectNote(): Locator {
    return this.page.getByText(/Showing only .* media/i).first();
  }

  /** Every display-format card in the builder (Landscape, Portrait, added ones). */
  zoneCards(): Locator {
    return this.page.locator('.msce-zone-card');
  }

  zoneCard(label: RegExp | string): Locator {
    return this.zoneCards().filter({ hasText: label }).first();
  }

  /** Click a zone card's header so it becomes the Active drop target. */
  async activateZone(label: RegExp | string): Promise<this> {
    await this.zoneCard(label).locator('.msce-zone-badge').click();
    await this.page.waitForTimeout(500);
    return this;
  }

  get clearMediaBtn(): Locator {
    return this.page.getByRole('button', { name: 'Clear Media' });
  }

  get addFormatBtn(): Locator {
    return this.page.getByText('Add Display Format').first();
  }

  get formatCountText(): Locator {
    return this.page.getByText(/\d+ formats? in this set/i).first();
  }

  get createSubmitBtn(): Locator {
    return this.page.getByRole('button', { name: 'Create', exact: true });
  }

  /** The Change Aspect Ratio dialog. */
  get ratioDialog(): Locator {
    return this.page.getByRole('dialog').filter({ hasText: /Change Aspect Ratio/i });
  }

  /** Visible file tiles in the grid, each with its "WxH" parsed from the tile text. */
  async tileDimensions(max = 50): Promise<{ w: number; h: number; text: string }[]> {
    const texts = await this.builderFiles().evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).innerText),
    );
    return texts.slice(0, max).flatMap((t) => {
      const m = t.match(/(\d+)\s*[×x]\s*(\d+)/);
      return m ? [{ w: Number(m[1]), h: Number(m[2]), text: t.split('\n').join(' | ') }] : [];
    });
  }
}

export default MediaSetsPage;
