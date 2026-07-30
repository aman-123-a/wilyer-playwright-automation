// =============================================================================
//  Campaigns · ROLE PERMISSION matrix — enable / disable each campaign
//  permission in Team → Roles, then check what the sub-user can actually do.
//
//  Target: cms2.pocsample.in. Identities come from .env (never hardcoded):
//    CMS_ADMIN_EMAIL        — account owner, grants and revokes
//    CMS_SUBUSER_EMAIL      — sub-user WITH a folder fence (isRestrictedAccess)
//    CMS_UNRESTRICTED_EMAIL — sub-user WITHOUT one (account-wide)
//
//  ── Two independent controls, tested apart ─────────────────────────────────
//  The CMS fences a sub-user twice over, and confusing the two is the classic
//  way an RBAC suite passes for the wrong reason:
//
//    1. ROLE PERMISSION — what the role may DO   (campaigns.view/create/…)
//       Revoked → 403 "You are not authorized to perform this action."
//    2. FOLDER FENCE    — where it may do it     (isRestrictedAccess)
//       Out of scope → 403 "Access denied to this folder." / campaign-specific.
//
//  Every case here holds the folder fence constant and moves ONE permission, so
//  a denial can only be attributed to the permission. The reverse experiment —
//  all permissions granted, folder wrong — lives in subuser-folder-campaigns.
//
//  ── Method ─────────────────────────────────────────────────────────────────
//  The role is a SHARED record: real accounts are assigned to it. This suite
//  snapshots it before the first write, restores it in afterAll, and asserts the
//  restore landed. `patchModule` always rewrites the full permission object
//  because PUT /role/update REPLACES it — see helpers/rbac/rolePermissions.
//
//  A revoked permission only reaches the sub-user on its NEXT login: `access`
//  is a JWT claim. Every case therefore re-authenticates after a toggle, and
//  PERM-009 pins down what happens when it does not.
//
//  `upload` is deliberately absent: campaigns expose exactly four permissions
//  (view/create/update/delete). Upload belongs to the `media` module, and
//  PERM-023 checks that a campaigns-only change does not leak into it.
//
//  ── What the server actually does, mapped live on 2026-07-29 ───────────────
//    campaigns.create  revoked → 403 "You are not authorized to perform this
//                                action." and nothing is written        ✓
//    campaigns.view    revoked → 403 on both the list and read-by-id    ✓
//    campaigns.delete  revoked → 403, the campaign survives             ✓
//    campaigns.update  revoked → 200, THE RENAME PERSISTS               ✗ BUG-PERM-02
//         /campaign/update admits the caller when campaigns.create OR
//         campaigns.update is held, and refuses only when BOTH are off — mapped
//         by flipping one verb at a time:
//              create ✓ update ✓ → 200      create ✓ update ✗ → 200  ← wrong
//              create ✗ update ✓ → 200      create ✗ update ✗ → 403
//         So `update` cannot be withdrawn from any role that may create, and
//         "may add, may not edit" is not expressible.
//    any permission revoked, existing session → still allowed until the
//    token is re-minted (24 h)                                          ✗ BUG-PERM-01
//    sub-user edits the role assigned to ITSELF → 200; it grants itself
//    the revoked permission and clears its own isRestrictedAccess       ✗ BUG-PERM-03
//
//  Both defects reproduce identically for the fenced and the unfenced sub-user,
//  so they are permission-layer faults, not folder-fence ones. They are asserted
//  AS OBSERVED — the convention in this repo — so the suite stays green and the
//  defect stays under test rather than being silently tolerated.
// =============================================================================

import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ENV, type Credentials } from '../../../../config/env';
import { loginAs, authHeaders, type Identity } from '../../../../helpers/rbac/identities';
import {
  findMember,
  readRole,
  readModule,
  patchModule,
  restoreRole,
  allCampaignVerbs,
  type RoleSnapshot,
} from '../../../../helpers/rbac/rolePermissions';

