import { test, expect } from '@playwright/test';
import { read, utils } from 'xlsx';

// ─── Google Sheets Config ─────────────────────────────────────────────────────
const SHEET_ID = '1V7TjTHwlkDZf4-eQHer76YYwb_rKEnR11Jd8A3OyLhU';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

// ─── Login Credentials ────────────────────────────────────────────────────────
const BASE_URL = 'https://cms.pocsample.in/';
const LOGIN_EMAIL = (process.env.CMS_EMAIL || process.env.CMS_ADMIN_EMAIL || '');
const LOGIN_PASSWORD = (process.env.CMS_PASSWORD || process.env.CMS_ADMIN_PASSWORD || '');

// ─── Single Test: Fetch Sheet → Login Once → Create All Clusters ──────────────

test('Fetch Google Sheet and create all clusters with single login', async ({ page }) => {
  test.setTimeout(600_000); // 10 min timeout for large datasets

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
  await page.goto(BASE_URL);
  await page.getByRole('textbox', { name: 'Enter your email or phone' }).fill(LOGIN_EMAIL);
  await page.getByRole('textbox', { name: 'Enter your password' }).fill(LOGIN_PASSWORD);
  await page.getByRole('button', { name: /Log In/i }).click();
  await page.waitForLoadState('networkidle');
  console.log(`✅ Login successful\n`);

  // 3. Loop through all rows and create each cluster
  const results = { created: [], skipped: [], failed: [] };

  for (const row of rows) {
    // ⚠️ Ensure the column header in your Excel file is exactly "Cluster Name" ⚠️
    const clusterName = row['Cluster Name'];
    if (!clusterName) continue; // skip empty rows

    console.log(`🚀 Creating cluster: "${clusterName}"`);

    try {
      // Navigate to Clusters page (direct URL is more robust than sidebar click)
      await page.goto(`${BASE_URL}clusters`, { waitUntil: 'networkidle', timeout: 20_000 });

      // Skip if a cluster with this name already exists (keeps re-runs idempotent)
      if (await page.getByText(clusterName, { exact: false }).count() > 0) {
        console.log(`⚠️  Cluster "${clusterName}" already exists — skipping\n`);
        results.skipped.push(clusterName);
        continue;
      }

      // Open New Cluster modal
      await page.getByRole('button', { name: ' New Cluster' }).click();
      await page.waitForSelector('#addCluster', { state: 'visible', timeout: 10_000 });

      // Fill cluster name from sheet
      await page.locator('#addCluster #name').fill(clusterName);

      // Submit
      await page.getByRole('button', { name: 'Create Cluster' }).click();

      // Success = modal closes. Don't rely on a list text match (the list is paginated,
      // so a newly created cluster may not be on the first page).
      await page.waitForSelector('#addCluster', { state: 'hidden', timeout: 15_000 });

      console.log(`✅ Cluster "${clusterName}" created!\n`);
      results.created.push(clusterName);

    } catch (err) {
      console.error(`❌ Failed to create cluster "${clusterName}": ${err.message}`);
      // Dismiss any lingering modal so the next iteration starts clean
      await page.keyboard.press('Escape').catch(() => {});
      results.failed.push(clusterName);
    }
  }

  // 4. Summary
  console.log('\n─────────────────────────────────────────');
  console.log(`📊 Summary:`);
  console.log(`   ✅ Created : ${results.created.length} — ${results.created.join(', ') || 'none'}`);
  console.log(`   ⚠️  Skipped : ${results.skipped.length} — ${results.skipped.join(', ') || 'none'}`);
  console.log(`   ❌ Failed  : ${results.failed.length} — ${results.failed.join(', ') || 'none'}`);
  console.log('─────────────────────────────────────────\n');

  // Fail the test only if a creation genuinely failed (skipped duplicates are fine)
  expect(results.failed, `These clusters failed: ${results.failed.join(', ')}`).toHaveLength(0);
});
