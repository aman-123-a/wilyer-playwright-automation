import { test, expect } from '@playwright/test';

test('Delete 200 Roles via Loop', async ({ page }) => {
  test.setTimeout(1200000); // 20 min

  // --- 1. LOGIN ---
  console.log('🔐 Logging in...');
  await page.goto('https://cms.pocsample.in/', { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByPlaceholder(/email/i).fill('dev@wilyer.com');
  await page.getByPlaceholder(/password/i).fill('testdev');
  await page.getByRole('button', { name: /Log In/i }).click();

  await page.getByRole('link', { name: /Team/i }).first().waitFor({ state: 'visible', timeout: 60000 });

  // --- 2. NAVIGATION ---
  console.log('📂 Navigating to Roles...');
  await page.getByRole('link', { name: /Team/i }).first().click();
  await page.getByRole('link', { name: /Roles/i }).first().click();
  await page.waitForLoadState('networkidle');

  // --- 3. DELETION LOOP ---
  const TOTAL_TO_DELETE = 100;
  console.log(`🚀 Starting automated deletion of up to ${TOTAL_TO_DELETE} roles...`);

  for (let i = 1; i <= TOTAL_TO_DELETE; i++) {
    const deleteBtn = page.getByRole('button', { name: /Delete/i }).first();

    // If the first delete button is missing, refresh once and re-check.
    if (!(await deleteBtn.isVisible().catch(() => false))) {
      console.log('⚠️ No delete button visible, attempting refresh...');
      await page.reload();
      await page.waitForLoadState('networkidle');

      if (!(await page.getByRole('button', { name: /Delete/i }).first().isVisible().catch(() => false))) {
        console.log('🏁 No more deletable roles found. Ending loop.');
        break;
      }
    }

    const targetRow = page.locator('tr').filter({ has: deleteBtn }).first();

    try {
      await deleteBtn.click();
      const deleteModal = page.locator('#deleteRoleModal');
      await deleteModal.waitFor({ state: 'visible', timeout: 10000 });

      await deleteModal.evaluate((node) => node.setAttribute('data-delete', 'true'));

      const confirmBtn = deleteModal.getByRole('button', { name: /Delete/i });
      await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
      await confirmBtn.click();

      await expect(deleteModal).toBeHidden({ timeout: 10000 });
      await expect(targetRow).toBeHidden({ timeout: 10000 });

      await page.waitForTimeout(1500);
      console.log(`✅ [${i}/${TOTAL_TO_DELETE}] Role deleted successfully.`);
    } catch (error) {
      console.log(`❌ Error deleting item #${i}: ${error.message}. Refreshing and continuing...`);
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    if (i % 25 === 0) {
      console.log('♻️ Refreshing page to load next batch...');
      await page.reload();
      await page.waitForLoadState('networkidle');
    }
  }

  console.log('🎉 Mission accomplished: delete loop finished.');
});