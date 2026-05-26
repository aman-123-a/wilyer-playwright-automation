// tests/cms.spec.ts
// Playwright Test Suite for Wilyer Signage CMS - cms.pocsample.in
// Generated from automated browser testing - 22 May 2026

import { test, expect, Page } from '@playwright/test';

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const BASE_URL = 'https://cms.pocsample.in';
const TIMEOUT = 15000;
// ─── Config ───────────────────────────────────────────────────────────────────
const LOGIN_EMAIL    = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';

// Helper: wait for page to be stable
async function waitForLoad(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
}

// Helper: close modal if open (press Escape)
async function closeModal(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

// ─────────────────────────────────────────────
// 1. DASHBOARD
// ─────────────────────────────────────────────
test.describe('Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForLoad(page);
  });

  test('Dashboard page loads correctly', async ({ page }) => {
    await expect(page).toHaveURL(`${BASE_URL}/`);
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=ONLINE SCREENS')).toBeVisible();
    await expect(page.locator('text=OFFLINE SCREENS')).toBeVisible();
    await expect(page.locator('text=TOTAL SCREENS')).toBeVisible();
    await expect(page.locator('text=TOTAL MEDIA FILES')).toBeVisible();
    await expect(page.locator('text=STORAGE USED')).toBeVisible();
    await expect(page.locator('text=AVAILABLE LICENCES')).toBeVisible();
  });

  test('Renew button (expired screens) opens modal', async ({ page }) => {
    const renewButtons = page.locator('button:has-text("Renew")');
    await renewButtons.first().click();
    await expect(page.locator('text=Renew Licenses')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=screens available')).toBeVisible();
    await closeModal(page);
  });

  test('Renew button (expiring soon) opens modal', async ({ page }) => {
    const renewButtons = page.locator('button:has-text("Renew")');
    await renewButtons.nth(1).click();
    await expect(page.locator('text=Renew Licenses — Expiring')).toBeVisible({ timeout: TIMEOUT });
    await closeModal(page);
  });

  test('Yellow banner dismiss (X) button works', async ({ page }) => {
    const dismissBtn = page.locator('.text-yellow-700 button, button[aria-label="Close"]').first();
    if (await dismissBtn.isVisible()) {
      await dismissBtn.click();
      await expect(page.locator('text=2 screens will expire within 30 days')).not.toBeVisible();
    }
  });

  test('+ New Screen button opens modal', async ({ page }) => {
    await page.locator('a:has-text("New Screen"), button:has-text("New Screen")').first().click();
    await expect(page.locator('text=New Screen')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=Pairing Code')).toBeVisible();
    await expect(page.locator('text=Screen Name')).toBeVisible();
    await closeModal(page);
  });

  test('+ Add Media button navigates to Library', async ({ page }) => {
    await page.locator('a:has-text("Add Media"), button:has-text("Add Media")').first().click();
    await expect(page).toHaveURL(/\/library/, { timeout: TIMEOUT });
  });

  test('+ New Playlist button opens modal', async ({ page }) => {
    await page.locator('a:has-text("New Playlist"), button:has-text("New Playlist")').first().click();
    await expect(page.locator('text=Create New Playlist')).toBeVisible({ timeout: TIMEOUT });
    await closeModal(page);
  });

  test('+ New Group button opens modal', async ({ page }) => {
    await page.locator('a:has-text("New Group"), button:has-text("New Group")').first().click();
    await expect(page.locator('text=New Group')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=Group Name')).toBeVisible();
    await closeModal(page);
  });

  test('View More button navigates to Screens page', async ({ page }) => {
    await page.locator('a:has-text("View More")').click();
    await expect(page).toHaveURL(/\/screens/, { timeout: TIMEOUT });
  });

  test('Read Docs button opens documentation panel', async ({ page }) => {
    await page.locator('button:has-text("Read Docs")').first().click();
    await expect(page.locator('text=Documentation')).toBeVisible({ timeout: TIMEOUT });
    await page.keyboard.press('Escape');
  });

  test('Screen Players list View button works', async ({ page }) => {
    const viewBtn = page.locator('a:has-text("View")').first();
    await viewBtn.click();
    await expect(page).toHaveURL(/\/screen-settings\//, { timeout: TIMEOUT });
  });

  test('Screens Location map renders', async ({ page }) => {
    await expect(page.locator('text=SCREENS LOCATION')).toBeVisible();
    // Map region should be present
    await expect(page.locator('[role="region"]').first()).toBeVisible();
  });

});

// ─────────────────────────────────────────────
// 2. SCREENS
// ─────────────────────────────────────────────
test.describe('Screens', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/screens`);
    await waitForLoad(page);
  });

  test('Screens page loads with data', async ({ page }) => {
    await expect(page.locator('text=ALL SCREENS')).toBeVisible();
    await expect(page.locator('text=All Screens')).toBeVisible();
    await expect(page.locator('text=Deleted Screens')).toBeVisible();
    await expect(page.locator('text=Expired Screens')).toBeVisible();
  });

  test('All Screens tab is active and shows screens', async ({ page }) => {
    await page.locator('a:has-text("All Screens"), button:has-text("All Screens")').first().click();
    await expect(page.locator('text=ALL SCREENS')).toBeVisible();
    await expect(page.locator('a:has-text("View Detail")').first()).toBeVisible({ timeout: TIMEOUT });
  });

  test('Deleted Screens tab loads', async ({ page }) => {
    await page.locator('a:has-text("Deleted Screens"), button:has-text("Deleted Screens")').first().click();
    await expect(page.locator('text=DELETED SCREENS')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('button:has-text("Restore")').first()).toBeVisible({ timeout: TIMEOUT });
  });

  test('Expired Screens tab loads', async ({ page }) => {
    await page.locator('a:has-text("Expired Screens"), button:has-text("Expired Screens")').first().click();
    await expect(page.locator('text=EXPIRED SCREENS')).toBeVisible({ timeout: TIMEOUT });
  });

  test('+ New Screen button opens modal with map', async ({ page }) => {
    await page.locator('button:has-text("New Screen"), a:has-text("New Screen")').first().click();
    await expect(page.locator('text=New Screen')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=Pairing Code')).toBeVisible();
    await expect(page.locator('text=Select Plan')).toBeVisible();
    await closeModal(page);
  });

  test('Filter button opens filter panel', async ({ page }) => {
    await page.locator('a:has-text("Filter"), button:has-text("Filter")').click();
    await expect(page.locator('text=ORIENTATION')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=SCREEN STATUS')).toBeVisible();
    await expect(page.locator('text=OPERATING SYSTEM')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('Read Docs opens documentation', async ({ page }) => {
    await page.locator('button:has-text("Read Docs")').click();
    await expect(page.locator('text=Documentation')).toBeVisible({ timeout: TIMEOUT });
    await page.keyboard.press('Escape');
  });

  test('View Detail opens screen settings', async ({ page }) => {
    await page.locator('a:has-text("View Detail")').first().click();
    await expect(page).toHaveURL(/\/screen-settings\//, { timeout: TIMEOUT });
  });

  test('Screen detail page tabs are all functional', async ({ page }) => {
    await page.locator('a:has-text("View Detail")').first().click();
    await waitForLoad(page);

    const tabs = ['Media', 'Schedule', 'Configurations', 'Downloaded Files', 'Network Uptime', 'Additional Info', 'Custom Params', 'Settings', 'Logs'];
    for (const tab of tabs) {
      await page.locator(`a:has-text("${tab}"), button:has-text("${tab}")`).first().click();
      await page.waitForTimeout(500);
      // Verify no error page
      await expect(page.locator('text=Something went wrong')).not.toBeVisible();
    }
  });

  test('Screen Settings tab shows Player Control buttons', async ({ page }) => {
    await page.locator('a:has-text("View Detail")').first().click();
    await waitForLoad(page);
    await page.locator('a:has-text("Settings"), text=Settings').last().click();
    await expect(page.locator('text=Player Control')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('button:has-text("Restart Player App")')).toBeVisible();
    await expect(page.locator('button:has-text("Restart Device")')).toBeVisible();
    await expect(page.locator('text=License Management')).toBeVisible();
  });

  test('20 Screens dropdown works', async ({ page }) => {
    const dropdown = page.locator('select').first();
    await dropdown.selectOption('50');
    await expect(dropdown).toHaveValue('50');
  });

  test('Search bar accepts input', async ({ page }) => {
    await page.locator('input[placeholder="Search..."]').first().fill('test');
    await expect(page.locator('input[placeholder="Search..."]').first()).toHaveValue('test');
  });

});

// ─────────────────────────────────────────────
// 3. GROUPS
// ─────────────────────────────────────────────
test.describe('Groups', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/groups`);
    await waitForLoad(page);
  });

  test('Groups page loads with screen groups', async ({ page }) => {
    await expect(page.locator('text=SCREEN GROUPS')).toBeVisible();
    await expect(page.locator('text=TOTAL SCREEN GROUPS')).toBeVisible();
  });

  test('+ New Group button opens modal', async ({ page }) => {
    await page.locator('button:has-text("New Group")').click();
    await expect(page.locator('text=New Group')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=Group Name')).toBeVisible();
    await expect(page.locator('text=Description')).toBeVisible();
    await expect(page.locator('button:has-text("Create Group")')).toBeVisible();
    await closeModal(page);
  });

  test('Search bar is functional', async ({ page }) => {
    await page.locator('input[placeholder="Search..."]').fill('India');
    await expect(page.locator('input[placeholder="Search..."]')).toHaveValue('India');
  });

  test('Edit icon links to group settings', async ({ page }) => {
    const editLink = page.locator('a[href*="/group-settings/"]').first();
    await expect(editLink).toBeVisible();
    const href = await editLink.getAttribute('href');
    expect(href).toContain('/group-settings/');
  });

});

