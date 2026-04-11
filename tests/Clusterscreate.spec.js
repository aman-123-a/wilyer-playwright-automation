import { test, expect } from '@playwright/test';
import { read, utils } from 'xlsx';

// ─── Google Sheets Config ─────────────────────────────────────────────────────
const SHEET_ID = '1V7TjTHwlkDZf4-eQHer76YYwb_rKEnR11Jd8A3OyLhU';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

// ─── Login Credentials ────────────────────────────────────────────────────────
const LOGIN_EMAIL = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';

// ─── Single Test: Fetch Sheet → Login Once → Create All Clusters ──────────────

test('Fetch Google Sheet and create all clusters with single login', async ({ page }) => {
  test.setTimeout(300_000); // 5 min timeout for large datasets

  // 1. Fetch cluster data from Google Sheets (CSV export)
  console.log(`\n📊 Fetching cluster data from Google Sheets...`);
  const response = await fetch(SHEET_URL);
  if (!response.ok) throw new Error(`Failed to fetch sheet: ${response.statusText}. Check if the sheet is public/accessible and the ID is correct.`);

  const csvBuffer = Buffer.from(await response.arrayBuffer());
  const workbook = read(csvBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json(sheet); // uses first row as headers

  console.log(`✅ Loaded ${rows.length} cluster(s) from Google Sheets:`);
  rows.forEach((r, i) => console.log(`   ${i + 1}. ${r['Cluster Name']}`));

  // 2. Login ONCE
  console.log(`\n🔐 Logging in as: ${LOGIN_EMAIL}`);
  await page.goto('https://cms.pocsample.in/');
  await page.getByRole('textbox', { name: 'Enter your email or phone' }).fill(LOGIN_EMAIL);
  await page.getByRole('textbox', { name: 'Enter your password' }).fill(LOGIN_PASSWORD);
  await page.getByRole('button', { name: /Log In/i }).click();
  await page.waitForLoadState('networkidle');
  console.log(`✅ Login successful\n`);

  // 3. Loop through all rows and create each cluster
  for (const row of rows) {
    // ⚠️ Ensure the column header in your Excel file is exactly "Cluster Name" ⚠️
    const clusterName = row['Cluster Name'];
    if (!clusterName) continue; // skip empty rows

    console.log(`🚀 Creating cluster: "${clusterName}"`);

    // Navigate to Clusters page
    await page.getByRole('link', { name: ' Clusters' }).click();
    await page.waitForLoadState('networkidle');

    // Open New Cluster modal
    await page.getByRole('button', { name: ' New Cluster' }).click();

    // Fill cluster name from sheet
    await page.locator('#addCluster #name').fill(clusterName);

    // Submit
    await page.getByRole('button', { name: 'Create Cluster' }).click();
    await page.waitForLoadState('networkidle');

    // Verify cluster is visible
    await expect(
      page.getByText(clusterName, { exact: false }).first()
    ).toBeVisible({ timeout: 15_000 });

    console.log(`✅ Cluster "${clusterName}" created!\n`);
  }

  console.log(`🎉 All ${rows.length} clusters created successfully!`);
});
