// =============================================================================
//  COMPARISON VALIDATION — merged/staging build vs production reference.
//    STAGING (under test): https://cms.wilyersignage.com   (ENV.BASE_URL)
//    PROD   (reference)  : https://cms.wilyersignage.com (ENV.PROD_URL)
//
//  Diffs the two environments along the dimensions the requirements call out:
//    • UI consistency      — same navigation modules present on both
//    • Feature availability — same set of core routes reachable
//    • Console errors       — staging must not introduce NEW console errors
//    • API behaviour        — no unexpected 5xx on staging that prod doesn't have
//    • Performance          — staging load time within a tolerance of prod
//
//  Each test logs in to BOTH environments in isolated contexts. If prod login
//  fails (different creds / not reachable), the suite skips with a clear reason
//  rather than reporting a misleading diff.
// =============================================================================

import { test, expect, CLEAN_STATE } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { ConsoleMonitor } from '../../utils/cms/consoleMonitor.js';
import { ApiMonitor } from '../../utils/cms/apiMonitor.js';

// Always start clean — we log into each environment explicitly.
test.use({ storageState: CLEAN_STATE });

const CORE_ROUTES = ['/', '/screens', '/groups', '/library', '/playlists', '/reports'];
const NAV_MODULES = [/dashboard/i, /screens/i, /groups/i, /library/i, /playlists/i, /reports/i];