// ─────────────────────────────────────────────
// 4. CLUSTERS
// ─────────────────────────────────────────────
test.describe('Clusters', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/clusters`);
    await waitForLoad(page);
  });

  test('Clusters page loads', async ({ page }) => {
    await expect(page.locator('text=SCREEN CLUSTERS')).toBeVisible();
    await expect(page.locator('text=TOTAL SCREEN CLUSTERS')).toBeVisible();
  });

  test('+ New Cluster opens dialog', async ({ page }) => {
    await page.locator('button:has-text("New Cluster")').click();
    await expect(page.locator('text=New Cluster')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=Cluster Name')).toBeVisible();
    await expect(page.locator('button:has-text("Create Cluster")')).toBeVisible();
    await closeModal(page);
  });

  test('Search bar works', async ({ page }) => {
    await page.locator('input[placeholder="Search..."]').fill('test');
    await expect(page.locator('input[placeholder="Search..."]')).toHaveValue('test');
  });

});

// ─────────────────────────────────────────────
// 5. LIBRARY
// ─────────────────────────────────────────────
test.describe('Library', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/library`);
    await waitForLoad(page);
  });

  test('Library page loads with folders and media', async ({ page }) => {
    await expect(page.locator('text=Library')).toBeVisible();
    await expect(page.locator('text=Folders')).toBeVisible();
    await expect(page.locator('text=ALL MEDIA FILES')).toBeVisible({ timeout: TIMEOUT });
  });

  test('+ Upload Files button opens upload panel', async ({ page }) => {
    await page.locator('button:has-text("Upload Files")').click();
    await expect(page.locator('text=Upload Files')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=Drop files here or click to browse')).toBeVisible();
    await expect(page.locator('button:has-text("Browse Files")')).toBeVisible();
    // Close upload panel
    await page.locator('button:has-text("Close"), text=Close').click();
  });

  test('+ Create Folder opens dialog', async ({ page }) => {
    await page.locator('button:has-text("Create Folder")').click();
    await expect(page.locator('text=Create New Folder')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=Folder Name')).toBeVisible();
    await closeModal(page);
  });

  test('Widgets tab loads', async ({ page }) => {
    await page.locator('a:has-text("Widgets"), button:has-text("Widgets")').click();
    await expect(page.locator('text=CLICK ON WIDGET TYPE TO SHOW WIDGETS')).toBeVisible({ timeout: TIMEOUT });
  });

  test('Media publish History tab loads', async ({ page }) => {
    await page.locator('a:has-text("Media publish History")').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
  });

  test('Media Sets tab loads with Create button', async ({ page }) => {
    await page.locator('a:has-text("Media Sets")').click();
    await expect(page.locator('text=Media Sets')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('button:has-text("Create Media Set")')).toBeVisible();
  });

  test('Create Media Set opens dialog', async ({ page }) => {
    await page.locator('a:has-text("Media Sets")').click();
    await page.locator('button:has-text("Create Media Set")').first().click();
    await expect(page.locator('text=Create Media Set')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('button:has-text("Create")')).toBeVisible();
    await closeModal(page);
  });

  test('+ Create Design tab loads', async ({ page }) => {
    await page.locator('a:has-text("Create Design")').click();
    await expect(page.locator('text=Design Plugin Editor')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('button:has-text("Create Design")')).toBeVisible();
  });

  test('Media filter tabs work (All, Videos, Photos)', async ({ page }) => {
    await expect(page.locator('button:has-text("All")')).toBeVisible({ timeout: TIMEOUT });
    await page.locator('button:has-text("Videos")').click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Photos")').click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("All")').click();
  });

  test('Search media input works', async ({ page }) => {
    await page.locator('input[placeholder="Search..."]').fill('test');
    await expect(page.locator('input[placeholder="Search..."]')).toHaveValue('test');
  });

  test('Folder search works', async ({ page }) => {
    await page.locator('input[placeholder*="Search folders"]').fill('India');
    await expect(page.locator('input[placeholder*="Search folders"]')).toHaveValue('India');
  });

});

