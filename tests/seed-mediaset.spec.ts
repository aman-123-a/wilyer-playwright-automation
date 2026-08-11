import { test } from '@playwright/test';

const BASE_URL = 'https://cms.wilyersignage.com';

test.describe('seed', () => {
  test('open cms2', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 90_000 });
    await page.waitForTimeout(6000);
  });
});
