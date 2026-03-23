import { test, expect } from '@playwright/test';

test('Delete 100 Roles via Loop', async ({ page }) => {
  // Increase timeout to 15 minutes for 100 deletions
  test.setTimeout(900000);

  // --- 1. LOGIN ---
  console.log('🔐 Logging in...');
  await page.goto('https://cms.pocsample.in/', { waitUntil: 'domcontentloaded' });
  
  await page.getByPlaceholder(/email/i).fill('dev@wilyer.com');
  await page.getByPlaceholder(/password/i).fill('testdev');
  await page.getByRole('button', { name: /Log In/i }).click();

  // Wait for the URL to change to indicate successful login
  await page.waitForURL('**/dashboard**', { timeout: 30000 });

  // --- 2. NAVIGATION ---
  console.log('📂 Navigating to Roles...');
  await page.getByRole('link', { name: /Team/i }).first().click();
  await page.getByRole('link', { name: /Roles/i }).first().click();

  // Ensure the table is loaded
  await page.waitForLoadState('networkidle');

  // --- 3. DELETION LOOP ---
  console.log('🗑️     Starting automated deletion of up to 100 roles...');

  for (let i = 1; i <= 100; i++) {
    // 1. Locate the first delete button
    const deleteBtn = page.getByRole('button', { name: /Delete/i }).first();

    // Check if it exists; if not, the list is empty
    if (!(await deleteBtn.isVisible())) {
      console.log('🏁 No more roles found. Ending loop.');
      break;
    }

    // 2. Click the Delete button in the table row
    await deleteBtn.click();

    // 3. Handle the Confirmation Modal
    // We use a specific locator for the button INSIDE the modal to avoid clicking the background
    const confirmDeleteBtn = page.getByRole('button', { name: 'Delete Role' });
    
    await confirmDeleteBtn.waitFor({ state: 'visible', timeout: 5000 });
    await confirmDeleteBtn.click();

    // 4. WAIT: Ensure the modal disappears before the next loop iteration
    // This is the most important step for stability
    await expect(confirmDeleteBtn).toBeHidden({ timeout: 10000 });
    
    // Optional: Wait for any success toast to clear if it overlaps buttons
    // await page.locator('.toast-success').waitFor({ state: 'hidden' }).catch(() => {});

    console.log(`✅ Deleted Role #${i}`);

    // 5. Periodic Refresh (Every 20 deletions) to keep the DOM clean
    if (i % 20 === 0) {
      await page.reload();
      await page.waitForLoadState('networkidle');
      console.log(`♻️ Page reloaded at ${i} deletions for stability.`);
    }
  }

  console.log('🎉 Mission accomplished: 100 roles processed.');
});