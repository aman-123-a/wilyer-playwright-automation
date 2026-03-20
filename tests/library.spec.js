import { test, expect } from '@playwright/test';

test('Create and Delete Custom Role', async ({ page }) => {
  test.setTimeout(50000); // Higher timeout for the full flow

  const roleName = `Auto_Role_${Date.now()}`;

  // 1. LOGIN
  await page.goto('https://cms.pocsample.in/');
  await page.locator('input[type="text"], input[name*="email"]').first().fill('dev@wilyer.com');
  await page.locator('input[type="password"]').fill('testdev');
  await page.getByRole('button', { name: /Log In/i }).click();

  // 2. NAVIGATE TO ROLES
  await page.getByRole('link', { name: /Team/i }).first().click();
  await page.getByRole('link', { name: /Roles/i }).first().click();

  // 3. CREATE ROLE
  await page.locator('button[data-bs-target="#roleModal"]').click();
  const modal = page.locator('#roleModal.show, #roleModal');
  await modal.waitFor({ state: 'visible' });
  
  await modal.locator('input[placeholder*="role name" i]').fill(roleName);

  // Check all permissions
  const sections = ['Overview', 'Screens', 'Content', 'Screen Group', 'Team', 'Reports', 'Cluster', 'Remote Update'];
  for (const section of sections) {
    await modal.locator('label').filter({ hasText: new RegExp(`Select All in ${section}`, 'i') }).click();
  }

  // Submit and Wait for Modal to Close
  await modal.getByRole('button', { name: /Update Role/i }).click({ force: true });
  await expect(modal).toBeHidden();

  // 4. VERIFY CREATION
  const roleRow = page.locator('tr').filter({ hasText: roleName });
  await expect(roleRow).toBeVisible();
  console.log(`Successfully created: ${roleName}`);

  // 5. CLEANUP (Delete the Role)
  // Find the delete button within the specific row for our new role
  // Usually, delete buttons have a trash icon or 'Delete' text
  const deleteBtn = roleRow.locator('button i.fa-trash, button:has-text("Delete")').first();
  
  await deleteBtn.click();

  // Handle the Confirmation Modal (deleteRoleModal from your screenshot)
  const confirmModal = page.locator('#deleteRoleModal.show, #deleteRoleModal');
  await confirmModal.waitFor({ state: 'visible' });
  
  // Click the 'Delete' or 'Confirm' button in the popup
  await confirmModal.getByRole('button', { name: /Delete|Confirm/i }).click();

  // Final Verification: Role should no longer exist
  await expect(page.getByText(roleName)).toBeHidden();
  console.log(`Successfully cleaned up: ${roleName}`);
});