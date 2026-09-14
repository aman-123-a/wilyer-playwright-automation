// =============================================================================
//  Maker-checker flows — the shortest reliable path to each approval mail.
//
//  This is not a general page object for the library or the playlist editor;
//  those exist already. It is the set of steps that provably drive one
//  notification each, written down because several of them are not where you
//  would look for them:
//
//    * There is NO media-upload control on /library for a folder-fenced maker.
//      The only upload entry that works for that role is the "+ Upload" button
//      inside the playlist editor. /library?action=uploadContent renders no
//      modal at all for this user, and the dashboard's "Add Media" tile links
//      to that same dead route.
//
//    * "+ New Playlist" on /playlists does nothing on a fresh load. Navigating
//      to /playlists?action=createPlaylist opens the same modal reliably, so
//      that is what createPlaylist() uses.
//
//    * A zone cannot be drawn by dragging across the grid, and "Full Screen"
//      needs a zone to already exist. Dragging a MEDIA thumbnail onto the
//      canvas creates the zone and fills it in one gesture — with real mouse
//      steps, because a single dragTo() is too fast for the drop handler.
//
//  Every method leaves the app on a settled page and returns the identifier a
//  test needs to correlate the mail it caused.
// =============================================================================

import type { Page } from '@playwright/test';
import { ENV } from '../config/env';

/** The drop handler needs intermediate mouse moves; a single jump is ignored. */
const DRAG_STEPS = 10;

export class ApprovalFlowsPage {
  constructor(private readonly page: Page) {}

  // ── session ───────────────────────────────────────────────────────────────

  /** Sign in, clearing any previous identity first — maker and checker share
   *  an origin, so a leftover session silently runs the wrong role. */
  async loginAs(who: 'maker' | 'checker'): Promise<void> {
    const creds = who === 'maker' ? ENV.MAKER : ENV.CHECKER;
    await this.page.goto(`${ENV.BASE_URL}/`);
    await this.page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await this.page.context().clearCookies();

    await this.page.goto(`${ENV.BASE_URL}/login`);
    await this.page.getByRole('textbox', { name: 'Enter your email or phone' }).fill(creds.email);
    await this.page.getByRole('textbox', { name: 'Enter your password' }).fill(creds.password);
    await this.page.getByRole('button', { name: 'Log In' }).click();
    await this.page.waitForURL(`${ENV.BASE_URL}/`, { timeout: 30_000 });
    await this.page.getByText(creds.email).first().waitFor({ timeout: 30_000 });
  }

  // ── maker: uploads ────────────────────────────────────────────────────────

  /**
   * Upload files as the maker, which raises one upload-approval request.
   *
   * Runs through the playlist editor because that is the only working upload
   * entry for a folder-fenced maker — see the header note. `playlistId` is any
   * playlist the maker owns; nothing about it is modified.
   */
  async uploadFiles(playlistId: string, paths: readonly string[]): Promise<void> {
    await this.page.goto(`${ENV.BASE_URL}/playlist-settings/${playlistId}`);
    await this.page.getByRole('button', { name: /Upload/ }).first().waitFor({ timeout: 30_000 });

    const chooser = this.page.waitForEvent('filechooser');
    await this.page.getByRole('button', { name: /Upload/ }).first().click();
    await (await chooser).setFiles([...paths]);

    // The uppy pipeline is create-multipart -> sign-part -> PUT -> complete ->
    // finalize per file. Wait on the last call of the last file, not a toast.
    await this.page.waitForResponse(
      (r) => r.url().includes('/file/uppy/finalize') && r.status() === 200,
      { timeout: 120_000 },
    );
    await this.page.waitForTimeout(2000);
  }

  // ── maker: playlists ──────────────────────────────────────────────────────

  /** Create a playlist in `folderName` and return its id. */
  async createPlaylist(name: string, folderName: string): Promise<string> {
    await this.page.goto(`${ENV.BASE_URL}/playlists?action=createPlaylist`);
    const modal = this.page.locator('.modal.show');
    await modal.waitFor({ timeout: 30_000 });

    await modal.locator('input').first().fill(name);
    await modal.locator('select').selectOption({ label: folderName });
    await modal.getByRole('button', { name: 'Create Playlist' }).click();

    await this.page.waitForURL(/\/playlist-settings\/[a-f0-9]{24}/, { timeout: 30_000 });
    return this.page.url().split('/').pop() as string;
  }

