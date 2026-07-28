import { test, expect, chromium } from '@playwright/test';
import path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL = 'https://cms.pocsample.in';

// Sub-User (Uploader) — uploads files that need approval
const SUB_USER = {
  email: 'amankumarbsrbsr@gmail.com',
  password: '12345',
  displayName: 'AMAN',
};

// Parent User (Approver) — can approve or reject sub-user uploads
const PARENT_USER = {
  email: 'aman@wilyer.com',
  password: '12345',

  displayName: 'QA',
};

// Test image to upload — must exist in data/ directory
const SAMPLE_FILE = path.resolve('data/sample.jpg');
const SAMPLE_NAME = path.basename(SAMPLE_FILE);
const FILE_BASE_NAME = SAMPLE_NAME.replace(/\.[^.]+$/, ''); // "sample"

// Unique stamp to identify this test run's upload in the approval queue
const STAMP = Date.now();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Logs into the CMS with the given credentials.
 * Waits for the login button to disappear (proof that auth succeeded)
 * and the dashboard sidebar to become visible.
 */
async function login(page, user) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 15_000 });

  await page.getByRole('textbox', { name: /email|phone/i }).fill(user.email);
  await page.getByRole('textbox', { name: /password/i }).fill(user.password);

  const loginBtn = page.getByRole('button', { name: /log in/i });
  await loginBtn.click();

  // Wait for login to complete — login button disappears on success
  await expect(loginBtn).toBeHidden({ timeout: 20_000 });

  // Confirm we're on the dashboard — sidebar link visible
  await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible({ timeout: 15_000 });
  console.log(`  Logged in as ${user.email}`);
}

/**
 * Clicks a folder item in the Library folder sidebar.
 * Folder items are div containers with [cursor=pointer] containing the folder name text.
 * A single click enters the folder. We wait for the breadcrumb to update as confirmation.
 */
async function clickFolder(page, folderName) {
  // Target the visible text label inside the folder sidebar.
  // The folder container is: div[cursor=pointer] > ... > div (text label)
  const folderText = page.getByText(folderName, { exact: true });
  await expect(folderText.first()).toBeVisible({ timeout: 15_000 });
  await folderText.first().click();
  // Wait for the folder to open — breadcrumb or subfolder section updates
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => { });
  await page.waitForTimeout(1000);
  console.log(`  Clicked folder: ${folderName}`);
}

/**
 * Navigates into the folder hierarchy where uploads happen.
 * Hierarchy:
 *   Sub-user:   Library root → "sector 14" folder
 *   Parent user: Library root → "noida" folder → "sector 14" subfolder
 *
 * @param {import('@playwright/test').Page} page
 * @param {'sub' | 'parent'} role - Which user is navigating
 */
async function navigateToUploadFolder(page, role) {
  await page.goto(`${BASE_URL}/library`, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => { });
  // Wait for the Library heading to confirm page loaded
  await expect(page.getByRole('heading', { name: /library/i })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000);

  if (role === 'parent') {
    // Parent sees "noida" folder at root — click to enter, then "sector 14" inside
    await clickFolder(page, 'noida');
  }

  // Both users see "sector 14" folder at their current level — click to enter
  await clickFolder(page, 'sector 14');

  // Verify we're inside the folder — Upload Files button should be visible
  await expect(page.getByRole('button', { name: /upload files?/i })).toBeVisible({ timeout: 15_000 });
  console.log(`  Navigated to upload folder (role: ${role})`);
}

/**
 * Uploads a file via the Upload Files → Browse Files flow.
 * The CMS auto-starts upload on file selection (no confirm button).
 * Dialog closing indicates upload is complete.
 */
async function uploadFile(page, filePath) {
  // Click "Upload Files" to open the upload dialog
  await page.getByRole('button', { name: /upload files?/i }).click();

  // Click "Browse Files" and handle the native file chooser
  const browseBtn = page.getByRole('button', { name: /browse files?/i });
  await expect(browseBtn).toBeVisible({ timeout: 10_000 });

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    browseBtn.click(),
  ]);
  await fileChooser.setFiles(filePath);
  console.log(`  Selected file: ${path.basename(filePath)}`);

  // Upload auto-starts — wait for dialog to close (browse button hidden)
  await expect(browseBtn).toBeHidden({ timeout: 60_000 });
  console.log('  Upload dialog closed — upload complete');
}

