// =============================================================================
//  EtaWidgetPage — page object for the Live ETA widget surface.
//
//  Selectors below were mapped LIVE against cms.wilyersignage.com (v3.5.25) on
//  2026-08-04.  Where the product gives no accessible handle (the modals carry
//  no role="dialog", the buttons no accessible name) the CSS hook actually used
//  by the app is documented inline rather than dressed up as a role query.
//
//  ── Real UI shape ───────────────────────────────────────────────────────────
//  Library (/library) → "Widgets (n)" tab → "Live ETA" type tile → widget grid.
//  Grid card:   <small>{id}</small> <b>{name}</b> [pencil → #updateWidget]
//                                                [trash  → #deleteModal]
//  Create/edit modal fields:  #name
//                             input[placeholder="Search location"]  (Places)
//                             input[placeholder="Custom name (optional)"]
//                             button "+ Add destination"
//                             Cancel / Save
//
//  NON-DESTRUCTIVE reads (open, search, read field values) are always safe.
//  Writes (create / update / delete) are guarded by the caller's destructive
//  flag — this class does not police that, the spec does.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/** Bootstrap modal ids the CMS uses for this widget type. */
const MODAL = {
  create: '#createWidget',
  update: '#updateWidget',
  delete: '#deleteModal',
} as const;

export class EtaWidgetPage extends BasePage {
  /** The widget library lives under the media Library route. */
  static readonly ROUTE = '/library';

  /** Public renderer origin — what the player actually loads. */
  static readonly RENDERER_ORIGIN = 'https://widgets.signagecloud.in';

  // ── Library chrome ────────────────────────────────────────────────────────

  /** The "Widgets (n)" tab beside "Media Files (n)". */
  readonly widgetsTab: Locator;

  /** The "Live ETA (n)" widget-type tile. */
  readonly liveEtaTypeTile: Locator;

  /** "Add New" — opens #createWidget. Distinct from the ticker's Add New. */
  readonly addNewBtn: Locator;

  /** Every widget card currently rendered in the grid. */
  readonly widgetCards: Locator;

  /** Empty-state copy shown when the account has no Live ETA widgets. */
  readonly emptyState: Locator;

  // ── Create / edit modal ───────────────────────────────────────────────────

  readonly createModal: Locator;
  readonly updateModal: Locator;
  readonly deleteModal: Locator;

  /** Google Places autocomplete dropdowns. Rendered on <body>, not in-modal. */
  readonly placeSuggestions: Locator;

