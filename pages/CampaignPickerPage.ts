// =============================================================================
//  CampaignPickerPage — the Campaigns surface of the CMS.
//
//  Campaigns have NO sidebar entry. The only UI is picker tab 4 inside the
//  playlist editor (`Media | Widgets | Sequences | Campaigns`), so this page
//  object opens a playlist editor first and then the tab.
//  Selectors verified live against cms2.pocsample.in, 2026-07-28.
//
//  DOM facts that shape this object:
//   • Card:    .card.bg-default.border.shadow-sm.mb-3
//              name in `.card-body.p-2 b`; the campaign id is only exposed via
//              the report link `a[href="/campaign-report/<id>"]`.
//   • Actions: buttons carry data-bs-target — #updateCampaign / #deleteCampaign
//              / #copyCampaign. Create is button[data-bs-target="#createCampaign"].
//   • Modals:  #createCampaign, #updateCampaign, #deleteCampaign are
//              data-bs-backdrop="static" data-bs-keyboard="false" — Escape and
//              backdrop clicks do NOT close them. Dismissal must use the modal's
//              own control, otherwise the open modal eats every later click.
//   • #name and #defaultDuration exist in BOTH the create and update modals, so
//              every field locator is scoped to its modal. Never use a bare #name.
//
//  Assertion rule (learned the hard way, see report 10 § "Method self-correction"):
//  a toast is evidence that a message appeared, never evidence that data
//  persisted. Persistence is asserted through CampaignApi read-back.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export type CampaignAction = 'edit' | 'delete' | 'clone' | 'report';

/**
 * Outcome of submitting a campaign modal.
 *  • `status` — HTTP status of the save, or null when the client blocked it and
 *    no request was ever issued (a real, assertable outcome).
 *  • `toast` — the message shown, captured from the moment of the click.
 *    Message evidence only: it never proves anything persisted.
 *  • `blockedReason` — set when the submit button was DISABLED, so the click
 *    never happened. The string is the button's `title`, which is how the app
 *    explains the block (e.g. "Add at least one media item."). A block can
 *    therefore surface two ways — a disabled button or a toast after an allowed
 *    click — and callers must accept whichever the build uses.
 */
export interface SubmitResult {
  status: number | null;
  body: string;
  toast: string;
  blockedReason: string | null;
}

const CARD = '.card.bg-default.border.shadow-sm.mb-3';

export class CampaignPickerPage extends BasePage {
  readonly tab: Locator;
  readonly searchInput: Locator;
  readonly newButton: Locator;
  readonly cards: Locator;
  readonly createModal: Locator;
  readonly updateModal: Locator;
  readonly deleteModal: Locator;
  readonly toast: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.tab = page.getByRole('button', { name: /^campaigns$/i }).first();
    this.newButton = page.locator('button[data-bs-target="#createCampaign"]').first();
    this.searchInput = page.locator('input#search').first();
    this.cards = page.locator(CARD);
    this.createModal = page.locator('#createCampaign');
    this.updateModal = page.locator('#updateCampaign');
    this.deleteModal = page.locator('#deleteCampaign');
    this.toast = page.locator('.Toastify__toast');
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  /** Open a playlist editor and switch to the Campaigns tab. */
  async open(playlistId: string): Promise<this> {
    await this.goto(`/playlist-settings/${playlistId}`);
    await expect(this.page.locator('#composer')).toBeVisible({ timeout: 30_000 });
    await this.openTab();
    return this;
  }

  /** Switch to the Campaigns tab of an already-open playlist editor. */
  async openTab(): Promise<this> {
    await expect(this.tab).toBeVisible({ timeout: 20_000 });
    await this.tab.click();
    await expect(this.newButton).toBeVisible({ timeout: 20_000 });
    return this;
  }

  /** True when the tab is rendered at all — the RBAC / feature-flag assertion. */
  async isTabVisible(): Promise<boolean> {
    return this.tab.isVisible().catch(() => false);
  }

  // ── List ───────────────────────────────────────────────────────────────────

  card(name: string): Locator {
    return this.cards.filter({ has: this.page.getByText(name, { exact: true }) });
  }

  async listNames(): Promise<string[]> {
    const names = await this.cards.locator('.card-body.p-2 b').allTextContents();
    return names.map((n) => n.trim());
  }

  async count(): Promise<number> {
    return this.cards.count();
  }

  /** The campaign id, read off the card's report link — the only place the UI exposes it. */
  async idOf(name: string): Promise<string | null> {
    const href = await this.card(name)
      .locator('a[href^="/campaign-report/"]')
      .first()
      .getAttribute('href')
      .catch(() => null);
    return href?.split('/').pop() ?? null;
  }

  /** Type into the picker's search box and wait for the list request to settle. */
  async search(query: string): Promise<this> {
    const response = this.page.waitForResponse(
      (r) => /\/campaign\/read\?/.test(r.url()),
      { timeout: 20_000 },
    ).catch(() => null);
    await this.searchInput.fill(query);
    await response;
    return this;
  }