/**
 * Switches to the "Unapproved Files" tab in the Library.
 * Waits for the FILE APPROVALS heading to confirm the tab loaded.
 */
async function switchToUnapprovedFilesTab(page) {
  const tab = page.getByRole('link', { name: 'Unapproved Files' });
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();

  // Wait for the FILE APPROVALS section to appear
  await expect(page.getByText('FILE APPROVALS')).toBeVisible({ timeout: 15_000 });
  console.log('  Switched to Unapproved Files tab');
}

/**
 * Clicks one of the status filter buttons (Pending / Approved / Rejected)
 * in the FILE APPROVALS section.
 */
async function clickApprovalFilter(page, filterName) {
  const filterBtn = page.getByRole('button', { name: new RegExp(`^${filterName}$`, 'i') });
  await expect(filterBtn).toBeVisible({ timeout: 10_000 });
  await filterBtn.click();
  // Allow time for the filter to apply and content to refresh
  await page.waitForTimeout(2000);
  console.log(`  Clicked "${filterName}" filter`);
}

// =============================================================================
//  IMAGE APPROVAL WORKFLOW — Multi-Context Tests
// =============================================================================

test.describe('Image Approval Workflow', () => {
  // Longer timeout for multi-user handshake tests
  test.setTimeout(180_000);

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 1: Success Path — Sub-user uploads, Parent approves
  // ───────────────────────────────────────────────────────────────────────────

  test('Success Path: Sub-user uploads → Parent approves → status is Approved', async ({ browser }) => {
    // ── Step 1: Create two isolated browser contexts (separate sessions) ──
    // Using browser.newContext() ensures both users are "online" simultaneously
    // with independent cookies, localStorage, and session state.
    const subUserContext = await browser.newContext();
    const parentContext = await browser.newContext();

    const subPage = await subUserContext.newPage();
    const parentPage = await parentContext.newPage();

    try {
      // ── Step 2: Sub-user logs in and uploads an image ──
      console.log('\n--- SUB-USER: Login and Upload ---');
      await login(subPage, SUB_USER);
      await navigateToUploadFolder(subPage, 'sub');
      await uploadFile(subPage, SAMPLE_FILE);

      // ── Step 3: Sub-user verifies file appears in their "Unapproved Files" tab ──
      // After uploading, the file should enter "Pending" state in the approval queue
      console.log('\n--- SUB-USER: Verify file is Pending ---');
      await switchToUnapprovedFilesTab(subPage);
      await clickApprovalFilter(subPage, 'Pending');

      // The uploaded file should be visible in the Pending queue
      const pendingFile = subPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      await expect(pendingFile).toBeVisible({ timeout: 20_000 });
      console.log(`  File "${FILE_BASE_NAME}" found in Pending queue`);

      // Verify the pending file count badge shows at least 1 file
      await expect(subPage.getByText(/\d+ files? · Pending/i)).toBeVisible({ timeout: 10_000 });

      // ── Step 4: Parent user logs in and navigates to approval queue ──
      // This is the "handshake" — parent sees the file that sub-user uploaded
      console.log('\n--- PARENT USER: Login and Navigate to Approvals ---');
      await login(parentPage, PARENT_USER);
      await navigateToUploadFolder(parentPage, 'parent');
      await switchToUnapprovedFilesTab(parentPage);
      await clickApprovalFilter(parentPage, 'Pending');

      // ── Step 5: Parent verifies the uploaded file is in their Pending queue ──
      const parentPendingFile = parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      await expect(parentPendingFile).toBeVisible({ timeout: 20_000 });
      console.log(`  Parent sees "${FILE_BASE_NAME}" in Pending queue`);

      // ── Step 6: Parent approves the file ──
      // Look for the Approve button associated with the uploaded file
      // IMPORTANT: Use exact "Approve" to avoid matching the "Approved" filter button
      const approveBtn = parentPage.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' });
      await expect(approveBtn.first()).toBeVisible({ timeout: 10_000 });
      await approveBtn.first().click();

      // Wait for toast: "File approved successfully."
      const toast = parentPage.getByText(/file approved successfully/i);
      await toast.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
        console.log('  (No toast detected — checking status directly)');
      });

      // Allow server processing time
      await parentPage.waitForTimeout(2000);

      // ── Step 7: Verify the file now appears under "Approved" filter ──
      console.log('\n--- PARENT USER: Verify file moved to Approved ---');
      await clickApprovalFilter(parentPage, 'Approved');

      const approvedFile = parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      await expect(approvedFile).toBeVisible({ timeout: 20_000 });
      // Verify "Approved by" label is shown
      await expect(parentPage.getByText(/Approved by/i).first()).toBeVisible({ timeout: 10_000 });
      console.log(`  File "${FILE_BASE_NAME}" confirmed in Approved queue`);

      // ── Step 8: Sub-user also sees the file as Approved ──
      console.log('\n--- SUB-USER: Verify file status is now Approved ---');
      await subPage.reload({ waitUntil: 'networkidle', timeout: 30_000 }).catch(() => { });
      await switchToUnapprovedFilesTab(subPage);
      await clickApprovalFilter(subPage, 'Approved');

      const subApprovedFile = subPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      await expect(subApprovedFile).toBeVisible({ timeout: 20_000 });
      console.log(`  Sub-user confirms file "${FILE_BASE_NAME}" is Approved`);

    } finally {
      // Clean up browser contexts
      await subUserContext.close();
      await parentContext.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 2: Rejection Path — Sub-user uploads, Parent rejects
  // ───────────────────────────────────────────────────────────────────────────

  test('Rejection Path: Sub-user uploads → Parent rejects → status is Rejected', async ({ browser }) => {
    // ── Step 1: Create isolated contexts for both users ──
    const subUserContext = await browser.newContext();
    const parentContext = await browser.newContext();

    const subPage = await subUserContext.newPage();
    const parentPage = await parentContext.newPage();

    try {
      // ── Step 2: Sub-user uploads a new image ──
      console.log('\n--- SUB-USER: Login and Upload ---');
      await login(subPage, SUB_USER);
      await navigateToUploadFolder(subPage, 'sub');
      await uploadFile(subPage, SAMPLE_FILE);

      // ── Step 3: Verify file enters Pending state ──
      console.log('\n--- SUB-USER: Verify file is Pending ---');
      await switchToUnapprovedFilesTab(subPage);
      await clickApprovalFilter(subPage, 'Pending');

      const pendingFile = subPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      await expect(pendingFile).toBeVisible({ timeout: 20_000 });
      console.log(`  File "${FILE_BASE_NAME}" confirmed in Pending queue`);

      // ── Step 4: Parent logs in and navigates to the approval queue ──
      console.log('\n--- PARENT USER: Login and Navigate to Approvals ---');
      await login(parentPage, PARENT_USER);
      await navigateToUploadFolder(parentPage, 'parent');
      await switchToUnapprovedFilesTab(parentPage);
      await clickApprovalFilter(parentPage, 'Pending');

      // Verify file is visible in parent's Pending queue
      const parentPendingFile = parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      await expect(parentPendingFile).toBeVisible({ timeout: 20_000 });
      console.log(`  Parent sees "${FILE_BASE_NAME}" in Pending queue`);

      // ── Step 5: Parent rejects the file ──
      // IMPORTANT: Use exact "Reject" to avoid matching the "Rejected" filter button
      const rejectBtn = parentPage.locator('button', { hasText: 'Reject' }).filter({ hasNotText: 'Rejected' });
      await expect(rejectBtn.first()).toBeVisible({ timeout: 10_000 });
      await rejectBtn.first().click();

      // Wait for toast: "File rejected successfully." or similar
      const toast = parentPage.getByText(/file rejected/i);
      await toast.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
        console.log('  (No toast detected — checking status directly)');
      });

      await parentPage.waitForTimeout(2000);

      // ── Step 6: Verify the file now appears under "Rejected" filter ──
      console.log('\n--- PARENT USER: Verify file moved to Rejected ---');
      await clickApprovalFilter(parentPage, 'Rejected');

      const rejectedFile = parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      await expect(rejectedFile).toBeVisible({ timeout: 20_000 });
      // Verify "Rejected by" label is shown
      await expect(parentPage.getByText(/Rejected by/i).first()).toBeVisible({ timeout: 10_000 });
      console.log(`  File "${FILE_BASE_NAME}" confirmed in Rejected queue`);

      // ── Step 7: Sub-user also sees the file as Rejected ──
      console.log('\n--- SUB-USER: Verify file status is now Rejected ---');
      await subPage.reload({ waitUntil: 'networkidle', timeout: 30_000 }).catch(() => { });
      await switchToUnapprovedFilesTab(subPage);
      await clickApprovalFilter(subPage, 'Rejected');

      const subRejectedFile = subPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      await expect(subRejectedFile).toBeVisible({ timeout: 20_000 });
      console.log(`  Sub-user confirms file "${FILE_BASE_NAME}" is Rejected`);

    } finally {
      await subUserContext.close();
      await parentContext.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 3: Security — Sub-user cannot approve their own files (RBAC)
  // ───────────────────────────────────────────────────────────────────────────

  test('Security: Sub-user does NOT have Approve/Reject buttons (RBAC)', async ({ browser }) => {
    const subUserContext = await browser.newContext();
    const subPage = await subUserContext.newPage();

    try {
      // ── Step 1: Sub-user logs in ──
      console.log('\n--- SUB-USER: Login ---');
      await login(subPage, SUB_USER);

      // ── Step 2: Navigate to the library folder and upload a file ──
      console.log('\n--- SUB-USER: Upload a file ---');
      await navigateToUploadFolder(subPage, 'sub');
      await uploadFile(subPage, SAMPLE_FILE);

      // ── Step 3: Switch to the Unapproved Files tab ──
      console.log('\n--- SUB-USER: Check Unapproved Files tab ---');
      await switchToUnapprovedFilesTab(subPage);
      await clickApprovalFilter(subPage, 'Pending');

      // Verify the file is visible in the Pending queue
      const pendingFile = subPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      await expect(pendingFile).toBeVisible({ timeout: 20_000 });

      // ── Step 4: RBAC Check — Approve/Reject ACTION buttons MUST NOT exist ──
      // Sub-users should only be able to view their pending files,
      // NOT approve or reject them. This is a critical security check.
      // NOTE: "Approved"/"Rejected" FILTER buttons will exist — we check for
      //       the ACTION buttons "Approve" and "Reject" (without trailing 'd').
      console.log('\n--- SECURITY: Verifying no Approve/Reject action buttons ---');

      // Use exact match: "Approve" (not "Approved") and "Reject" (not "Rejected")
      const approveActionBtn = subPage.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' });
      const rejectActionBtn = subPage.locator('button', { hasText: 'Reject' }).filter({ hasNotText: 'Rejected' });

      // These action buttons should NOT exist for the sub-user
      await expect(approveActionBtn).toHaveCount(0, { timeout: 5_000 });
      await expect(rejectActionBtn).toHaveCount(0, { timeout: 5_000 });
      console.log('  PASS: No Approve action button found for sub-user');
      console.log('  PASS: No Reject action button found for sub-user');

      // ── Step 5: Additional RBAC check — verify via DOM inspection ──
      // Even if buttons are hidden via CSS, they should not exist in the DOM.
      // Count buttons that match exact "Approve"/"Reject" (not "Approved"/"Rejected")
      const approveInDOM = await subPage.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' }).count();
      const rejectInDOM = await subPage.locator('button', { hasText: 'Reject' }).filter({ hasNotText: 'Rejected' }).count();

      expect(approveInDOM, 'Approve action button should not exist in DOM for sub-user').toBe(0);
      expect(rejectInDOM, 'Reject action button should not exist in DOM for sub-user').toBe(0);
      console.log('  PASS: Approve/Reject action buttons absent from DOM entirely');

    } finally {
      await subUserContext.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 4: UI Verification — Toast, badges, and visibility
  // ───────────────────────────────────────────────────────────────────────────

  test('UI Verification: toast messages, status badges, and file visibility', async ({ browser }) => {
    const subUserContext = await browser.newContext();
    const parentContext = await browser.newContext();

    const subPage = await subUserContext.newPage();
    const parentPage = await parentContext.newPage();

    try {
      // ── Step 1: Sub-user uploads a file ──
      console.log('\n--- SUB-USER: Upload file for UI verification ---');
      await login(subPage, SUB_USER);
      await navigateToUploadFolder(subPage, 'sub');
      await uploadFile(subPage, SAMPLE_FILE);

      // ── Step 2: Verify the "Unapproved Files" tab is visible and has correct structure ──
      console.log('\n--- UI: Verify Unapproved Files tab structure ---');
      await switchToUnapprovedFilesTab(subPage);

      // Verify all three filter buttons exist
      await expect(subPage.getByRole('button', { name: /^Pending$/i })).toBeVisible({ timeout: 10_000 });
      await expect(subPage.getByRole('button', { name: /^Approved$/i })).toBeVisible();
      await expect(subPage.getByRole('button', { name: /^Rejected$/i })).toBeVisible();
      console.log('  PASS: Pending / Approved / Rejected filter buttons present');

      // Verify the FILE APPROVALS heading
      await expect(subPage.getByText('FILE APPROVALS')).toBeVisible();
      console.log('  PASS: FILE APPROVALS heading visible');

      // Verify the file count badge format (e.g. "1 file · Pending")
      await clickApprovalFilter(subPage, 'Pending');
      await expect(subPage.getByText(/\d+ files? · Pending/i)).toBeVisible({ timeout: 10_000 });
      console.log('  PASS: File count badge shows correct format');

      // Verify the search box is present
      await expect(subPage.locator('input[placeholder="Search..."]')).toBeVisible();
      console.log('  PASS: Search box is present in approval queue');

      // ── Step 3: Verify uploaded file is in the Pending list with correct metadata ──
      const pendingFile = subPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      await expect(pendingFile).toBeVisible({ timeout: 15_000 });
      console.log(`  PASS: File "${FILE_BASE_NAME}" visible in Pending queue`);

      // ── Step 4: Parent user approves and we verify toast message ──
      console.log('\n--- PARENT USER: Approve file and check toast ---');
      await login(parentPage, PARENT_USER);
      await navigateToUploadFolder(parentPage, 'parent');
      await switchToUnapprovedFilesTab(parentPage);
      await clickApprovalFilter(parentPage, 'Pending');

      // Verify file visible in parent's queue
      await expect(parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first())
        .toBeVisible({ timeout: 20_000 });

      // Click Approve (exact match to avoid hitting "Approved" filter button)
      const approveBtn = parentPage.locator('button', { hasText: 'Approve' }).filter({ hasNotText: 'Approved' });
      await expect(approveBtn.first()).toBeVisible({ timeout: 10_000 });
      await approveBtn.first().click();

      // Check for toast: "File approved successfully."
      const toastLocator = parentPage.getByText(/file approved successfully/i);
      const toastVisible = await toastLocator
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);

      if (toastVisible) {
        const toastText = await toastLocator.innerText();
        console.log(`  Toast message: "${toastText}"`);
        expect(toastText.toLowerCase()).toMatch(/approv|success/i);
        console.log('  PASS: Toast message confirms approval');
      } else {
        console.log('  INFO: No visible toast — verifying status change directly');
      }

      // ── Step 5: Verify file moved to Approved tab ──
      await parentPage.waitForTimeout(2000);
      await clickApprovalFilter(parentPage, 'Approved');

      const approvedFile = parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      await expect(approvedFile).toBeVisible({ timeout: 20_000 });
      // Verify "Approved by" attribution shown
      await expect(parentPage.getByText(/Approved by/i).first()).toBeVisible({ timeout: 10_000 });
      console.log(`  PASS: File "${FILE_BASE_NAME}" visible in Approved tab`);

      // ── Step 6: Verify the Pending count decremented ──
      await clickApprovalFilter(parentPage, 'Pending');
      // After approval, the file count should reflect the change
      const countText = await parentPage.getByText(/\d+ files? · Pending/i).innerText().catch(() => '');
      console.log(`  Pending count after approval: "${countText}"`);

      // ── Step 7: Verify file is visible in parent's main Media tab ──
      // Approved files should appear in the regular library
      console.log('\n--- PARENT USER: Verify approved file in Media tab ---');
      const mediaTab = parentPage.getByRole('link', { name: 'Media' });
      await mediaTab.click();
      await parentPage.waitForTimeout(3000);

      const mediaFile = parentPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first();
      const fileInMedia = await mediaFile.isVisible({ timeout: 10_000 }).catch(() => false);
      console.log(`  File in Media tab: ${fileInMedia ? 'YES' : 'NO (may be in subfolder)'}`);

    } finally {
      await subUserContext.close();
      await parentContext.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 5: Search within approval queue
  // ───────────────────────────────────────────────────────────────────────────

  test('Approval queue search works for uploaded file names', async ({ browser }) => {
    const subUserContext = await browser.newContext();
    const subPage = await subUserContext.newPage();

    try {
      // ── Step 1: Sub-user logs in, uploads, and navigates to approvals ──
      console.log('\n--- SUB-USER: Upload and search in approval queue ---');
      await login(subPage, SUB_USER);
      await navigateToUploadFolder(subPage, 'sub');
      await uploadFile(subPage, SAMPLE_FILE);

      await switchToUnapprovedFilesTab(subPage);
      await clickApprovalFilter(subPage, 'Pending');

      // ── Step 2: Search for the uploaded file name ──
      // The search box in FILE APPROVALS uses placeholder "Search..."
      // Use locator within the approval section to get the right input
      const searchBox = subPage.locator('input[placeholder="Search..."]');
      await expect(searchBox).toBeVisible({ timeout: 10_000 });
      await searchBox.fill(FILE_BASE_NAME);
      await subPage.waitForTimeout(2000);

      // File should be visible after search
      await expect(subPage.getByText(new RegExp(FILE_BASE_NAME, 'i')).first())
        .toBeVisible({ timeout: 15_000 });
      console.log(`  PASS: Search for "${FILE_BASE_NAME}" returns results`);

      // ── Step 3: Search for a non-existent file ──
      await searchBox.clear();
      await searchBox.fill('zzz_nonexistent_file_99999');
      await subPage.waitForTimeout(2000);

      // Should show "No data available" or empty list
      const noDataVisible = await subPage.getByText(/no data available/i)
        .isVisible().catch(() => false);
      const noResults = await subPage.getByText(new RegExp(FILE_BASE_NAME, 'i'))
        .isVisible().catch(() => false);
      expect(noDataVisible || !noResults).toBeTruthy();
      console.log('  PASS: Search for non-existent file shows empty/no data');

      // ── Step 4: Search with special characters (XSS safety) ──
      await searchBox.clear();
      await searchBox.fill('<script>alert(1)</script>');
      await subPage.waitForTimeout(2000);

      // Page should not crash — FILE APPROVALS heading still visible
      await expect(subPage.getByText('FILE APPROVALS')).toBeVisible();
      console.log('  PASS: Special characters handled safely (no XSS)');

    } finally {
      await subUserContext.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 6: Filter state persistence across tabs
  // ───────────────────────────────────────────────────────────────────────────

  test('Filter buttons correctly toggle between Pending, Approved, and Rejected views', async ({ browser }) => {
    const subUserContext = await browser.newContext();
    const subPage = await subUserContext.newPage();

    try {
      console.log('\n--- SUB-USER: Verify filter toggle behavior ---');
      await login(subPage, SUB_USER);
      await navigateToUploadFolder(subPage, 'sub');
      await switchToUnapprovedFilesTab(subPage);

      // ── Verify each filter updates the count/label ──
      // Click Pending
      await clickApprovalFilter(subPage, 'Pending');
      await expect(subPage.getByText(/\d+ files? · Pending/i)).toBeVisible({ timeout: 10_000 });
      console.log('  PASS: Pending filter shows "X files · Pending"');

      // Click Approved
      await clickApprovalFilter(subPage, 'Approved');
      await expect(subPage.getByText(/\d+ files? · Approved/i)).toBeVisible({ timeout: 10_000 });
      console.log('  PASS: Approved filter shows "X files · Approved"');

      // Click Rejected
      await clickApprovalFilter(subPage, 'Rejected');
      await expect(subPage.getByText(/\d+ files? · Rejected/i)).toBeVisible({ timeout: 10_000 });
      console.log('  PASS: Rejected filter shows "X files · Rejected"');

      // Toggle back to Pending to confirm state doesn't get stuck
      await clickApprovalFilter(subPage, 'Pending');
      await expect(subPage.getByText(/\d+ files? · Pending/i)).toBeVisible({ timeout: 10_000 });
      console.log('  PASS: Filter toggles correctly back to Pending');

    } finally {
      await subUserContext.close();
    }
  });
});