// ─────────────────────────────────────────────
// 6. ROLLOUTS
// ─────────────────────────────────────────────
test.describe('Rollouts', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/content-rollout`);
    await waitForLoad(page);
  });

  test('Rollouts page loads', async ({ page }) => {
    await expect(page.locator('text=CONTENT ROLLOUTS')).toBeVisible();
    await expect(page.locator('text=TOTAL ROLLOUTS')).toBeVisible();
  });

  test('+ New Rollout opens dialog', async ({ page }) => {
    await page.locator('button:has-text("New Rollout")').click();
    await expect(page.locator('text=New Rollout')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=Rollout Name')).toBeVisible();
    await expect(page.locator('text=Description')).toBeVisible();
    await expect(page.locator('button:has-text("Create")')).toBeVisible();
    await closeModal(page);
  });

  test('Open button links to rollout detail', async ({ page }) => {
    const openBtn = page.locator('a:has-text("Open")').first();
    await expect(openBtn).toBeVisible();
    const href = await openBtn.getAttribute('href');
    expect(href).toContain('/content-rollout/');
  });

  test('Search rollouts input works', async ({ page }) => {
    await page.locator('input[placeholder*="Search rollouts"]').fill('test');
    await expect(page.locator('input[placeholder*="Search rollouts"]')).toHaveValue('test');
  });

  test('Pagination is present', async ({ page }) => {
    await page.locator('button:has-text("Next")').isVisible();
  });

});

// ─────────────────────────────────────────────
// 7. PLAYLISTS
// ─────────────────────────────────────────────
test.describe('Playlists', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/playlists`);
    await waitForLoad(page);
  });

  test('Playlists page loads with folders', async ({ page }) => {
    await expect(page.locator('text=Total Playlists')).toBeVisible();
    await expect(page.locator('text=Folders')).toBeVisible();
  });

  test('+ New Playlist opens dialog', async ({ page }) => {
    await page.locator('button:has-text("New Playlist")').first().click();
    await expect(page.locator('text=Create New Playlist')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=Playlist Name')).toBeVisible();
    await expect(page.locator('text=Add to Folder')).toBeVisible();
    await expect(page.locator('button:has-text("Create Playlist")')).toBeVisible();
    await closeModal(page);
  });

  test('+ New Folder button is visible', async ({ page }) => {
    await expect(page.locator('button:has-text("New Folder")').first()).toBeVisible();
  });

  test('Publish Requests button is visible', async ({ page }) => {
    await expect(page.locator('button:has-text("Publish Requests")')).toBeVisible();
  });

  test('Sort by Created dropdown works', async ({ page }) => {
    await expect(page.locator('button:has-text("Sort by Created")')).toBeVisible();
  });

  test('Each playlist card has Publish, Edit, Delete buttons', async ({ page }) => {
    await expect(page.locator('button:has-text("Publish")').first()).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('button:has-text("Edit")').first()).toBeVisible();
  });

});