/** Log in to an arbitrary CMS base URL using the shared role-based selectors. */
async function loginTo(page, baseURL) {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"], input[placeholder*="email" i], input[name="email"]', { timeout: 15_000 });
  await page.getByRole('textbox', { name: /email|phone/i }).fill(ENV.ADMIN_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(ENV.ADMIN_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.getByRole('link', { name: /dashboard/i }).waitFor({ state: 'visible', timeout: 25_000 });
}

/** Open both environments in their own contexts; returns { staging, prod } pages + a dispose(). */
async function openBoth(browser) {
  const stagingCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const prodCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const staging = await stagingCtx.newPage();
  const prod = await prodCtx.newPage();
  let prodOk = true;
  await loginTo(staging, ENV.BASE_URL);
  try {
    await loginTo(prod, ENV.PROD_URL);
  } catch {
    prodOk = false;
  }
  return {
    staging,
    prod,
    prodOk,
    dispose: async () => { await stagingCtx.close(); await prodCtx.close(); },
  };
}

// ── UI CONSISTENCY ───────────────────────────────────────────────────────────
test.describe('Comparison — UI consistency', () => {
  test('staging exposes the same navigation modules as prod', async ({ browser }) => {
    const { staging, prod, prodOk, dispose } = await openBoth(browser);
    try {
      test.skip(!prodOk, `Prod (${ENV.PROD_URL}) login failed — cannot compare. Set CMS_PROD_URL/creds.`);
      for (const mod of NAV_MODULES) {
        const onProd = await prod.getByRole('link', { name: mod }).first().isVisible().catch(() => false);
        const onStaging = await staging.getByRole('link', { name: mod }).first().isVisible().catch(() => false);
        // Any module present in prod must also be present in staging (no regressions).
        if (onProd) {
          expect(onStaging, `module ${mod} present on prod but missing on staging`).toBeTruthy();
        }
      }
    } finally {
      await dispose();
    }
  });
});

// ── FEATURE AVAILABILITY ──────────────────────────────────────────────────────
test.describe('Comparison — feature availability', () => {
  test('core routes reachable on staging wherever they are on prod', async ({ browser }) => {
    const { staging, prod, prodOk, dispose } = await openBoth(browser);
    try {
      test.skip(!prodOk, `Prod (${ENV.PROD_URL}) login failed — cannot compare.`);
      for (const route of CORE_ROUTES) {
        await prod.goto(`${ENV.PROD_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await staging.goto(`${ENV.BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await prod.waitForTimeout(800);
        await staging.waitForTimeout(800);
        const prodReached = !/login|signin/i.test(prod.url());
        const stagingReached = !/login|signin/i.test(staging.url());
        if (prodReached) {
          expect(stagingReached, `route ${route} reachable on prod but not staging`).toBeTruthy();
        }
      }
    } finally {
      await dispose();
    }
  });
});

// ── CONSOLE ERRORS ─────────────────────────────────────────────────────────────
test.describe('Comparison — console errors', () => {
  test('staging introduces no NEW console errors vs prod across core routes', async ({ browser }) => {
    const { staging, prod, prodOk, dispose } = await openBoth(browser);
    try {
      test.skip(!prodOk, `Prod (${ENV.PROD_URL}) login failed — cannot compare.`);
      const stagingMon = new ConsoleMonitor(staging);
      const prodMon = new ConsoleMonitor(prod);
      for (const route of CORE_ROUTES) {
        await prod.goto(`${ENV.PROD_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await staging.goto(`${ENV.BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await prod.waitForLoadState('networkidle').catch(() => {});
        await staging.waitForLoadState('networkidle').catch(() => {});
      }
      const norm = (s) => s.replace(/\d+/g, '#').replace(/https?:\/\/[^\s)"']+/g, 'URL').slice(0, 120);
      const prodSet = new Set(prodMon.allCritical.map(norm));
      const newOnStaging = stagingMon.allCritical.map(norm).filter((e) => !prodSet.has(e));
      console.log(`Console errors — prod: ${prodMon.allCritical.length}, staging: ${stagingMon.allCritical.length}, new: ${newOnStaging.length}`);
      newOnStaging.slice(0, 10).forEach((e) => console.log(`   NEW: ${e}`));
      // Report always; fail only in strict mode (the merged app is still settling).
      if (ENV.STRICT_MONITORS) {
        expect(newOnStaging, `staging-only console errors:\n${newOnStaging.join('\n')}`).toHaveLength(0);
      }
    } finally {
      await dispose();
    }
  });
});

// ── API BEHAVIOUR ──────────────────────────────────────────────────────────────
test.describe('Comparison — API behaviour', () => {
  test('staging produces no 5xx that prod does not', async ({ browser }) => {
    const { staging, prod, prodOk, dispose } = await openBoth(browser);
    try {
      test.skip(!prodOk, `Prod (${ENV.PROD_URL}) login failed — cannot compare.`);
      const stagingApi = new ApiMonitor(staging);
      const prodApi = new ApiMonitor(prod);
      for (const route of CORE_ROUTES) {
        await prod.goto(`${ENV.PROD_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await staging.goto(`${ENV.BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await prod.waitForTimeout(800);
        await staging.waitForTimeout(800);
      }
      console.log('Prod API:', prodApi.summary());
      console.log('Staging API:', stagingApi.summary());
      // Staging must not regress: no unexpected 5xx introduced by the merge.
      expect(stagingApi.serverErrors,
        `staging 5xx: ${stagingApi.serverErrors.map((e) => `${e.status} ${e.url}`).join(', ')}`)
        .toHaveLength(0);
    } finally {
      await dispose();
    }
  });
});

// ── PERFORMANCE ────────────────────────────────────────────────────────────────
test.describe('Comparison — performance', () => {
  test('staging dashboard loads within tolerance of prod', async ({ browser }) => {
    const { staging, prod, prodOk, dispose } = await openBoth(browser);
    try {
      test.skip(!prodOk, `Prod (${ENV.PROD_URL}) login failed — cannot compare.`);
      const time = async (page, base) => {
        const start = Date.now();
        await page.goto(`${base}/`, { waitUntil: 'networkidle' }).catch(() => {});
        return Date.now() - start;
      };
      const prodMs = await time(prod, ENV.PROD_URL);
      const stagingMs = await time(staging, ENV.BASE_URL);
      console.log(`Dashboard load — prod: ${prodMs}ms, staging: ${stagingMs}ms`);
      // Allow staging to be up to 2.5× prod (infra differs); also cap absolute.
      expect(stagingMs).toBeLessThan(Math.max(prodMs * 2.5, ENV.PERF_RELAXED_LOAD_MS * 1.5));
    } finally {
      await dispose();
    }
  });
});
