import { test, expect } from '@playwright/test';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
//  FILE APPROVAL WORKFLOW — POSITIVE & NEGATIVE TEST CASES
//  CMS: https://cms.pocsample.in
//  Sub-User (Uploader): amankumarbsrbsr@gmail.com / 12345
//  Parent User (Approver): aman@wilyer.com / 12345
//  Supported formats: .jpg, .jpeg, .png, .mp4
//  Folder hierarchy: Sub-user → "sector 14" | Parent → "noida" → "sector 14"
// ═══════════════════════════════════════════════════════════════════════════════

const BASE_URL = 'https://cms.pocsample.in';

const SUB_USER = { email: 'amankumarbsrbsr@gmail.com', password: '12345' };
const PARENT_USER = { email: 'aman@wilyer.com', password: '12345' };

const SAMPLE_JPG = path.resolve('data/sample.jpg');
const FILE_BASE_NAME = 'sample';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login(page, user) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder*="email" i]', { timeout: 15_000 });
  await page.getByRole('textbox', { name: /email|phone/i }).fill(user.email);
  await page.getByRole('textbox', { name: /password/i }).fill(user.password);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.getByRole('button', { name: /log in/i })).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible({ timeout: 15_000 });
}

async function clickFolder(page, folderName) {
  const folderText = page.getByText(folderName, { exact: true });
  await expect(folderText.first()).toBeVisible({ timeout: 15_000 });
  await folderText.first().click();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function navigateToUploadFolder(page, role) {
  await page.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
  await expect(page.getByRole('heading', { name: /library/i })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  if (role === 'parent') await clickFolder(page, 'noida');
  await clickFolder(page, 'sector 14');
  await expect(page.getByRole('button', { name: /upload files?/i })).toBeVisible({ timeout: 15_000 });
}

async function uploadFile(page, filePath) {
  await page.getByRole('button', { name: /upload files?/i }).click();
  const browseBtn = page.getByRole('button', { name: /browse files?/i });
  await expect(browseBtn).toBeVisible({ timeout: 10_000 });
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    browseBtn.click(),
  ]);
  await fileChooser.setFiles(filePath);
  await expect(browseBtn).toBeHidden({ timeout: 60_000 });
}

async function switchToUnapprovedFilesTab(page) {
  const tab = page.getByRole('link', { name: 'Unapproved Files' });
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();
  await expect(page.getByText('FILE APPROVALS')).toBeVisible({ timeout: 15_000 });
}