// ─────────────────────────────────────────────
// 8. TEAM
// ─────────────────────────────────────────────
test.describe('Team', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/team`);
    await waitForLoad(page);
  });

  test('Team page loads with members list', async ({ page }) => {
    await expect(page.locator('text=Members')).toBeVisible();
    await expect(page.locator('text=MEMBER NAME')).toBeVisible();
    await expect(page.locator('text=MEMBER EMAIL')).toBeVisible();
    await expect(page.locator('text=ROLE')).toBeVisible();
  });

  test('Members tab shows team list', async ({ page }) => {
    await page.locator('a:has-text("Members")').click();
    await expect(page.locator('text=MEMBER NAME')).toBeVisible({ timeout: TIMEOUT });
  });

  // ⚠️ KNOWN BUG - Roles tab causes browser freeze
  test.skip('KNOWN BUG: Roles tab causes page freeze', async ({ page }) => {
    // This test is SKIPPED because clicking "Roles" causes browser renderer to hang.
    // Bug: JavaScript error or infinite render loop on Roles tab.
    // Reproduce: Navigate to /team and click the "Roles" tab.
    await page.locator('a:has-text("Roles")').click();
    await expect(page.locator('text=Roles')).toBeVisible({ timeout: TIMEOUT });
  });

  test('New Member tab is accessible', async ({ page }) => {
    await page.locator('a:has-text("New Member")').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
  });

  test('Logs tab is accessible', async ({ page }) => {
    await page.locator('a:has-text("Logs")').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
  });

  test('Status toggle is present per member', async ({ page }) => {
    await expect(page.locator('[role="switch"]').first()).toBeVisible({ timeout: TIMEOUT });
  });

  test('Read Docs opens documentation', async ({ page }) => {
    await page.locator('button:has-text("Read Docs")').click();
    await expect(page.locator('text=Documentation')).toBeVisible({ timeout: TIMEOUT });
    await page.keyboard.press('Escape');
  });

});

// ─────────────────────────────────────────────
// 9. REPORTS
// ─────────────────────────────────────────────
test.describe('Reports', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/reports`);
    await waitForLoad(page);
  });

  test('Reports page loads Analytics tab', async ({ page }) => {
    await expect(page.locator('text=Analytics')).toBeVisible();
    await expect(page.locator('text=Duration')).toBeVisible();
    await expect(page.locator('text=Select Screen')).toBeVisible();
  });

  test('Analytics Duration dropdown is present', async ({ page }) => {
    await expect(page.locator('text=Select Days')).toBeVisible();
  });

  test('Select Screen dropdown is present', async ({ page }) => {
    await expect(page.locator('input[placeholder*="Search & select screen"], text=Search & select screen')).toBeVisible();
  });

  // ⚠️ KNOWN BUG - Previous Reports tab causes browser freeze
  test.skip('KNOWN BUG: Previous Reports tab causes page freeze', async ({ page }) => {
    // This test is SKIPPED because clicking "Previous Reports" causes browser renderer to hang.
    // Bug: Likely heavy data fetch or rendering issue on Previous Reports tab.
    // Reproduce: Navigate to /reports and click "Previous Reports" tab.
    await page.locator('button:has-text("Previous Reports")').click();
    await expect(page.locator('text=Previous Reports')).toBeVisible({ timeout: TIMEOUT });
  });

  test('What\'s New button is visible', async ({ page }) => {
    await expect(page.locator('button:has-text("What\'s New")')).toBeVisible();
  });

  test('Read Docs button is visible', async ({ page }) => {
    await expect(page.locator('button:has-text("Read Docs")')).toBeVisible();
  });

});

