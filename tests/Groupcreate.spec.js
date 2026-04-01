import { test, expect } from '@playwright/test';

test('Create Group and Subgroups Flow', async ({ page }) => {
  const groupName = 'QA aman';

  // 1. Login
  await page.goto('https://cms.pocsample.in/');
  await page.getByRole('textbox', { name: /email or phone/i }).fill('dev@wilyer.com');
  await page.getByRole('textbox', { name: /password/i }).fill('testdev');
  await page.getByRole('button', { name: 'Log In' }).click();

  // 2. Navigate to Groups and Create New
  // Using regex to ignore the icon character
  await page.getByRole('link', { name: /Groups/ }).click();
  await page.getByRole('button', { name: /New Group/ }).click();
  
  await page.locator('input[name="name"]').fill(groupName);
  await page.locator('textarea[name="description"]').fill('playwright automation');
  await page.getByRole('button', { name: 'Create Group' }).click();

  // 3. Add Subgroups
  // Tip: Instead of .first(), try to target the specific group row if possible
  await page.getByRole('link', { name: /Settings/ }).first().click();
  
  // Create 'resturant' subgroup
  await page.getByRole('button', { name: /Add Subgroup/ }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('resturant');
  await page.getByRole('button', { name: /Create/ }).click();

  // Create 'delhi' subgroup under 'resturant'
  // Using a more specific locator than nth(1) is safer
  await page.getByText('resturant').last().click(); 
  await page.getByRole('button', { name: /Add Subgroup/ }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('delhi');
  await page.getByRole('button', { name: /Create/ }).click();

  // 4. Screens and Cleanup
  await page.getByRole('button', { name: /Screens/ }).click();
  await page.locator('#closemanageScreens').getByText('×').click();
  
  // Basic assertion to ensure we are where we expect
  await expect(page.getByText('delhi')).toBeVisible();
});