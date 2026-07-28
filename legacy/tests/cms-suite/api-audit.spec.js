// =============================================================================
//  CMS API AUDIT
// =============================================================================
//  Senior-QA audit: logs in once, walks every CMS module in sequence, and
//  captures EVERY API request/response the SPA fires while each module loads.
//
//  For each call it records:  Module · URL · Method · Status · Response-time ·
//  Timestamp — then classifies failures (4xx/5xx/transport), slow (> 2000ms)
//  and critical (> 5000ms) calls, and probes each page for blank/white screens,
//  uncaught exceptions and console errors.
//
//  Outputs (written to reports/api-audit/):
//    • api-report.json          full structured report
//    • api-report.csv           every captured call
//    • failed-api-report.csv    only 4xx/5xx/transport failures
//  …and prints a markdown results table + headline totals to the console.
//
//  This is an AUDIT, not a gate: it deliberately does NOT fail on individual
//  4xx/5xx/slow calls — it reports them. It fails only if it captured no API
//  traffic at all (which would mean the audit itself is broken). Flip
//  STRICT=true (env CMS_AUDIT_STRICT=true) to also fail on failures/criticals.
//
//  Run:   npm run cms -- tests/cms-suite/api-audit.spec.js
// =============================================================================

import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { ENV } from '../../utils/cms/env.js';
import { login, logout } from '../../helpers/loginHelper.js';
import { ApiAuditor } from '../../utils/cms/apiAuditor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', '..', 'reports', 'api-audit');
const STRICT = process.env.CMS_AUDIT_STRICT === 'true';

/**
 * Modules to audit, in navigation order. Logout MUST be last (it ends the
 * session). `path` is the canonical route (preferred — sidebar links use
 * icon-glyph labels that break anchored selectors). `linkName` is a fallback
 * used when the route is a guess (header/help-menu items).
 *
 * @type {{name:string, path?:string, linkName?:RegExp, logout?:boolean}[]}
 */
const MODULES = [
  { name: 'Screens',     path: '/screens' },
  { name: 'Groups',      path: '/groups' },
  { name: 'Clusters',    path: '/clusters' },
  { name: 'Library',     path: '/library' },
  { name: 'Playlists',   path: '/playlists' },
  { name: 'Team',        path: '/team' },
  { name: 'Reports',     path: '/reports' },
  { name: "What's New",  path: '/whats-new',  linkName: /what'?s\s*new|release notes/i },
  { name: 'Help',        path: '/help',       linkName: /help|support|docs/i },
  { name: 'Feedback',    path: '/feedback',   linkName: /feedback/i },
  { name: 'Account',     path: '/account',    linkName: /account|profile|my settings/i },
  { name: 'Logout',      logout: true },
];

/** Absolute URL for a route under the target base. */
const urlFor = (route) => new URL(route, ENV.BASE_URL).toString();

/** Did we land on the login screen (i.e. the route bounced us out)? */
const onLoginScreen = (page) => /login|signin/i.test(page.url());

/**
 * Open a module robustly and let its API traffic fire & settle.
 * Strategy: direct route navigation first; fall back to a header/menu link if
 * the route is missing or bounced to login.
 * @returns {Promise<boolean>} whether the module was opened.
 */
async function openModule(page, mod) {
  let opened = false;

  if (mod.path) {
    const resp = await page
      .goto(urlFor(mod.path), { waitUntil: 'domcontentloaded' })
      .catch(() => null);
    opened = !!resp && !onLoginScreen(page);
  }

  if ((!opened || onLoginScreen(page)) && mod.linkName) {
    const link = page.getByRole('link', { name: mod.linkName }).first();
    if (await link.count()) {
      await link.click().catch(() => {});
      opened = true;
    }
  }

  if (!opened) return false;

  // Let the SPA's XHR/fetch traffic for this module fire AND complete so the
  // auditor can time the responses. networkidle is best-effort (this app keeps
  // long-lived connections open), then a short fixed window for late XHRs.
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
  return true;
}

test.describe('CMS API audit', () => {
  // 12 modules × (nav + settle); give the whole sweep plenty of headroom.
  test.setTimeout(240_000);

  test('audit every API call across all CMS modules', async ({ page }) => {
    const auditor = new ApiAuditor(page, { slowMs: 2_000, criticalMs: 5_000 });

    // 1) Login once. Auth traffic is attributed to the "Login" module.
    auditor.setModule('Login');
    await login(page);
    await auditor.recordPageHealth(page);

    try {
      // 2) Walk each module, capturing traffic + health as we go.
      for (const mod of MODULES) {
        auditor.setModule(mod.name);

        if (mod.logout) {
          await logout(page).catch((e) => console.warn(`[audit] logout: ${e.message}`));
          await page.waitForTimeout(1_000); // capture the logout/session API
          await auditor.recordPageHealth(page);
          continue;
        }

        const opened = await openModule(page, mod);
        if (!opened) {
          console.warn(`[audit] ${mod.name}: no route/link found — skipped`);
          continue;
        }
        await auditor.recordPageHealth(page);
      }
    } finally {
      // 3) Always emit reports + summary, even if the sweep threw midway.
      const paths = auditor.writeReports(OUT_DIR);
      auditor.printSummary();
      console.log('[audit] reports written:');
      console.log(`        ${paths.json}`);
      console.log(`        ${paths.csv}`);
      console.log(`        ${paths.failedCsv}`);

      // Surface as a Playwright attachment for the HTML report / CI artifacts.
      test.info().attach('api-report.json', { path: paths.json, contentType: 'application/json' });
      test.info().attach('api-report.csv', { path: paths.csv, contentType: 'text/csv' });
      test.info().attach('failed-api-report.csv', { path: paths.failedCsv, contentType: 'text/csv' });
    }

    // 4) Assertions. The audit must have observed real traffic.
    expect(auditor.calls.length, 'audit captured no API calls — instrument broken?')
      .toBeGreaterThan(0);

    // Optional strict gate (off by default — this is a report, not a regression).
    if (STRICT) {
      expect(auditor.failed, `failed APIs:\n${fmt(auditor.failed)}`).toHaveLength(0);
      expect(auditor.critical, `critical (>5s) APIs:\n${fmt(auditor.critical)}`).toHaveLength(0);
      expect(auditor.unhealthyModules, `unhealthy modules: ${auditor.unhealthyModules.map((h) => h.module).join(', ')}`)
        .toHaveLength(0);
    }
  });
});

/** Compact one-line-per-call formatter for assertion messages. */
function fmt(calls) {
  return calls
    .slice(0, 20)
    .map((c) => `  [${c.module}] ${c.method} ${c.url} → ${c.status} (${c.ms}ms)`)
    .join('\n');
}
