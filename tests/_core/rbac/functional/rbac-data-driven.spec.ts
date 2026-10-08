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

import { test, expect, type Page } from '@playwright/test';
import { LoginPage } from '../../../../pages/LoginPage';
import { RolesPage, type PermissionKind } from '../../../../pages/RolesPage';
import { BasePage } from '../../../../pages/BasePage';
import { ENV, type Credentials } from '../../../../config/env';
import { credentialsFor } from '../../../../helpers/rbac/roles';

// ---------------------------------------------------------------------------
//  Accounts — resolved from the environment ONLY.
//  This suite needs two real logins (an admin to change the role, and the
//  sub-user to verify the effect). It skips itself when either is missing
//  rather than falling back to a committed credential.
// ---------------------------------------------------------------------------
const ADMIN: Credentials = ENV.ADMIN;
const SUBUSER: Credentials | undefined = credentialsFor('unrestricted');

test.skip(
  !ADMIN.email || SUBUSER === undefined,
  'RBAC suite needs both an admin and a sub-user account — set CMS_ADMIN_* and ' +
    'CMS_SUBUSER_EMAIL / CMS_SUBUSER_PASSWORD in your .env.',
);
/** The exact name of the role assigned to the sub-user (Team → Roles card). */
const ROLE_NAME = process.env.CMS_RBAC_ROLE ?? 'un';

// ---------------------------------------------------------------------------
//  Every selector and interaction for the Team → Roles permission editor lives
//  in pages/RolesPage.ts. This file holds only the matrix and the expectations.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  DATA-DRIVEN MATRIX.
//  `kind: 'section'` → NONE/ALL bulk toggle; `kind: 'switch'` → Enable toggle.
//  `expectedPageUrl` is hit directly via page.goto() to prove server-side guard.
// ---------------------------------------------------------------------------
interface PermissionCase {
  name: string;
  kind: PermissionKind;
  sectionId: string; // accordion slug (see RolesPage.section)
  navLabel: RegExp; // sidebar link to assert hidden/visible
  expectedPageUrl: string; // route to probe directly
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
  {
    name: 'Reports',
    kind: 'section',
    sectionId: 'reports',
    navLabel: /reports/i,
    expectedPageUrl: '/reports',
  },
  {
    name: 'Cluster Management',
    kind: 'section',
    sectionId: 'cluster-management',
    navLabel: /clusters/i,
    expectedPageUrl: '/clusters',
    apiProbe: /\/cluster\/read/,
  },
  {
    name: 'Team Administration',
    kind: 'section',
    sectionId: 'team-administration',
    navLabel: /team/i,
    expectedPageUrl: '/team',
  },
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

/**
 * Edge case #1: leave no stale admin token behind, then log in fresh.
 * LoginPage.freshLogin() owns the cookie/web-storage clear + login sequence.
 */
async function freshLogin(page: Page, creds: Credentials): Promise<void> {
  await new LoginPage(page).freshLogin(creds);
}

/**
 * Set a permission to a desired state and save.
 * Edge case #3: RolesPage.setPermission awaits the PUT save response, so this
 * does not resolve — and the test does not log out — until the backend has
 * actually persisted the change.
 */
async function setPermission(page: Page, c: PermissionCase, grant: boolean): Promise<void> {
  await new RolesPage(page).setPermission(ROLE_NAME, c, grant);
}

/** Edge case #2 + #4: verify the sub-user's actual access for a permission. */
async function verifySubUserAccess(
  page: Page,
  c: PermissionCase,
  shouldHaveAccess: boolean,
): Promise<void> {
  await freshLogin(page, SUBUSER as Credentials);

  // (a) Sidebar link — hidden when access is revoked, present when granted.
  //     BasePage.navLink scopes to "the list that contains the Logout link",
  //     which avoids body/stat-card links pointing at the same route.
  const shell = new BasePage(page);
  const navLink = shell.navLink(c.navLabel);
  if (shouldHaveAccess) {
    await expect(navLink, `nav link for "${c.name}" should be visible`).toBeVisible({
      timeout: 10_000,
    });
  } else {
    await expect(navLink, `nav link for "${c.name}" should be hidden`).toHaveCount(0, {
      timeout: 10_000,
    });
  }

  // (b) Direct URL access — the real authorization gate. Edge case #2.
  //     We also watch the network so we can prove the *data* is withheld even
  //     when the route renders an empty shell instead of a 403 page.
  const forbiddenApis = await shell.gotoRecordingForbidden(c.expectedPageUrl);

  const accessError = await shell.hasAccessError();
  const url = page.url();
  const redirectedAway = shell.redirectedAwayFrom(c.expectedPageUrl);
  const apiForbidden = c.apiProbe !== undefined && forbiddenApis.some((p) => c.apiProbe!.test(p));
  const apiAllowed = c.apiProbe === undefined || !forbiddenApis.some((p) => c.apiProbe!.test(p));

  if (shouldHaveAccess) {
    expect(accessError, `granted "${c.name}" must NOT show an access error`).toBeFalsy();
    expect(url, `granted "${c.name}" should stay on ${c.expectedPageUrl}`).toContain(
      c.expectedPageUrl,
    );
    // The module's data API must NOT be forbidden when the permission is granted.
    expect(apiAllowed, `granted "${c.name}": data API must not return 403`).toBeTruthy();
  } else {
    // "Fenced" = a 403 page OR a redirect OR (for shell-rendering modules) the
    // data API itself returning 403. The stricter apiProbe closes the gap where
    // a route renders an empty shell with no visible "Access Denied" text.
    expect(
      accessError || redirectedAway || apiForbidden,
      `revoked "${c.name}": expected a 403 page, a redirect, or a 403 from ${c.apiProbe} ` +
        `(saw forbidden APIs: ${forbiddenApis.join(', ') || 'none'})`,
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
    await freshLogin(page, SUBUSER as Credentials);
    const writeActions: RegExp[] = [/delete/i, /^create/i, /publish/i, /assign/i];

    // Hidden (absent from the DOM) or present-but-disabled both pass; a visible
    // AND enabled control is the defect. BasePage owns that either/or check.
    const shell = new BasePage(page);
    for (const name of writeActions) {
      await shell.expectActionHiddenOrDisabled(name);
    }
  });
});