  /**
   * Drag the first media thumbnail onto the canvas, which creates a zone and
   * drops the file into it. Returns once the layout reports a zone.
   */
  async addFirstMediaToLayout(): Promise<void> {
    const thumb = this.page.locator('img').nth(2);
    await thumb.waitFor({ timeout: 30_000 });
    const box = await thumb.boundingBox();
    if (!box) throw new Error('No media thumbnail in the editor — the folder is empty.');

    const canvas = { x: 960, y: 360 };
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.mouse.down();
    await this.page.waitForTimeout(200);
    for (let i = 1; i <= DRAG_STEPS; i++) {
      await this.page.mouse.move(
        box.x + ((canvas.x - box.x) * i) / DRAG_STEPS,
        box.y + ((canvas.y - box.y) * i) / DRAG_STEPS,
      );
      await this.page.waitForTimeout(60);
    }
    await this.page.mouse.up();

    await this.page.getByText(/[1-9]\d* Zones? in /).waitFor({ timeout: 15_000 });
  }

  /**
   * Save the playlist and send it for approval against `screenCount` screens.
   *
   * The path is Save -> "Send for Approval" -> screen picker -> "Save and Send
   * for Approval" -> a confirm modal. The confirm modal is easy to miss: the
   * button that opens it is left covered by the backdrop, so a second click on
   * it times out rather than doing anything.
   */
  async sendPlaylistForApproval(screenCount = 1): Promise<void> {
    await this.page.getByRole('button', { name: 'Save' }).first().click();
    await this.page.getByRole('button', { name: 'Send for Approval' }).first().click();

    const boxes = this.page.locator('table input[type=checkbox]');
    await boxes.first().waitFor({ timeout: 30_000 });
    for (let i = 1; i <= screenCount; i++) await boxes.nth(i).check();

    await this.page.getByRole('button', { name: 'Save and Send for Approval' }).first().click();
    await this.page
      .locator('#publishPlaylistConfirm')
      .getByRole('button', { name: 'Yes, Send for Approval' })
      .click();

    await this.page.waitForURL(/\/playlists\/unapproved/, { timeout: 30_000 });
  }

  // ── checker: decisions ────────────────────────────────────────────────────

  /** Approve or reject the top pending file-upload request. */
  async decideTopUpload(decision: 'approve' | 'reject'): Promise<string> {
    await this.page.goto(`${ENV.BASE_URL}/library?tab=unapprovedFiles&subtab=pending`);
    const label = decision === 'approve' ? 'Approve' : 'Reject';
    // The tab filters read "Approved"/"Rejected", so match the card buttons by
    // their exact (icon-prefixed) text rather than a substring.
    const button = this.page
      .locator('button')
      .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) })
      .first();
    await button.waitFor({ timeout: 30_000 });
    const card = await button.evaluate((b) => b.closest('div')?.parentElement?.innerText ?? '');
    await button.click();
    await this.page.getByText(`File ${decision}ed successfully.`).waitFor({ timeout: 30_000 });
    return card.split('\n')[0] ?? '';
  }

  /** Approve or reject the top pending content-publish request. */
  async decideTopPublish(decision: 'approve' | 'reject'): Promise<void> {
    await this.page.goto(`${ENV.BASE_URL}/library?tab=unapprovedMedia&subtab=pending`);
    const row = this.page.locator('table tbody tr').first();
    await row.waitFor({ timeout: 30_000 });
    await row.locator(decision === 'approve' ? 'button.btn-success' : 'button.btn-danger').click();
    await this.page
      .getByText(decision === 'approve' ? /approved and published/i : /rejected successfully/i)
      .waitFor({ timeout: 30_000 });
  }

  /** Approve or reject a playlist-publish request by playlist name. */
  async decidePlaylist(playlistName: string, decision: 'approve' | 'reject'): Promise<void> {
    await this.page.goto(`${ENV.BASE_URL}/playlists/unapproved`);
    const row = this.page.locator('table tbody tr').filter({ hasText: playlistName }).first();
    await row.waitFor({ timeout: 30_000 });
    await row.locator(decision === 'approve' ? 'button.btn-success' : 'button.btn-danger').click();
    await this.page.getByText(`Playlist ${decision}ed successfully.`).waitFor({ timeout: 30_000 });
  }
}
