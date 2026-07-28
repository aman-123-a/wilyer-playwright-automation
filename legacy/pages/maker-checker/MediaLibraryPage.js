import { expect } from '@playwright/test';
import path from 'path';
import { BasePage } from './BasePage.js';

// MediaLibraryPage — Maker/Checker surface for the /library route on
// cms.pocsample.in. Covers folder navigation, the Upload Files dialog, the
// Unapproved Files tab (FILE APPROVALS) and per-file Approve / Reject / Edit
// actions used by the maker-checker media workflow.
//
// Notes captured from the live app:
//  • Upload dialog: Browse Files → file chooser auto-starts; dialog closes when done.
//  • Library page never reaches networkidle — rely on DOM waits.
//  • Filter buttons are siblings of the FILE APPROVALS heading, named exactly
//    "Pending" / "Approved" / "Rejected".
//  • Approve / Reject ACTION buttons share text with the filter buttons; we
//    disambiguate with hasNotText for the trailing "d".
export class MediaLibraryPage extends BasePage {
  constructor(page) {
    super(page);

    // Top-level Library nav + structural elements
    this.libraryNav        = page.getByRole('link', { name: /^library$/i });
    this.libraryHeading    = page.getByRole('heading', { name: /library/i });
    this.mediaTab          = page.getByRole('link', { name: /^media$/i });
    // Approval-queue entry points seen on cms.pocsample.in:
    //   • Maker-side button "Upload Requests" (top-right, with pending count)
    //   • Some tenants surface a sidebar link "Unapproved Files" instead.
    this.unapprovedTab     = page.getByRole('link', { name: /unapproved files?/i });
    // Any clickable element labelled "Upload Requests" — could be button or anchor
    this.uploadRequestsBtn = page.locator('button, a').filter({ hasText: /^upload requests?\s*\d*$/i }).first();
    this.fileApprovalsHdr  = page.getByText(/FILE APPROVALS|UPLOAD REQUESTS|PENDING APPROVALS|approval requests/i);
    this.searchBox         = page.locator('input[placeholder="Search..."]');

    // Upload dialog
    this.uploadFilesBtn    = page.getByRole('button', { name: /upload files?/i });
    this.browseBtn         = page.getByRole('button', { name: /browse files?/i });

    // Filter buttons inside FILE APPROVALS
    this.pendingFilter     = page.getByRole('button', { name: /^pending$/i });
    this.approvedFilter    = page.getByRole('button', { name: /^approved$/i });
    this.rejectedFilter    = page.getByRole('button', { name: /^rejected$/i });

    // Action buttons — exact text "Approve" / "Reject" only (NOT "Approved"/"Rejected")
    this.approveActionBtn  = page.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' });
    this.rejectActionBtn   = page.locator('button', { hasText: 'Reject' }).filter({ hasNotText: 'Rejected' });

    // Reject reason / comment dialog (when present)
    this.commentInput      = page.locator('textarea, input[type="text"]').filter({ hasText: '' }).first();
    this.confirmBtn        = page.getByRole('button', { name: /confirm|submit|continue|yes|ok/i });

    // Toast / inline messages
    this.toast             = page.locator('.toast, .toast-body, [role="status"], [role="alert"]');

    // User menu / logout
    this.profileMenu       = page.locator('header').getByRole('img').last();
    this.logoutBtn         = page.getByRole('button', { name: /log\s*out|sign\s*out/i });
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  async open() {
    await this.page.goto('/library', { waitUntil: 'domcontentloaded' });
    await expect(this.libraryHeading).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Walk into the upload folder. The CMS shows a different starting point
   * for each role:
   *   maker   → "sector 14" sits at root (when present).
   *   checker → "noida" parent folder → "sector 14" (when present).
   *
   * Tolerant: if a folder isn't visible we stay at the current level. The
   * Upload Files button is the real anchor — if it's already exposed at /library
   * root for this user, we don't need to descend at all.
   */
  async navigateToUploadFolder(role) {
    await this.open();
    await this.page.waitForTimeout(800); // sidebar mount settles

    // Folder names live on the tenant — overridable via env. Defaults match
    // what amankumarbsrbsr@gmail.com / aman@wilyer.com see today on cms.pocsample.in.
    if (role === 'checker') {
      // Checker exposes Upload Requests at root — no descend needed. Try a
      // folder if the env var is set, but don't fail if absent.
      const parent = process.env.CHECKER_PARENT_FOLDER;
      if (parent) await this.tryClickFolder(parent);
      // Don't require Upload Files for the checker (they don't need to upload).
      return;
    }

    const child = process.env.UPLOAD_FOLDER || 'test';
    await this.tryClickFolder(child);
    await expect(this.uploadFilesBtn).toBeVisible({ timeout: 15_000 });
  }

  /** Strict click — fails the test if the folder isn't there. */
  async clickFolder(name) {
    const folderText = this.page.getByText(name, { exact: true });
    await expect(folderText.first()).toBeVisible({ timeout: 15_000 });
    await folderText.first().click();
    await this.page.waitForTimeout(800);
  }

  /** Soft click — returns true if entered, false if folder absent. */
  async tryClickFolder(name, timeout = 5000) {
    const folderText = this.page.getByText(name, { exact: true }).first();
    const visible = await folderText.isVisible({ timeout }).catch(() => false);
    if (!visible) return false;
    await folderText.click();
    await this.page.waitForTimeout(800);
    return true;
  }

  // ─── Upload ───────────────────────────────────────────────────────────────
  /**
   * Upload a single file via Upload Files → Browse Files. The CMS auto-starts
   * the upload on file selection; dialog closes when finished.
   * Returns the base name (no extension) for downstream visibility checks.
   */
  async uploadFile(filePath) {
    await expect(this.uploadFilesBtn).toBeVisible({ timeout: 15_000 });
    await this.uploadFilesBtn.click();

    await expect(this.browseBtn).toBeVisible({ timeout: 10_000 });
    const [chooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      this.browseBtn.click(),
    ]);
    await chooser.setFiles(filePath);

    // Dialog auto-closes on completion — that's the upload-finished signal.
    await expect(this.browseBtn).toBeHidden({ timeout: 60_000 });

    return path.basename(filePath).replace(/\.[^.]+$/, '');
  }

  // ─── Approval queue helpers ───────────────────────────────────────────────
  /**
   * Open the approval queue — the CMS exposes this via either a sidebar link
   * "Unapproved Files" or a top-right button "Upload Requests" depending on
   * tenant. Try both, accept whichever exists.
   */
  async openUnapprovedTab() {
    const sidebarVisible = await this.unapprovedTab.isVisible({ timeout: 3000 }).catch(() => false);
    if (sidebarVisible) {
      await this.unapprovedTab.click();
    } else {
      // Scroll back to top so the top-right "Upload Requests" button is visible
      await this.page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      await this.uploadRequestsBtn.scrollIntoViewIfNeeded().catch(() => {});
      await expect(this.uploadRequestsBtn).toBeVisible({ timeout: 15_000 });
      await this.uploadRequestsBtn.click();
    }
    // Anchor on the Pending filter button — most reliable signal that the
    // FILE APPROVALS panel rendered.
    await expect(this.pendingFilter).toBeVisible({ timeout: 15_000 });
  }

  async clickFilter(label) {
    const map = { Pending: this.pendingFilter, Approved: this.approvedFilter, Rejected: this.rejectedFilter };
    const btn = map[label];
    if (!btn) throw new Error(`Unknown filter: ${label}`);
    await btn.click();
    await this.page.waitForTimeout(1500);
  }

  fileRow(baseName) {
    return this.page.getByText(new RegExp(baseName, 'i')).first();
  }

  /** Approve the first pending file (matches button text "Approve" exactly). */
  async approveFirst() {
    await this.clickFilter('Pending');
    await expect(this.approveActionBtn.first()).toBeVisible({ timeout: 10_000 });
    await this.approveActionBtn.first().click();
    await this.page.waitForTimeout(2000);
  }

  /**
   * Reject the first pending file. If a comment dialog appears, fill it and
   * confirm. If `comment` is empty, only fill nothing — useful for the
   * "reject without comment" negative case.
   */
  async rejectFirst(comment = '') {
    await this.clickFilter('Pending');
    await expect(this.rejectActionBtn.first()).toBeVisible({ timeout: 10_000 });
    await this.rejectActionBtn.first().click();

    // If a confirm/comment dialog appears, handle it. This CMS may or may not
    // prompt — both branches are valid.
    const commentBox = this.page.locator('textarea, input[placeholder*="reason" i], input[placeholder*="comment" i]').first();
    const dialogConfirm = this.page.getByRole('button', { name: /confirm|reject|submit|yes|ok/i }).last();

    if (await commentBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (comment) await commentBox.fill(comment);
      if (await dialogConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dialogConfirm.click().catch(() => {});
      }
    }
    await this.page.waitForTimeout(2000);
  }

  // ─── Misc ─────────────────────────────────────────────────────────────────
  /** Best-effort logout — clears cookies + localStorage as a robust fallback. */
  async logout() {
    // Try the visible profile/logout path first
    const visibleLogout = this.page.getByText(/log\s*out|sign\s*out/i).first();
    if (await visibleLogout.isVisible({ timeout: 2000 }).catch(() => false)) {
      await visibleLogout.click().catch(() => {});
      await this.page.waitForTimeout(1500);
    }
    // Hard reset — guarantees a clean session for the next role
    await this.page.context().clearCookies().catch(() => {});
    await this.page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (_) {} }).catch(() => {});
  }
}
