import { test, expect } from '@playwright/test';
import { read, utils } from 'xlsx';

// ─── Google Sheets Config ─────────────────────────────────────────────────────
const SHEET_ID = '1fe0hc2JsbpVe5mSu-DTmUfPv-twBMr0BDmkatfIfzDQ';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

// ─── Login Credentials ────────────────────────────────────────────────────────
const LOGIN_EMAIL = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';

// ─── Single Test: Fetch Sheet → Login Once → Create All Groups ────────────────

test('Fetch Google Sheet and create all groups with single login', async ({ page }) => {
  test.setTimeout(300_000); // 5 min for large datasets

  // 1. Fetch group data from Google Sheets (CSV export)
  console.log(`\n📊 Fetching group data from Google Sheets...`);
  const response = await fetch(SHEET_URL);
  if (!response.ok) throw new Error(`Failed to fetch sheet: ${response.statusText}`);

  const csvBuffer = Buffer.from(await response.arrayBuffer());
  const workbook = read(csvBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json(sheet); // uses first row as headers

  console.log(`✅ Loaded ${rows.length} group(s) from Google Sheets:`);
  rows.forEach((r, i) => console.log(`   ${i + 1}. ${r['Group Name']}`));

  // 2. Login ONCE
  console.log(`\n🔐 Logging in as: ${LOGIN_EMAIL}`);
  await page.goto('https://cms.pocsample.in/');
  await page.getByPlaceholder(/email/i).fill(LOGIN_EMAIL);
  await page.getByPlaceholder(/password/i).fill(LOGIN_PASSWORD);
  await page.getByRole('button', { name: /Log In/i }).click();
  await page.waitForLoadState('networkidle');
  console.log(`✅ Login successful\n`);

  // 3. Loop through all rows and create each group
  for (const row of rows) {
    const groupName = row['Group Name'];
    if (!groupName) continue; // skip empty rows

    console.log(`🚀 Creating group: "${groupName}"`);

    // Navigate to Groups page
    await page.getByRole('link', { name: /Groups/i }).click();
    await page.waitForLoadState('networkidle');

    // Open New Group modal
    await page.getByRole('button', { name: /New Group/i }).click();

    // Fill group name from sheet
    await page.locator('input[name="name"]').fill(groupName);

    // Submit
    await page.getByRole('button', { name: /Create Group/i }).click();
    await page.waitForLoadState('networkidle');

    // Verify group is visible
    await expect(
      page.getByText(groupName, { exact: false })
    ).toBeVisible({ timeout: 15_000 });

    console.log(`✅ Group "${groupName}" created!\n`);
  }

  console.log(`🎉 All ${rows.length} groups created successfully!`);
});