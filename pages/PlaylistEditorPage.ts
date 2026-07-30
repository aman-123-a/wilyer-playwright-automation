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
  readonly errorBanner: Locator;

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
    this.errorBanner = page.getByText(/something went wrong|error/i).first();
  }

  /**
   * Navigate to a playlist id WITHOUT asserting the editor mounted, then let the
   * page run for `settleMs`. This is the probe for missing/deleted playlists,
   * where the expected outcome is a graceful empty state — and the current
   * (buggy) outcome is an uncaught exception. openById() would mask that by
   * failing on the missing canvas instead of reporting the crash.
   */
  async probeById(id: string, settleMs = 3_000): Promise<this> {
    await this.goto(`/playlist-settings/${id}`);
    await this.page.waitForTimeout(settleMs);
    return this;
  }

  /** Reload the current editor and settle again — the crash is not 100% per load. */
  async reloadAndSettle(settleMs = 3_000): Promise<this> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(settleMs);
    return this;
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

  // ── Scheduling ─────────────────────────────────────────────────────────────
  //
  //  Selectors verified live against cms2.pocsample.in, 2026-07-29.
  //
  //  A zone item's schedule is edited in the `#arrayItemSchedule` OFFCANVAS
  //  (not a modal — it is dismissed with data-bs-dismiss="offcanvas"). It is
  //  opened by a small round badge pinned to the slide thumbnail carrying
  //  data-bs-target="#arrayItemSchedule".
  //
  //  Two facts that shape every locator here:
  //   • The offcanvas is ONE shared instance, re-bound to whichever slide was
  //     clicked. Its inputs have no id — they are addressed positionally
  //     (date[0]=from, date[1]=to, time[0]=from, time[1]=to).
  //   • The weekday pickers are BUTTONS with title="monday" …, not checkboxes.
  //     Selected state is the `btn-primary` class; unselected is `btn-outline-*`.
  //     They all start selected, which is why the summary badge reads
  //     "Every day" before anything is touched.
  //
  //  A CAMPAIGN zone item renders with only Edit Campaign / Change Position /
  //  Remove — it has NO schedule badge. `itemHasScheduleControl()` exists to
  //  assert that difference rather than to work around it.

  /** The shared "Set Schedule" offcanvas. */
  get schedulePanel(): Locator {
    return this.page.locator('#arrayItemSchedule');
  }

  /**
   * FILE slide entries in the Slides strip.
   *
   * Named for what it actually matches, which is not what the name once implied:
   * `.d-flex.align-items-center.h-100.w-100.p-2` is the FILE entry's inner row.
   * A campaign entry is a different component (`.d-flex.align-items-center.p-2.ps-3`
   * inside a gradient card) and is NOT matched here — verified live 2026-07-30 on
   * a zone holding 2 files + 1 campaign, where this returns 2. Use `zoneEntries()`
   * for every item regardless of kind.
   */
  slideEntries(): Locator {
    return this.page.locator('.d-flex.align-items-center.h-100.w-100.p-2');
  }

  // ── Campaign items inside a zone ───────────────────────────────────────────
  //
  //  Every zone item — file, widget or campaign — is one draggable card in the
  //  strip carrying its playback index as `data-id`. That attribute is the only
  //  thing the two kinds of entry have in common, so it is what ordering and
  //  counting assertions are built on.
  //
  //  A campaign entry (mapped live 2026-07-30) renders a "CAMPAIGN" pill, the
  //  name in a `[title]` attribute, an "N file(s)" summary, and three controls
  //  keyed by tooltip id: c-edit-<i> → #updateCampaignZone, c-swap-<i> →
  //  #swapModal, and c-remove-<i>, which removes the item from the zone. There
  //  is deliberately no schedule control — see BUG-SCHED-01.

  /** Every item in the zone's playback strip, in playback order. */
  zoneEntries(): Locator {
    return this.page.locator('div.card[draggable="true"][data-id]');
  }

  /** Just the campaign items — identified by the CAMPAIGN pill's icon. */
  campaignEntries(): Locator {
    return this.zoneEntries().filter({ has: this.page.locator('.bi-collection-play-fill') });
  }

  /** The zone entry for a named campaign. */
  campaignEntry(name: string): Locator {
    return this.campaignEntries().filter({ has: this.page.locator(`[title="${name}"]`) });
  }

  /** Playback position (0-based) of a named campaign in the zone, or -1. */
  async campaignPosition(name: string): Promise<number> {
    const id = await this.campaignEntry(name)
      .first()
      .getAttribute('data-id')
      .catch(() => null);
    return id === null ? -1 : Number(id);
  }

  /**
   * Whether a campaign's in-zone control is usable, absent, or rendered inert.
   * The RBAC probe: a revoked capability may hide the control or disable it, and
   * both are acceptable — a live control that acts anyway is the defect.
   */
  async campaignZoneControl(
    name: string,
    control: 'edit' | 'position' | 'remove',
  ): Promise<'enabled' | 'disabled' | 'absent'> {
    const prefix = { edit: 'c-edit-', position: 'c-swap-', remove: 'c-remove-' }[control];
    const el = this.campaignEntry(name).locator(`[data-tooltip-id^="${prefix}"]`).first();
    if ((await el.count()) === 0) return 'absent';
    // These controls are <span> badges, not buttons, so `disabled` is expressed
    // through pointer-events / opacity rather than the DOM property.
    const inert = await el.evaluate((e) => {
      const s = getComputedStyle(e);
      return s.pointerEvents === 'none' || Number(s.opacity) < 0.5 || e.hasAttribute('disabled');
    });
    return inert ? 'disabled' : 'enabled';
  }

  /**
   * Add a campaign to the selected zone by dragging its picker card onto the
   * zone's drop area — the only way the UI offers.
   *
   * The search settle is a response wait rather than a sleep: the picker list
   * re-renders on /campaign/read, and dragging a card that is about to be
   * replaced drops nothing.
   */
  async addCampaignToZone(name: string): Promise<this> {
    await this.page.getByRole('button', { name: /^campaigns$/i }).first().click();
    const listed = this.page
      .waitForResponse((r) => /\/campaign\/read\?/.test(r.url()), { timeout: 20_000 })
      .catch(() => null);
    await this.page.locator('input#search').first().fill(name);
    await listed;

    const card = this.page
      .locator('.card.bg-default.border.shadow-sm.mb-3')
      .filter({ has: this.page.getByText(name, { exact: true }) })
      .first();
    await expect(card, `the campaign "${name}" must be listed before it can be dragged`).toBeVisible(
      { timeout: 20_000 },
    );
    await card.dragTo(this.slideDropTarget);
    await expect(
      this.campaignEntry(name),
      'the dropped campaign must appear in the zone strip — a drag that lands nowhere is silent',
    ).toHaveCount(1, { timeout: 15_000 });
    return this;
  }

  /**
   * Remove a campaign from the selected zone via its own Remove control.
   *
   * Client-side only: the strip updates immediately and nothing is persisted
   * until `save()`, so a caller asserting removal must save first and then read
   * the playlist back.
   */
  async removeCampaignFromZone(name: string): Promise<this> {
    const entry = this.campaignEntry(name);
    await expect(entry, `"${name}" must be in the zone before it can be removed`).toHaveCount(1, {
      timeout: 15_000,
    });
    await entry.locator('[data-tooltip-id^="c-remove-"]').first().click({ force: true });
    await expect(entry, 'the entry must leave the strip when Remove is clicked').toHaveCount(0, {
      timeout: 15_000,
    });
    return this;
  }

  /** The schedule-opening badges. One per FILE item; campaigns have none. */
  scheduleBadges(): Locator {
    return this.page.locator('[data-bs-target="#arrayItemSchedule"]');
  }

  /** Does the nth zone item expose a schedule control at all? */
  async itemHasScheduleControl(index: number): Promise<boolean> {
    const entry = this.slideEntries().nth(index);
    if (!(await entry.count())) return false;
    return (await entry.locator('[data-bs-target="#arrayItemSchedule"]').count()) > 0;
  }

  /** Open the Set Schedule offcanvas for the nth item that has one. */
  async openItemSchedule(index = 0): Promise<this> {
    await this.scheduleBadges().nth(index).click({ force: true });
    await expect(this.schedulePanel).toBeVisible({ timeout: 15_000 });
    await expect(this.schedulePanel.locator('input[type="date"]').first()).toBeVisible({
      timeout: 10_000,
    });
    return this;
  }

  scheduleDateInputs(): Locator {
    return this.schedulePanel.locator('input[type="date"]');
  }

  scheduleTimeInputs(): Locator {
    return this.schedulePanel.locator('input[type="time"]');
  }

  dayButton(day: string): Locator {
    return this.schedulePanel.locator(`button[title="${day}"]`);
  }

  /** The "Every day" / "Mon, Tue…" summary pill above the date range. */
  get scheduleSummary(): Locator {
    return this.schedulePanel.locator('span.badge').first();
  }

  async setScheduleDates(from: string, to: string): Promise<this> {
    await this.scheduleDateInputs().nth(0).fill(from);
    await this.scheduleDateInputs().nth(1).fill(to);
    return this;
  }

  async setScheduleTimes(from: string, to: string): Promise<this> {
    await this.scheduleTimeInputs().nth(0).fill(from);
    await this.scheduleTimeInputs().nth(1).fill(to);
    return this;
  }

  /** Turn "Repeat on selected days" on or off. */
  async setRoutine(on: boolean): Promise<this> {
    const toggle = this.schedulePanel.locator('#arrayItemScheduleRoutine');
    await toggle.setChecked(on, { force: true });
    await this.page.waitForTimeout(400);
    return this;
  }

  /** Is a weekday button currently selected? */
  async isDaySelected(day: string): Promise<boolean> {
    const cls = (await this.dayButton(day).getAttribute('class')) ?? '';
    return /btn-primary/.test(cls);
  }

  /**
   * Leave exactly `wanted` selected. Every day starts ON, so this toggles the
   * unwanted ones off rather than clicking the wanted ones on — clicking an
   * already-selected day would deselect it.
   */
  async selectOnlyDays(wanted: string[]): Promise<this> {
    const ALL = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    for (const day of ALL) {
      const shouldBeOn = wanted.includes(day);
      if ((await this.isDaySelected(day)) !== shouldBeOn) {
        await this.dayButton(day).click({ force: true });
        await this.page.waitForTimeout(150);
      }
    }
    return this;
  }

  /** Commit the offcanvas. This only updates client state — the playlist Save persists it. */
  async saveSchedule(): Promise<this> {
    await this.schedulePanel.getByRole('button', { name: /save schedule/i }).click();
    await expect(this.schedulePanel).toBeHidden({ timeout: 15_000 });
    return this;
  }

  /**
   * Dismiss the offcanvas without committing.
   *
   * The close control sits in the offcanvas header, which can render above the
   * viewport once the day-picker row expands the panel — Playwright then refuses
   * the click as "outside of the viewport" even with `force`. Dispatching the
   * click on the element itself is the reliable exit, and leaving the panel open
   * breaks every later interaction in the editor.
   */
  async dismissSchedule(): Promise<this> {
    await this.page
      .locator('#closearrayItemSchedule')
      .evaluate((el) => (el as HTMLElement).click());
    await expect(this.schedulePanel).toBeHidden({ timeout: 15_000 });
    return this;
  }

  /**
   * The `min`/`max` the app puts on the date inputs. The From field gets
   * max=To and the To field gets min=From, which is how an inverted range is
   * meant to be prevented at the client — asserting the attributes is how the
   * boundary case is checked without fighting a native date picker.
   */
  async dateBounds(): Promise<{ fromMax: string | null; toMin: string | null }> {
    return {
      fromMax: await this.scheduleDateInputs().nth(0).getAttribute('max'),
      toMin: await this.scheduleDateInputs().nth(1).getAttribute('min'),
    };
  }
}

export default PlaylistEditorPage;
