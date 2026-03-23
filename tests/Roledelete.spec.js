import { test, expect } from '@playwright/test';

test('Delete 100 Roles via Loop', async ({ page }) => {
  // Increase timeout to 15 minutes to allow for 100 deletions
  test.setTimeout(900000);

  // --- 1. LOGIN ---
  await page.goto('https://cms.pocsample.in/');
  
  // Using your recorded selectors for the login form
  await page.getByRole('textbox', { name: 'Enter your email or phone' }).fill('dev@wilyer.com');
  await page.getByRole('textbox', { name: 'Enter your password' }).fill('testdev');
  await page.getByRole('button', { name: 'Log In' }).click();

  // --- 2. NAVIGATION ---
  // Wait for the Team link to be available and click
  await page.getByRole('link', { name: ' Team' }).click();
  await page.getByRole('link', { name: 'Roles' }).click();

  // Ensure the page is ready
  await page.waitForLoadState('networkidle');
  console.log('🗑️ Starting automated deletion of 100 roles...');

  // --- 3. THE LOOP ---
  for (let i = 1; i <= 100; i++) {
    // Always target the FIRST visible delete button on the page
    const deleteBtn = page.getByRole('button', { name: ' Delete' }).first();

    // If the button isn't visible, we've run out of roles to delete
    if (!(await deleteBtn.isVisible())) {
      console.log('🏁 No more roles found. Ending loop.');
      break;
    }

    // Step A: Click the Delete button in the row
    await deleteBtn.click();

    // Step B: Click the "Delete Role" button in the confirmation modal
    const confirmBtn = page.getByRole('button', { name: ' Delete Role' });
    
    // Wait for the modal button to be ready before clicking
    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
    await confirmBtn.click();

    // Step C: IMPORTANT - Wait for the modal to disappear before starting next loop
    // This prevents the script from clicking the next row too early
    await expect(confirmBtn).toBeHidden({ timeout: 10000 });

    console.log(`✅ Deleted Role #${i}`);

    // Optional: Refresh the page every 20 deletions to keep the site snappy
    if (i % 20 === 0) {
      await page.reload();
      await page.waitForLoadState('networkidle');
    }
  }

  console.log('🎉 Done! All requested roles have been processed.');
});