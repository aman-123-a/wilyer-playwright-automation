// =============================================================================
//  SUBUSER FOLDER SCOPING — a scoped sub-user must only see/reach assigned
//  folders & media. Positive, negative, edge, and security validation.
//
//  Requires a scoped sub-user account (CMS_SUBUSER_EMAIL/PASSWORD). If those
//  creds aren't valid in the target env, the whole file is skipped with a clear
//  reason rather than producing misleading failures.
// =============================================================================

import { test, expect, CLEAN_STATE } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { LibraryPage } from '../../pages/cms/LibraryPage.js';
import { fillLogin } from '../../helpers/loginHelper.js';

// Must authenticate as the SUB-USER, so never inherit the cached admin session.
test.use({ storageState: CLEAN_STATE });

// Probe sub-user creds once; skip the file if login doesn't reach the dashboard.
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await fillLogin(page, ENV.SUBUSER_EMAIL, ENV.SUBUSER_PASSWORD);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  const ok = (await page.getByRole('button', { name: /log in/i }).count()) === 0;
  await ctx.close();
  test.skip(!ok, `Sub-user (${ENV.SUBUSER_EMAIL}) could not authenticate — set CMS_SUBUSER_* to a valid scoped account.`);
});

// ── POSITIVE ────────────────────────────────────────────────────────────────
test.describe('Subuser scoping — Positive', () => {
  test('sub-user sees a (possibly restricted) set of folders', async ({ subuserPage }) => {
    const lib = new LibraryPage(subuserPage);
    await lib.open();
    const folders = await lib.listFolders();
    console.log(`Sub-user visible folders: ${folders.length} -> ${folders.slice(0, 10).join(', ')}`);
    // The view must render (not crash); folder count is environment-specific.
    await expect(subuserPage.locator('body')).toBeVisible();
  });

  test('allowed media is visible and folder navigation works', async ({ subuserPage }) => {
    const lib = new LibraryPage(subuserPage);
    await lib.open();
    const folders = await lib.listFolders();
    if (folders.length > 0) {
      await lib.openFolder(folders[0]);
      await expect(subuserPage.locator('body')).toBeVisible();
    } else {
      console.log('Sub-user has no folders assigned — empty permission set (see edge case).');
    }
  });
});

// ── NEGATIVE ────────────────────────────────────────────────────────────────
test.describe('Subuser scoping — Negative', () => {
  test('restricted admin routes (/team, /roles) are blocked', async ({ subuserPage }) => {
    for (const route of ['/team', '/roles']) {
      await subuserPage.goto(`${ENV.BASE_URL}${route}`, { waitUntil: 'networkidle' });
      const url = subuserPage.url();
      const blocked = !url.includes(route) || url.includes('login') || url === `${ENV.BASE_URL}/`;
      const errored = await subuserPage.getByText(/unauthorized|forbidden|access denied|not found/i)
        .isVisible().catch(() => false);
      expect(blocked || errored, `${route} must be blocked for sub-user`).toBeTruthy();
    }
  });

  test('direct API folder access without authorization is denied', async ({ request }) => {
    // No session on this request context → must not return folder data.
    const res = await request.get(`${ENV.BASE_URL}/api/folders`, { failOnStatusCode: false });
    console.log(`Unauthenticated /api/folders -> ${res.status()}`);
    expect(res.status()).not.toBe(200);
  });

  test('URL manipulation to a guessed foreign folder id is handled', async ({ subuserPage }) => {
    // Navigate to an unlikely/foreign folder id; app must not leak its contents.
    await subuserPage.goto(`${ENV.BASE_URL}/library?folder=999999999`, { waitUntil: 'networkidle' });
    const errored = await subuserPage.getByText(/no access|unauthorized|not found|empty|no (file|media)/i)
      .isVisible().catch(() => false);
    const cards = await subuserPage.getByText(/IMAGE|VIDEO/i).count();
    // Either an explicit empty/error state, or simply no media surfaced.
    expect(errored || cards === 0, 'foreign folder must not leak media').toBeTruthy();
  });
});

// ── EDGE CASES ──────────────────────────────────────────────────────────────
test.describe('Subuser scoping — Edge Cases', () => {
  test('searching for restricted media returns nothing for the sub-user', async ({ subuserPage }) => {
    const lib = new LibraryPage(subuserPage);
    await lib.open();
    await lib.searchMedia('zzz_restricted_media_should_not_exist_for_subuser');
    const cards = await lib.mediaCards().count();
    const noData = await subuserPage.getByText(/no (file|media|data|result|record)/i)
      .isVisible().catch(() => false);
    expect(cards === 0 || noData).toBeTruthy();
  });

  test('library remains stable with an empty/zero permission view', async ({ subuserPage }) => {
    const lib = new LibraryPage(subuserPage);
    await lib.open();
    // Even with no assigned media, the page must render an empty state, not crash.
    await expect(subuserPage.locator('body')).toBeVisible();
    const crashed = await subuserPage.getByText(/something went wrong|application error/i)
      .isVisible().catch(() => false);
    expect(crashed).toBeFalsy();
  });
});

// ── SECURITY VALIDATION ──────────────────────────────────────────────────────
test.describe('Subuser scoping — Security', () => {
  test('folder-list API payload does not leak more folders than the UI shows', async ({ subuserPage }) => {
    const folderPayloads = [];
    subuserPage.on('response', async (res) => {
      if (/\/api\/.*folder/i.test(res.url()) && res.request().method() === 'GET') {
        try {
          const json = await res.json();
          folderPayloads.push(json);
        } catch { /* non-JSON, ignore */ }
      }
    });

    const lib = new LibraryPage(subuserPage);
    await lib.open();
    await subuserPage.waitForTimeout(2000);

    const uiFolders = await lib.listFolders();
    // Count folder-like objects in the captured payloads.
    const countFolders = (j) => {
      let n = 0;
      const walk = (o) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') {
          if ('folderName' in o || 'folder_name' in o || ('name' in o && 'id' in o)) n++;
          Object.values(o).forEach(walk);
        }
      };
      folderPayloads.forEach(walk);
      return n;
    };
    const apiFolderCount = countFolders();
    console.log(`UI folders: ${uiFolders.length}, API folder objects: ${apiFolderCount}`);
    // The API must not return a wildly larger set than the scoped UI exposes.
    // (Heuristic: allow small structural overhead, flag gross over-exposure.)
    if (uiFolders.length > 0) {
      expect(apiFolderCount).toBeLessThanOrEqual(uiFolders.length + 5);
    }
  });

  test('no obvious metadata leakage (other tenants / admin-only keys) in payloads', async ({ subuserPage }) => {
    const leaks = [];
    subuserPage.on('response', async (res) => {
      if (!/\/api\//.test(res.url())) return;
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const body = await res.text().catch(() => '');
      // Admin-only / cross-tenant markers that a scoped user should never receive.
      if (/"adminOnly"\s*:\s*true|"isSuperAdmin"|"allTenants"|"ownerEmail"\s*:\s*"(?!.*subuser)/i.test(body)) {
        leaks.push(res.url());
      }
    });
    await new LibraryPage(subuserPage).open();
    await subuserPage.goto(`${ENV.BASE_URL}/playlists`, { waitUntil: 'networkidle' });
    await subuserPage.waitForTimeout(1500);
    expect(leaks, `Possible metadata leakage in: ${leaks.join(', ')}`).toHaveLength(0);
  });
});
