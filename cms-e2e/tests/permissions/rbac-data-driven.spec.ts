// =============================================================================
//  DATA-DRIVEN RBAC SUITE — admin toggles a role permission, sub-user verifies.
//
//  Flow per row in PERMISSIONS_TO_TEST:
//    1. ADMIN logs in, opens Team → Roles, edits the sub-user's role.
//    2. Revokes (or grants) the permission *section* and clicks "Update Role".
//       We WAIT for the PUT /role/update => 200 response before moving on so we
//       never log out mid-save (race-condition guard — edge case #3).
//    3. We FULLY evict the admin session (cookies + local/session storage) and
//       do a fresh sub-user login, so a stale admin token can't leak access
//       (edge case #1 — session/token eviction).
//    4. We verify the sub-user's access matches the permission state:
//         • nav link hidden        (UI fencing)
//         • direct page.goto()     → 403 / Access Denied / redirect (edge #2)
//         • action controls hidden OR disabled (edge #4 — disabled vs hidden)
//    5. We RESTORE the original permission (cleanup) so tests never interfere
//       with one another or leave the shared environment mutated.
//
//  Verified live against cms.pocsample.in (2026-05-26): the permission UI is
//  *section-based* — each section (e.g. "Reports", "Cluster Management") exposes
//  NONE / READ-ONLY / ALL bulk buttons plus per-module checkboxes once expanded,
//  and two sections ("File Uploading", "Content Publishing") are Enable toggles.
//  Swap the SELECTORS / PERMISSIONS_TO_TEST below to match your own UI.
// =============================================================================

import { test, expect, type Page, type Locator } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { ENV, type Credentials } from '../../config/env';

// ---------------------------------------------------------------------------
//  Accounts (override via env in CI; committed values are a local fallback).
// ---------------------------------------------------------------------------
const ADMIN: Credentials = ENV.ADMIN; // admin credentials supplied via .env
const SUBUSER: Credentials = {
  email: process.env.CMS_SUBUSER_EMAIL ?? 'ak22@gmail.com',
  password: process.env.CMS_SUBUSER_PASSWORD ?? '12345',
};
/** The exact name of the role assigned to the sub-user (Team → Roles card). */
const ROLE_NAME = process.env.CMS_RBAC_ROLE ?? 'un';

// ---------------------------------------------------------------------------
//  SWAPPABLE SELECTORS — replace with your real UI selectors.
//  (These are the values verified live on cms.pocsample.in.)
// ---------------------------------------------------------------------------
const SELECTORS = {
  teamMenu: (p: Page) => p.getByRole('link', { name: /team/i }).first(),
  rolesTab: (p: Page) => p.getByRole('link', { name: /^roles$/i }),
  /** The role card whose <h5> heading equals ROLE_NAME. */
  roleCard: (p: Page, name: string) =>
    p.getByRole('heading', { level: 5, name, exact: true })
      .locator('xpath=ancestor::*[.//button[contains(.,"Edit")]][1]'),
  editButton: (card: Locator) => card.getByRole('button', { name: /edit/i }),
  dialog: (p: Page) => p.getByRole('dialog'),
  /** A permission section accordion, addressed by its slug id. */
  section: (p: Page, id: string) => p.locator(`[id="section-accordion-${id}"]`),
  bulkNone: (section: Locator) => section.getByRole('button', { name: 'NONE' }),
  bulkAll: (section: Locator) => section.getByRole('button', { name: 'ALL' }),
  enableSwitch: (section: Locator) => section.getByRole('switch'),
  updateRole: (p: Page) => p.getByRole('button', { name: /update role/i }),
};

// API the "Update Role" button hits — we wait for this to succeed before logout.
const SAVE_API = /\/role\/update\//;

// ---------------------------------------------------------------------------
//  DATA-DRIVEN MATRIX.
//  `kind: 'section'` → NONE/ALL bulk toggle; `kind: 'switch'` → Enable toggle.
//  `expectedPageUrl` is hit directly via page.goto() to prove server-side guard.
// ---------------------------------------------------------------------------
interface PermissionCase {
  name: string;
  kind: 'section' | 'switch';
  sectionId: string;          // accordion slug (see SELECTORS.section)
  navLabel: RegExp;           // sidebar link to assert hidden/visible
  expectedPageUrl: string;    // route to probe directly
  // The module's data API. Verified live: when the permission is revoked some
  // routes show a full 403 page (Team, Reports) while others render an empty
  // shell whose data API quietly returns 403 (Screens, Library, Playlists,
  // Groups, Clusters). For the latter, the 403 page check alone is too weak —
  // we additionally assert this endpoint returns 403 so "fenced" means the data
  // is actually withheld, not just hidden in the nav.
  apiProbe?: RegExp;
}