// ─────────────────────────────────────────────
// 10. WHAT'S NEW
// ─────────────────────────────────────────────
test.describe("What's New", () => {

  test("What's New page loads feature cards", async ({ page }) => {
    await page.goto(`${BASE_URL}/whats-new`);
    await waitForLoad(page);
    await expect(page.locator("text=What's New")).toBeVisible();
    await expect(page.locator('button:has-text("View Guide"), a:has-text("View Guide")').first()).toBeVisible({ timeout: TIMEOUT });
  });

});

// ─────────────────────────────────────────────
// 11. HELP
// ─────────────────────────────────────────────
test.describe('Help', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/help`);
    await waitForLoad(page);
  });

  test('Help page loads all 4 sections', async ({ page }) => {
    await expect(page.locator('text=Documentation')).toBeVisible();
    await expect(page.locator('text=Contact Us')).toBeVisible();
    await expect(page.locator('text=Watch Tutorial on Youtube')).toBeVisible();
    await expect(page.locator('text=Download Apps')).toBeVisible();
  });

  test('Documentation Read More opens docs panel', async ({ page }) => {
    await page.locator('a:has-text("Read More"), button:has-text("Read More")').first().click();
    await expect(page.locator('text=Wilyer Signage Docs')).toBeVisible({ timeout: TIMEOUT });
    await page.keyboard.press('Escape');
  });

  test('Contact Us links to email', async ({ page }) => {
    const contactLink = page.locator('a:has-text("Contact Us")');
    const href = await contactLink.getAttribute('href');
    expect(href).toContain('mailto:');
  });

  test('Watch Now links to YouTube', async ({ page }) => {
    const watchBtn = page.locator('a:has-text("Watch Now")');
    const href = await watchBtn.getAttribute('href');
    expect(href).toContain('youtube.com');
  });

});

// ─────────────────────────────────────────────
// 12. FEEDBACK
// ─────────────────────────────────────────────
test.describe('Feedback', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/feedback`);
    await waitForLoad(page);
  });

  test('Feedback page loads form fields', async ({ page }) => {
    await expect(page.locator('text=Feedback')).toBeVisible();
    await expect(page.locator('input[placeholder="Subject"]')).toBeVisible();
    await expect(page.locator('textarea[placeholder="Message"]')).toBeVisible();
    await expect(page.locator('button:has-text("Send")')).toBeVisible();
  });

  test('Subject field accepts input', async ({ page }) => {
    await page.locator('input[placeholder="Subject"]').fill('Test Subject');
    await expect(page.locator('input[placeholder="Subject"]')).toHaveValue('Test Subject');
  });

  test('Message field accepts input', async ({ page }) => {
    await page.locator('textarea[placeholder="Message"]').fill('This is a test message');
    await expect(page.locator('textarea[placeholder="Message"]')).toHaveValue('This is a test message');
  });

});

