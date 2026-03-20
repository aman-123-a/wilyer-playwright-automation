import { test, expect } from '@playwright/test';

test('Login and Pair New Screen', async ({ page }) => {
  // --- STEP 1: LOGIN ---
  console.log('🔹 Starting Login...');

  await page.goto('https://cms.pocsample.in/', {
    waitUntil: 'networkidle',
  });

  // Fill email
  await page
    .getByPlaceholder('Enter your email or phone')
    .fill('dev@wilyer.com');

  // Fill password
  await page
    .getByPlaceholder('Enter your password')
    .fill('testdev');

  // Click login button
  await page.locator('button[type="submit"]').click();

  // Wait for dashboard / screens page
  await page.waitForURL('**/screens**', {
    timeout: 80000,
  });

  // Optional assertion (recommended)
  await expect(page).toHaveURL(/screens/);

  console.log('✅ Login Successful');
});