// NOTE: sidebar links carry a leading icon glyph in their accessible name
// (e.g. " Reports"), so navLabel regexes must NOT be anchored with ^…$ — match
// the word loosely and rely on the sidebar-scoped lookup in verifySubUserAccess.
const PERMISSIONS_TO_TEST: PermissionCase[] = [
  { name: 'Reports',            kind: 'section', sectionId: 'reports',            navLabel: /reports/i,   expectedPageUrl: '/reports'  },
  { name: 'Cluster Management', kind: 'section', sectionId: 'cluster-management', navLabel: /clusters/i,  expectedPageUrl: '/clusters', apiProbe: /\/cluster\/read/ },
  { name: 'Team Administration',kind: 'section', sectionId: 'team-administration',navLabel: /team/i,      expectedPageUrl: '/team'     },
];

// NOTE — why the two Enable-switch toggles are NOT in the route matrix above:
// "File Uploading" and "Content Publishing" are *capability* toggles, not route
// gates. Verified live: with File Uploading OFF the sub-user still sees the
// Library nav link, can open /library, and even sees an enabled "Upload Files"
// button — the restriction is enforced server-side on the upload API, with no
// observable nav/route effect. Asserting nav-hidden / route-403 for them would
// be wrong. Their real (data-layer) enforcement belongs in an API-level test,
// not this UI route-fencing matrix.

// =============================================================================
//  HELPERS
// =============================================================================

/** Edge case #1: leave no stale admin token behind, then log in fresh. */
async function freshLogin(page: Page, creds: Credentials): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const login = new LoginPage(page);
  await login.goto();
  await login.login(creds);
  await login.isAuthenticated();
}

/** Open the role's Edit modal from Team → Roles. */
async function openRoleEditor(page: Page): Promise<void> {
  await SELECTORS.teamMenu(page).click();
  await page.waitForLoadState('domcontentloaded');
  await SELECTORS.rolesTab(page).click();
  await page.waitForTimeout(1_200); // role cards re-render
  const card = SELECTORS.roleCard(page, ROLE_NAME);
  await expect(card.first(), `role card "${ROLE_NAME}" should exist`).toBeVisible({ timeout: 15_000 });
  await SELECTORS.editButton(card.first()).click();
  await expect(SELECTORS.dialog(page)).toBeVisible({ timeout: 10_000 });
}

/**
 * Set a permission to a desired state and save.
 * Edge case #3: we await the PUT save response (200) inside Promise.all so the
 * function does not resolve — and the test does not log out — until the backend
 * has actually persisted the change.
 */
async function setPermission(page: Page, c: PermissionCase, grant: boolean): Promise<void> {
  await openRoleEditor(page);
  const section = SELECTORS.section(page, c.sectionId);
  await expect(section).toBeVisible({ timeout: 10_000 });

  if (c.kind === 'section') {
    await (grant ? SELECTORS.bulkAll(section) : SELECTORS.bulkNone(section)).click();
  } else {
    // Toggle switch: only click if its checked-state differs from desired.
    const sw = SELECTORS.enableSwitch(section);
    const isOn = (await sw.getAttribute('aria-checked')) === 'true' || (await sw.isChecked().catch(() => false));
    if (isOn !== grant) await sw.click();
  }

  const [resp] = await Promise.all([
    page.waitForResponse((r) => SAVE_API.test(r.url()) && r.request().method() === 'PUT', { timeout: 20_000 }),
    SELECTORS.updateRole(page).click(),
  ]);
  expect(resp.status(), 'Update Role save must return 2xx before we continue').toBeLessThan(300);
  await expect(SELECTORS.dialog(page)).toBeHidden({ timeout: 10_000 }).catch(() => {});
}

