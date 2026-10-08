import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://cms.pocsample.in/');
  await page.getByRole('link', { name: ' Library' }).click();
  await page.getByRole('button', { name: 'Publish ' }).click();
  await page.getByRole('button', { name: ' Select Screens' }).click();
  await page.getByRole('button', { name: ' Publish' }).click();
  await page.goto('https://cms.pocsample.in/library');
});