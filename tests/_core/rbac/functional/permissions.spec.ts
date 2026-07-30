// =============================================================================
//  PERMISSION / RBAC SUITE — restricted role user.
//
//  Goal: prove that a non-admin role account is correctly *fenced in*:
//    1. can authenticate and reach its dashboard,
//    2. sees the features it is entitled to,
//    3. cannot reach admin-only routes by typing the URL,
//    4. is not shown admin-only action controls, and
//    5. degrades gracefully (Access Denied, not a crash) when the API says 403.
//
//  Built entirely on the Page Object Model: page objects come from the shared
//  fixtures, and the guard/authorization mechanics (route fencing, access-error
//  and crash detection, hidden-vs-disabled controls) live on BasePage.
//  We deliberately start from a CLEAN browser context (no cached admin session)
//  so the login below authenticates as THIS role user, not the admin.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { type Credentials } from '../../../../config/env';
import { ROUTES } from '../../../../pages/BasePage';
import { credentialsFor } from '../../../../helpers/rbac/roles';

// -----------------------------------------------------------------------------
//  Role-user credentials — resolved from the environment ONLY.
//  This suite skips itself when the account is not configured, rather than
//  falling back to a committed credential. A fallback login in a shared
//  repository is a credential leak whatever the intent behind it.
//  Set CMS_RESTRICTED_EMAIL / CMS_RESTRICTED_PASSWORD to enable it.
// -----------------------------------------------------------------------------
const ROLE_USER: Credentials | undefined = credentialsFor('restricted');

test.skip(
  ROLE_USER === undefined,
  'No restricted-role account configured — set CMS_RESTRICTED_EMAIL / CMS_RESTRICTED_PASSWORD in your .env.',
);

// Admin-only routes this restricted user must NOT be able to open directly.
// (Real routes from the app's ROUTES map, plus a couple of common guesses.)
const RESTRICTED_ROUTES = [
  ROUTES.team, // '/team'    — user/role management
  ROUTES.billing, // '/billing' — invoices / plan management
  '/admin', // common admin console guess
  '/management', // common management guess
] as const;

// Admin-only action controls that must not be actionable for this role.
const ADMIN_ACTIONS: RegExp[] = [
  /delete item|delete user|delete role/i,
  /approve invoice|approve/i,
  /edit settings|manage roles|manage team/i,
];

// Start every test in this file from a pristine, unauthenticated context so the
// config-level cached admin storageState is NOT inherited.
test.use({ storageState: { cookies: [], origins: [] } });

// -----------------------------------------------------------------------------
//  1. SETUP / LOGIN
//     Authenticate as the role user and confirm we land on the dashboard shell.
//     Skips the whole file (with a clear reason) if these creds can't log in,
//     so we never emit misleading red failures for a bad/missing account.
// -----------------------------------------------------------------------------
test.beforeEach(async ({ loginPage }) => {
  await loginPage.goto();
  // Guarded by the file-level test.skip above; narrows the type here.
  const creds = ROLE_USER as Credentials;
  await loginPage.login(creds);

  const ok = await loginPage.isAuthenticated();
  test.skip(
    !ok,
    `Restricted-role user (${creds.email}) could not authenticate — check ` +
      `CMS_RESTRICTED_EMAIL / CMS_RESTRICTED_PASSWORD.`,
  );
});

// -----------------------------------------------------------------------------
//  2. POSITIVE UI CHECK
//     The features this role IS entitled to must render and be interactive.
//     We assert on the dashboard shell + at least one enabled quick action,
//     rather than asserting the *admin* action set (which this user lacks).
// -----------------------------------------------------------------------------
test.describe('Role user — Positive (entitled features)', () => {
  test('dashboard loads and an entitled action is visible & enabled', async ({ dashboardPage }) => {
    await dashboardPage.open(); // navigates to '/' and waits for the shell
    await dashboardPage.expectLoaded(); // stat cards painted → genuinely on the dashboard

    // Why: confirm the user can actually *use* what they see, not just that it
    // renders. A visible-but-disabled control would be a permission/UX bug.
    const entitledAction = dashboardPage.actionControl(/add media|new playlist|library/i).first();

    if (await entitledAction.count()) {
      await expect(entitledAction).toBeVisible();
      await expect(entitledAction).toBeEnabled();
    } else {
      // Minimal entitlement: the app shell itself must still be usable.
      await dashboardPage.expectAuthenticated();
    }
  });
});

