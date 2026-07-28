// =============================================================================
//  PlaylistEditorPage — the playlist layout editor at /playlist-settings/<id>.
//  Selectors verified live against cms.pocsample.in (build v3.5.25, 2026-07-27).
//
//  "Layout time duration" model (see memory playlist-duration-ui):
//   • Layout Settings → `Duration (Nsec)` = input#duration — READ-ONLY rollup
//     (sum of the layout's slide durations); shown when the LAYOUT is selected.
//   • ZoneSettings (select a zone on #composer) → per-slide duration. The editable
//     controls appear ONLY when a zone holds 2+ slides. A single-slide zone shows
//     a read-only "N sec" label. Per IMAGE slide: a `− [input] +` stepper. Per
//     VIDEO slide: fixed intrinsic length (no stepper). A bulk "Duration (sec)"
//     input applies to all image slides; "Total Duration : 0h:Mm:Ss" is a display.
//
//  Validation quirk: the stepper buttons floor at 1, but TYPING bypasses that —
//  0 / negative / huge stick in the field; decimals truncate; the real question a
//  test asks is whether Save persists an invalid value.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class PlaylistEditorPage extends BasePage {
  readonly composer: Locator;
  readonly newLayoutBtn: Locator;
  readonly mediaTab: Locator;
  readonly imagesFilter: Locator;
  readonly videosFilter: Locator;
  readonly allFilter: Locator;
  readonly mediaTiles: Locator;
  readonly slideDropTarget: Locator;
  readonly slidesBtn: Locator;
  readonly bulkDurationInput: Locator;
  readonly totalDuration: Locator;
  readonly layoutDurationInput: Locator;
  readonly saveBtn: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.composer = page.locator('#composer');
    this.newLayoutBtn = page.getByRole('button', { name: /\bnew layout\b/i }).first();
    this.mediaTab = page.getByRole('button', { name: /^media$/i }).first();
    this.imagesFilter = page.getByRole('button', { name: /^images$/i }).first();
    this.videosFilter = page.getByRole('button', { name: /^videos$/i }).first();
    this.allFilter = page.getByRole('button', { name: /^all$/i }).first();
    this.mediaTiles = page.locator('.media-grid-item');
    this.slideDropTarget = page.getByText(/\+\s*Drop Widgets & Files/i).first();
    this.slidesBtn = page.getByRole('button', { name: /^slides$/i }).first();
    // Bulk "Duration (sec)" input sits inside the .form-group that owns the label.
    this.bulkDurationInput = page
      .locator('.form-group', { hasText: /^Duration \(sec\)/ })
      .locator('input.form-control')
      .first();
    this.totalDuration = page.locator('.text-primary', { hasText: /Total Duration/i }).first();
    // Layout-level rollup (read-only) — shown in Layout Settings.
    this.layoutDurationInput = page.locator('input#duration');
    this.saveBtn = page.locator('button.btn-warning[data-bs-target="#updatePlaylist"]').first();
  }

  /** Open an existing playlist editor by id and wait for the canvas to mount. */
  async openById(id: string): Promise<this> {
    await this.goto(`/playlist-settings/${id}`);
    await expect(this.composer).toBeVisible({ timeout: 30_000 });
    await this.page.waitForTimeout(1_500);
    return this;
  }

  /**
   * Create a fresh playlist from the listing and land in the editor. Returns the
   * new playlist id (parsed from the /playlist-settings/<id> URL) for later cleanup.
   */
  async createPlaylist(name: string, description = 'e2e duration suite'): Promise<string> {
    await this.goto('/playlists?action=createPlaylist');
    const modal = this.page.locator('.modal.show').filter({ hasText: /create new playlist/i });
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await modal.locator('#name').fill(name);
    await modal.locator('#description').fill(description);
    await modal.getByRole('button', { name: /create playlist/i }).click();
    await this.page.waitForURL(/\/playlist-settings\//, { timeout: 25_000 });
    await expect(this.composer).toBeVisible({ timeout: 30_000 });
    await this.page.waitForTimeout(1_500);
    const m = this.page.url().match(/playlist-settings\/([a-f0-9]{24})/i);
    if (!m) throw new Error(`could not parse playlist id from ${this.page.url()}`);
    return m[1];
  }

  /** Filter the media panel to a single type so drags are deterministic. */
  async filterMedia(kind: 'all' | 'images' | 'videos'): Promise<this> {
    const map = { all: this.allFilter, images: this.imagesFilter, videos: this.videosFilter };
    await map[kind].click();
    await this.page.waitForTimeout(1_000);
    await expect(this.mediaTiles.first()).toBeVisible({ timeout: 15_000 });
    return this;
  }

  /** Drag the nth media tile onto the empty canvas → creates a new zone. */
  async dropMediaToCanvas(tileIndex = 0): Promise<this> {
    const tile = this.mediaTiles.nth(tileIndex);
    await tile.scrollIntoViewIfNeeded();
    await tile.dragTo(this.composer);
    await expect(this.page.locator('strong', { hasText: /^ZoneSettings$/ })).toBeVisible({
      timeout: 15_000,
    });
    await this.page.waitForTimeout(600);
    return this;
  }

  /** Drag the nth media tile onto the ZoneSettings drop area → adds a slide to the zone. */
  async dropMediaToZone(tileIndex = 1): Promise<this> {
    const tile = this.mediaTiles.nth(tileIndex);
    await tile.scrollIntoViewIfNeeded();
    await tile.dragTo(this.slideDropTarget);
    await this.page.waitForTimeout(1_200);
    return this;
  }

  /**
   * Build the minimal slideshow the duration UI needs: a single zone holding two
   * image slides (both get editable steppers). Assumes the Media panel is open.
   */
  async buildTwoImageSlideZone(): Promise<this> {
    await this.filterMedia('images');
    await this.dropMediaToCanvas(0);
    await this.dropMediaToZone(1);
    await expect(this.slideDurationInputs().first()).toBeVisible({ timeout: 15_000 });
    return this;
  }

  /** Per-image-slide duration stepper inputs (one per image slide in the zone). */
  slideDurationInputs(): Locator {
    return this.page.locator('input.text-center.mx-1.rounded-md');
  }

  stepMinus(index = 0): Locator {
    return this.page.locator('span.badge.bg-gray-600').filter({ hasText: /^-$/ }).nth(index);
  }

  stepPlus(index = 0): Locator {
    return this.page.locator('span.badge.bg-primary').filter({ hasText: /^\+$/ }).nth(index);
  }

  /** Set a slide's duration by typing directly (bypasses the +/- floor of 1). */
  async setSlideDuration(value: string, index = 0): Promise<this> {
    const input = this.slideDurationInputs().nth(index);
    await input.click();
    await input.fill(value);
    await this.page.waitForTimeout(300);
    return this;
  }

  async slideDurationValue(index = 0): Promise<string> {
    return this.slideDurationInputs().nth(index).inputValue();
  }

  /** Read a slide duration without throwing; returns null if no stepper is present. */
  async slideDurationValueOrNull(index = 0): Promise<string | null> {
    const input = this.slideDurationInputs().nth(index);
    if (!(await input.isVisible({ timeout: 8_000 }).catch(() => false))) return null;
    return input.inputValue();
  }

  /** How many slides the currently-selected zone shows (image steppers + fixed labels). */
  async visibleSlideCount(): Promise<number> {
    const steppers = await this.slideDurationInputs().count();
    const fixed = await this.page.locator('span.text-center.me-2').count();
    return steppers + fixed;
  }

  /**
   * Select the LAYOUT (not a zone) so Layout Settings — and its read-only
   * `Duration (Nsec)` rollup — is shown. Clicks the layout thumbnail in the
   * bottom strip. ZoneSettings and Layout Settings are mutually exclusive, so the
   * rollup is only readable after this (or immediately after a fresh reload).
   */
  async openLayoutSettings(): Promise<this> {
    const thumb = this.page
      .locator('div.px-2.fs-12')
      .filter({ hasText: /Zones in/i })
      .first();
    await thumb.click();
    await expect(this.layoutDurationInput).toBeVisible({ timeout: 10_000 });
    return this;
  }

  /** Read the read-only layout rollup duration (seconds), or null if not shown. */
  async layoutDurationSeconds(): Promise<number | null> {
    if (!(await this.layoutDurationInput.isVisible().catch(() => false))) return null;
    const raw = await this.layoutDurationInput.inputValue();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Select a zone on the canvas so ZoneSettings (re)opens — needed after a reload,
   * where no zone is auto-selected. Clicks the largest media-bearing rectangle
   * inside the composer.
   */
  async selectFirstZone(): Promise<boolean> {
    const point = await this.page.evaluate(() => {
      const composer = document.querySelector('#composer');
      if (!composer) return null;
      const cands = Array.from(composer.querySelectorAll('*')).filter((e) => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return (
          r.width > 60 &&
          r.height > 40 &&
          (!!e.querySelector('img') || s.backgroundImage !== 'none')
        );
      });
      if (!cands.length) return null;
      cands.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      });
      const r = cands[0].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!point) return false;
    await this.page.mouse.click(point.x, point.y);
    await this.page.waitForTimeout(1_000);
    return true;
  }

  /** Save the playlist and confirm the "Update Playlist" modal; awaits the toast. */
  async save(): Promise<this> {
    await this.saveBtn.click();
    const modal = this.page.locator('.modal.show').filter({ hasText: /update playlist/i });
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await modal.getByRole('button', { name: /continue/i }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });
    await this.page
      .getByText(/playlist updated/i)
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => {});
    return this;
  }

  /**
   * Delete a playlist from the listing by id (idempotent teardown). Uses the card's
   * red trash button → "Delete Playlist" confirm → Continue.
   */
  async deletePlaylistById(id: string): Promise<boolean> {
    await this.goto('/playlists');
    await this.page.waitForTimeout(1_500);
    const card = this.page
      .locator('.card-body')
      .filter({ has: this.page.locator(`a[href="/playlist-settings/${id}"]`) });
    if (
      !(await card
        .first()
        .isVisible({ timeout: 8_000 })
        .catch(() => false))
    )
      return false;
    await card.first().locator('button.btn-danger').first().click();
    const modal = this.page.locator('.modal.show').filter({ hasText: /delete playlist/i });
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await modal.getByRole('button', { name: /continue/i }).click();
    await expect(this.page.locator(`a[href="/playlist-settings/${id}"]`)).toHaveCount(0, {
      timeout: 15_000,
    });
    return true;
  }
}

export default PlaylistEditorPage;
