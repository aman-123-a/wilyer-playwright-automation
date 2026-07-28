// =============================================================================
//  PrayerSchedulePage — Prayer Schedule module at /prayer-schedule (v3.5.20).
//  Interrupts screen content at Islamic prayer times, astronomically resolved
//  per location. Part of the CMS sidebar nav ("Prayer Schedule").
//
//  Surface (captured live 2026-07-02, RE-VERIFY selectors before trusting):
//   • Header stat cards: Total Screens / Daily Prayers (=5) / Locations /
//     Active Plans (X/Y).
//   • Three tabs: Today | Schedules | Calendar.
//   • Today  — location <select>; live clock; "Next Prayer" countdown; 5 prayer
//              cards (Fajr/Dhuhr/Asr/Maghrib/Isha); Live Screen Status list.
//   • Schedules — SCHEDULE PLANS cards (enable toggle, location, N screens,
//              Method/School) + per-prayer table + Configure / Save Changes /
//              Publish. "Configure" opens a right drawer (Basics → Calculation →
//              Advanced → Schedule period → Banner).
//   • Calendar — month table with location + method + Madhab + month + year
//              (2024-2028) filters + Apply.
//   • API: v3-5api.pocsample.in/v3/cms/prayer-schedule/{screens|timings}/{id}.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/** The five daily prayers, in order. */
export const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type Prayer = (typeof PRAYERS)[number];