/** Edge case #2 + #4: verify the sub-user's actual access for a permission. */
async function verifySubUserAccess(page: Page, c: PermissionCase, shouldHaveAccess: boolean): Promise<void> {
  await freshLogin(page, SUBUSER);

  // (a) Sidebar link — hidden when access is revoked, present when granted.
  //     The sidebar is a plain <ul> (NOT a <nav>/<aside> landmark), so we scope
  //     to "the list that contains the Logout link" — robust and unambiguous,
  //     avoiding body/stat-card links to the same route. navLabel is un-anchored
  //     because sidebar links carry a leading icon glyph (" Reports").
  const sidebar = page.getByRole('list')
    .filter({ has: page.getByRole('link', { name: /logout/i }) })
    .first();
  const navLink = sidebar.getByRole('link', { name: c.navLabel }).first();
  if (shouldHaveAccess) {
    await expect(navLink, `nav link for "${c.name}" should be visible`).toBeVisible({ timeout: 10_000 });
  } else {
    await expect(navLink, `nav link for "${c.name}" should be hidden`).toHaveCount(0, { timeout: 10_000 });
  }

  // (b) Direct URL access — the real authorization gate. Edge case #2.
  //     We also watch the network so we can prove the *data* is withheld even
  //     when the route renders an empty shell instead of a 403 page.
  const forbiddenApis = new Set<string>();
  const onResponse = (r: import('@playwright/test').Response): void => {
    if (r.status() === 403) forbiddenApis.add(new URL(r.url()).pathname);
  };
  page.on('response', onResponse);
  try {
    await page.goto(c.expectedPageUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    // Give late XHRs a beat to resolve so apiProbe can observe their status.
    await page.waitForTimeout(1_500);
  } finally {
    page.off('response', onResponse);
  }

  const accessError = await page
    .getByText(/403|forbidden|access denied|permission denied|unauthori[sz]ed|no permission/i)
    .first()
    .isVisible()
    .catch(() => false);
  const url = page.url();
  const redirectedAway = !url.includes(c.expectedPageUrl) || new URL(url).pathname === '/';
  const apiForbidden =
    c.apiProbe !== undefined && [...forbiddenApis].some((p) => c.apiProbe!.test(p));
  const apiAllowed =
    c.apiProbe === undefined || ![...forbiddenApis].some((p) => c.apiProbe!.test(p));

  if (shouldHaveAccess) {
    expect(accessError, `granted "${c.name}" must NOT show an access error`).toBeFalsy();
    expect(url, `granted "${c.name}" should stay on ${c.expectedPageUrl}`).toContain(c.expectedPageUrl);
    // The module's data API must NOT be forbidden when the permission is granted.
    expect(apiAllowed, `granted "${c.name}": data API must not return 403`).toBeTruthy();
  } else {
    // "Fenced" = a 403 page OR a redirect OR (for shell-rendering modules) the
    // data API itself returning 403. The stricter apiProbe closes the gap where
    // a route renders an empty shell with no visible "Access Denied" text.
    expect(
      accessError || redirectedAway || apiForbidden,
      `revoked "${c.name}": expected a 403 page, a redirect, or a 403 from ${c.apiProbe} ` +
        `(saw forbidden APIs: ${[...forbiddenApis].join(', ') || 'none'})`,
    ).toBeTruthy();
    // When we declared an apiProbe, insist the data is actually withheld — not
    // merely hidden from the nav. This is the assertion that catches a route
    // that leaks data despite the revoked permission.
    if (c.apiProbe && !accessError) {
      expect(
        apiForbidden,
        `revoked "${c.name}": route rendered without a 403 page, so its data API ` +
          `(${c.apiProbe}) MUST return 403 — otherwise data is leaking`,
      ).toBeTruthy();
    }
  }
}

// =============================================================================
//  TESTS — one isolated block per permission, run serially (shared role state).
// =============================================================================
test.describe.configure({ mode: 'serial' });
// Always start unauthenticated; do NOT inherit the cached admin storageState.
test.use({ storageState: { cookies: [], origins: [] } });

for (const perm of PERMISSIONS_TO_TEST) {
  test.describe(`RBAC · ${perm.name}`, () => {
    // Restore the granted state after each block so blocks never interfere.
    test.afterAll(async ({ browser }) => {
      const page = await browser.newPage();
      try {
        await freshLogin(page, ADMIN);
        await setPermission(page, perm, /* grant */ true);
      } finally {
        await page.close();
      }
    });

    test(`REVOKED → sub-user is fenced out of ${perm.expectedPageUrl}`, async ({ page }) => {
      await freshLogin(page, ADMIN);
      await setPermission(page, perm, /* grant */ false);
      await verifySubUserAccess(page, perm, /* shouldHaveAccess */ false);
    });

    test(`GRANTED → sub-user can reach ${perm.expectedPageUrl}`, async ({ page }) => {
      await freshLogin(page, ADMIN);
      await setPermission(page, perm, /* grant */ true);
      await verifySubUserAccess(page, perm, /* shouldHaveAccess */ true);
    });
  });
}

// ---------------------------------------------------------------------------
//  EDGE CASE #4 (explicit) — "disabled vs hidden" action controls.
//  When a write permission is downgraded, an action control may be either
//  removed from the DOM (hidden) OR rendered but inert (disabled). Both are
//  acceptable; a visible-AND-enabled control would be the real defect.
// ---------------------------------------------------------------------------
test.describe('RBAC · disabled-vs-hidden action controls', () => {
  test('admin-only write actions are hidden or disabled for the sub-user', async ({ page }) => {
    await freshLogin(page, SUBUSER);
    const writeActions: RegExp[] = [/delete/i, /^create/i, /publish/i, /assign/i];

    for (const name of writeActions) {
      const control = page.getByRole('button', { name }).or(page.getByRole('link', { name }));
      const count = await control.count();
      if (count === 0) continue; // hidden — acceptable
      // Present → must be disabled (not actionable) for at least the first match.
      await expect(
        control.first(),
        `"${name}" is present but must be disabled for the restricted sub-user`,
      ).toBeDisabled();
    }
  });
});
