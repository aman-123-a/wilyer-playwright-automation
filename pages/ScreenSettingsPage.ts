// =============================================================================
//  ScreenSettingsPage — a single screen's "Manage Screen" surface at
//  /screen-settings/<id>.
//
//  Selectors mapped live against cms2.pocsample.in on 2026-08-03:
//   • Tabs render as buttons: Media, Schedule, Configurations, Downloaded Files,
//     Network Uptime, Additional Info, Custom Params, Settings, Logs.
//   • The Media tab holds two content sections and nothing else:
//       DIRECT PLAYLIST        — one playlist, or "No playlist assigned"
//       INDIVIDUAL MEDIA FILES — bare media, each with a duration label
//   • Assigning: "Assign Playlist" (or "Assign" when empty) opens a picker of
//     playlist FOLDERS and playlists, with a "Search content..." box and a
//     per-playlist "Publish" button → POST /screen/publishPlaylist
//     {playlistId, screens:[screenId]}.
//   • The assigned card carries Change / Edit / Remove. Remove opens the
//     #unpublishPlaylist modal, confirmed by a second "Unpublish Playlist"
//     button. The card's own actions have no accessible name beyond their text,
//     so they are located through the card, not by role name alone.
//
//  There is NO campaign surface anywhere beneath a screen — the same shape the
//  cluster surface has. A campaign reaches a screen only by sitting inside the
//  playlist that is published to it.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ScreenSettingsPage extends BasePage {
  readonly mediaTab: Locator;
  readonly assignPlaylistBtn: Locator;
  readonly directPlaylistHeading: Locator;
  readonly emptyDirectPlaylist: Locator;
  readonly pickerSearch: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.mediaTab = page.getByRole('button', { name: /^media$/i }).first();
    // "Assign Playlist" is the header action; "Assign" is the empty-state CTA in
    // the Direct Playlist card. Either opens the same picker.
    this.assignPlaylistBtn = page.getByRole('button', { name: /^assign playlist$/i }).first();
    this.directPlaylistHeading = page.getByText(/^DIRECT PLAYLIST$/i).first();
    this.emptyDirectPlaylist = page.getByText(/no playlist assigned/i).first();
    this.pickerSearch = page.getByPlaceholder('Search content...');
  }

  async open(screenId: string): Promise<this> {
    await this.goto(`/screen-settings/${screenId}`);
    await expect(this.directPlaylistHeading, 'the Media tab must render its content sections').toBeVisible({
      timeout: 30_000,
    });
    return this;
  }

  /**
   * The card that holds the currently assigned direct playlist, if any.
   *
   * Located through its Change action rather than by heading: the card's buttons
   * render an icon before their label, so their accessible names are " Change" /
   * " Remove" — an anchored /^change$/ never matches them.
   */
  directPlaylistCard(): Locator {
    return this.page
      .locator('div.card-body')
      .filter({ has: this.page.getByRole('button', { name: /change/i }) })
      .first();
  }

  /** Name of the assigned playlist, or null when the screen has none. */
  async directPlaylistName(): Promise<string | null> {
    if (await this.emptyDirectPlaylist.isVisible().catch(() => false)) return null;
    const title = this.directPlaylistCard().locator('div[title]').first();
    if (!(await title.isVisible().catch(() => false))) return null;
    return (await title.getAttribute('title'))?.trim() ?? null;
  }

  /** The playlist id the card's Edit action links to — proves the reference, not just the label. */
  async directPlaylistId(): Promise<string | null> {
    const href = await this.directPlaylistCard()
      .locator('a[href^="/playlist-settings/"]')
      .first()
      .getAttribute('href')
      .catch(() => null);
    return href ? href.split('/').pop()! : null;
  }

  async openPicker(): Promise<this> {
    await this.assignPlaylistBtn.click();
    await expect(this.pickerSearch, 'the picker must offer a content search').toBeVisible({
      timeout: 20_000,
    });
    return this;
  }

  /** Type into the picker search and let its debounce settle. */
  async searchPicker(term: string): Promise<this> {
    await this.pickerSearch.fill(term);
    await this.page.waitForTimeout(3_500);
    return this;
  }

  /** Rows the picker currently offers — one Publish button per playlist. */
  publishButtons(): Locator {
    return this.page.getByRole('button', { name: /^publish$/i });
  }

  /**
   * How a name appears in the picker: truncated to 20 characters. Callers that
   * assert a name is ABSENT must use this too, or they assert on a string the
   * picker would never have rendered even if the item were listed.
   */
  pickerLabel(name: string): Locator {
    return this.page.getByText(name.slice(0, 20), { exact: false });
  }

  /**
   * The Publish button that belongs to the row for `name`.
   *
   * Resolved by walking up from the row's own title element rather than by taking
   * "the first Publish on the page": once a playlist is assigned, the picker keeps
   * offering the currently published one alongside the search hit, so a positional
   * pick would republish the playlist already on the screen.
   */
  private async publishButtonFor(name: string): Promise<Locator> {
    // The picker truncates a playlist name to 20 characters and carries no title
    // attribute (unlike the assigned card, which does), so the row is anchored on
    // the visible prefix. The search box has already been filled with the FULL
    // name, so the only rows on screen are that playlist and whatever is
    // currently published — the prefix cannot collide with a sibling.
    const label = this.pickerLabel(name).first();
    await expect(label, `the picker must offer a row for ${name}`).toBeVisible({ timeout: 20_000 });

    let node = label;
    for (let up = 0; up < 8; up++) {
      node = node.locator('xpath=..');
      const publish = node.getByRole('button', { name: /publish/i });
      if ((await publish.count()) === 1) return publish;
    }
    throw new Error(`no Publish action found on the picker row for ${name}`);
  }

  /** Publish `name` to this screen, through that playlist's own row. */
  async publishPlaylist(name: string): Promise<void> {
    await this.openPicker();
    await this.searchPicker(name);
    const publish = await this.publishButtonFor(name);

    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('/screen/publishPlaylist') && r.request().method() === 'POST',
        { timeout: 45_000 },
      ),
      publish.click(),
    ]);
    expect(response.ok(), 'publishing a playlist to a screen must succeed').toBe(true);
    await this.page.waitForTimeout(3_000);
  }

  /** Remove the assigned playlist through the confirm modal. */
  async unpublishPlaylist(): Promise<void> {
    await this.directPlaylistCard().getByRole('button', { name: /remove/i }).click();
    const confirm = this.page.getByRole('button', { name: /unpublish playlist/i }).last();
    await expect(confirm, 'removing must ask for confirmation first').toBeVisible({ timeout: 15_000 });
    await confirm.click();
    await this.page.waitForTimeout(4_000);
  }

  /** Any campaign-shaped control on the screen surface — expected to be zero. */
  campaignControls(): Locator {
    return this.page.getByRole('button', { name: /campaign/i });
  }
}

export default ScreenSettingsPage;