export class PrayerSchedulePage extends BasePage {
  readonly heading: Locator;
  readonly todayTab: Locator;
  readonly schedulesTab: Locator;
  readonly calendarTab: Locator;
  readonly locationSelect: Locator;
  readonly schedulePlansHeading: Locator;
  readonly addNewPlanBtn: Locator;
  readonly configureBtn: Locator;
  readonly saveChangesBtn: Locator;
  readonly publishBtn: Locator;
  readonly deletePlanBtn: Locator;
  readonly applyBtn: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.heading = page.getByRole('heading', { name: /prayer schedule/i }).first();
    // Tabs render as buttons whose accessible name carries a LEADING icon glyph
    // (e.g. " Today"), so these matchers are intentionally NOT anchored.
    this.todayTab = page.getByRole('button', { name: /today/i }).first();
    this.schedulesTab = page.getByRole('button', { name: /schedules?/i }).first();
    this.calendarTab = page.getByRole('button', { name: /calendar/i }).first();
    // Today tab: the plan/location picker is the first VISIBLE <select>.
    // (The page also carries a hidden country-code <select>, so :visible is
    // required — an unscoped select.first() grabs the wrong element.)
    this.locationSelect = page.locator('select:visible').first();
    // Schedules tab. "Schedule Plans" renders as <strong>, not a heading role.
    // Action buttons carry the same leading icon glyph — keep matchers unanchored.
    this.schedulePlansHeading = page.getByText(/schedule plans/i).first();
    this.addNewPlanBtn = page.getByRole('button', { name: /add new plan/i });
    this.configureBtn = page.getByRole('button', { name: /configure/i });
    this.saveChangesBtn = page.getByRole('button', { name: /save changes/i });
    this.publishBtn = page.getByRole('button', { name: /publish/i });
    this.deletePlanBtn = page.getByRole('button', { name: /delete plan/i });
    this.applyBtn = page.getByRole('button', { name: /apply/i });
  }

  async open(): Promise<this> {
    await this.goto('/prayer-schedule');
    await this.expectShellReady();
    await expect(this.heading).toBeVisible({ timeout: 20_000 });
    return this;
  }

  // ── Tab navigation ────────────────────────────────────────────────────────

  async openToday(): Promise<this> {
    await this.todayTab.click();
    return this;
  }

  async openSchedules(): Promise<this> {
    await this.schedulesTab.click();
    await expect(this.schedulePlansHeading).toBeVisible({ timeout: 15_000 });
    return this;
  }

  async openCalendar(): Promise<this> {
    await this.calendarTab.click();
    return this;
  }

  // ── Today tab ─────────────────────────────────────────────────────────────

  /** One card per prayer; a stable count/label hook for the Today grid. */
  prayerCard(prayer: Prayer): Locator {
    return this.page.getByText(new RegExp(`\\b${prayer}\\b`, 'i')).first();
  }

  /** All five prayer names are rendered (whatever their resolved time). */
  async expectPrayerCardsPresent(): Promise<this> {
    for (const prayer of PRAYERS) {
      await expect(this.prayerCard(prayer)).toBeVisible({ timeout: 15_000 });
    }
    return this;
  }

  /** Select a location on the Today/Calendar filter by its visible label. */
  async selectLocation(label: string): Promise<this> {
    await this.locationSelect.selectOption({ label });
    await this.page.waitForTimeout(800);
    return this;
  }

  /** All resolved prayer times as displayed (e.g. "05:12" or "—"). */
  async prayerTimes(): Promise<string[]> {
    return this.page
      .locator('[class*="prayer" i] time, [class*="prayer" i] [class*="time" i]')
      .allInnerTexts();
  }

  /**
   * True when the current view shows the "Location is required" error toast —
   * the coordinate-less-plan bug (see prayer-schedule-coordinateless.spec.ts).
   */
  locationRequiredToast(): Locator {
    return this.page.getByText(/location is required/i).first();
  }

  /** True when every visible prayer time is a "—" placeholder (unresolved). */
  async allTimesUnresolved(): Promise<boolean> {
    const times = await this.prayerTimes();
    if (!times.length) return false;
    return times.every((t) => /^[—\-–\s]*$/.test(t.trim()));
  }

  // ── Schedules tab — plan cards + Configure drawer ─────────────────────────
  //
  //  Drawer surface RE-VERIFIED live 2026-07-23. The Configure/Add drawer is a
  //  Bootstrap `.offcanvas.offcanvas-end`. Fields are label-then-control pairs
  //  inside cards (NO `for`/`id` association, so getByLabel does NOT work):
  //   • Plan name — text input, placeholder "e.g. Riyadh Public Spaces"
  //   • City — a <select> of predefined locations (NOT a free text/lat-lng box)
  //   • Calculation method — a <select> (~12 options)
  //   • School — Shafi / Hanafi toggle BUTTONS
  //   • Start date / End date — <input type=date>
  //   • Banner duration — <input type=number min=1>
  //   • Pre Announcement Duration — <input type=number min=1> (under a checkbox)
  //  There are NO latitude/longitude inputs on this surface.

  /** The open Configure/Add offcanvas drawer — scopes ambiguous buttons. */
  drawer(): Locator {
    return this.page.locator('.offcanvas.show').first();
  }

  /** A label-anchored control inside the drawer: <label>…</label> → sibling. */
  private byLabelSibling(label: string, tag: 'input' | 'select'): Locator {
    return this.page
      .locator(
        `xpath=//label[starts-with(normalize-space(.),${JSON.stringify(label)})]/following-sibling::${tag}[1]`,
      )
      .first();
  }

  /** A label-anchored control where the control is not an immediate sibling. */
  private byLabelFollowing(label: string, tag: 'input' | 'select'): Locator {
    return this.page
      .locator(
        `xpath=//label[starts-with(normalize-space(.),${JSON.stringify(label)})]/following::${tag}[1]`,
      )
      .first();
  }

  /** SCHEDULE PLANS cards — a count hook for the plan list. */
  planCards(): Locator {
    return this.page.locator('[class*="plan" i][class*="card" i], [data-plan-id]');
  }

  /** A plan card by its visible name. */
  planCard(name: string): Locator {
    return this.page.getByText(name, { exact: false }).first();
  }

  async openPlan(name: string): Promise<this> {
    await this.planCard(name).click();
    await this.page.waitForTimeout(500);
    return this;
  }

  /** Open the right-hand Configure drawer for the currently-selected plan. */
  async openConfigure(): Promise<this> {
    await this.configureBtn.first().click();
    await expect(this.planNameInput()).toBeVisible({ timeout: 10_000 });
    return this;
  }

  /** Open the drawer to create a brand-new plan (blank/default fields). */
  async openAddNewPlan(): Promise<this> {
    await this.addNewPlanBtn.first().click();
    await expect(this.planNameInput()).toBeVisible({ timeout: 10_000 });
    return this;
  }

  // Configure drawer fields ---------------------------------------------------

  planNameInput(): Locator {
    return this.page.getByPlaceholder(/riyadh public spaces/i).first();
  }

  /** City / location picker — a bounded <select>, NOT a free-text field. */
  citySelect(): Locator {
    return this.byLabelSibling('City', 'select');
  }

  /** Calculation-method dropdown (~12 options: ISNA, MWL, Umm Al-Qura, …). */
  methodSelect(): Locator {
    return this.byLabelSibling('Calculation method', 'select');
  }

  startDateInput(): Locator {
    return this.byLabelSibling('Start date', 'input');
  }

  endDateInput(): Locator {
    return this.byLabelSibling('End date', 'input');
  }

  /** Banner duration (minutes) — <input type=number min=1>. */
  bannerDurationInput(): Locator {
    return this.byLabelFollowing('Banner duration', 'input');
  }

  /** Pre-announcement duration (minutes) — <input type=number min=1>. */
  preAnnouncementDurationInput(): Locator {
    return this.byLabelFollowing('Pre Announcement Duration', 'input');
  }

  /** Shafi / Hanafi school (Madhab) toggle button. */
  schoolButton(name: 'Shafi' | 'Hanafi'): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first();
  }

  /** Available City option labels (bounded domain for boundary tests). */
  async cityOptions(): Promise<string[]> {
    return this.citySelect().locator('option').allInnerTexts();
  }

  /** Pick the first REAL city (the default value is a "__custom__" placeholder). */
  async selectFirstRealCity(): Promise<string> {
    const opts = await this.citySelect().locator('option').all();
    for (const opt of opts) {
      const value = (await opt.getAttribute('value')) ?? '';
      const label = (await opt.innerText()).trim();
      // Skip the "__custom__" / empty placeholder; take the first real location.
      if (value && value !== '__custom__' && label) {
        await this.citySelect().selectOption(value);
        return label;
      }
    }
    // Fallback: first non-placeholder option by index.
    await this.citySelect().selectOption({ index: 1 });
    return (await this.citySelect().locator('option').nth(1).innerText()).trim();
  }

  /**
   * Fill the minimum required fields for a NEW plan: name, a real City, and the
   * schedule period (Start/End default EMPTY on the Add-New-Plan drawer and are
   * server-required — "Start date is required"). Banner defaults to 5.
   */
  async fillRequiredPlanBasics(
    planName: string,
    opts: { start?: string; end?: string } = {},
  ): Promise<this> {
    await this.planNameInput().fill(planName);
    await this.selectFirstRealCity();
    await this.startDateInput().fill(opts.start ?? '2026-08-01');
    await this.endDateInput().fill(opts.end ?? '2026-08-07');
    return this;
  }

  /** Save the drawer — scoped to the offcanvas so it never hits the page-level
   *  "Save Changes" on the Schedules tab. */
  async saveConfigure(): Promise<this> {
    await this.drawer()
      .getByRole('button', { name: /^save changes$/i })
      .first()
      .click();
    return this;
  }

  /** True while the drawer is still open (save blocked / validation pending). */
  async drawerStillOpen(): Promise<boolean> {
    return this.planNameInput()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
  }

  /**
   * Delete the currently-selected plan, confirming the destructive dialog.
   * IMPORTANT: "Delete plan" lives in the plan-DETAIL panel, not the Configure
   * modal — opening Configure floats a dialog OVER it and intercepts the click.
   * So select the plan (openPlan) and call this WITHOUT opening Configure.
   * The confirm is a "Delete Prayer Schedule" modal with a [Delete] button —
   * scope to it explicitly (the generic confirm helper mis-targets here).
   */
  async deleteSelectedPlan(): Promise<this> {
    const del = this.page.getByRole('button', { name: /delete plan/i }).first();
    await del.scrollIntoViewIfNeeded().catch(() => {});
    await del.click({ timeout: 10_000 });
    const dlg = this.page
      .locator('[role="dialog"]:visible, .modal.show')
      .filter({ hasText: /are you sure/i })
      .first();
    await dlg.getByRole('button', { name: /^delete$/i }).click({ timeout: 8_000 });
    return this;
  }

  /** Distinct plan names currently rendered in the Schedule Plans list. */
  async planListNames(): Promise<string[]> {
    const strongs = await this.page
      .locator('strong')
      .allInnerTexts()
      .catch(() => []);
    return strongs.map((t) => t.trim()).filter(Boolean);
  }

  /**
   * The summary line shown for a plan in the list — e.g.
   * "Riyadh, Saudi Arabia  0 screens  Jul 23 – Jul 30 Method: 3 | School: 0
   *  Banner: 5m | Pre: 2m". Empty string when the plan is not listed.
   */
  async planRowText(planName: string): Promise<string> {
    const strong = this.page.locator('strong', { hasText: planName }).first();
    if (!(await strong.isVisible({ timeout: 2_000 }).catch(() => false))) return '';
    // The summary text sits in the plan-name entry's parent container.
    const container = strong.locator('xpath=ancestor::*[self::div or self::li][1]');
    return (await container.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /**
   * Assert a plan is gone from the LIST. Uses the plan-name <strong> entries, not
   * getByText — a post-delete success toast echoes the name and would otherwise
   * yield a false "still present". Polls so the list has time to re-render.
   */
  async expectPlanAbsent(planName: string): Promise<this> {
    await expect
      .poll(async () => (await this.planListNames()).includes(planName), { timeout: 15_000 })
      .toBe(false);
    return this;
  }

  // ── "Choose Media" picker (per-prayer FILES column) ───────────────────────
  //
  //  Surface captured live 2026-07-24. Each row of the per-prayer table carries
  //  a FILES column whose [+ Files] button opens a `Choose Media` modal:
  //   • Tabs:    Media | Widgets
  //   • Filters: All | Images | Videos | Folders
  //   • Search:  <input placeholder="Search...">  (fires ONE request PER
  //              KEYSTROKE — there is no effective debounce, see spec notes)
  //   • Folders: chips rendered as buttons; drilling in swaps the grid and
  //              shows a [Back] chip + the folder name as a breadcrumb.
  //   • Items:   tiles whose text is "<filename>\n<Image|Video> · <size>".
  //  Backing API:
  //   GET /v3/cms/folder/read?parentFolder=<id>&page=1&limit=100[&search=]
  //   GET /v3/cms/file/read?limit=50&search=<t>&page=1&type=&sort=createdAt
  //       &order=-1&folderId=<id>

  /** The open "Choose Media" modal. */
  mediaPicker(): Locator {
    return this.page.locator('[role="dialog"]:visible, .modal.show, .offcanvas.show').first();
  }

  /**
   * The per-prayer table row for a given prayer.
   *
   * NOTE: `hasText` matches the element's *textContent*, which is unspaced —
   * the Fajr row reads "Fajr04:10 – 04:15in 18h 22m…". A `\bFajr\b` matcher
   * therefore does NOT match (the "r" is followed by "0", both word chars), so
   * the prayer name is anchored to the start of the row instead.
   */
  prayerRow(prayer: Prayer): Locator {
    return this.page.locator('tr', { hasText: new RegExp(`^\\s*${prayer}`, 'i') }).first();
  }

  /**
   * The [+ Files] trigger for a prayer. NOTE: the CMS caps a prayer at TWO media
   * files — once two are assigned the button is not rendered at all, so callers
   * must handle its absence rather than assuming every row exposes it.
   */
  addFilesButton(prayer: Prayer): Locator {
    return this.prayerRow(prayer).getByRole('button', { name: /files/i }).first();
  }

  /** The first prayer whose row still exposes an [+ Files] trigger, if any. */
  async firstPrayerWithAddSlot(): Promise<Prayer | null> {
    for (const p of PRAYERS) {
      if ((await this.addFilesButton(p).count()) > 0) return p;
    }
    return null;
  }

  /** Open the media picker from a prayer row's FILES column. */
  async openMediaPicker(prayer: Prayer): Promise<this> {
    await this.addFilesButton(prayer).click();
    await expect(
      this.mediaPicker()
        .getByText(/choose media/i)
        .first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    await this.waitForPickerContent();
    return this;
  }

  /**
   * The modal title renders before its grid does — the folder chips and media
   * tiles arrive from folder/read + file/read afterwards. Wait for the content
   * to settle so callers never read an empty grid that is merely still loading.
   */
  async waitForPickerContent(): Promise<this> {
    await expect
      .poll(
        async () =>
          (await this.mediaTiles().count()) > 0 ||
          (await this.folderChips()).some((c) => !/^back$/i.test(c)) ||
          (await this.pickerIsEmpty()),
        { timeout: 20_000 },
      )
      .toBe(true);
    return this;
  }

  async closeMediaPicker(): Promise<this> {
    await this.mediaPicker()
      .getByRole('button', { name: /^\s*×\s*$/ })
      .first()
      .click()
      .catch(() => this.page.keyboard.press('Escape'));
    await this.page.waitForTimeout(500);
    return this;
  }

  /** The media search box inside the picker. */
  mediaSearch(): Locator {
    return this.mediaPicker()
      .getByPlaceholder(/search/i)
      .first();
  }

  /** Media tiles — matched by the "Image · 1.2 MB" / "Video · 34 MB" meta line. */
  mediaTiles(): Locator {
    return this.mediaPicker()
      .locator('[role="button"], button')
      .filter({ hasText: /(Image|Video)\s·\s/ });
  }

  /** Filenames of the currently-rendered media tiles (first text line each). */
  async mediaTileNames(): Promise<string[]> {
    const out: string[] = [];
    for (const tile of await this.mediaTiles().all()) {
      out.push(((await tile.innerText()).split('\n')[0] ?? '').trim());
    }
    return out;
  }

  /**
   * Folder/navigation chips in the picker — every clickable that is NOT a media
   * tile and NOT one of the fixed tab/filter controls. Includes "Back".
   */
  async folderChips(): Promise<string[]> {
    const out: string[] = [];
    for (const b of await this.mediaPicker().locator('button, [role="button"]').all()) {
      const t = (await b.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (/(Image|Video)\s·\s/.test(t)) continue;
      if (/^(Media|Widgets|All|Images|Videos|Folders|×)$/i.test(t)) continue;
      out.push(t);
    }
    return out;
  }

  /** A folder chip (or Back) by exact visible label. */
  folderChip(label: string): Locator {
    const escaped = label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    return this.mediaPicker()
      .locator('button, [role="button"]')
      .filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i') })
      .first();
  }

  /** Drill into a folder and wait for the grid to swap. */
  async openFolder(label: string): Promise<this> {
    await this.folderChip(label).click();
    await this.page.waitForTimeout(1_200);
    await this.waitForPickerContent();
    return this;
  }

  /** Go up one level via the Back chip. */
  async folderBack(): Promise<this> {
    await this.folderChip('Back').click();
    await this.page.waitForTimeout(1_200);
    await this.waitForPickerContent();
    return this;
  }

  /** Type into the picker search; the grid refreshes per keystroke. */
  async searchMedia(term: string): Promise<this> {
    const box = this.mediaSearch();
    await box.click();
    await box.fill(term);
    await this.page.waitForTimeout(2_500);
    return this;
  }

  async clearMediaSearch(): Promise<this> {
    await this.mediaSearch().fill('');
    await this.page.waitForTimeout(2_500);
    return this;
  }

  /** True when the picker shows its explicit empty state. */
  async pickerIsEmpty(): Promise<boolean> {
    return this.mediaPicker()
      .getByText(/this folder is empty|no (media|results|files)/i)
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
  }

  /** Select a media tile by (partial) filename. */
  async selectMedia(filename: string): Promise<this> {
    await this.mediaTiles().filter({ hasText: filename }).first().click();
    await this.page.waitForTimeout(1_000);
    return this;
  }

  /** Filenames currently assigned to a prayer row (FILES column thumbnails). */
  async assignedMedia(prayer: Prayer): Promise<string[]> {
    const imgs = this.prayerRow(prayer).locator('img[alt]');
    return (await imgs.evaluateAll((els) =>
      els.map((e) => (e as HTMLImageElement).alt).filter(Boolean),
    )) as string[];
  }

  // ── Calendar tab ──────────────────────────────────────────────────────────

  /** The month table body rows (one per date). */
  calendarRows(): Locator {
    return this.page.locator('table tbody tr');
  }

  yearSelect(): Locator {
    return this.page
      .getByRole('combobox', { name: /year/i })
      .or(this.page.locator('select').filter({ hasText: /202[4-8]/ }))
      .first();
  }

  /**
   * Click Apply once it is actually enabled. Apply is a dirty-state gate: it
   * stays `disabled title="No changes to apply"` until a filter changes, and
   * briefly `disabled title="Set a valid location first"` while the app
   * re-validates the location after a change (a transient race that made the
   * year-boundary cases flaky). Poll for the enabled state, then click; if it
   * never enables (nothing to recompute) this is a safe no-op — the calendar
   * already shows its computed rows.
   */
  async applyCalendar(): Promise<this> {
    const btn = this.applyBtn.first();
    const enabled = await expect
      .poll(async () => btn.isEnabled(), { timeout: 8_000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (enabled) {
      await btn.click();
      await this.page.waitForTimeout(1_000);
    }
    return this;
  }

  /** Calendar shows recomputed rows OR an explicit empty state. */
  async expectCalendarLoaded(): Promise<this> {
    const loaded = await expect
      .poll(async () => (await this.calendarRows().count()) > 0, { timeout: 20_000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (!loaded) {
      const empty = await this.page
        .getByText(/no (data|result|schedule)/i)
        .first()
        .isVisible()
        .catch(() => false);
      expect(empty, 'calendar shows rows or an empty state').toBeTruthy();
    }
    return this;
  }
}

export default PrayerSchedulePage;
