// =============================================================================
//  Campaigns V1 — what a SUB-USER can actually do at the API layer.
//
//  Campaign permissions DO exist, contrary to Doc 12's first conclusion. They
//  live in the JWT `access` map, not in the role editor UI:
//
//      access.campaigns = { view, create, update, delete }
//
//  Doc 12 inspected the role editor, found no mention of "campaign", and
//  concluded there was no campaign RBAC. That was wrong — the editor simply does
//  not surface this permission set. Only a real sub-user token reveals it, which
//  is why this suite logs in as one instead of reasoning from the admin's token
//  (the admin's `access` is `{}` because an unrestricted admin needs no map).
//
//  A second, orthogonal gate also applies: `isRestrictedAccess` plus folder
//  scope. The two combine, so all four permissions can be true while the
//  effective answer is still "no campaigns" — see SUB-002/003.
//
//  It runs unauthenticated by default and logs in as the sub-user itself, so it
//  never inherits the cached admin session — a stale admin token would make
//  every assertion here pass for the wrong reason.
//
//  If the sub-user cannot authenticate on the selected environment the whole
//  block skips with the server's own reason, rather than failing as though the
//  application were broken.
// =============================================================================

import { test, expect, type Page } from '@playwright/test';
import { LoginPage } from '../../../../pages/LoginPage';
import { tokenFromContext, decodeJwt } from '../../../../api/session';
import { ENV } from '../../../../config/env';

interface Session {
  token: string;
  claims: Record<string, unknown>;
}

/**
 * Log in through the UI (the login API is reCAPTCHA-gated) and lift the JWT.
 * LoginPage.freshLogin() owns the clear-session-then-authenticate sequence, and
 * api/session.ts owns where the token lives and how it is decoded — so if the
 * product moves either, this suite does not change.
 */
