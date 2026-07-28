// =============================================================================
//  Reusable permission helper.
//
//  Gives every RBAC suite one vocabulary for the four ways the CMS fences a
//  user, so specs describe intent and this file owns the mechanics:
//
//    1. Navigation fencing  — the sidebar link is absent.
//    2. Route guarding      — a direct goto() is refused, not silently rendered.
//    3. Control fencing     — the action control is hidden OR disabled.
//    4. Server enforcement  — the API itself rejects the call.
//
//  (4) is the one that matters. A hidden button is a UX affordance, not a
//  security control: a suite that only checks the UI passes against a product
//  that leaves the endpoint wide open. Every `expectDenied` therefore asserts
//  the server, and treats UI fencing as an additional signal.
// =============================================================================

import { expect, type APIResponse, type Locator, type Page } from '@playwright/test';

/** Statuses that count as a correct refusal. */
const DENIED_STATUSES = new Set([401, 403, 404]);

/** Text the CMS renders on an access-denied screen. */
const DENIED_TEXT = /access denied|not authorised|not authorized|forbidden|no permission|unauthorized/i;

export interface RouteGuardResult {
  /** Where the browser ended up after attempting the route. */
  finalUrl: string;
  /** True when the app refused: redirect away, or an explicit denial screen. */
  refused: boolean;
  /** Which signal proved it, for readable failure messages. */
  signal: 'redirected' | 'denial-screen' | 'rendered';
}

/**
 * Attempt a direct navigation and report whether the app refused it.
 *
 * Does not assert — callers decide, because "may not reach /team" and "may
 * reach /team" are both legitimate expectations depending on the role.
 */
export async function probeRoute(page: Page, route: string): Promise<RouteGuardResult> {
  await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);

  const finalUrl = page.url();
  const landedElsewhere = !finalUrl.includes(route.replace(/^\//, ''));

  const deniedVisible = await page
    .getByText(DENIED_TEXT)
    .first()
    .isVisible({ timeout: 3_000 })
    .catch(() => false);

  if (deniedVisible) return { finalUrl, refused: true, signal: 'denial-screen' };
  if (landedElsewhere) return { finalUrl, refused: true, signal: 'redirected' };
  return { finalUrl, refused: false, signal: 'rendered' };
}

/** Assert a role cannot reach a route by typing its URL. */
export async function expectRouteBlocked(page: Page, route: string): Promise<void> {
  const result = await probeRoute(page, route);
  expect(
    result.refused,
    `route ${route} should be blocked, but it rendered (landed on ${result.finalUrl})`,
  ).toBe(true);
}

/** Assert a role can reach a route. */
export async function expectRouteAllowed(page: Page, route: string): Promise<void> {
  const result = await probeRoute(page, route);
  expect(
    result.refused,
    `route ${route} should be reachable, but the app refused it (${result.signal}, ${result.finalUrl})`,
  ).toBe(false);
}

/** Assert a sidebar nav entry is not offered to this role. */
export async function expectNavHidden(page: Page, name: RegExp): Promise<void> {
  await expect(
    page.getByRole('link', { name }),
    `sidebar should not offer "${name}" to this role`,
  ).toHaveCount(0);
}

/** Assert a nav entry is offered. */
export async function expectNavVisible(page: Page, name: RegExp): Promise<void> {
  await expect(
    page.getByRole('link', { name }).first(),
    `sidebar should offer "${name}" to this role`,
  ).toBeVisible();
}

/**
 * Assert an action control is fenced — absent, or present but disabled.
 *
 * Both are legitimate product choices, and which one a screen uses varies, so
 * pinning the suite to one of them makes it brittle without adding rigour.
 */
export async function expectControlFenced(control: Locator, label: string): Promise<void> {
  const count = await control.count();
  if (count === 0) return; // hidden — fenced

  const enabled = await control.first().isEnabled().catch(() => false);
  expect(enabled, `"${label}" is visible and enabled, so this role can invoke it`).toBe(false);
}

/** Assert an action control is offered and usable. */
export async function expectControlAvailable(control: Locator, label: string): Promise<void> {
  await expect(control.first(), `"${label}" should be available to this role`).toBeVisible();
  await expect(control.first(), `"${label}" should be enabled for this role`).toBeEnabled();
}

/**
 * Assert the SERVER refused the call — the only check that proves an
 * authorisation boundary rather than a UI affordance.
 */
export function expectApiDenied(response: APIResponse, what: string): void {
  const status = response.status();
  expect(
    DENIED_STATUSES.has(status),
    `${what}: expected the server to refuse (401/403/404) but it answered ${status}. ` +
      `Hiding the control in the UI is not an authorisation boundary.`,
  ).toBe(true);
}

/** Assert the server accepted the call. */
export function expectApiAllowed(response: APIResponse, what: string): void {
  expect(
    response.ok(),
    `${what}: expected the server to allow this role, but it answered ${response.status()}`,
  ).toBe(true);
}

/**
 * Full denial check for one action: the server must refuse, and — when a
 * control was supplied — the UI should fence it too. Reports both signals so a
 * failure says which layer is wrong.
 */
export async function expectDenied(options: {
  what: string;
  response: APIResponse;
  control?: Locator;
}): Promise<void> {
  expectApiDenied(options.response, options.what);
  if (options.control) {
    await expectControlFenced(options.control, options.what);
  }
}
