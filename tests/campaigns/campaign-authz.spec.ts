// =============================================================================
//  Campaigns V1 — API authorization at the token layer.
//
//  SCOPE NOTE — why this file is not the full RBAC matrix.
//  On cms2 (build v3.5.x, verified 2026-07-28) campaigns have NO role-based
//  permissions. Every role editor was opened with all accordions and all "+N"
//  chips expanded: the word "campaign" does not appear anywhere in the
//  permission model. The only campaign gate is the ACCOUNT-level JWT claim
//  `isCampaignEnabled`. There is therefore nothing to toggle for a
//  View/Create/Update/Delete matrix, and the per-permission cases in Doc 08
//  §19.5 cannot be executed until that permission set ships.
//
//  What IS enforceable today is token-layer authorization, covered here:
//  missing credentials, malformed credentials, and tampered credentials.
//  Cross-user and cross-tenant checks (IDOR, privilege escalation, permission
//  revoked mid-session) need a SECOND working account and remain blocked.
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';
import { ENV } from '../../config/env';
import { uniqueName } from '../../test-data/campaigns.data';

const LIST = `${ENV.API_BASE_URL}/campaign/read?limit=5&page=1&sort=createdAt&order=-1&search=&folderId=`;

/** Re-encode a JWT's payload, leaving the original signature in place. */
function tamperPayload(token: string, mutate: (claims: Record<string, unknown>) => void): string {
  const [header, payload, signature] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  mutate(claims);
  const forged = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${forged}.${signature}`;
}

test.describe('Campaigns · API authorization @api @security', () => {
  test('SEC-001 · an unauthenticated request is rejected @critical', async ({ request }) => {
    const res = await request.get(LIST);
    expect(
      res.status(),
      'campaign data must never be readable without credentials',
    ).toBeGreaterThanOrEqual(401);
    expect(res.status()).toBeLessThan(500);
  });

  test('SEC-002 · a malformed bearer token is rejected @critical', async ({ request }) => {
    const res = await request.get(LIST, { headers: { Authorization: 'Bearer not-a-jwt' } });
    expect(res.status()).toBeGreaterThanOrEqual(401);
    expect(res.status()).toBeLessThan(500);
  });

  test('SEC-003 · a JWT with a tampered userId is rejected @critical', async ({
    request,
    context,
  }) => {
    const cookie = (await context.cookies()).find((c) => c.name === 'footprint');
    const forged = tamperPayload(decodeURIComponent(cookie!.value), (claims) => {
      claims.userId = '000000000000000000000001';
      claims.id = '000000000000000000000001';
    });

    const res = await request.get(LIST, { headers: { Authorization: `Bearer ${forged}` } });
    expect(
      res.status(),
      'the signature must be verified — a re-encoded payload is a forged identity',
    ).toBeGreaterThanOrEqual(401);
  });

  test('SEC-004 · a JWT with the feature flag flipped on is rejected @p1', async ({
    request,
    context,
  }) => {
    // Campaigns are gated by `isCampaignEnabled`. If that claim is trusted without
    // signature verification, any account could switch the feature on for itself.
    const cookie = (await context.cookies()).find((c) => c.name === 'footprint');
    const forged = tamperPayload(decodeURIComponent(cookie!.value), (claims) => {
      claims.isCampaignEnabled = true;
      claims.exp = Math.floor(Date.now() / 1000) + 86_400 * 365;
    });

    const res = await request.get(LIST, { headers: { Authorization: `Bearer ${forged}` } });
    expect(res.status(), 'a self-granted feature flag must not be honoured').toBeGreaterThanOrEqual(401);
  });

  test('SEC-005 · writes are rejected without credentials @critical', async ({ request }) => {
    const create = await request.post(`${ENV.API_BASE_URL}/campaign/create`, {
      data: { name: uniqueName('Unauth', 'x'), data: [], defaultDuration: 10 },
    });
    expect(create.status(), 'an anonymous caller must not be able to create').toBeGreaterThanOrEqual(401);

    const del = await request.delete(`${ENV.API_BASE_URL}/campaign/delete/000000000000000000000000`);
    expect(del.status(), 'an anonymous caller must not be able to delete').toBeGreaterThanOrEqual(401);
  });
});