async function loginAs(
  page: Page,
  creds: { email: string; password: string },
): Promise<{ session: Session | null; reason: string }> {
  const failures: string[] = [];
  page.on('response', async (r) => {
    if (/\/auth\/login/.test(r.url()) && !r.ok()) {
      failures.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 120)}`);
    }
  });

  await new LoginPage(page).freshLogin(creds).catch(() => false);

  try {
    const token = await tokenFromContext(page.context());
    return { session: { token, claims: decodeJwt(token) }, reason: '' };
  } catch {
    return { session: null, reason: failures[0] ?? 'no session cookie after login' };
  }
}

const listUrl = (): string =>
  `${ENV.API_BASE_URL}/campaign/read?limit=50&page=1&sort=createdAt&order=-1&search=&folderId=`;

function authHeaders(session: Session): Record<string, string> {
  return { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };
}

test.describe('Campaigns · sub-user API access @api @rbac @security', () => {
  // Never inherit the admin storageState — this suite is about a different identity.
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: 'serial' });

  let session: Session | null = null;
  let adminSession: Session | null = null;
  let skipReason = '';

  /**
   * Admin bearer token, used only to establish the comparison baseline and to
   * seed/clean the IDOR target. Obtained by logging in here rather than reading
   * a cached storageState, so the suite is self-contained and works with
   * --no-deps.
   */
  async function adminBearer(): Promise<string> {
    test.skip(adminSession === null, 'admin login failed, so no baseline to compare against');
    return adminSession!.token;
  }

  test.beforeAll(async ({ browser }) => {
    for (const [label, creds] of [
      ['SUB-USER', ENV.SUBUSER],
      ['ADMIN', ENV.ADMIN],
    ] as const) {
      const page = await browser.newPage();
      try {
        const result = await loginAs(page, creds);
        if (label === 'SUB-USER') {
          session = result.session;
          skipReason = result.reason;
        } else {
          adminSession = result.session;
        }
        // eslint-disable-next-line no-console
        console.log(
          `${label} LOGIN [${ENV.NAME}] ${creds.email}: ` +
            (result.session ? 'OK' : `FAILED — ${result.reason}`),
        );
      } finally {
        await page.close();
      }
    }
  });

  test.beforeEach(() => {
    test.skip(
      session === null,
      `Sub-user ${ENV.SUBUSER.email} cannot authenticate on ${ENV.NAME}: ${skipReason}`,
    );
  });

  test('SUB-001 · the sub-user session reports its identity and campaign flag', async ({}, testInfo) => {
    const claims = session!.claims;
    const summary = {
      email: claims.email,
      role: claims.role,
      userId: claims.userId,
      partner: claims.partner,
      isRestrictedAccess: claims.isRestrictedAccess,
      isCampaignEnabled: claims.isCampaignEnabled,
      // The full access map, not just its keys: this is where the campaign
      // permission actually lives, and its shape drives every case below.
      access: claims.access,
    };
    // eslint-disable-next-line no-console
    console.log('SUB-USER CLAIMS:', JSON.stringify(summary, null, 2));
    await testInfo.attach('subuser-claims', {
      body: JSON.stringify(summary, null, 2),
      contentType: 'application/json',
    });

    expect(claims.email, 'the token must belong to the sub-user, not the admin').toBe(
      ENV.SUBUSER.email,
    );
  });

  test('SUB-002 · can the sub-user READ campaigns? @critical', async ({ request }) => {
    const res = await request.get(listUrl(), { headers: authHeaders(session!) });
    const body = (await res.text()).slice(0, 200);
    // eslint-disable-next-line no-console
    console.log(`SUB READ  → ${res.status()} ${body}`);

    // Either outcome is a legitimate finding; what matters is that it is recorded
    // and that a denial is a clean 401/403 rather than a 500.
    expect(res.status(), `unexpected server error: ${body}`).toBeLessThan(500);
  });

  test('SUB-003 · can the sub-user CREATE a campaign? @critical @destructive', async ({
    request,
  }) => {
    const name = `SUBUSER_PROBE_${Date.now()}`;
    const res = await request.post(`${ENV.API_BASE_URL}/campaign/create`, {
      headers: authHeaders(session!),
      // Intentionally item-less: if creation is denied we never reach validation,
      // and if it is allowed this is the least invasive record to make.
      data: { name, data: [], defaultDuration: 10 },
    });
    const body = (await res.text()).slice(0, 200);
    // eslint-disable-next-line no-console
    console.log(`SUB CREATE → ${res.status()} ${body}`);

    // Clean up anything that did get created, using the sub-user's own session.
    if (res.ok()) {
      const list = await request.get(listUrl(), { headers: authHeaders(session!) });
      if (list.ok()) {
        const made = ((await list.json()).docs ?? []).find(
          (d: { name: string }) => d.name === name,
        );
        if (made) {
          await request.delete(`${ENV.API_BASE_URL}/campaign/delete/${made.id}`, {
            headers: authHeaders(session!),
          });
        }
      }
    }

    expect(res.status(), `unexpected server error: ${body}`).toBeLessThan(500);
  });

  test('SUB-004 · can the sub-user DELETE a campaign it does not own? @critical @security', async ({
    request,
  }) => {
    // IDOR probe. Target a campaign id the sub-user did not create — read the
    // list first, and if the sub-user can see other people's campaigns, attempt
    // a delete against a NON-EXISTENT id rather than destroying real data.
    // A 401/403 proves authorization runs BEFORE the lookup; a 400/404
    // "not found" proves the lookup runs first, which leaks existence.
    const res = await request.delete(
      `${ENV.API_BASE_URL}/campaign/delete/000000000000000000000000`,
      { headers: authHeaders(session!) },
    );
    const body = (await res.text()).slice(0, 200);
    // eslint-disable-next-line no-console
    console.log(`SUB DELETE(foreign id) → ${res.status()} ${body}`);

    expect(res.status(), `unexpected server error: ${body}`).toBeLessThan(500);
  });

  test('SUB-005 · the sub-user list is scoped, not the full account @critical @security', async ({
    request,
  }) => {
    const subRes = await request.get(listUrl(), { headers: authHeaders(session!) });
    expect(subRes.status()).toBe(200);
    const subDocs: Array<{ id: string; name: string }> = (await subRes.json()).docs ?? [];

    // Compare against what the ADMIN sees, using the cached admin session. The
    // gap between the two lists is the fence.
    const adminToken = await adminBearer();
    const adminRes = await request.get(listUrl(), {
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    });
    const adminTotal = adminRes.ok() ? (await adminRes.json()).totalDocs : -1;

    // eslint-disable-next-line no-console
    console.log(`SUB sees ${subDocs.length} campaigns; ADMIN sees ${adminTotal}`);

    if (session!.claims.isRestrictedAccess === true) {
      expect(
        subDocs.length,
        'a restricted sub-user must receive fewer campaigns than the admin',
      ).toBeLessThan(adminTotal);
    }
  });

  test('SUB-008 · BUG-CMP-16 · the admin list must not omit campaigns a sub-user can see @critical', async ({
    request,
  }) => {
    test.fail(
      true,
      'BUG-CMP-16: an empty `folderId` means "root only" for the admin but "all folders" for a ' +
        'sub-user, so the admin list hides foldered campaigns it is otherwise authorised to read',
    );

    const adminToken = await adminBearer();
    const adminRes = await request.get(listUrl(), {
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    });
    const subRes = await request.get(listUrl(), { headers: authHeaders(session!) });
    test.skip(!adminRes.ok() || !subRes.ok(), 'both identities must be able to list');

    const adminIds = new Set(
      ((await adminRes.json()).docs as Array<{ id: string }>).map((d) => d.id),
    );
    const subDocs = (await subRes.json()).docs as Array<{ id: string; name: string }>;
    // A sub-user that sees nothing cannot reveal what the admin is missing —
    // the comparison only discriminates when the sub-user has folder visibility.
    test.skip(
      subDocs.length === 0,
      `${ENV.SUBUSER.email} sees no campaigns, so it cannot expose an admin visibility gap`,
    );
    const hiddenFromAdmin = subDocs.filter((d) => !adminIds.has(d.id));

    // eslint-disable-next-line no-console
    console.log(
      `Campaigns visible to ${ENV.SUBUSER.email} but NOT to the admin: ${hiddenFromAdmin.length}`,
      hiddenFromAdmin.slice(0, 10).map((d) => d.name),
    );

    expect(
      hiddenFromAdmin,
      'the account admin must not be missing campaigns from their own account list',
    ).toHaveLength(0);
  });

  test('SUB-006 · IDOR — a campaign the sub-user cannot list must not be readable by id @critical @security', async ({
    request,
  }) => {
    // The real test of a scoped list: the list hides other campaigns, but does a
    // DIRECT read by id still return one? That is the classic IDOR, and a list
    // filter alone does not prevent it.
    const adminToken = await adminBearer();
    const adminRes = await request.get(listUrl(), {
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    });
    test.skip(!adminRes.ok(), 'cannot enumerate a target campaign as admin');

    const adminDocs: Array<{ id: string; name: string }> = (await adminRes.json()).docs ?? [];
    const subRes = await request.get(listUrl(), { headers: authHeaders(session!) });
    const subIds = new Set(
      ((subRes.ok() ? (await subRes.json()).docs : []) as Array<{ id: string }>).map((d) => d.id),
    );

    const target = adminDocs.find((d) => !subIds.has(d.id));
    test.skip(!target, 'no campaign exists that the sub-user cannot already see');

    const read = await request.get(`${ENV.API_BASE_URL}/campaign/read/${target!.id}`, {
      headers: authHeaders(session!),
    });
    const body = (await read.text()).slice(0, 200);
    // eslint-disable-next-line no-console
    console.log(`SUB READ-BY-ID "${target!.name}" → ${read.status()} ${body}`);

    // Same conditional logic as SUB-007: only a RESTRICTED account is expected
    // to be refused. An unrestricted sub-user normally has nothing it cannot see,
    // so this case usually skips above for lack of a target.
    if (session!.claims.isRestrictedAccess === true) {
      expect(
        read.ok(),
        `IDOR: a restricted sub-user cannot see "${target!.name}" in its list but read it directly by id`,
      ).toBe(false);
    } else {
      expect(read.status(), 'unrestricted account: the call must not error').toBeLessThan(500);
    }
  });

  test('SUB-007 · IDOR — a foreign campaign must not be deletable by id @critical @security @destructive', async ({
    request,
  }) => {
    const adminToken = await adminBearer();
    const adminRes = await request.get(listUrl(), {
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    });
    test.skip(!adminRes.ok(), 'cannot enumerate a target campaign as admin');

    // Create a throwaway campaign AS ADMIN, so a successful delete destroys only
    // this suite's own data and never a colleague's campaign.
    const name = `SUBUSER_IDOR_TARGET_${Date.now()}`;
    const media = ((await adminRes.json()).docs ?? [])
      .flatMap((d: { data?: Array<{ file?: { id?: string } }> }) => d.data ?? [])
      .map((i: { file?: { id?: string } }) => i.file?.id)
      .filter(Boolean)[0];
    test.skip(!media, 'no media available to build a target campaign');

    const adminHeaders = {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    };
    const made = await request.post(`${ENV.API_BASE_URL}/campaign/create`, {
      headers: adminHeaders,
      data: { name, data: [{ file: media, duration: 10 }], defaultDuration: 10, folderId: null },
    });
    test.skip(!made.ok(), 'could not seed an IDOR target as admin');

    const listAgain = await request.get(listUrl(), { headers: adminHeaders });
    const target = ((await listAgain.json()).docs ?? []).find(
      (d: { name: string }) => d.name === name,
    );
    test.skip(!target, 'seeded target not found');

    try {
      const del = await request.delete(`${ENV.API_BASE_URL}/campaign/delete/${target.id}`, {
        headers: authHeaders(session!),
      });
      const body = (await del.text()).slice(0, 200);
      // eslint-disable-next-line no-console
      console.log(`SUB DELETE(admin-owned "${name}") → ${del.status()} ${body}`);

      // What counts as correct depends on the account. A RESTRICTED sub-user
      // deleting the admin's campaign is IDOR. An UNRESTRICTED one doing the
      // same is the documented behaviour — it holds account-wide rights — and
      // asserting otherwise would report a false security finding.
      if (session!.claims.isRestrictedAccess === true) {
        expect(
          del.ok(),
          'IDOR: a restricted sub-user deleted a campaign belonging to the admin',
        ).toBe(false);
      } else {
        expect(
          del.status(),
          'an unrestricted sub-user is account-wide by design; the call must still be a clean 2xx/4xx',
        ).toBeLessThan(500);
      }
    } finally {
      await request
        .delete(`${ENV.API_BASE_URL}/campaign/delete/${target.id}`, { headers: adminHeaders })
        .catch(() => undefined);
    }
  });
});
