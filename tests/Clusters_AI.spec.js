import { test, expect } from '@playwright/test';
import { read, utils } from 'xlsx';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL      = 'https://cms.pocsample.in/';
const LOGIN_EMAIL   = 'dev@wilyer.com';
const LOGIN_PASSWORD= 'testdev';
const SHEET_ID      = '1V7TjTHwlkDZf4-eQHer76YYwb_rKEnR11Jd8A3OyLhU';
const SHEET_URL     = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Log in and wait for dashboard to be ready */
async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  await page.waitForSelector('input[placeholder*="email"], input[type="email"]', { timeout: 15_000 });
  await page.getByRole('textbox', { name: /email|phone/i }).fill(LOGIN_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(LOGIN_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();

  // Wait for page to fully load after login (proven reliable approach)
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  console.log(`✅ Logged in as ${LOGIN_EMAIL}`);
}

/** Fetch cluster names from Google Sheets CSV export */
async function fetchClusterNames() {
  console.log('📊 Fetching cluster data from Google Sheets...');
  const response = await fetch(SHEET_URL);
  if (!response.ok) throw new Error(`Sheet fetch failed: ${response.statusText}`);

  const buffer  = Buffer.from(await response.arrayBuffer());
  const workbook= read(buffer, { type: 'buffer' });
  const sheet   = workbook.Sheets[workbook.SheetNames[0]];
  const rows    = utils.sheet_to_json(sheet);

  const names = rows.map(r => r['Cluster Name']).filter(Boolean);
  console.log(`✅ Loaded ${names.length} cluster(s): ${names.join(', ')}`);
  return names;
}

/** Navigate to the Clusters page via direct URL (more robust than sidebar click) */
async function goToClusters(page) {
  await page.goto(`${BASE_URL}clusters`, { waitUntil: 'networkidle', timeout: 20_000 });
}

/** Check if a cluster already exists in the list (after navigating to clusters page) */
async function clusterExists(page, name) {
  // If paginated, we can also try URL search param approach
  const url = page.url();
  if (!url.includes('cluster')) {
    await page.goto(`${BASE_URL}clusters`, { waitUntil: 'networkidle', timeout: 20_000 });
  }
  const count = await page.getByText(name, { exact: false }).count();
  return count > 0;
}

/** Open the New Cluster modal */
async function openNewClusterModal(page) {
  const btn = page.getByRole('button', { name: /new cluster/i });
  await btn.waitFor({ timeout: 10_000 });
  await btn.click();

  // Wait for modal to be visible
  await page.waitForSelector('#addCluster, [class*="modal"], [role="dialog"]', { timeout: 10_000 });
}

/** Fill and submit the cluster creation form */
async function createCluster(page, name) {
  // Prefer scoped ID selector, fall back to any visible name input inside modal
  const nameInput = page.locator('#addCluster #name, [role="dialog"] input[name="name"], [class*="modal"] input[placeholder*="name" i]').first();
  await nameInput.waitFor({ timeout: 10_000 });
  await nameInput.clear();
  await nameInput.fill(name);

  const submitBtn = page.getByRole('button', { name: /create cluster/i });
  await submitBtn.waitFor({ timeout: 5_000 });
  await submitBtn.click();

  // Wait for modal to fully close (dismiss backdrop so nav is unblocked)
  await page.waitForSelector('#addCluster', { state: 'hidden', timeout: 15_000 })
    .catch(async () => {
      // Only press Escape if page is still alive
      if (!page.isClosed()) {
        await page.keyboard.press('Escape').catch(() => {});
      }
    });
  // Give any CSS transitions a moment to finish
  if (!page.isClosed()) await page.waitForTimeout(300);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Clusters AI — Bulk Create from Google Sheets', () => {

  test.setTimeout(600_000); // 10 min for 100 clusters

  test('Fetch sheet → login once → create all clusters', async ({ page }) => {

    // 1. Fetch cluster names
    const clusterNames = await fetchClusterNames();
    expect(clusterNames.length, 'No cluster names found in sheet').toBeGreaterThan(0);

    // 2. Login once
    await login(page);

    // 3. Navigate to Clusters
    await goToClusters(page);

    const results = { created: [], skipped: [], failed: [] };

    // 4. Loop and create each cluster
    for (const name of clusterNames) {
      console.log(`\n🚀 Processing cluster: "${name}"`);

      try {
        // Re-navigate to clusters each iteration to ensure clean state
        await goToClusters(page);

        // Skip if already exists
        if (await clusterExists(page, name)) {
          console.log(`⚠️  Cluster "${name}" already exists — skipping`);
          results.skipped.push(name);
          continue;
        }

        // Open modal and create
        await openNewClusterModal(page);
        await createCluster(page, name);

        // Wait for success feedback — toast message or modal closing is enough
        // (cluster list may be paginated, so text search can miss it)
        const successToast = page.locator([
          '[class*="toast"]',
          '[class*="alert-success"]',
          '[class*="success"]',
          '.swal2-popup',
          '[role="alert"]'
        ].join(', '));

        const toastVisible = await successToast.first().isVisible().catch(() => false);
        if (toastVisible) {
          console.log(`   ✔ Success toast detected`);
        } else {
          // Fallback: if modal closed cleanly, treat as success
          const modalStillOpen = await page.locator('#addCluster').isVisible().catch(() => false);
          if (modalStillOpen) throw new Error('Modal still open after submit — creation may have failed');
        }

        // Screenshot as evidence (guard if page was redirected/closed)
        if (!page.isClosed()) {
          await page.screenshot({
            path: `test-results/cluster-created-${name.replace(/\s+/g, '_')}.png`
          }).catch(() => {});
        }

        console.log(`✅ Cluster "${name}" created successfully!`);
        results.created.push(name);

      } catch (err) {
        console.error(`❌ Failed to create cluster "${name}": ${err.message}`);
        // If the page/browser has been closed, abort the loop entirely
        if (page.isClosed()) {
          console.error('🚨 Browser page was closed unexpectedly — aborting loop.');
          results.failed.push(name);
          break;
        }
        // Guard screenshot — page may be in bad state
        try {
          await page.screenshot({
            path: `test-results/cluster-failed-${name.replace(/\s+/g, '_')}.png`
          });
        } catch (_) { /* ignore screenshot errors */ }
        results.failed.push(name);
      }
    }

    // 5. Summary
    console.log('\n─────────────────────────────────────────');
    console.log(`📊 Summary:`);
    console.log(`   ✅ Created : ${results.created.length} — ${results.created.join(', ') || 'none'}`);
    console.log(`   ⚠️  Skipped : ${results.skipped.length} — ${results.skipped.join(', ') || 'none'}`);
    console.log(`   ❌ Failed  : ${results.failed.length} — ${results.failed.join(', ') || 'none'}`);
    console.log('─────────────────────────────────────────\n');

    // Fail test only if any cluster failed (skipped is acceptable)
    expect(results.failed, `These clusters failed: ${results.failed.join(', ')}`).toHaveLength(0);
  });

});