  /** Whether a card action is enabled, disabled, or not rendered — the RBAC probe. */
  async isActionAvailable(name: string, action: CampaignAction): Promise<'enabled' | 'disabled' | 'absent'> {
    const map: Record<CampaignAction, string> = {
      edit: 'button[data-bs-target="#updateCampaign"]',
      delete: 'button[data-bs-target="#deleteCampaign"]',
      clone: 'button[data-bs-target="#copyCampaign"]',
      report: 'a[href^="/campaign-report/"]',
    };
    const control = this.card(name).locator(map[action]).first();
    if ((await control.count()) === 0) return 'absent';
    return (await control.isEnabled()) ? 'enabled' : 'disabled';
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async openCreateModal(): Promise<this> {
    await this.newButton.click();
    await expect(this.createModal).toHaveClass(/show/, { timeout: 15_000 });
    await expect(this.createModal.locator('#name')).toBeVisible({ timeout: 10_000 });
    return this;
  }

  /**
   * Fill the create form and submit. `items` picks that many tiles from the
   * media panel. Returns the create response so the caller can assert its status
   * — a 4xx here is a legitimate outcome for the negative cases.
   *
   * When the client blocks submission (e.g. zero media) no request is issued and
   * this resolves to null; the caller asserts the toast instead.
   */
  async create(
    name: string,
    opts: { items?: number; defaultDuration?: number } = {},
  ): Promise<SubmitResult> {
    const { items = 1, defaultDuration } = opts;
    await this.openCreateModal();
    await this.createModal.locator('#name').fill(name);
    if (defaultDuration !== undefined) {
      await this.createModal.locator('#defaultDuration').fill(String(defaultDuration));
    }
    await this.addMedia(this.createModal, items);
    return this.submitModal(this.createModal, /create campaign/i, /\/campaign\/create/);
  }

  /**
   * Selectable media tiles in a modal's picker panel.
   *
   * Scoped to the tile card, not its `img`: a video tile lays a play-icon
   * overlay across the thumbnail, so clicking the image itself is blocked by
   * hit-target interception. The card is the element that carries the handler.
   */
  mediaTiles(modal: Locator): Locator {
    return modal.locator('div.card:has(> img.rounded-2)');
  }

  /** Click the first `count` media tiles in a modal's picker panel. */
  async addMedia(modal: Locator, count: number): Promise<this> {
    if (count <= 0) return this;
    const tiles = this.mediaTiles(modal);
    await expect(tiles.first()).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < count; i += 1) {
      await tiles.nth(i).click();
      await expect(modal.getByText(/Active Media\s*\(?\s*\d+/i).first()).toContainText(
        String(i + 1),
        { timeout: 10_000 },
      );
    }
    return this;
  }

  /** "Active Media (N)" as the modal currently reports it. */
  async activeMediaCount(modal: Locator): Promise<number> {
    const text = await modal.getByText(/Active Media/i).first().textContent();
    const m = text?.match(/(\d+)/);
    return m ? Number(m[1]) : 0;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  /**
   * Open the edit dialog for a campaign and wait until it is BOUND to that
   * campaign, not merely visible. The modal is a single shared instance that is
   * populated after it opens; typing into it too early is silently overwritten
   * when the data lands, and submitting too early trips the client's
   * "no media" guard because the item list has not rendered yet.
   */
  async openUpdateModal(name: string): Promise<this> {
    await this.card(name).locator('button[data-bs-target="#updateCampaign"]').first().click();
    await expect(this.updateModal).toHaveClass(/show/, { timeout: 15_000 });
    await expect(this.updateModal.locator('#name')).toHaveValue(name, { timeout: 15_000 });
    await expect(
      this.updateModal.locator('.card.shadow-sm.m-2').first(),
      'the campaign\'s existing items must render before the form can be submitted',
    ).toBeVisible({ timeout: 15_000 });
    return this;
  }

  /** Rename and/or re-time an existing campaign through the UI. */
  async update(
    name: string,
    changes: { name?: string; defaultDuration?: number; addItems?: number; itemDuration?: number },
  ): Promise<SubmitResult> {
    await this.openUpdateModal(name);
    if (changes.name !== undefined) await this.updateModal.locator('#name').fill(changes.name);
    if (changes.defaultDuration !== undefined) {
      await this.updateModal.locator('#defaultDuration').fill(String(changes.defaultDuration));
    }
    if (changes.addItems) await this.addMedia(this.updateModal, changes.addItems);
    if (changes.itemDuration !== undefined) await this.setItemDuration(0, changes.itemDuration);
    return this.submitModal(this.updateModal, /update campaign/i, /\/campaign\/update/);
  }

  /** Per-item duration inputs inside the update modal's Active Media list. */
  itemDurationInputs(): Locator {
    return this.updateModal.locator('.card.shadow-sm.m-2 input[type="number"]');
  }

  async setItemDuration(index: number, seconds: number): Promise<this> {
    await this.itemDurationInputs().nth(index).fill(String(seconds));
    return this;
  }

  /** The `min` attribute on a per-item duration input — null means unbounded. */
  async itemDurationMin(index = 0): Promise<string | null> {
    return this.itemDurationInputs().nth(index).getAttribute('min');
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  /**
   * Delete via the card's trash action. The confirm dialog warns that the
   * campaign may be assigned to playlists; `confirm: false` takes "Go back",
   * which is how the cancel path is exercised without destroying anything.
   */
  async delete(name: string, confirm = true): Promise<void> {
    await this.card(name).locator('button[data-bs-target="#deleteCampaign"]').first().click();
    await expect(this.deleteModal).toHaveClass(/show/, { timeout: 15_000 });
    const button = confirm ? /^continue$/i : /^go back$/i;
    const settled = confirm
      ? this.page.waitForResponse((r) => /\/campaign\/delete/.test(r.url()), { timeout: 25_000 }).catch(() => null)
      : Promise.resolve(null);
    await this.deleteModal.getByRole('button', { name: button }).first().click();
    await settled;
    await expect(this.deleteModal).not.toHaveClass(/show/, { timeout: 15_000 });
  }

  // ── Modal plumbing ─────────────────────────────────────────────────────────

  /**
   * Submit a campaign modal and capture the resulting API call.
   *
   * The form may be blocked client-side (zero media, native `required`), in
   * which case no request is issued at all — that is a real outcome, not a
   * failure, so this returns `status: null` rather than timing out the test.
   *
   * The block can take either of two forms. The button may be left DISABLED
   * with a `title` explaining why, in which case clicking it would just burn the
   * action timeout — so that case is detected up front and returned as
   * `blockedReason`. Otherwise the click is allowed and the app answers with a
   * toast.
   */
  private async submitModal(
    modal: Locator,
    submitLabel: RegExp,
    urlPattern: RegExp,
  ): Promise<SubmitResult> {
    const submit = modal.getByRole('button', { name: submitLabel }).first();
    await expect(submit).toBeVisible({ timeout: 15_000 });

    // The button is ALSO disabled transiently while the modal binds its data, so
    // a bare isEnabled() check here reads a perfectly valid form as blocked.
    // Give it a bounded window to settle; only a button still disabled after
    // that is a genuine client-side block.
    const enabled = await expect(submit)
      .toBeEnabled({ timeout: 5_000 })
      .then(() => true, () => false);
    if (!enabled) {
      const reason = (await submit.getAttribute('title')) ?? '';
      await this.dismiss(modal);
      return { status: null, body: '', toast: '', blockedReason: reason };
    }

    // Clear any toast still on screen from a previous action, then arm the wait
    // for the *next* one BEFORE clicking. Reading the toast after the click has
    // resolved is too late: a client-side block issues no request, so waiting on
    // the response first burns 20 s and the toast auto-dismisses at ~11 s.
    await this.waitForToastToClear();
    const nextToast = this.toast
      .first()
      .textContent({ timeout: 20_000 })
      .catch(() => null);
    const pending = this.page
      .waitForResponse((r) => urlPattern.test(r.url()), { timeout: 20_000 })
      .catch(() => null);

    await submit.click();

    const response = await pending;
    if (!response) {
      // No request was issued — the client blocked the save. The toast is the
      // only evidence of what happened, and it was captured from the click.
      const toast = (await nextToast) ?? '';
      await this.dismiss(modal);
      return { status: null, body: '', toast, blockedReason: null };
    }
    const body = await response.text().catch(() => '');
    // A successful save closes the modal itself; a rejected one leaves it open.
    if (response.ok()) {
      await expect(modal).not.toHaveClass(/show/, { timeout: 15_000 }).catch(() => undefined);
    }
    await this.dismiss(modal);
    return { status: response.status(), body, toast: (await nextToast) ?? '', blockedReason: null };
  }

  /** Let an in-flight toast expire so the next assertion cannot read a stale one. */
  private async waitForToastToClear(): Promise<void> {
    if (!(await this.toast.first().isVisible().catch(() => false))) return;
    await this.toast.first().waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
  }

  /**
   * Close a modal if it is still open. These modals use a static backdrop and
   * disable the keyboard, so Escape does nothing — the dismiss control is the
   * only exit, and leaving one open breaks every subsequent click in the test.
   */
  async dismiss(modal: Locator): Promise<void> {
    if (!(await modal.evaluate((m) => m.classList.contains('show')).catch(() => false))) return;
    const control = modal.locator('[data-bs-dismiss="modal"]').first();
    if (await control.count()) {
      await control.click({ force: true }).catch(() => undefined);
      await expect(modal).not.toHaveClass(/show/, { timeout: 10_000 }).catch(() => undefined);
    }
  }

  /** Text of the toast currently on screen. Message evidence only — never persistence. */
  async toastText(): Promise<string> {
    return (await this.toast.first().textContent({ timeout: 10_000 }).catch(() => '')) ?? '';
  }
}

export default CampaignPickerPage;
