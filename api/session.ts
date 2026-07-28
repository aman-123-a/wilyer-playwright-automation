// =============================================================================
//  Session token extraction.
//
//  The CMS stores its JWT in the `footprint` cookie and sends it as
//  `Authorization: Bearer <jwt>`. There is no token in localStorage.
//  Verified live against cms2.pocsample.in, 2026-07-28.
//
//  Kept in one place so that if the product ever moves the token, exactly one
//  file changes rather than every API service.
// =============================================================================

import type { BrowserContext } from '@playwright/test';

/** Cookie the CMS stores its session JWT in. */
export const SESSION_COOKIE = 'footprint';

/**
 * Read the session JWT from an authenticated browser context.
 * Throws with an actionable message rather than returning an empty token —
 * an empty Bearer header produces a 401 that reads like a product bug.
 */
export async function tokenFromContext(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((c) => c.name === SESSION_COOKIE);
  if (!cookie) {
    throw new Error(
      `No \`${SESSION_COOKIE}\` cookie — this browser context is not authenticated. ` +
        `Check that the \`setup\` project ran and the storage state for this ` +
        `environment is fresh (storage/<env>/admin.json).`,
    );
  }
  return decodeURIComponent(cookie.value);
}

/** Decoded JWT payload, for expiry and claim assertions in the security suites. */
export interface JwtPayload {
  exp?: number;
  iat?: number;
  [claim: string]: unknown;
}

/**
 * Decode a JWT payload WITHOUT verifying its signature.
 *
 * For inspection only — asserting claims, checking expiry. Never use this to
 * decide whether a token is trustworthy; that is the server's job, and the
 * point of the security suites is to confirm the server actually does it.
 */
export function decodeJwt(token: string): JwtPayload {
  const [, payload] = token.split('.');
  if (!payload) throw new Error('Not a JWT: expected three dot-separated segments.');
  const normalised = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as JwtPayload;
}

/** True when the token's `exp` claim is in the past. */
export function isExpired(token: string, now: Date = new Date()): boolean {
  const { exp } = decodeJwt(token);
  return exp !== undefined && exp * 1000 <= now.getTime();
}
