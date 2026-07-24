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
    const lines = (await card.innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
    return (
      lines.find(
        (l) => !/^[A-Za-z]{3,}\s+\d{1,2}[, ]+\d{4}$/.test(l) && !/^\d+\s+files?$/i.test(l),
      ) ?? lines[0] ?? ''
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
    const hasCards = await this.cards().first().isVisible({ timeout: 10_000 }).catch(() => false);
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
    await this.page.waitForTimeout(1_000);
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
}

export default MediaSetsPage;