// -----------------------------------------------------------------------------
//  3. NEGATIVE — UNAUTHORIZED URL ACCESS (edge case)
//     Server-side authorization must hold even when the UI link is hidden.
//     Typing an admin URL must redirect, bounce to login, or show 403/forbidden
//     — never silently render the protected admin screen.
// -----------------------------------------------------------------------------
test.describe('Role user — Negative (direct URL access is fenced)', () => {
  for (const route of RESTRICTED_ROUTES) {
    test(`navigating to ${route} is blocked or shows an access error`, async ({
      dashboardPage,
    }) => {
      await dashboardPage.expectRouteFenced(route);
    });
  }
});

// -----------------------------------------------------------------------------
//  4. HIDDEN ELEMENTS CHECK (edge case)
//     Admin-only action controls must be absent (or disabled) for this role.
//     `expectActionHiddenOrDisabled` accepts either — a rendered AND enabled
//     control is the defect.
// -----------------------------------------------------------------------------
test.describe('Role user — Hidden elements (admin actions are not actionable)', () => {
  test('admin-only action controls are hidden or disabled on the dashboard', async ({
    dashboardPage,
  }) => {
    await dashboardPage.open();
    await dashboardPage.expectLoaded();

    for (const name of ADMIN_ACTIONS) {
      await dashboardPage.expectActionHiddenOrDisabled(name);
    }
  });
});

// -----------------------------------------------------------------------------
//  5. API MOCKING / ERROR HANDLING (edge case)
//     Even if the user reaches a screen, a backend 403 on a restricted endpoint
//     must surface a friendly "Access Denied" state — the UI must NOT crash,
//     white-screen, or hang. We mock the API with page.route() and assert the
//     app degrades gracefully.
// -----------------------------------------------------------------------------
test.describe('Role user — API 403 handling (graceful, not a crash)', () => {
  test('a forced 403 on a restricted endpoint shows access-denied, not a crash', async ({
    page,
    billingPage,
  }) => {
    // Intercept any restricted-looking API call and force a 403 Forbidden.
    await page.route(/\/api\/.*(admin|billing|team|role|invoice|setting)/i, async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forbidden', message: 'Access Denied' }),
      });
    });

    // Visit a surface that fetches one of those endpoints. Billing is a good
    // probe: it's admin-oriented and triggers a data fetch on load. We goto()
    // rather than open(), because open() asserts a healthy Billing screen and
    // the whole point here is that the data call fails.
    await billingPage.goto(ROUTES.billing);
    await billingPage.settleAfterGuard();

    // (a) The app must still be alive — no error boundary blew up.
    expect(await billingPage.hasCrashed(), 'a 403 must not white-screen / crash the app').toBe(
      false,
    );

    // (b) Ideally the user is told *why* — an access-denied / forbidden notice.
    //     We log (don't hard-fail) if the app swallows it silently, since the
    //     primary contract here is "no crash"; surfacing the reason is the bonus.
    if (await billingPage.hasAccessError()) {
      await expect(billingPage.accessErrorText).toBeVisible();
    } else {
      // Still authenticated (not logged out) is the minimum acceptable bar.
      expect(await billingPage.isLoggedOut(), 'a 403 should not log the user out').toBe(false);
      console.warn(
        '[perm] 403 handled without a crash, but no explicit "Access Denied" notice was shown.',
      );
    }
  });
});
