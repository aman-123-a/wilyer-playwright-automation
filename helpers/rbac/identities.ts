// =============================================================================
//  Identity helper for RBAC suites.
//
//  An RBAC suite is only meaningful if each request is made as a KNOWN identity.
//  The cached admin storageState is the wrong tool for that: a suite that
//  forgets to clear it silently runs every "sub-user" assertion as the admin and
//  passes for the wrong reason. So these suites log in explicitly, per identity,
//  and carry the bearer token around.
//
//  Login goes through the UI because the login API is reCAPTCHA-gated;
//  LoginPage.freshLogin() owns the clear-session-then-authenticate sequence and
//  api/session.ts owns where the token lives, so this helper stays thin.
// =============================================================================

import type { Page } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { tokenFromContext, decodeJwt } from '../../api/session';

export interface Identity {
  /** Raw JWT, for Authorization headers. */
  token: string;
  /** Decoded claims — where `access`, `isRestrictedAccess` and role live. */
  claims: Record<string, unknown>;
}

export interface LoginOutcome {
  identity: Identity | null;
  /** Why login failed, taken from the server's own response where possible. */
  reason: string;
}

/**
 * Log in as `creds` and lift the session token.
 *
 * Never throws: a suite that cannot authenticate an identity should SKIP with
 * the server's reason, not fail as though the application were broken. The
 * caller decides which it is.
 */
export async function loginAs(
  page: Page,
  creds: { email: string; password: string },
): Promise<LoginOutcome> {
  const failures: string[] = [];
  page.on('response', async (r) => {
    if (/\/auth\/login/.test(r.url()) && !r.ok()) {
      failures.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 120)}`);
    }
  });

  await new LoginPage(page).freshLogin(creds).catch(() => false);

  try {
    const token = await tokenFromContext(page.context());
    return { identity: { token, claims: decodeJwt(token) as Record<string, unknown> }, reason: '' };
  } catch {
    return { identity: null, reason: failures[0] ?? 'no session cookie after login' };
  }
}

/** Authorization headers for an identity. */
export function authHeaders(identity: Identity): Record<string, string> {
  return { Authorization: `Bearer ${identity.token}`, 'Content-Type': 'application/json' };
}