  constructor(page: BasePage['page']) {
    super(page);

    this.widgetsTab = page.locator('a').filter({ hasText: /^Widgets \(\d+\)$/ });
    this.liveEtaTypeTile = page.locator('h6').filter({ hasText: /^Live ETA \(\d+\)/ });
    // The library hosts two "Add New" buttons; only this one targets #createWidget.
    this.addNewBtn = page.locator(`button[data-bs-target="${MODAL.create}"]`);
    this.widgetCards = page.locator('.card-body').filter({ has: page.locator('p b') });
    this.emptyState = page.getByText(/No Live ETA widgets found|No Widgets Found/i);

    this.createModal = page.locator(MODAL.create);
    this.updateModal = page.locator(MODAL.update);
    this.deleteModal = page.locator(MODAL.delete);

    // Google injects one .pac-container per autocomplete input, all on <body>,
    // and hides the inactive ones with display:none — hence :visible.
    this.placeSuggestions = page.locator('.pac-container:visible .pac-item');
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  /** Open Library → Widgets → Live ETA and wait for the grid to settle. */
  async open(): Promise<this> {
    await this.goto(EtaWidgetPage.ROUTE);
    await this.expectShellReady();
    await this.widgetsTab.click();
    await this.liveEtaTypeTile.click();
    await this.expectListLoaded();
    return this;
  }

  /** Wait until either a card or the empty state is on screen. */
  async expectListLoaded(timeout = 20_000): Promise<this> {
    await expect(this.widgetCards.first().or(this.emptyState.first())).toBeVisible({ timeout });
    return this;
  }

  // ── Grid helpers ──────────────────────────────────────────────────────────

  widgetCard(name: string): Locator {
    return this.widgetCards.filter({ hasText: name }).first();
  }

  async isCardVisible(name: string, timeout = 10_000): Promise<boolean> {
    return this.widgetCard(name)
      .isVisible({ timeout })
      .catch(() => false);
  }

  /** The widget id the card prints above the name. */
  async cardId(name: string): Promise<string> {
    return (await this.widgetCard(name).locator('small').first().innerText()).trim();
  }

  async cardNames(): Promise<string[]> {
    return this.widgetCards.locator('p b').allInnerTexts();
  }

  // ── Modal plumbing ────────────────────────────────────────────────────────
  //
  //  The modals have no role="dialog" and no accessible name, so visibility is
  //  the only honest readiness signal.  Bootstrap animates them in, hence the
  //  explicit wait rather than an immediate assertion.

  private modal(kind: keyof typeof MODAL): Locator {
    return kind === 'create' ? this.createModal : kind === 'update' ? this.updateModal : this.deleteModal;
  }

  async openCreateModal(): Promise<this> {
    await this.addNewBtn.click();
    await expect(this.createModal).toBeVisible({ timeout: 10_000 });
    return this;
  }

  async openEditModal(name: string): Promise<this> {
    await this.widgetCard(name).locator(`button[data-bs-target="${MODAL.update}"]`).click();
    await expect(this.updateModal).toBeVisible({ timeout: 10_000 });
    // The edit modal hydrates asynchronously; wait for the name to arrive.
    await expect(this.nameInput('update')).not.toHaveValue('', { timeout: 10_000 });
    return this;
  }

  async openDeleteModal(name: string): Promise<this> {
    await this.widgetCard(name).locator(`button[data-bs-target="${MODAL.delete}"]`).click();
    await expect(this.deleteModal).toBeVisible({ timeout: 10_000 });
    return this;
  }

  // ── Form fields ───────────────────────────────────────────────────────────

  nameInput(kind: 'create' | 'update' = 'create'): Locator {
    return this.modal(kind).locator('input#name');
  }

  /** Index 0 is Pickup Location; 1..N are Destination 1..N. */
  locationInput(index: number, kind: 'create' | 'update' = 'create'): Locator {
    return this.modal(kind).locator('input[placeholder="Search location"]').nth(index);
  }

  pickupInput(kind: 'create' | 'update' = 'create'): Locator {
    return this.locationInput(0, kind);
  }

  destinationInput(n = 1, kind: 'create' | 'update' = 'create'): Locator {
    return this.locationInput(n, kind);
  }

  /** Optional per-destination display label. */
  destinationLabelInput(n = 0, kind: 'create' | 'update' = 'create'): Locator {
    return this.modal(kind).locator('input[placeholder="Custom name (optional)"]').nth(n);
  }

  addDestinationBtn(kind: 'create' | 'update' = 'create'): Locator {
    return this.modal(kind).getByRole('button', { name: /\+ Add destination/i });
  }

  saveBtn(kind: 'create' | 'update' = 'create'): Locator {
    return this.modal(kind).locator('button.btn-primary');
  }

  cancelBtn(kind: 'create' | 'update' = 'create'): Locator {
    return this.modal(kind).locator('button.btn-danger');
  }

  confirmDeleteBtn(): Locator {
    return this.deleteModal.locator('button.btn-danger');
  }

  cancelDeleteBtn(): Locator {
    return this.deleteModal.locator('button.btn-secondary');
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async fillName(name: string, kind: 'create' | 'update' = 'create'): Promise<this> {
    await this.nameInput(kind).fill(name);
    return this;
  }

  /**
   * Type into a Places-backed location field and accept a suggestion.
   *
   * `fill()` is deliberately avoided: the Places widget listens for real key
   * events and will not open its dropdown for a programmatic value set.
   *
   * @param index 0 = pickup, 1..N = destination N
   * @param pick  which suggestion to accept (default: the first)
   * @returns the resolved address the field settled on
   */
  async chooseLocation(
    index: number,
    query: string,
    kind: 'create' | 'update' = 'create',
    pick = 0,
  ): Promise<string> {
    const field = this.locationInput(index, kind);
    await field.click();
    await field.fill('');
    await field.pressSequentially(query, { delay: 60 });

    await expect(this.placeSuggestions.first()).toBeVisible({ timeout: 10_000 });
    await this.placeSuggestions.nth(pick).click();

    // Places writes the formatted address back asynchronously.
    await expect(field).not.toHaveValue(query, { timeout: 10_000 });
    return field.inputValue();
  }

  choosePickup(query: string, kind: 'create' | 'update' = 'create'): Promise<string> {
    return this.chooseLocation(0, query, kind);
  }

  chooseDestination(query: string, n = 1, kind: 'create' | 'update' = 'create'): Promise<string> {
    return this.chooseLocation(n, query, kind);
  }

  /** True when the Places dropdown offered at least one suggestion. */
  async hasSuggestions(query: string, index = 1, kind: 'create' | 'update' = 'create'): Promise<boolean> {
    const field = this.locationInput(index, kind);
    await field.click();
    await field.fill('');
    await field.pressSequentially(query, { delay: 60 });
    return this.placeSuggestions
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
  }

  async addDestination(kind: 'create' | 'update' = 'create'): Promise<this> {
    const before = await this.modal(kind).locator('input[placeholder="Search location"]').count();
    await this.addDestinationBtn(kind).click();
    await expect(this.modal(kind).locator('input[placeholder="Search location"]')).toHaveCount(
      before + 1,
      { timeout: 5_000 },
    );
    return this;
  }

  async save(kind: 'create' | 'update' = 'create'): Promise<this> {
    await this.saveBtn(kind).click();
    return this;
  }

  async cancel(kind: 'create' | 'update' = 'create'): Promise<this> {
    await this.cancelBtn(kind).click();
    return this;
  }

  /**
   * Create in one call. Returns nothing — prove persistence via the API.
   *
   * Save is deliberately deferred until the modal has finished computing the
   * route: the map/ETA resolution re-renders the form, and a click that lands
   * mid-render is dropped without any error. Waiting for the computed line is
   * the only observable "form state has settled" signal the product offers.
   */
  async createWidget(name: string, pickupQuery: string, destinationQuery: string): Promise<this> {
    await this.openCreateModal();
    await this.fillName(name);
    await this.choosePickup(pickupQuery);
    await this.chooseDestination(destinationQuery);
    await this.waitForFormSettled('create');
    await this.save();
    await expect(this.createModal).toBeHidden({ timeout: 15_000 });
    return this;
  }

  /**
   * Wait until the modal's route computation has resolved (or give up quietly
   * after `timeout` — an unroutable pair never produces the line).
   */
  async waitForFormSettled(kind: 'create' | 'update' = 'create', timeout = 15_000): Promise<this> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await this.computedEtaText(kind)) break;
      await this.page.waitForTimeout(500);
    }
    // Let React commit the state change the route result triggered.
    await this.page.waitForTimeout(500);
    return this;
  }

  async deleteWidget(name: string, confirm: boolean): Promise<this> {
    await this.openDeleteModal(name);
    await (confirm ? this.confirmDeleteBtn() : this.cancelDeleteBtn()).click();
    await expect(this.deleteModal).toBeHidden({ timeout: 10_000 });
    return this;
  }

  // ── Modal state ───────────────────────────────────────────────────────────

  async isModalOpen(kind: 'create' | 'update' | 'delete'): Promise<boolean> {
    return this.modal(kind === 'delete' ? 'delete' : kind).isVisible();
  }

  /** Text of the delete confirmation — asserts the right widget is named. */
  async deletePromptText(): Promise<string> {
    return (await this.deleteModal.innerText()).replace(/\s+/g, ' ').trim();
  }

  /**
   * The computed "42 mins · 18.7 KM" line the edit modal renders once both
   * endpoints resolve.  Returns null when the product shows nothing.
   */
  async computedEtaText(kind: 'create' | 'update' = 'update'): Promise<string | null> {
    const body = (await this.modal(kind).innerText()).replace(/\s+/g, ' ');
    const m = body.match(/(\d+(?:\.\d+)?\s*(?:hour|hr|min)s?(?:\s*\d+\s*mins?)?)\s*·\s*([\d.]+\s*\w+)/i);
    return m ? `${m[1]} · ${m[2]}` : null;
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * True when an inline validation error is visible near `field`.
   *
   * Note: as of v3.5.25 the create modal surfaces NO inline error on an empty
   * submit — it silently refuses to close.  Callers should therefore treat a
   * still-open modal as the rejection signal and use this only to check
   * whether the product has since gained real messaging.
   */
  async hasInlineError(field: Locator): Promise<boolean> {
    if ((await field.getAttribute('aria-invalid').catch(() => null)) === 'true') return true;
    const group = field.locator('xpath=ancestor::*[self::div][1]');
    const err = group.getByText(/invalid|required|must be|between|valid|error/i);
    return (
      (await err.count()) > 0 &&
      (await err
        .first()
        .isVisible()
        .catch(() => false))
    );
  }

  // ── Renderer (what the player loads) ──────────────────────────────────────

  /** Open the public renderer for a widget id in the current page. */
  async openRenderer(id: string): Promise<this> {
    await this.page.goto(`${EtaWidgetPage.RENDERER_ORIGIN}/widget/${id}`);
    return this;
  }

  /** Visible text the renderer paints. Empty string means a blank widget. */
  async rendererText(): Promise<string> {
    return (await this.page.locator('body').innerText()).trim();
  }

  /** True when the renderer painted a duration-looking token. */
  async rendererShowsEta(): Promise<boolean> {
    return /\b\d+\s*(min|mins|minute|minutes|hr|hrs|hour|hours)\b/i.test(await this.rendererText());
  }

  // ── Security helpers ──────────────────────────────────────────────────────

  /** True if a payload stored in `name` executed rather than rendering inert. */
  async cardScriptsExecuted(name: string): Promise<boolean> {
    const dialogFired = this.watchDialogs();
    await this.page.waitForTimeout(400);
    const hasScriptEl = (await this.widgetCard(name).locator('script').count()) > 0;
    return dialogFired() || hasScriptEl;
  }
}

export default EtaWidgetPage;