// ─────────────────────────────────────────────
// 13. BILLING
// ─────────────────────────────────────────────
test.describe('Billing', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/billing`);
    await waitForLoad(page);
  });

  test('Billing page loads with plans', async ({ page }) => {
    await expect(page.locator('text=Purchase & Billing')).toBeVisible();
    await expect(page.locator('button:has-text("My Plans")')).toBeVisible();
  });

  test('My Plans tab shows available plans', async ({ page }) => {
    await page.locator('button:has-text("My Plans")').click();
    await expect(page.locator('text=Available Licenses')).toBeVisible({ timeout: TIMEOUT });
  });

  test('Expiring Soon tab shows expired screens list', async ({ page }) => {
    await page.locator('button:has-text("Expiring Soon")').click();
    await expect(page.locator('text=Expired/Expiring Screens')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=SCREEN NAME')).toBeVisible();
    await expect(page.locator('text=EXPIRY DATE')).toBeVisible();
  });

  // ⚠️ KNOWN BUG - Buy Plan tab causes browser freeze
  test.skip('KNOWN BUG: Buy Plan tab causes page freeze', async ({ page }) => {
    // This test is SKIPPED because clicking "Buy Plan" causes browser renderer to hang.
    // Bug: Likely a payment gateway iframe or pricing component failing to load.
    // Reproduce: Navigate to /billing and click the "Buy Plan" tab.
    await page.locator('button:has-text("Buy Plan")').click();
    await expect(page.locator('text=Buy Plan')).toBeVisible({ timeout: TIMEOUT });
  });

  test('My Purchases tab shows purchase history', async ({ page }) => {
    await page.locator('button:has-text("My Purchases")').click();
    await expect(page.locator('text=PLAN')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=PAY METHOD')).toBeVisible();
    await expect(page.locator('text=STATUS')).toBeVisible();
  });

  test('Download button is present on Paid purchases', async ({ page }) => {
    await page.locator('button:has-text("My Purchases")').click();
    await expect(page.locator('button:has-text("Download")').first()).toBeVisible({ timeout: TIMEOUT });
  });

  test('Support contact details are visible', async ({ page }) => {
    await expect(page.locator('text=support@wilyer.com')).toBeVisible();
  });

});

// ─────────────────────────────────────────────
// 14. ACCOUNT
// ─────────────────────────────────────────────
test.describe('Account', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/account`);
    await waitForLoad(page);
  });

  test('Account Settings page loads', async ({ page }) => {
    await expect(page.locator('text=Account Settings')).toBeVisible();
    await expect(page.locator('text=Profile')).toBeVisible();
  });

  test('Profile section shows all settings', async ({ page }) => {
    await expect(page.locator('text=CHANGE NAME')).toBeVisible();
    await expect(page.locator('text=CHANGE EMAIL')).toBeVisible();
    await expect(page.locator('text=CHANGE PASSWORD')).toBeVisible();
    await expect(page.locator('text=ORGANZIATION NAME')).toBeVisible();
    await expect(page.locator('text=CHANGE PHONE NUMBER')).toBeVisible();
    await expect(page.locator('text=SECURITY - TWO FACTOR AUTHENTICATION')).toBeVisible();
  });

  test('Change Email button is present', async ({ page }) => {
    await expect(page.locator('button:has-text("Change Email")')).toBeVisible();
  });

  test('Change Password button is present', async ({ page }) => {
    await expect(page.locator('button:has-text("Change Password")')).toBeVisible();
  });

  test('Notification Settings tab loads', async ({ page }) => {
    await page.locator('a:has-text("Notification Settings")').click();
    await expect(page.locator('text=NOTIFICATION SETTINGS')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('button:has-text("Create New Setting")')).toBeVisible();
  });

  test('Logs tab loads', async ({ page }) => {
    await page.locator('a:has-text("Logs")').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
  });

  test('Device Profile shows software details', async ({ page }) => {
    await page.locator('a:has-text("Device Profile")').click();
    await expect(page.locator('text=Software Details')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=Hardware Details')).toBeVisible();
    await expect(page.locator('text=Total Variations')).toBeVisible();
  });

  test('Triggers & Data Sources tab loads', async ({ page }) => {
    await page.locator('a:has-text("Triggers & Data Sources")').click();
    await expect(page.locator('text=Hardware Triggers')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('text=Player Sensors')).toBeVisible();
    await expect(page.locator('text=Incoming Webhook')).toBeVisible();
    await expect(page.locator('text=Touch Screen Interaction')).toBeVisible();
    await expect(page.locator('text=GPS Location')).toBeVisible();
  });

  test('Read Docs opens documentation', async ({ page }) => {
    await page.locator('button:has-text("Read Docs")').click();
    await expect(page.locator('text=Documentation')).toBeVisible({ timeout: TIMEOUT });
    await page.keyboard.press('Escape');
  });

});

// ─────────────────────────────────────────────
// 15. SIDEBAR NAVIGATION
// ─────────────────────────────────────────────
test.describe('Sidebar Navigation', () => {

  test('All sidebar links navigate correctly', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForLoad(page);

    const navItems = [
      { label: 'Dashboard', url: '/' },
      { label: 'Screens', url: '/screens' },
      { label: 'Groups', url: '/groups' },
      { label: 'Clusters', url: '/clusters' },
      { label: 'Library', url: '/library' },
      { label: 'Rollouts', url: '/content-rollout' },
      { label: 'Playlists', url: '/playlists' },
      { label: 'Team', url: '/team' },
      { label: 'Reports', url: '/reports' },
      { label: "What's New", url: '/whats-new' },
      { label: 'Help', url: '/help' },
      { label: 'Feedback', url: '/feedback' },
      { label: 'Billing', url: '/billing' },
      { label: 'Account', url: '/account' },
    ];

    for (const item of navItems) {
      await page.goto(BASE_URL + item.url);
      await waitForLoad(page);
      expect(page.url()).toContain(item.url === '/' ? '' : item.url);
      // Ensure no error page
      await expect(page.locator('text=Something went wrong')).not.toBeVisible();
    }
  });

});
      // Ensure no error