const PREFIX = 'QA_PERM_';
const NOT_AUTHORIZED = /not authorized to perform this action/i;

const uniqueName = (label: string): string =>
  `${PREFIX}${label}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const api = (p: string): string => `${ENV.API_BASE_URL}${p}`;

const listUrl = (folderId = ''): string =>
  api(`/campaign/read?limit=100&page=1&sort=createdAt&order=-1&search=&folderId=${folderId}`);

/** One account under test, plus everything needed to exercise it. */
interface Subject {
  key: 'restricted' | 'unrestricted';
  label: string;
  creds: Credentials;
  /** Where this identity is allowed to file campaigns: its folder, or the root. */
  folderId: string;
  /** A media id it may legitimately reference, when it has one. */
  fileId: string;
  role: RoleSnapshot;
}

test.describe('Campaigns · role permission matrix @rbac @security', () => {
  // Identity is the whole point of this suite — never inherit the admin session.
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: 'serial' });

  let admin: Identity | null = null;
  const subjects: Partial<Record<Subject['key'], Subject>> = {};
  let setupError = '';

  /** Log in and return the identity, or null. Each call yields a FRESH token. */
  async function authenticate(
    browser: import('@playwright/test').Browser,
    creds: Credentials,
  ): Promise<Identity | null> {
    const page = await browser.newPage();
    const outcome = await loginAs(page, creds);
    await page.close();
    return outcome.identity;
  }

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(300_000);

    admin = await authenticate(browser, ENV.ADMIN);
    if (!admin) {
      setupError = 'the admin could not authenticate';
      return;
    }

    const wanted: Array<[Subject['key'], string, Credentials]> = [
      ['restricted', 'folder-fenced sub-user', ENV.SUBUSER],
      ['unrestricted', 'account-wide sub-user', ENV.UNRESTRICTED],
    ];

    for (const [key, label, creds] of wanted) {
      if (!creds.email || !creds.password) {
        setupError = `no credentials configured for the ${label}`;
        return;
      }
      const member = await findMember(request, admin, creds.email);
      if (!member?.roleId) {
        setupError = `${creds.email} is not a team member with an assigned role`;
        return;
      }

      const role = await readRole(request, admin, member.roleId);

      // Where may this identity file a campaign? A fenced sub-user must use an
      // assigned folder; an account-wide one uses the root like the owner does.
      const identity = await authenticate(browser, creds);
      if (!identity) {
        setupError = `${creds.email} could not authenticate`;
        return;
      }

      let folderId = '';
      let fileId = '';
      if (role.isRestrictedAccess) {
        const folders = ((await (
          await request.get(api('/folder/read?page=1&limit=100'), { headers: authHeaders(identity) })
        ).json()).folders ?? []) as Array<{ id: string; name: string }>;
        // Prefer an assigned folder that actually holds media, so the campaign
        // payload can be realistic. An empty folder is still usable — the API
        // accepts an item-less campaign — so this is a preference, not a need.
        for (const f of folders) {
          const docs = ((await (
            await request.get(
              api(`/file/read?limit=5&page=1&search=&type=&sort=createdAt&order=-1&folderId=${f.id}`),
              { headers: authHeaders(identity) },
            )
          ).json()).docs ?? []) as Array<{ id: string }>;
          if (docs.length > 0) {
            folderId = f.id;
            fileId = docs[0].id;
            break;
          }
        }
        if (!folderId) folderId = folders[0]?.id ?? '';
        if (!folderId) {
          setupError = `${creds.email} has no assigned folder to create in`;
          return;
        }
      } else {
        const docs = ((await (
          await request.get(
            api('/file/read?limit=5&page=1&search=&type=&sort=createdAt&order=-1&folderId='),
            { headers: authHeaders(identity) },
          )
        ).json()).docs ?? []) as Array<{ id: string }>;
        fileId = docs[0]?.id ?? '';
      }

      subjects[key] = { key, label, creds, folderId, fileId, role };
    }

    // The role is shared. If this run dies before afterAll, the snapshots on
    // disk are what an operator needs to put the environment back by hand.
    const recovery = path.join('reports', ENV.NAME, 'role-snapshots.json');
    fs.mkdirSync(path.dirname(recovery), { recursive: true });
    fs.writeFileSync(
      recovery,
      JSON.stringify(
        Object.values(subjects).map((s) => ({ subject: s!.key, role: s!.role })),
        null,
        2,
      ),
    );
  });

  test.beforeEach(() => {
    test.skip(Boolean(setupError), `Cannot set up the permission matrix: ${setupError}`);
    test.skip(
      !ENV.ALLOW_DESTRUCTIVE,
      'Edits role permissions and creates campaigns. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
    );
  });

  test.afterAll(async ({ request }) => {
    if (!admin) return;

    // Restore first — an unrestored role breaks the environment for everyone,
    // so it must not be left waiting behind campaign cleanup.
    for (const subject of Object.values(subjects)) {
      if (!subject) continue;
      await restoreRole(request, admin, subject.role).catch(() => undefined);
      const live = await readModule(request, admin, subject.role.id, 'campaigns').catch(() => ({}));
      expect(
        live,
        `the ${subject.label}'s role must be restored to how the suite found it`,
      ).toEqual(subject.role.permissions.campaigns);
      expect(
        Object.keys((await readRole(request, admin, subject.role.id)).permissions).length,
        'every other module must survive: PUT /role/update replaces the whole permission object',
      ).toBe(Object.keys(subject.role.permissions).length);
    }

    // Then remove this suite's campaigns, wherever they were filed.
    const folders = new Set(['', ...Object.values(subjects).map((s) => s!.folderId)]);
    for (const folderId of folders) {
      const r = await request.get(listUrl(folderId), { headers: authHeaders(admin) });
      if (!r.ok()) continue;
      const docs = ((await r.json()).docs ?? []) as Array<{ id: string; name: string }>;
      for (const d of docs.filter((x) => x.name.startsWith(PREFIX))) {
        await request
          .delete(api(`/campaign/delete/${d.id}`), { headers: authHeaders(admin) })
          .catch(() => undefined);
      }
    }
  });

  // ── mechanics ──────────────────────────────────────────────────────────────

  /**
   * Put the subject's campaign permissions into `verbs` and hand back a session
   * that actually carries them.
   *
   * The re-login is not ceremony: `access` is a JWT claim, so a token minted
   * before the change still carries the old permissions (PERM-009).
   */
  async function withPermissions(
    browser: import('@playwright/test').Browser,
    request: APIRequestContext,
    subject: Subject,
    verbs: Record<string, boolean>,
  ): Promise<Identity> {
    const status = await patchModule(request, admin!, subject.role, 'campaigns', verbs);
    expect(status, `the admin must be able to set ${JSON.stringify(verbs)} on the role`).toBe(200);

    const live = await readModule(request, admin!, subject.role.id, 'campaigns');
    expect(live, 'the role must actually hold the permissions the test asked for').toMatchObject(
      verbs,
    );

    const identity = await authenticate(browser, subject.creds);
    expect(identity, `${subject.label} must be able to log in`).toBeTruthy();
    return identity!;
  }

  /** A campaign payload filed where this subject is permitted to file it. */
  function body(subject: Subject, name: string): Record<string, unknown> {
    return {
      name,
      data: subject.fileId ? [{ file: subject.fileId, duration: 10 }] : [],
      defaultDuration: 10,
      ...(subject.folderId ? { folderId: subject.folderId } : {}),
    };
  }

  async function createAs(
    request: APIRequestContext,
    who: Identity,
    subject: Subject,
    name: string,
  ): Promise<{ status: number; message: string; raw: string }> {
    const r = await request.post(api('/campaign/create'), {
      headers: authHeaders(who),
      data: body(subject, name),
    });
    const raw = await r.text();
    let message = '';
    try {
      message = JSON.parse(raw).message ?? '';
    } catch {
      message = raw.slice(0, 120);
    }
    return { status: r.status(), message, raw };
  }

  /** Look a campaign up as the ADMIN — the only reader whose view never changes. */
  async function findAsAdmin(
    request: APIRequestContext,
    subject: Subject,
    name: string,
  ): Promise<{ id: string; name: string } | undefined> {
    const r = await request.get(listUrl(subject.folderId), { headers: authHeaders(admin!) });
    if (!r.ok()) return undefined;
    return ((await r.json()).docs ?? []).find((d: { name: string }) => d.name === name);
  }

  /** Seed a campaign for the subject with the admin's authority, so seeding never
   *  depends on the permission the test is about to revoke. */
  async function seed(
    request: APIRequestContext,
    subject: Subject,
    label: string,
  ): Promise<{ id: string; name: string }> {
    const name = uniqueName(label);
    const r = await request.post(api('/campaign/create'), {
      headers: authHeaders(admin!),
      data: body(subject, name),
    });
    expect(r.status(), `admin seed must succeed: ${(await r.text()).slice(0, 200)}`).toBe(200);
    const doc = await findAsAdmin(request, subject, name);
    expect(doc, 'the seeded campaign must be readable back').toBeTruthy();
    return { id: doc!.id, name };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  The matrix — run identically against both kinds of sub-user
  // ═══════════════════════════════════════════════════════════════════════════

  for (const key of ['restricted', 'unrestricted'] as const) {
    const tag = key === 'restricted' ? 'RES' : 'UNR';
    const subj = (): Subject => {
      const s = subjects[key];
      if (!s) throw new Error(`subject ${key} was not set up`);
      return s;
    };

    test.describe(`${key} sub-user`, () => {
      // ── POSITIVE: the permission granted ────────────────────────────────────

      test(`PERM-${tag}-001 · campaigns.create ENABLED → the sub-user creates @smoke @critical`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        const who = await withPermissions(browser, request, s, allCampaignVerbs(true));

        const name = uniqueName('CreateOn');
        const res = await createAs(request, who, s, name);
        expect(res.status, `create must be allowed when granted: ${res.raw}`).toBe(200);
        expect(
          await findAsAdmin(request, s, name),
          'a granted create must actually persist, not just answer 200',
        ).toBeTruthy();
      });

      test(`PERM-${tag}-002 · campaigns.view ENABLED → the sub-user lists and reads one @smoke`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        const seeded = await seed(request, s, 'ViewOn');
        const who = await withPermissions(browser, request, s, allCampaignVerbs(true));

        const list = await request.get(listUrl(s.folderId), { headers: authHeaders(who) });
        expect(list.status(), 'listing must be allowed when view is granted').toBe(200);

        const one = await request.get(api(`/campaign/read/${seeded.id}`), {
          headers: authHeaders(who),
        });
        expect(one.status(), 'reading one must be allowed when view is granted').toBe(200);
        expect((await one.json()).name).toBe(seeded.name);
      });

      test(`PERM-${tag}-003 · campaigns.update ENABLED → the sub-user renames @critical`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        const seeded = await seed(request, s, 'UpdateOn');
        const who = await withPermissions(browser, request, s, allCampaignVerbs(true));

        const renamed = `${seeded.name}_renamed`;
        const r = await request.post(api(`/campaign/update/${seeded.id}`), {
          headers: authHeaders(who),
          data: { ...body(s, renamed) },
        });
        expect(r.status(), `update must be allowed when granted: ${(await r.text()).slice(0, 200)}`).toBe(
          200,
        );

        const after = await request.get(api(`/campaign/read/${seeded.id}`), {
          headers: authHeaders(admin!),
        });
        expect((await after.json()).name, 'the rename must persist').toBe(renamed);
      });

      test(`PERM-${tag}-004 · campaigns.delete ENABLED → the sub-user deletes @critical @destructive`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        const seeded = await seed(request, s, 'DeleteOn');
        const who = await withPermissions(browser, request, s, allCampaignVerbs(true));

        const r = await request.delete(api(`/campaign/delete/${seeded.id}`), {
          headers: authHeaders(who),
        });
        expect(r.status(), `delete must be allowed when granted: ${(await r.text()).slice(0, 200)}`).toBe(
          200,
        );
        expect(
          await findAsAdmin(request, s, seeded.name),
          'the campaign must be gone, confirmed by the admin rather than by the 200',
        ).toBeUndefined();
      });

      // ── NEGATIVE: the permission revoked ────────────────────────────────────

      test(`PERM-${tag}-010 · campaigns.create DISABLED → create is refused and nothing is written @negative @critical`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        const who = await withPermissions(browser, request, s, {
          ...allCampaignVerbs(true),
          create: false,
        });

        const name = uniqueName('CreateOff');
        const res = await createAs(request, who, s, name);
        expect(res.status, `expected a clean denial, got: ${res.raw}`).toBe(403);
        expect(res.message).toMatch(NOT_AUTHORIZED);
        expect(
          await findAsAdmin(request, s, name),
          'a refused create must leave nothing behind — a denial that still writes is the worst outcome',
        ).toBeUndefined();
      });

      test(`PERM-${tag}-011 · campaigns.view DISABLED → listing and reading one are refused @negative @critical`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        const seeded = await seed(request, s, 'ViewOff');
        const who = await withPermissions(browser, request, s, {
          ...allCampaignVerbs(true),
          view: false,
        });

        const list = await request.get(listUrl(s.folderId), { headers: authHeaders(who) });
        expect(list.status(), 'listing must be refused when view is revoked').toBe(403);
        expect((await list.json()).message).toMatch(NOT_AUTHORIZED);

        const one = await request.get(api(`/campaign/read/${seeded.id}`), {
          headers: authHeaders(who),
        });
        expect(
          one.status(),
          'reading one by id must be refused too — the list filter is not the boundary',
        ).toBe(403);
      });

      test(`PERM-${tag}-012 · campaigns.update DISABLED is NOT enforced — the sub-user still renames @negative @critical @defect`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        const seeded = await seed(request, s, 'UpdateOff');
        const who = await withPermissions(browser, request, s, {
          ...allCampaignVerbs(true),
          update: false,
        });

        // Precondition, so the result cannot be blamed on a stale token: the
        // session this test uses was minted AFTER the revocation and carries it.
        expect(
          ((who.claims as Record<string, any>).access?.campaigns ?? {}).update,
          'the sub-user\'s own token must already say update is revoked',
        ).toBe(false);

        const hijacked = `${seeded.name}_hijacked`;
        const r = await request.post(api(`/campaign/update/${seeded.id}`), {
          headers: authHeaders(who),
          data: { ...body(s, hijacked) },
        });

        // Asserted as observed, per this repo's convention for confirmed defects:
        // the suite stays green and the defect stays visible and re-tested.
        expect(
          r.status(),
          'BUG-PERM-02: /campaign/update admits the caller when campaigns.create OR ' +
            'campaigns.update is held (PERM-014/PERM-015 pin the other corners), so ' +
            'revoking update from a role that may create does not remove edit rights. ' +
            'create, view and delete each enforce their own verb — this endpoint should too.',
        ).toBe(200);

        const after = await request.get(api(`/campaign/read/${seeded.id}`), {
          headers: authHeaders(admin!),
        });
        expect(
          (await after.json()).name,
          'BUG-PERM-02: and the write persists — this is a real edit, not a misleading 200',
        ).toBe(hijacked);
      });

      test(`PERM-${tag}-015 · campaigns.update GRANTED with create revoked → editing still works @regression`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        const seeded = await seed(request, s, 'UpdateOnCreateOff');
        const who = await withPermissions(browser, request, s, {
          ...allCampaignVerbs(true),
          create: false,
        });

        const edited = `${seeded.name}_edited`;
        const r = await request.post(api(`/campaign/update/${seeded.id}`), {
          headers: authHeaders(who),
          data: { ...body(s, edited) },
        });

        // Correct on its own: a role granted update may edit even when it may
        // not create. What makes BUG-PERM-02 is the OTHER half — PERM-012 shows
        // the edit is ALSO allowed when update is revoked and create is granted.
        // Taken together the endpoint admits the caller when EITHER verb is
        // held, so `update` can never be withdrawn from a role that may create.
        expect(r.status(), `a granted update must work: ${(await r.text()).slice(0, 200)}`).toBe(200);

        const after = await request.get(api(`/campaign/read/${seeded.id}`), {
          headers: authHeaders(admin!),
        });
        expect((await after.json()).name, 'the edit must persist').toBe(edited);
      });

      test(`PERM-${tag}-013 · campaigns.delete DISABLED → the campaign survives @negative @critical`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        const seeded = await seed(request, s, 'DeleteOff');
        const who = await withPermissions(browser, request, s, {
          ...allCampaignVerbs(true),
          delete: false,
        });

        const r = await request.delete(api(`/campaign/delete/${seeded.id}`), {
          headers: authHeaders(who),
        });
        expect(r.status(), 'delete must be refused when revoked').toBe(403);
        expect((await r.json()).message).toMatch(NOT_AUTHORIZED);
        expect(
          await findAsAdmin(request, s, seeded.name),
          'the campaign must survive a denied delete',
        ).toBeTruthy();
      });

      test(`PERM-${tag}-014 · EVERY campaign permission disabled → all four verbs are refused @negative @security`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        const seeded = await seed(request, s, 'AllOff');
        const who = await withPermissions(browser, request, s, allCampaignVerbs(false));
        const h = authHeaders(who);

        const attempts: Record<string, number> = {
          list: (await request.get(listUrl(s.folderId), { headers: h })).status(),
          read: (await request.get(api(`/campaign/read/${seeded.id}`), { headers: h })).status(),
          create: (await createAs(request, who, s, uniqueName('AllOff'))).status,
          update: (
            await request.post(api(`/campaign/update/${seeded.id}`), {
              headers: h,
              data: { ...body(s, `${seeded.name}_x`) },
            })
          ).status(),
          delete: (await request.delete(api(`/campaign/delete/${seeded.id}`), { headers: h })).status(),
        };

        for (const [verb, status] of Object.entries(attempts)) {
          // update is refused here too — but only because `create` is also off.
          // PERM-012 and PERM-015 isolate that; see BUG-PERM-02.
          expect(status, `${verb} must be refused when the module is fully revoked`).toBe(403);
        }
        expect(
          await findAsAdmin(request, s, seeded.name),
          'revoking permissions must not destroy data the sub-user already had',
        ).toBeTruthy();
      });

      // ── THE TOGGLE ITSELF ──────────────────────────────────────────────────

      test(`PERM-${tag}-020 · re-ENABLING a revoked permission restores the ability @regression`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(240_000);
        const s = subj();

        // Off …
        const revoked = await withPermissions(browser, request, s, {
          ...allCampaignVerbs(true),
          create: false,
        });
        const blocked = await createAs(request, revoked, s, uniqueName('ToggleOff'));
        expect(blocked.status, 'precondition: revoked means refused').toBe(403);

        // … and on again. A permission system that cannot be un-revoked is as
        // broken as one that cannot revoke.
        const granted = await withPermissions(browser, request, s, allCampaignVerbs(true));
        const name = uniqueName('ToggleOn');
        const allowed = await createAs(request, granted, s, name);
        expect(allowed.status, `re-granting must restore the ability: ${allowed.raw}`).toBe(200);
        expect(await findAsAdmin(request, s, name), 'and the create must persist').toBeTruthy();
      });

      test(`PERM-${tag}-021 · a token minted BEFORE the revocation still creates @security @defect`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(240_000);
        const s = subj();

        // A session established while the permission was still granted.
        const before = await withPermissions(browser, request, s, allCampaignVerbs(true));

        // The administrator revokes create. The sub-user does not log in again.
        expect(
          await patchModule(request, admin!, s.role, 'campaigns', {
            ...allCampaignVerbs(true),
            create: false,
          }),
          'the revocation itself must succeed',
        ).toBe(200);

        const name = uniqueName('Stale');
        const res = await createAs(request, before, s, name);

        expect(
          res.status,
          'BUG-PERM-01: `access` is a JWT claim, so revoking a permission does not reach a ' +
            'session that already exists. The sub-user keeps the revoked ability until its ' +
            'token expires (24 h) or it logs in again. Authorisation must be resolved ' +
            'per-request from the role, or the token invalidated when the role changes.',
        ).toBe(200);
        expect(
          await findAsAdmin(request, s, name),
          'and the write really lands — this is not a cosmetic 200',
        ).toBeTruthy();
      });

      test(`PERM-${tag}-022 · the sub-user rewrites its OWN role and escalates itself @security @critical @defect`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(240_000);
        const s = subj();
        const who = await withPermissions(browser, request, s, {
          ...allCampaignVerbs(true),
          create: false,
        });

        const holdsRoleAdmin =
          (s.role.permissions.roles as Record<string, unknown> | undefined)?.update === true;

        try {
          // The obvious escalation: edit the role that fences you — granting
          // back the revoked permission AND dropping your own folder fence.
          const r = await request.put(api(`/role/update/${s.role.id}`), {
            headers: authHeaders(who),
            data: {
              name: s.role.name,
              description: s.role.description,
              isRestrictedAccess: false,
              reportsTo: s.role.reportsTo,
              permissions: { ...s.role.permissions, campaigns: allCampaignVerbs(true) },
            },
          });

          if (!holdsRoleAdmin) {
            // No role-management rights: this must simply be refused.
            expect(
              [401, 403, 404].includes(r.status()),
              `a sub-user without roles.update edited its own role (server answered ${r.status()})`,
            ).toBe(true);
            expect(
              (await readModule(request, admin!, s.role.id, 'campaigns')).create,
              'the role must not have been escalated',
            ).toBe(false);
            return;
          }

          // This role DOES carry roles.update, so calling the endpoint is
          // legitimate. Editing the role that governs YOURSELF is not: it lets
          // a sub-user lift its own limits, which is the whole point of a limit.
          expect(
            r.status(),
            'BUG-PERM-03: a sub-user holding roles.update may edit the role it is itself ' +
              'assigned to. Role administration must refuse self-assignment edits, or at ' +
              'least refuse to grant a permission the caller does not already hold.',
          ).toBe(200);

          const live = await readRole(request, admin!, s.role.id);
          expect(
            (live.permissions.campaigns as Record<string, unknown>).create,
            'BUG-PERM-03: the sub-user granted itself the permission the owner revoked',
          ).toBe(true);
          expect(
            live.isRestrictedAccess,
            'BUG-PERM-03: and it cleared its own isRestrictedAccess flag — for a fenced ' +
              'sub-user that is a complete escape from the folder fence, not just a ' +
              'permission change',
          ).toBe(false);

          // Prove it is effective, not merely stored: the next token carries it.
          const escalated = await authenticate(browser, s.creds);
          const claims = escalated!.claims as Record<string, any>;
          expect(claims.access?.campaigns?.create, 'the escalation reaches the JWT').toBe(true);
          expect(claims.isRestrictedAccess, 'and the fence is gone from the JWT too').toBe(false);
        } finally {
          // Restore immediately: every later case assumes the fence is intact,
          // and afterAll is too late for them.
          await restoreRole(request, admin!, s.role);
          const back = await readRole(request, admin!, s.role.id);
          expect(back.isRestrictedAccess, 'the fence must be put back before anything else runs').toBe(
            s.role.isRestrictedAccess,
          );
        }
      });

      test(`PERM-${tag}-023 · revoking campaigns leaves the OTHER modules alone @regression`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        const who = await withPermissions(browser, request, s, allCampaignVerbs(false));

        // Media is a separate module and must be unaffected — both in the stored
        // role and in what the sub-user can actually do.
        const media = await readModule(request, admin!, s.role.id, 'media');
        expect(media, 'the media permissions must survive a campaigns-only change').toEqual(
          s.role.permissions.media,
        );

        if ((s.role.permissions.media as Record<string, unknown>)?.view === true) {
          const files = await request.get(
            api(
              `/file/read?limit=5&page=1&search=&type=&sort=createdAt&order=-1&folderId=${s.folderId}`,
            ),
            { headers: authHeaders(who) },
          );
          expect(
            files.status(),
            'a sub-user with no campaign rights must still be able to use its media rights',
          ).toBe(200);
        }
      });

      test(`PERM-${tag}-024 · the admin is unaffected while the sub-user is revoked @regression`, async ({
        browser,
        request,
      }) => {
        test.setTimeout(180_000);
        const s = subj();
        await withPermissions(browser, request, s, allCampaignVerbs(false));

        const name = uniqueName('AdminUnaffected');
        const r = await request.post(api('/campaign/create'), {
          headers: authHeaders(admin!),
          data: body(s, name),
        });
        expect(
          r.status(),
          'revoking a sub-user role must never restrict the account owner',
        ).toBe(200);
        expect(await findAsAdmin(request, s, name)).toBeTruthy();
      });

      test(`PERM-${tag}-025 · an anonymous caller is refused before any permission logic @negative @security`, async ({
        request,
      }) => {
        const s = subj();
        const r = await request.post(api('/campaign/create'), {
          headers: { 'Content-Type': 'application/json' },
          data: body(s, uniqueName('Anon')),
        });
        expect(r.status(), 'no token must mean 401, whatever the role permissions say').toBe(401);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  THE TWO CONTROLS ARE INDEPENDENT — the point of testing both sub-users
  // ═══════════════════════════════════════════════════════════════════════════

  test('PERM-030 · full campaign permissions do NOT lift the folder fence @security @critical', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const s = subjects.restricted!;
    expect(s.role.isRestrictedAccess, 'precondition: this sub-user is folder-fenced').toBe(true);

    const who = await withPermissions(browser, request, s, allCampaignVerbs(true));

    // Every campaign permission is granted, and the root is still refused: the
    // permission says WHAT, the fence says WHERE, and one does not buy the other.
    const r = await request.post(api('/campaign/create'), {
      headers: authHeaders(who),
      data: {
        name: uniqueName('FencedRoot'),
        data: s.fileId ? [{ file: s.fileId, duration: 10 }] : [],
        defaultDuration: 10,
        folderId: null,
      },
    });
    expect(r.status(), 'a fenced sub-user must not reach the root, however permissive its role').toBe(
      403,
    );
    expect((await r.json()).message).toMatch(/only create campaigns inside a folder you have access to/i);
  });

  test('PERM-031 · an unfenced sub-user with the same permissions CAN use the root @regression', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const s = subjects.unrestricted!;
    expect(s.role.isRestrictedAccess, 'precondition: this sub-user has no folder fence').toBe(false);

    const who = await withPermissions(browser, request, s, allCampaignVerbs(true));
    const name = uniqueName('UnfencedRoot');
    const res = await createAs(request, who, s, name);

    expect(res.status, `the same permission set at the root must succeed here: ${res.raw}`).toBe(200);
    expect(await findAsAdmin(request, s, name)).toBeTruthy();
  });
});