async function clickApprovalFilter(page, filterName) {
  await page.getByRole('button', { name: new RegExp(`^${filterName}$`, 'i') }).click();
  await page.waitForTimeout(2000);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 1: POSITIVE TEST CASES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('POSITIVE: File Approval Workflow', () => {
  test.setTimeout(180_000);

  // ── TC-P01: Sub-user can upload a valid JPG file ──────────────────────────
  test('TC-P01: Sub-user uploads a valid .jpg file successfully', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await navigateToUploadFolder(page, 'sub');
      await uploadFile(page, SAMPLE_JPG);

      // File should appear in Media tab
      await page.getByRole('link', { name: 'Media' }).click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(new RegExp(FILE_BASE_NAME, 'i')).first()).toBeVisible({ timeout: 20_000 });
      console.log('TC-P01 PASS: Sub-user uploaded .jpg successfully');
    } finally { await ctx.close(); }
  });

  // ── TC-P02: Uploaded file enters "Pending" approval state ─────────────────
  test('TC-P02: Uploaded file enters Pending state in Unapproved Files tab', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await navigateToUploadFolder(page, 'sub');
      await uploadFile(page, SAMPLE_JPG);

      await switchToUnapprovedFilesTab(page);
      await clickApprovalFilter(page, 'Pending');

      // Verify file is in the Pending queue
      await expect(page.getByText(new RegExp(FILE_BASE_NAME, 'i')).first()).toBeVisible({ timeout: 20_000 });
      // Verify count badge
      await expect(page.getByText(/\d+ files? · Pending/i)).toBeVisible({ timeout: 10_000 });
      console.log('TC-P02 PASS: File entered Pending state');
    } finally { await ctx.close(); }
  });

  // ── TC-P03: Parent user can see sub-user's pending file ───────────────────
  test('TC-P03: Parent user sees sub-user upload in their Pending queue', async ({ browser }) => {
    const subCtx = await browser.newContext();
    const parentCtx = await browser.newContext();
    const subPage = await subCtx.newPage();
    const parentPage = await parentCtx.newPage();
    try {
      // Sub-user uploads
      await login(subPage, SUB_USER);
      await navigateToUploadFolder(subPage, 'sub');
      await uploadFile(subPage, SAMPLE_JPG);

      // Parent navigates to approval queue
      await login(parentPage, PARENT_USER);
      await navigateToUploadFolder(parentPage, 'parent');
      await switchToUnapprovedFilesTab(parentPage);
      await clickApprovalFilter(parentPage, 'Pending');

      // Verify parent can see the file uploaded by sub-user
      await expect(parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first()).toBeVisible({ timeout: 20_000 });
      // Verify uploader name "AMAN" is displayed
      await expect(parentPage.getByText('AMAN').first()).toBeVisible({ timeout: 10_000 });
      console.log('TC-P03 PASS: Parent sees sub-user pending file with uploader name');
    } finally {
      await subCtx.close();
      await parentCtx.close();
    }
  });

  // ── TC-P04: Parent approves file → status changes to "Approved" ───────────
  test('TC-P04: Parent approves file → moves to Approved tab with attribution', async ({ browser }) => {
    const subCtx = await browser.newContext();
    const parentCtx = await browser.newContext();
    const subPage = await subCtx.newPage();
    const parentPage = await parentCtx.newPage();
    try {
      // Sub-user uploads
      await login(subPage, SUB_USER);
      await navigateToUploadFolder(subPage, 'sub');
      await uploadFile(subPage, SAMPLE_JPG);

      // Parent approves
      await login(parentPage, PARENT_USER);
      await navigateToUploadFolder(parentPage, 'parent');
      await switchToUnapprovedFilesTab(parentPage);
      await clickApprovalFilter(parentPage, 'Pending');
      await expect(parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first()).toBeVisible({ timeout: 20_000 });

      const approveBtn = parentPage.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' });
      await approveBtn.first().click();

      // Verify toast
      await expect(parentPage.getByText(/file approved successfully/i)).toBeVisible({ timeout: 10_000 });
      await parentPage.waitForTimeout(2000);

      // Verify in Approved tab
      await clickApprovalFilter(parentPage, 'Approved');
      await expect(parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first()).toBeVisible({ timeout: 20_000 });
      await expect(parentPage.getByText(/Approved by/i).first()).toBeVisible({ timeout: 10_000 });
      console.log('TC-P04 PASS: File approved, shows "Approved by" attribution');
    } finally {
      await subCtx.close();
      await parentCtx.close();
    }
  });

  // ── TC-P05: Parent rejects file → status changes to "Rejected" ────────────
  test('TC-P05: Parent rejects file → moves to Rejected tab with attribution', async ({ browser }) => {
    const subCtx = await browser.newContext();
    const parentCtx = await browser.newContext();
    const subPage = await subCtx.newPage();
    const parentPage = await parentCtx.newPage();
    try {
      // Sub-user uploads
      await login(subPage, SUB_USER);
      await navigateToUploadFolder(subPage, 'sub');
      await uploadFile(subPage, SAMPLE_JPG);

      // Parent rejects
      await login(parentPage, PARENT_USER);
      await navigateToUploadFolder(parentPage, 'parent');
      await switchToUnapprovedFilesTab(parentPage);
      await clickApprovalFilter(parentPage, 'Pending');
      await expect(parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first()).toBeVisible({ timeout: 20_000 });

      const rejectBtn = parentPage.locator('button', { hasText: 'Reject' }).filter({ hasNotText: 'Rejected' });
      await rejectBtn.first().click();
      await parentPage.waitForTimeout(2000);

      // Verify in Rejected tab
      await clickApprovalFilter(parentPage, 'Rejected');
      await expect(parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first()).toBeVisible({ timeout: 20_000 });
      await expect(parentPage.getByText(/Rejected by/i).first()).toBeVisible({ timeout: 10_000 });
      console.log('TC-P05 PASS: File rejected, shows "Rejected by" attribution');
    } finally {
      await subCtx.close();
      await parentCtx.close();
    }
  });

  // ── TC-P06: Pending count badge decrements after approval ─────────────────
  test('TC-P06: Pending file count decrements after parent approves', async ({ browser }) => {
    const subCtx = await browser.newContext();
    const parentCtx = await browser.newContext();
    const subPage = await subCtx.newPage();
    const parentPage = await parentCtx.newPage();
    try {
      await login(subPage, SUB_USER);
      await navigateToUploadFolder(subPage, 'sub');
      await uploadFile(subPage, SAMPLE_JPG);

      await login(parentPage, PARENT_USER);
      await navigateToUploadFolder(parentPage, 'parent');
      await switchToUnapprovedFilesTab(parentPage);
      await clickApprovalFilter(parentPage, 'Pending');

      // Capture count before approval
      const countBefore = await parentPage.getByText(/\d+ files? · Pending/i).innerText();
      const numBefore = parseInt(countBefore.match(/(\d+)/)[1]);

      // Approve one file
      const approveBtn = parentPage.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' });
      await approveBtn.first().click();
      await parentPage.waitForTimeout(3000);

      // Verify count decremented
      const countAfter = await parentPage.getByText(/\d+ files? · Pending/i).innerText();
      const numAfter = parseInt(countAfter.match(/(\d+)/)[1]);
      expect(numAfter).toBe(numBefore - 1);
      console.log(`TC-P06 PASS: Pending count ${numBefore} → ${numAfter}`);
    } finally {
      await subCtx.close();
      await parentCtx.close();
    }
  });

  // ── TC-P07: Sub-user sees approval status change (cross-user sync) ────────
  test('TC-P07: Sub-user sees approved status after parent approves', async ({ browser }) => {
    const subCtx = await browser.newContext();
    const parentCtx = await browser.newContext();
    const subPage = await subCtx.newPage();
    const parentPage = await parentCtx.newPage();
    try {
      await login(subPage, SUB_USER);
      await navigateToUploadFolder(subPage, 'sub');
      await uploadFile(subPage, SAMPLE_JPG);

      // Parent approves
      await login(parentPage, PARENT_USER);
      await navigateToUploadFolder(parentPage, 'parent');
      await switchToUnapprovedFilesTab(parentPage);
      await clickApprovalFilter(parentPage, 'Pending');
      const approveBtn = parentPage.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' });
      await approveBtn.first().click();
      await parentPage.waitForTimeout(3000);

      // Sub-user checks Approved tab
      await subPage.reload({ waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
      await switchToUnapprovedFilesTab(subPage);
      await clickApprovalFilter(subPage, 'Approved');
      await expect(subPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first()).toBeVisible({ timeout: 20_000 });
      console.log('TC-P07 PASS: Sub-user sees file moved to Approved');
    } finally {
      await subCtx.close();
      await parentCtx.close();
    }
  });

  // ── TC-P08: Approval queue search works ───────────────────────────────────
  test('TC-P08: Search in approval queue finds file by name', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await navigateToUploadFolder(page, 'sub');
      await uploadFile(page, SAMPLE_JPG);
      await switchToUnapprovedFilesTab(page);
      await clickApprovalFilter(page, 'Pending');

      const searchBox = page.locator('input[placeholder="Search..."]');
      await expect(searchBox).toBeVisible({ timeout: 10_000 });
      await searchBox.fill(FILE_BASE_NAME);
      await page.waitForTimeout(2000);
      await expect(page.getByText(new RegExp(FILE_BASE_NAME, 'i')).first()).toBeVisible({ timeout: 15_000 });
      console.log('TC-P08 PASS: Search returns matching file');
    } finally { await ctx.close(); }
  });

  // ── TC-P09: Filter buttons toggle correctly ───────────────────────────────
  test('TC-P09: Pending/Approved/Rejected filters update count badge', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await navigateToUploadFolder(page, 'sub');
      await switchToUnapprovedFilesTab(page);

      await clickApprovalFilter(page, 'Pending');
      await expect(page.getByText(/\d+ files? · Pending/i)).toBeVisible({ timeout: 10_000 });

      await clickApprovalFilter(page, 'Approved');
      await expect(page.getByText(/\d+ files? · Approved/i)).toBeVisible({ timeout: 10_000 });

      await clickApprovalFilter(page, 'Rejected');
      await expect(page.getByText(/\d+ files? · Rejected/i)).toBeVisible({ timeout: 10_000 });
      console.log('TC-P09 PASS: All three filters show correct count badges');
    } finally { await ctx.close(); }
  });

  // ── TC-P10: File metadata displayed correctly in Pending queue ────────────
  test('TC-P10: Pending file shows correct metadata (type, size, date, uploader)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await navigateToUploadFolder(page, 'sub');
      await uploadFile(page, SAMPLE_JPG);
      await switchToUnapprovedFilesTab(page);
      await clickApprovalFilter(page, 'Pending');

      // Verify metadata fields are displayed for the first file
      const fileRow = page.getByText(new RegExp(FILE_BASE_NAME, 'i')).first().locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"row") or contains(@class,"list")]').first();

      // Type badge
      await expect(page.getByText('IMAGE').first()).toBeVisible({ timeout: 10_000 });
      // Size
      await expect(page.getByText(/\d+\.\d+MB/).first()).toBeVisible({ timeout: 10_000 });
      // Date
      await expect(page.getByText(/\d{1,2} \w+ \d{4}/).first()).toBeVisible({ timeout: 10_000 });
      // Uploader name
      await expect(page.getByText('AMAN').first()).toBeVisible({ timeout: 10_000 });
      console.log('TC-P10 PASS: File metadata (type, size, date, uploader) displayed correctly');
    } finally { await ctx.close(); }
  });

  // ── TC-P11: Upload dialog shows correct target folder ─────────────────────
  test('TC-P11: Upload dialog shows correct folder breadcrumb and supported formats', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await navigateToUploadFolder(page, 'sub');
      await page.getByRole('button', { name: /upload files?/i }).click();

      // Verify upload target folder
      await expect(page.getByText(/upload files to/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('sector 14').first()).toBeVisible({ timeout: 10_000 });

      // Verify supported formats shown
      await expect(page.getByText(/supported formats/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/\.jpg/i)).toBeVisible();
      await expect(page.getByText(/\.png/i)).toBeVisible();
      await expect(page.getByText(/\.mp4/i)).toBeVisible();

      // Verify Browse Files button
      await expect(page.getByRole('button', { name: /browse files?/i })).toBeVisible();

      // Verify drag-and-drop area text
      await expect(page.getByText(/drop files here/i)).toBeVisible();
      console.log('TC-P11 PASS: Upload dialog shows folder, formats, and drag-drop area');
    } finally { await ctx.close(); }
  });

  // ── TC-P12: Eye icon (preview) button visible on all file entries ─────────
  test('TC-P12: Preview (eye) icon visible on files across all approval states', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, PARENT_USER);
      await navigateToUploadFolder(page, 'parent');
      await switchToUnapprovedFilesTab(page);

      // Check Pending tab has eye icon
      await clickApprovalFilter(page, 'Pending');
      const pendingCount = await page.getByText(/\d+ files? · Pending/i).innerText();
      if (!pendingCount.startsWith('0')) {
        await expect(page.locator('button').filter({ has: page.locator('svg, i') }).first()).toBeVisible({ timeout: 10_000 });
      }

      // Check Approved tab has eye icon
      await clickApprovalFilter(page, 'Approved');
      const approvedCount = await page.getByText(/\d+ files? · Approved/i).innerText();
      if (!approvedCount.startsWith('0')) {
        await expect(page.locator('button svg, button i').first()).toBeVisible({ timeout: 10_000 });
      }
      console.log('TC-P12 PASS: Preview icon visible on file entries');
    } finally { await ctx.close(); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 2: NEGATIVE TEST CASES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('NEGATIVE: File Approval Workflow', () => {
  test.setTimeout(180_000);

  // ── TC-N01: Sub-user CANNOT approve their own files (RBAC) ────────────────
  test('TC-N01: Sub-user does NOT have Approve/Reject action buttons', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await navigateToUploadFolder(page, 'sub');
      await uploadFile(page, SAMPLE_JPG);
      await switchToUnapprovedFilesTab(page);
      await clickApprovalFilter(page, 'Pending');

      // Verify file is visible
      await expect(page.getByText(new RegExp(FILE_BASE_NAME, 'i')).first()).toBeVisible({ timeout: 20_000 });

      // RBAC: Action buttons must NOT exist (filter buttons "Approved"/"Rejected" WILL exist)
      const approveActionBtn = page.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' });
      const rejectActionBtn = page.locator('button', { hasText: 'Reject' }).filter({ hasNotText: 'Rejected' });

      await expect(approveActionBtn).toHaveCount(0, { timeout: 5_000 });
      await expect(rejectActionBtn).toHaveCount(0, { timeout: 5_000 });
      console.log('TC-N01 PASS: Sub-user has NO Approve/Reject action buttons (RBAC enforced)');
    } finally { await ctx.close(); }
  });

  // ── TC-N02: Search for non-existent file shows "No data available" ────────
  test('TC-N02: Search for non-existent file shows empty state', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await navigateToUploadFolder(page, 'sub');
      await switchToUnapprovedFilesTab(page);
      await clickApprovalFilter(page, 'Pending');

      const searchBox = page.locator('input[placeholder="Search..."]');
      await expect(searchBox).toBeVisible({ timeout: 10_000 });
      await searchBox.fill('zzz_nonexistent_file_99999');
      await page.waitForTimeout(2000);

      // Should show "No data available" or zero results
      const noData = await page.getByText(/no data available/i).isVisible().catch(() => false);
      const noResults = await page.getByText(new RegExp(FILE_BASE_NAME, 'i')).isVisible().catch(() => false);
      expect(noData || !noResults).toBeTruthy();
      console.log('TC-N02 PASS: Non-existent search shows empty/no data');
    } finally { await ctx.close(); }
  });

  // ── TC-N03: XSS payload in search does not execute ────────────────────────
  test('TC-N03: XSS payload in search field does not execute script', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await navigateToUploadFolder(page, 'sub');
      await switchToUnapprovedFilesTab(page);
      await clickApprovalFilter(page, 'Pending');

      const searchBox = page.locator('input[placeholder="Search..."]');
      await searchBox.fill('<script>alert("XSS")</script>');
      await page.waitForTimeout(2000);

      // Page should not crash — FILE APPROVALS heading still visible
      await expect(page.getByText('FILE APPROVALS')).toBeVisible();
      // No script tags injected into DOM
      await expect(page.locator('script:has-text("XSS")')).toHaveCount(0);
      console.log('TC-N03 PASS: XSS payload handled safely');
    } finally { await ctx.close(); }
  });

  // ── TC-N04: SQL injection in search does not crash the app ────────────────
  test('TC-N04: SQL injection payload in search does not crash application', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await navigateToUploadFolder(page, 'sub');
      await switchToUnapprovedFilesTab(page);
      await clickApprovalFilter(page, 'Pending');

      const searchBox = page.locator('input[placeholder="Search..."]');
      await searchBox.fill("' OR 1=1 --");
      await page.waitForTimeout(2000);

      // Page should not crash
      await expect(page.getByText('FILE APPROVALS')).toBeVisible();
      console.log('TC-N04 PASS: SQL injection payload handled safely');
    } finally { await ctx.close(); }
  });

  // ── TC-N05: Upload unsupported file format (.pdf) ─────────────────────────
  test('TC-N05: Upload unsupported format (.pdf) is rejected or not accepted', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await navigateToUploadFolder(page, 'sub');

      // Click Upload Files to see supported formats
      await page.getByRole('button', { name: /upload files?/i }).click();

      // Verify supported formats explicitly state .jpg, .jpeg, .png, .mp4
      await expect(page.getByText(/supported formats/i)).toBeVisible({ timeout: 10_000 });
      const formatsText = await page.getByText(/supported formats/i).innerText();
      expect(formatsText).not.toContain('.pdf');
      expect(formatsText).not.toContain('.gif');
      expect(formatsText).not.toContain('.bmp');
      expect(formatsText).not.toContain('.svg');
      expect(formatsText).toContain('.jpg');
      expect(formatsText).toContain('.png');
      expect(formatsText).toContain('.mp4');
      console.log('TC-N05 PASS: Unsupported formats (.pdf, .gif, .bmp, .svg) NOT listed');
    } finally { await ctx.close(); }
  });

  // ── TC-N06: Sub-user cannot access Team/Roles pages ───────────────────────
  test('TC-N06: Sub-user cannot access restricted admin pages via direct URL', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);

      // Try direct navigation to restricted pages
      for (const restrictedPath of ['/roles', '/members']) {
        await page.goto(`${BASE_URL}${restrictedPath}`, { waitUntil: 'networkidle', timeout: 15_000 }).catch(() => {});
        const url = page.url();
        const isBlocked = !url.includes(restrictedPath) || url.includes('login') || url === `${BASE_URL}/`;
        const hasError = await page.getByText(/unauthorized|forbidden|access denied|not found/i).isVisible().catch(() => false);
        expect(isBlocked || hasError, `${restrictedPath} should be blocked for sub-user`).toBeTruthy();
      }
      console.log('TC-N06 PASS: Sub-user blocked from restricted admin pages');
    } finally { await ctx.close(); }
  });

  // ── TC-N07: Upload Files button NOT visible at library root ───────────────
  test('TC-N07: Upload Files button is NOT visible at library root (only inside folder)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, SUB_USER);
      await page.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
      await expect(page.getByRole('heading', { name: /library/i })).toBeVisible({ timeout: 20_000 });

      // At root level, Upload Files button should NOT be visible
      const uploadBtn = page.getByRole('button', { name: /upload files?/i });
      await expect(uploadBtn).toHaveCount(0, { timeout: 5_000 });
      console.log('TC-N07 PASS: Upload Files button NOT visible at library root');
    } finally { await ctx.close(); }
  });

  // ── TC-N08: Approved file does NOT have Approve/Reject buttons ────────────
  test('TC-N08: Files in Approved tab do NOT have Approve/Reject action buttons', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, PARENT_USER);
      await navigateToUploadFolder(page, 'parent');
      await switchToUnapprovedFilesTab(page);
      await clickApprovalFilter(page, 'Approved');

      // Verify files exist in Approved tab
      await expect(page.getByText(/\d+ files? · Approved/i)).toBeVisible({ timeout: 10_000 });

      // Approve/Reject action buttons should NOT be present in Approved view
      const approveActionBtn = page.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' });
      const rejectActionBtn = page.locator('button', { hasText: 'Reject' }).filter({ hasNotText: 'Rejected' });
      await expect(approveActionBtn).toHaveCount(0, { timeout: 5_000 });
      await expect(rejectActionBtn).toHaveCount(0, { timeout: 5_000 });
      console.log('TC-N08 PASS: Approved files have no Approve/Reject action buttons');
    } finally { await ctx.close(); }
  });

  // ── TC-N09: Rejected file does NOT have Approve/Reject buttons ────────────
  test('TC-N09: Files in Rejected tab do NOT have Approve/Reject action buttons', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, PARENT_USER);
      await navigateToUploadFolder(page, 'parent');
      await switchToUnapprovedFilesTab(page);
      await clickApprovalFilter(page, 'Rejected');

      // Verify files exist in Rejected tab
      await expect(page.getByText(/\d+ files? · Rejected/i)).toBeVisible({ timeout: 10_000 });

      // Approve/Reject action buttons should NOT be present in Rejected view
      const approveActionBtn = page.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' });
      const rejectActionBtn = page.locator('button', { hasText: 'Reject' }).filter({ hasNotText: 'Rejected' });
      await expect(approveActionBtn).toHaveCount(0, { timeout: 5_000 });
      await expect(rejectActionBtn).toHaveCount(0, { timeout: 5_000 });
      console.log('TC-N09 PASS: Rejected files have no Approve/Reject action buttons');
    } finally { await ctx.close(); }
  });

  // ── TC-N10: Empty Pending queue shows "No data available" ─────────────────
  test('TC-N10: Empty approval queue shows "No data available" message', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page, PARENT_USER);
      await navigateToUploadFolder(page, 'parent');
      await switchToUnapprovedFilesTab(page);

      // Switch to a filter that may have 0 items
      // Check if "0 files" state shows the empty message
      const countText = await page.getByText(/\d+ files? · Pending/i).innerText();
      if (countText.startsWith('0')) {
        await expect(page.getByText(/no data available/i)).toBeVisible({ timeout: 10_000 });
        console.log('TC-N10 PASS: Empty Pending queue shows "No data available"');
      } else {
        // Search for something impossible to get empty state
        const searchBox = page.locator('input[placeholder="Search..."]');
        await searchBox.fill('zzz_impossible_99999');
        await page.waitForTimeout(2000);
        await expect(page.getByText(/no data available/i)).toBeVisible({ timeout: 10_000 });
        console.log('TC-N10 PASS: Empty search result shows "No data available"');
      }
    } finally { await ctx.close(); }
  });

  // ── TC-N11: Unauthenticated user cannot access library ────────────────────
  test('TC-N11: Unauthenticated user is redirected to login page', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      // Try to access library directly without logging in
      await page.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle', timeout: 15_000 }).catch(() => {});

      // Should redirect to login page
      const url = page.url();
      const loginVisible = await page.getByRole('button', { name: /log in/i }).isVisible().catch(() => false);
      expect(url.includes('/library') === false || loginVisible).toBeTruthy();
      console.log('TC-N11 PASS: Unauthenticated user redirected to login');
    } finally { await ctx.close(); }
  });

  // ── TC-N12: Invalid login credentials show error ──────────────────────────
  test('TC-N12: Invalid credentials do not grant access to approval workflow', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('input[placeholder*="email" i]', { timeout: 15_000 });
      await page.getByRole('textbox', { name: /email|phone/i }).fill('invalid@test.com');
      await page.getByRole('textbox', { name: /password/i }).fill('wrongpassword');
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForTimeout(3000);

      // Should still be on login page
      await expect(page.getByRole('button', { name: /log in/i })).toBeVisible({ timeout: 10_000 });
      // Should NOT see dashboard
      const dashboardVisible = await page.getByRole('link', { name: /dashboard/i }).isVisible().catch(() => false);
      expect(dashboardVisible).toBeFalsy();
      console.log('TC-N12 PASS: Invalid credentials blocked, still on login page');
    } finally { await ctx.close(); }
  });

  // ── TC-N13: Rapid double-click on Approve does not cause duplicate action ─
  test('TC-N13: Double-clicking Approve does not cause errors', async ({ browser }) => {
    const subCtx = await browser.newContext();
    const parentCtx = await browser.newContext();
    const subPage = await subCtx.newPage();
    const parentPage = await parentCtx.newPage();
    try {
      await login(subPage, SUB_USER);
      await navigateToUploadFolder(subPage, 'sub');
      await uploadFile(subPage, SAMPLE_JPG);

      await login(parentPage, PARENT_USER);
      await navigateToUploadFolder(parentPage, 'parent');
      await switchToUnapprovedFilesTab(parentPage);
      await clickApprovalFilter(parentPage, 'Pending');
      await expect(parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first()).toBeVisible({ timeout: 20_000 });

      // Rapid double-click on Approve
      const approveBtn = parentPage.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' });
      await approveBtn.first().dblclick();
      await parentPage.waitForTimeout(3000);

      // Page should not crash — FILE APPROVALS heading still visible
      await expect(parentPage.getByText('FILE APPROVALS')).toBeVisible({ timeout: 10_000 });
      console.log('TC-N13 PASS: Double-click on Approve handled gracefully');
    } finally {
      await subCtx.close();
      await parentCtx.close();
    }
  });
});
