import { test, expect } from '@playwright/test';

test('Create 4 Unique Roles', async ({ page }) => {
  test.setTimeout(300000);

  const baseUrl = 'https://cms.pocsample.in/';

  // 2. LOGIN (Once at the start)
  await page.goto(baseUrl);
  await page.getByPlaceholder(/email/i).fill('dev@wilyer.com');
  await page.getByPlaceholder(/password/i).fill('testdev');
  await page.getByRole('button', { name: /Log In/i }).click();

  // Wait for the dashboard to load
  await expect(page.getByRole('link', { name: /Team/i }).first()).toBeVisible();

  // 3. NAVIGATE TO ROLES PAGE
  await page.getByRole('link', { name: /Team/i }).first().click();
  await page.getByRole('link', { name: /Roles/i }).click();

  // 4. LOOP TO CREATE 4 ROLES
  const TOTAL = 4;
  for (let i = 1; i <= TOTAL; i++) {
    const uniqueRoleName = `LoadTest_Role_${i}_${Date.now()}`;
    console.log(`Starting creation of Role ${i}/${TOTAL}: ${uniqueRoleName}`);

    // Click Create Button
    await page.getByRole('button', { name: /Create Custom Role/i }).click();

    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: /Create Custom Role/i })).toBeVisible();

    // Fill Unique Name
    await modal.getByRole('textbox', { name: /Enter role name/i }).fill(uniqueRoleName);

    // 5. SELECT ALL PERMISSIONS
    const sections = [
      'Overview', 'Screens', 'Content', 'Screen Group', 
      'Team', 'Reports', 'Cluster', 'Remote Update'
    ];

    for (const section of sections) {
      // Using a locator that handles the "Select All" labels efficiently
      const checkbox = modal.locator('label').filter({ 
        hasText: new RegExp(`Select All in ${section}`, 'i') 
      });

      if (await checkbox.isVisible()) {
        await checkbox.click();
      }
    }

    // 6. SUBMIT & WAIT FOR CLOSURE
    await modal.getByRole('button', { name: 'Create Role' }).click();

    // Wait for the dialog to close before starting next loop
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 30_000 });

    console.log(`✅ Progress: ${i}/${TOTAL} roles created.`);
  }

  console.log(`🎉 Finished creating ${TOTAL} unique roles!`);
});