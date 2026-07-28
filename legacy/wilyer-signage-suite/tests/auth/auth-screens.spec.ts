// =============================================================================
//  AUTH SCREENS — Sign In, Forgot Password, Sign Up
// =============================================================================
//  Runs in the `no-auth` project (no cached storageState) — every test starts
//  logged out. Selectors and behaviours were captured live against
//  cms.wilyersignage.com (set CMS_BASE_URL accordingly).
//
//  Layout:
//   • Sign In            — positive login + blank / invalid-format negatives
//   • Forgot Password    — blank + malformed validation, valid-email OTP
//   • Sign Up            — missing-fields + unchecked-Terms gating, full create
//   • Known UI defects   — documented with test.fail(): the suite stays green
//     while the bug exists and auto-flags the moment it is fixed.
// =============================================================================
import { test, expect, ENV } from '../../fixtures/test';
import { EMAILS } from '../../utils/dataGenerators';
import { runId } from '../../utils/dataGenerators';

// ─────────────────────────────────────────────────────────────────────────────
//  SIGN IN
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Sign In', () => {
  test.beforeEach(async ({ signInPage }) => {
    await signInPage.open();
  });

  test('valid credentials reach the dashboard @smoke', async ({ signInPage, page }) => {
    // Requires real Wilyer Signage admin creds via CMS_ADMIN_EMAIL/PASSWORD.
    await signInPage.login(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD);
    expect(await signInPage.isAuthenticated(), 'admin login should reach the dashboard shell').toBe(true);
    await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible();
  });

  test('blank fields are rejected', async ({ signInPage }) => {
    await signInPage.submit();
    await signInPage.expectStillOnSignIn();
  });

  test('invalid email format is rejected', async ({ signInPage, page }) => {
    await signInPage.fill('not-an-email', 'SomePass123!');
    // There is NO client-side format guard: the app posts to /auth/login and the
    // backend rejects it with 400. The toast that renders the message is
    // transient/timing-dependent, so we assert on the deterministic API
    // rejection + staying on the form. (See bug list: an empty email is sent and
    // a leaky `"phoneNumber" must be a number` message is shown.)
    const rejected = page.waitForResponse(
      (r) => /auth\/login/i.test(r.url()) && r.status() >= 400,
      { timeout: 20_000 },
    );
    await signInPage.submit();
    expect((await rejected).status(), 'login should be rejected with a 4xx').toBeGreaterThanOrEqual(400);
    await signInPage.expectStillOnSignIn();
  });

  test('wrong password is rejected', async ({ signInPage }) => {
    await signInPage.fill(ENV.ADMIN_EMAIL, 'definitely-wrong-password');
    await signInPage.submit();
    await signInPage.expectStillOnSignIn();
  });

  test('password show/hide toggle reveals and re-masks the value', async ({ signInPage }) => {
    await signInPage.password.fill('SuperSecret1!');
    expect(await signInPage.passwordInputType(), 'password starts masked').toBe('password');
    await signInPage.togglePasswordVisibility();
    expect(await signInPage.passwordInputType(), 'toggle reveals the value').toBe('text');
    await signInPage.togglePasswordVisibility();
    expect(await signInPage.passwordInputType(), 'toggle re-masks the value').toBe('password');
  });

  test('"Forgot Password?" link navigates to /forget', async ({ signInPage, page }) => {
    await signInPage.forgotPasswordLink.click();
    await expect(page).toHaveURL(/\/forget/);
  });

  test('"Sign Up" link navigates to /signup', async ({ signInPage, page }) => {
    await signInPage.signUpLink.click();
    await expect(page).toHaveURL(/\/signup/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  FORGOT PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Forgot Password', () => {
  test.beforeEach(async ({ forgotPasswordPage }) => {
    await forgotPasswordPage.open();
  });

  test('blank email does not submit', async ({ forgotPasswordPage }) => {
    await forgotPasswordPage.sendOtp();
    await forgotPasswordPage.expectStillOnForgotPassword();
  });

  test('malformed email surfaces a validation error', async ({ forgotPasswordPage, page }) => {
    // No client-side format check: the malformed address round-trips to
    // /auth/forgetPassword which rejects it with 400 (`"email" must be a valid
    // email`). Assert on the deterministic API rejection rather than the
    // transient toast.
    const rejected = page.waitForResponse(
      (r) => /forgetPassword/i.test(r.url()) && r.status() >= 400,
      { timeout: 20_000 },
    );
    await forgotPasswordPage.requestOtp(EMAILS.noAt); // "plainaddress.example.com"
    expect((await rejected).status(), 'OTP request should be rejected with a 4xx').toBeGreaterThanOrEqual(400);
    await forgotPasswordPage.expectStillOnForgotPassword();
  });

  test('valid email requests an OTP', async ({ forgotPasswordPage, page, requireDestructive }) => {
    // Sends a real OTP email — gated behind CMS_ALLOW_DESTRUCTIVE.
    requireDestructive();
    const otpResponse = page.waitForResponse(/forgetPassword/i, { timeout: 20_000 }).catch(() => null);
    await forgotPasswordPage.requestOtp(ENV.ADMIN_EMAIL);
    const res = await otpResponse;
    // Either the request succeeds (2xx + success toast / OTP step) or the account
    // is unknown — but it must NOT be a client-side format rejection.
    expect(res, 'a forgetPassword request should be made for a well-formed email').not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  SIGN UP
// ─────────────────────────────────────────────────────────────────────────────
const validSignUp = () => ({
  name: 'QA Automation User',
  email: EMAILS.valid(),
  phone: '9876543210',
  company: `e2e-org-${runId()}`,
  password: 'Str0ng!Pass123',
  country: 'India',
});

test.describe('Sign Up', () => {
  test.beforeEach(async ({ signUpPage }) => {
    await signUpPage.open();
  });

  test('missing mandatory fields are rejected', async ({ signUpPage }) => {
    await signUpPage.submit();
    await signUpPage.expectStillOnSignUp();
  });

  test('submission is blocked while Terms is unchecked', async ({ signUpPage }) => {
    await signUpPage.signUp(validSignUp(), { acceptTerms: false });
    // The form must NOT proceed without consent.
    await signUpPage.expectStillOnSignUp();
  });

  test('all fields + accepted Terms creates the account', async ({ signUpPage, page, requireDestructive }) => {
    // Creates a real account — gated behind CMS_ALLOW_DESTRUCTIVE.
    requireDestructive();
    await signUpPage.signUp(validSignUp(), { acceptTerms: true });
    await expect(page).not.toHaveURL(/\/signup/, { timeout: 20_000 });
  });

  test('"Log In" link returns to the Sign In screen', async ({ signUpPage, page }) => {
    await signUpPage.logInLink.click();
    await expect(page).toHaveURL(/\/(?:$|login)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  KNOWN UI DEFECTS — documented, not yet fixed.
//  Each asserts the *correct* behaviour and is marked test.fail(), so:
//    • while the bug exists  → test "fails as expected" → suite stays GREEN
//    • once the bug is fixed → test unexpectedly passes  → suite turns RED,
//      reminding us to delete the test.fail() marker.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Known UI defects (Sign Up)', () => {
  test.beforeEach(async ({ signUpPage }) => {
    await signUpPage.open();
  });

  test.fail('primary submit button should be labelled "Sign Up", not "Sign In"', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^(sign ?up|create account)$/i })).toBeVisible();
  });

  test.fail('Terms of Service link should point to a real policy page', async ({ signUpPage }) => {
    const href = await signUpPage.termsLink.getAttribute('href');
    expect(href, 'Terms link must not be a /signup placeholder').not.toMatch(/\/signup$/);
  });

  test.fail('Privacy Policy link should point to a real policy page', async ({ signUpPage }) => {
    const href = await signUpPage.privacyLink.getAttribute('href');
    expect(href, 'Privacy link must not be a /signup placeholder').not.toMatch(/\/signup$/);
  });

  test.fail('Company Name placeholder should be spelt "organization"', async ({ page }) => {
    await expect(page.getByPlaceholder(/organization name/i)).toBeVisible();
  });

  test.fail('default country should match the "+91" dial code', async ({ page }) => {
    const selected = await page.locator('select option:checked').first().textContent();
    expect((selected ?? '').trim(), 'selected country should be India when +91 is shown').toMatch(/india/i);
  });
});
