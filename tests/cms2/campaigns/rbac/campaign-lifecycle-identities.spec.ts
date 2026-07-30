// =============================================================================
//  Campaigns V1 — THE FULL LIFECYCLE, RUN AS EACH IDENTITY.
//
//  Target: cms2.pocsample.in (branch `cms2`). Never run on `live`.
//
//  ── What this file asks ─────────────────────────────────────────────────────
//  Not "does the permission toggle work" — campaign-permission-matrix.spec.ts
//  owns that, by moving one verb at a time and watching the effect. This file
//  asks the complementary question, which no amount of toggling answers:
//
//      with the roles AS THE ENVIRONMENT ACTUALLY HAS THEM CONFIGURED, can each
//      of the three real accounts carry a campaign through its whole life —
//      create it, edit it, clone it, put it in a playlist, take it out again,
//      and delete it?
//
//  That matters because the two suites fail in different ways. A toggle suite
//  passes happily while a verb nobody ever revoked is broken for everyone; a
//  lifecycle suite catches "clone is admin-only by accident" and "a sub-user can
//  add a campaign to a playlist but never remove it again" — the states an
//  operator actually gets stuck in.
//
//  Critically, this suite MUTATES NO ROLE. It reads each identity's own JWT to
//  learn what that identity is supposed to be able to do, then asserts the server
//  agrees. So it is safe to run alongside anything, it leaves the shared roles
//  exactly as it found them, and a failure is never the previous test's cleanup.
//
//  ── The three identities (see the memory note `cms-test-identities`) ─────────
//    CMS_ADMIN_*        — account owner. No `access` map, no folder fence; the
//                         control case. Anything it cannot do is broken outright.
//    CMS_SUBUSER_*      — sub-user WITH a folder fence (isRestrictedAccess). Must
//                         file campaigns inside an assigned folder; the root is
//                         refused however permissive its role (PERM-030).
//    CMS_UNRESTRICTED_* — sub-user WITHOUT a fence. Account-wide, like the owner,
//                         but still governed by its role's permissions.
//
//  ── Expectations are DERIVED, never hardcoded ───────────────────────────────
//  Every case reads the verb out of the identity's token and expects allow-or-403
//  accordingly. Hardcoding "the sub-user may create" would make this suite a
//  record of one afternoon's role configuration: the moment an administrator
//  changes a role, half the file would fail and none of it would mean anything.
//  Deriving the expectation means the suite keeps asking a real question, and
//  the assertion messages say which identity and which verb produced the answer.
//
//  Two consequences of BUG-PERM-02 (mapped in campaign-permission-matrix) are
//  respected here rather than re-discovered: /campaign/update admits a caller
//  holding create OR update, so the edit case derives its expectation from both.
//
//  Standing rule: persistence is proven by an ADMIN read-back. A sub-user's own
//  read is not evidence — its view is exactly the thing under test.
// =============================================================================

import { test, expect, type APIRequestContext } from '@playwright/test';
import { ENV } from '../../../../config/env';
import { authHeaders } from '../../../../helpers/rbac/identities';
import {
  campaignIdentitySpecs,
  can,
  resolveCampaignIdentity,
  type CampaignIdentity,
} from '../../../../helpers/rbac/campaignIdentities';

const PREFIX = 'QA_LIFE_';
const NOT_AUTHORIZED = /not authorized to perform this action/i;

const api = (path: string): string => `${ENV.API_BASE_URL}${path}`;

const uniqueName = (label: string): string =>
  `${PREFIX}${label}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/** A fresh 24-hex id, the shape the playlist writer expects for layouts and zones. */
const objectId = (): string =>
  Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

const listUrl = (folderId: string | null): string =>
  api(
    `/campaign/read?limit=100&page=1&sort=createdAt&order=-1&search=&folderId=${folderId ?? ''}`,
  );

test.describe('Campaigns · lifecycle per identity @rbac @security', () => {
  // Identity is the entire point: never inherit the cached admin storageState,
  // or every "sub-user" assertion silently runs as the owner and passes wrongly.
  test.use({ storageState: { cookies: [], origins: [] } });

  // NOT serial, deliberately — unlike campaign-permission-matrix, which must be
  // because it mutates a shared role. Every case here seeds its own campaign and
  // its own playlist and changes no shared state, so isolating failures is worth
  // more than ordering them: in serial mode one broken case reports itself and
  // then SKIPS the other seventeen, which hides exactly the per-identity spread
  // this file exists to show.
  test.describe.configure({ mode: 'default' });

  let owner: CampaignIdentity | null = null;
  const identities: Partial<Record<CampaignIdentity['key'], CampaignIdentity>> = {};
  const unavailable: Partial<Record<CampaignIdentity['key'], string>> = {};

  /**
   * A real, editor-produced `layouts` array, used as the template for every
   * playlist this suite needs.
   *
   * Hand-synthesising one does not work. The playlist writer's schema demands a
   * long tail of fields the READ model does not hint at — `layouts[].id`,
   * `layouts[].renderConfig`, and more behind those — each of which only reveals
   * itself as the next 400 once the previous one is supplied. All of them are
   * minted CLIENT-side, so the authoritative source of a valid layout is the
   * editor itself. It is built once here and cloned per test, which also means
   * the membership writes under test are made against the same document shape the
   * application produces, not a reconstruction of it.
   */
  let template: Array<Record<string, any>> | null = null;

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(600_000);
    for (const spec of campaignIdentitySpecs()) {
      const resolved = await resolveCampaignIdentity(
        browser,
        request,
        spec.key,
        spec.label,
        spec.creds,
      );
      if (resolved) identities[spec.key] = resolved;
      else unavailable[spec.key] = `${spec.label} could not be resolved (credentials or login)`;
    }
    owner = identities.admin ?? null;
    if (!owner) return;

    const { PlaylistEditorPage } = await import('../../../../pages/PlaylistEditorPage');
    const { LoginPage } = await import('../../../../pages/LoginPage');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await new LoginPage(page).freshLogin(ENV.ADMIN);
      const editor = new PlaylistEditorPage(page);
      const id = await editor.createPlaylist(`${PREFIX}template_${Date.now()}`, 'layout template');
      await editor.buildTwoImageSlideZone();
      await editor.save();

      const doc = await (
        await request.get(api(`/playlist/read/${id}`), { headers: authHeaders(owner.identity) })
      ).json();
      template = normalise(doc).layouts;
      await request
        .delete(api(`/playlist/delete/${id}`), { headers: authHeaders(owner.identity) })
        .catch(() => undefined);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(() => {
    test.skip(
      !ENV.ALLOW_DESTRUCTIVE,
      'Creates and deletes campaigns and playlists. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
    );
  });

  // Sweep with the owner's authority, across every folder the suite may have
  // filed into — a fenced identity's campaigns are invisible from the root.
  test.afterAll(async ({ request }) => {
    if (!owner) return;
    const folders = new Set<string | null>([null, ...Object.values(identities).map((i) => i!.folderId)]);
    for (const folderId of folders) {
      const res = await request.get(listUrl(folderId), { headers: authHeaders(owner.identity) });
      if (!res.ok()) continue;
      const docs = ((await res.json()).docs ?? []) as Array<{ id: string; name: string }>;
      for (const doc of docs.filter((d) => d.name.startsWith(PREFIX))) {
        await request
          .delete(api(`/campaign/delete/${doc.id}`), { headers: authHeaders(owner.identity) })
          .catch(() => undefined);
      }
    }
    const playlists = await request.get(
      api('/playlist/read?page=1&limit=100&search=&sort=createdAt&order=-1&isNotFolder=false'),
      { headers: authHeaders(owner.identity) },
    );
    if (playlists.ok()) {
      const docs = ((await playlists.json()).docs ?? []) as Array<{ id: string; name: string }>;
      for (const doc of docs.filter((d) => d.name.startsWith(PREFIX))) {
        await request
          .delete(api(`/playlist/delete/${doc.id}`), { headers: authHeaders(owner.identity) })
          .catch(() => undefined);
      }
    }
  });

  // ── mechanics ──────────────────────────────────────────────────────────────

  /** A campaign payload filed where this identity is permitted to file it. */
  function body(who: CampaignIdentity, name: string): Record<string, unknown> {
    return {
      name,
      data: who.fileId ? [{ file: who.fileId, duration: 10 }] : [],
      defaultDuration: 10,
      ...(who.folderId ? { folderId: who.folderId } : { folderId: null }),
    };
  }

  /** Status + parsed message of a call, so denials can be asserted by shape. */
  async function outcome(
    res: import('@playwright/test').APIResponse,
  ): Promise<{ status: number; message: string; raw: string }> {
    const raw = await res.text();
    let message = '';
    try {
      message = JSON.parse(raw).message ?? '';
    } catch {
      message = raw.slice(0, 160);
    }
    return { status: res.status(), message, raw };
  }

  /** Look a campaign up as the OWNER — the only reader whose view never changes. */
  async function findAsOwner(
    request: APIRequestContext,
    who: CampaignIdentity,
    name: string,
  ): Promise<{ id: string; name: string } | undefined> {
    const res = await request.get(listUrl(who.folderId), { headers: authHeaders(owner!.identity) });
    if (!res.ok()) return undefined;
    return ((await res.json()).docs ?? []).find((d: { name: string }) => d.name === name);
  }

  /**
   * Seed a campaign for an identity using the OWNER's authority.
   *
   * Deliberate: seeding must never depend on the verb the test is about to
   * exercise, or a denied create turns into a skipped test instead of a failed
   * assertion — and the folder is the identity's, so the fence still applies to
   * whatever it then tries to do with it.
   */
  async function seedFor(
    request: APIRequestContext,
    who: CampaignIdentity,
    label: string,
  ): Promise<{ id: string; name: string }> {
    const name = uniqueName(label);
    const res = await request.post(api('/campaign/create'), {
      headers: authHeaders(owner!.identity),
      data: body(who, name),
    });
    expect(res.status(), `owner seed must succeed: ${(await res.text()).slice(0, 200)}`).toBe(200);
    const doc = await findAsOwner(request, who, name);
    expect(doc, 'the seeded campaign must be readable back before the test uses it').toBeTruthy();
    return { id: doc!.id, name };
  }

  /**
   * Assert an outcome against a DERIVED expectation.
   *
   * `allowed` comes from the identity's own token, so this is the one place that
   * decides what "correct" means — and it insists a denial is a clean 403 with
   * the product's own message, not a 500 and not a silent 200.
   */
  function expectAllowedOrDenied(
    res: { status: number; message: string; raw: string },
    allowed: boolean,
    what: string,
  ): void {
    if (allowed) {
      expect(res.status, `${what} is granted by this identity's token, so it must succeed — ${res.raw}`).toBe(
        200,
      );
    } else {
      expect(res.status, `${what} is not granted, so it must be refused — ${res.raw}`).toBe(403);
      expect(res.message, `${what}: a denial must be explained in the product's own words`).toMatch(
        NOT_AUTHORIZED,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  The lifecycle, once per identity
  // ═══════════════════════════════════════════════════════════════════════════

  for (const spec of campaignIdentitySpecs()) {
    const tag = { admin: 'ADM', subuser: 'SUB', unrestricted: 'UNR' }[spec.key];

    test.describe(`${spec.label}`, () => {
      /** The resolved identity, or a skip explaining exactly what is missing. */
      const who = (): CampaignIdentity => {
        const resolved = identities[spec.key];
        test.skip(!resolved, unavailable[spec.key] ?? `${spec.label} is not configured`);
        return resolved!;
      };

      test(`LIFE-${tag}-000 · the identity resolves to the account it is meant to be @sanity`, async () => {
        const me = who();
        // A mis-mapped identity is the failure mode that makes an RBAC suite pass
        // for the wrong reason, so it is asserted before anything is attempted:
        // the owner must not be fenced, and the fenced sub-user must be.
        if (me.key === 'admin') {
          expect(me.isFenced, 'the account owner must never be folder-fenced').toBe(false);
        }
        if (me.key === 'subuser') {
          expect(
            me.isFenced,
            'CMS_SUBUSER_* must be the FOLDER-FENCED account — if this fails the .env is ' +
              'pointing at the wrong sub-user and every fence assertion below is vacuous',
          ).toBe(true);
          expect(me.folderId, 'a fenced identity must have an assigned folder to work in').toBeTruthy();
        }
        if (me.key === 'unrestricted') {
          expect(
            me.isFenced,
            'CMS_UNRESTRICTED_* must be the account-wide sub-user, not the fenced one',
          ).toBe(false);
        }
      });

      test(`LIFE-${tag}-001 · CREATE a campaign @smoke @critical`, async ({ request }) => {
        test.setTimeout(120_000);
        const me = who();
        const allowed = can(me, 'campaigns', 'create');
        const name = uniqueName(`${tag}Create`);

        const res = await outcome(
          await request.post(api('/campaign/create'), {
            headers: authHeaders(me.identity),
            data: body(me, name),
          }),
        );
        expectAllowedOrDenied(res, allowed, `${me.label}: create`);

        // The write either landed or it did not. A denial that still writes is the
        // worst outcome of the two, because the operator is told it did not happen.
        const saved = await findAsOwner(request, me, name);
        if (allowed) {
          expect(saved, 'a granted create must persist, not merely answer 200').toBeTruthy();
        } else {
          expect(saved, 'a refused create must leave nothing behind').toBeUndefined();
        }
      });

      test(`LIFE-${tag}-002 · EDIT a campaign @critical`, async ({ request }) => {
        test.setTimeout(120_000);
        const me = who();
        // BUG-PERM-02: /campaign/update admits the caller when campaigns.create OR
        // campaigns.update is held. That is a defect, and it is asserted as such in
        // campaign-permission-matrix; here it is simply the environment's behaviour,
        // so the expectation reflects it rather than re-reporting it.
        const allowed = can(me, 'campaigns', 'update') || can(me, 'campaigns', 'create');
        const seeded = await seedFor(request, me, `${tag}Edit`);
        const renamed = `${seeded.name}_edited`;

        const res = await outcome(
          await request.post(api(`/campaign/update/${seeded.id}`), {
            headers: authHeaders(me.identity),
            data: body(me, renamed),
          }),
        );
        expectAllowedOrDenied(res, allowed, `${me.label}: update`);

        const after = await request.get(api(`/campaign/read/${seeded.id}`), {
          headers: authHeaders(owner!.identity),
        });
        expect(
          (await after.json()).name,
          allowed
            ? 'a granted edit must actually change the stored name'
            : 'a refused edit must leave the stored name alone',
        ).toBe(allowed ? renamed : seeded.name);
      });

      test(`LIFE-${tag}-003 · CLONE a campaign @critical`, async ({ request }) => {
        test.setTimeout(120_000);
        const me = who();
        // Clone writes a NEW campaign, so `campaigns.create` is the verb that
        // should govern it. If this expectation is ever wrong, the failure message
        // is the finding: a copy is a create, and gating it on anything weaker
        // would let a role that may not create produce campaigns anyway.
        const allowed = can(me, 'campaigns', 'create');
        const seeded = await seedFor(request, me, `${tag}Clone`);
        const copy = `${seeded.name}_copy`;

        const res = await outcome(
          await request.post(api(`/campaign/duplicate/${seeded.id}`), {
            headers: authHeaders(me.identity),
            data: { name: copy, folderId: me.folderId ?? '' },
          }),
        );
        expect(
          res.status,
          allowed
            ? `${me.label}: clone must succeed for an identity that may create — ${res.raw}`
            : `${me.label}: clone WRITES a campaign, so an identity that may not create must ` +
              `not be able to clone one either — ${res.raw}`,
        ).toBe(allowed ? 200 : 403);

        const madeIt = await findAsOwner(request, me, copy);
        if (allowed) {
          expect(madeIt, 'the copy must exist on the server').toBeTruthy();
          // A clone must be a copy, not a move: the source has to survive.
          expect(
            await findAsOwner(request, me, seeded.name),
            'cloning must leave the source campaign in place',
          ).toBeTruthy();
        } else {
          expect(madeIt, 'a refused clone must not leave a copy behind').toBeUndefined();
        }
      });

      test(`LIFE-${tag}-004 · DELETE a campaign @critical @destructive`, async ({ request }) => {
        test.setTimeout(120_000);
        const me = who();
        const allowed = can(me, 'campaigns', 'delete');
        const seeded = await seedFor(request, me, `${tag}Delete`);

        const res = await outcome(
          await request.delete(api(`/campaign/delete/${seeded.id}`), {
            headers: authHeaders(me.identity),
          }),
        );
        expectAllowedOrDenied(res, allowed, `${me.label}: delete`);

        const survives = await findAsOwner(request, me, seeded.name);
        if (allowed) {
          expect(survives, 'a granted delete must remove the record, confirmed by the owner').toBeUndefined();
        } else {
          expect(survives, 'the campaign must survive a denied delete').toBeTruthy();
        }
      });

      // ── The campaign inside a playlist ─────────────────────────────────────
      //
      //  Membership lives in the PLAYLIST document, so these two cases are
      //  governed by the `playlists` module, not `campaigns`. That split is the
      //  point: an identity may be perfectly entitled to a campaign and still be
      //  unable to put it on a screen, and that is the state operators report as
      //  "my campaign does nothing".

      test(`LIFE-${tag}-005 · ADD the campaign to a playlist @critical`, async ({ request }) => {
        test.setTimeout(180_000);
        const me = who();
        const allowed = can(me, 'playlists', 'update');
        const seeded = await seedFor(request, me, `${tag}PlAdd`);

        // The owner provides the playlist. This case is about the membership
        // write, not about whether the identity may create a playlist.
        const playlistId = await playlistWithLayout(request, `${tag}Add`);

        const res = await outcome(await addCampaign(request, me, playlistId, seeded.id));
        expect(
          res.status,
          allowed
            ? `${me.label}: an identity holding playlists.update must be able to place a campaign — ${res.raw}`
            : `${me.label}: without playlists.update the membership write must be refused — ${res.raw}`,
        ).toBe(allowed ? 200 : 403);

        const items = await zoneItemsAsOwner(request, playlistId);
        const placed = items.some((i) => i.campaign?.id === seeded.id);
        expect(
          placed,
          allowed
            ? 'a granted add must actually appear in the playlist the screen reads'
            : 'a refused add must not appear in the playlist anyway',
        ).toBe(allowed);
      });

      test(`LIFE-${tag}-006 · REMOVE the campaign from a playlist @critical`, async ({ request }) => {
        test.setTimeout(180_000);
        const me = who();
        const allowed = can(me, 'playlists', 'update');
        const seeded = await seedFor(request, me, `${tag}PlRm`);

        // Precondition established by the OWNER, so the removal is tested even
        // for an identity that could not have added it itself. "Can add but not
        // remove" and "can remove but not add" are both real, and both stuck states.
        const playlistId = await playlistWithLayout(request, `${tag}Rm`);
        const added = await addCampaign(request, { ...me, identity: owner!.identity }, playlistId, seeded.id);
        expect(added.status(), `precondition: the owner must be able to place the campaign — ${await added.text()}`).toBe(
          200,
        );
        expect(
          (await zoneItemsAsOwner(request, playlistId)).some((i) => i.campaign?.id === seeded.id),
          'precondition: the campaign is in the playlist before removal is attempted',
        ).toBe(true);

        const res = await outcome(await removeCampaigns(request, me, playlistId));
        expect(
          res.status,
          allowed
            ? `${me.label}: removal must be permitted when the add was — ${res.raw}`
            : `${me.label}: without playlists.update the removal must be refused — ${res.raw}`,
        ).toBe(allowed ? 200 : 403);

        const items = await zoneItemsAsOwner(request, playlistId);
        expect(
          items.some((i) => i.campaign?.id === seeded.id),
          allowed
            ? 'a granted removal must take the campaign out of what the screen reads'
            : 'a refused removal must leave the campaign in place',
        ).toBe(!allowed);

        // Removal is not deletion, whichever way the permission went.
        expect(
          await findAsOwner(request, me, seeded.name),
          'taking a campaign out of a playlist must never delete the campaign',
        ).toBeTruthy();
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Cross-identity — what one account does must not leak into another
  // ═══════════════════════════════════════════════════════════════════════════

  test('LIFE-X01 · a fenced sub-user cannot clone into the root @security @critical', async ({
    request,
  }) => {
    test.setTimeout(180_000);
    const me = identities.subuser;
    test.skip(!me, unavailable.subuser ?? 'the folder-fenced sub-user is not configured');
    expect(me!.isFenced, 'precondition: this identity is folder-fenced').toBe(true);

    const seeded = await seedFor(request, me!, 'FenceClone');

    // Clone is a second write path into the same table, and PERM-030 only proved
    // that CREATE respects the fence. A copy placed at the root would be a
    // campaign the sub-user can neither see nor manage, sitting outside its
    // boundary — the fence has to hold on every writer, not just the obvious one.
    const res = await outcome(
      await request.post(api(`/campaign/duplicate/${seeded.id}`), {
        headers: authHeaders(me!.identity),
        data: { name: uniqueName('FenceCloneRoot'), folderId: null },
      }),
    );

    expect(
      res.status,
      `a fenced sub-user must not be able to clone outside its folders — ${res.raw}`,
    ).toBeGreaterThanOrEqual(400);
    expect(res.status, 'and the refusal must be a decision, not a crash').toBeLessThan(500);
  });

  test('LIFE-X02 · the owner is unaffected by whatever the sub-users may not do @regression', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    test.skip(!owner, unavailable.admin ?? 'the admin is not configured');

    // The control case for the whole file. If the owner cannot complete the
    // lifecycle, a sub-user denial elsewhere is not evidence of a working fence —
    // it is evidence the feature is broken for everybody.
    const name = uniqueName('OwnerFull');
    const created = await request.post(api('/campaign/create'), {
      headers: authHeaders(owner!.identity),
      data: body(owner!, name),
    });
    expect(created.status(), `owner create — ${(await created.text()).slice(0, 200)}`).toBe(200);

    const doc = await findAsOwner(request, owner!, name);
    expect(doc, 'owner create must persist').toBeTruthy();

    const cloned = await request.post(api(`/campaign/duplicate/${doc!.id}`), {
      headers: authHeaders(owner!.identity),
      data: { name: `${name}_copy`, folderId: '' },
    });
    expect(cloned.status(), `owner clone — ${(await cloned.text()).slice(0, 200)}`).toBe(200);

    const edited = await request.post(api(`/campaign/update/${doc!.id}`), {
      headers: authHeaders(owner!.identity),
      data: body(owner!, `${name}_edited`),
    });
    expect(edited.status(), `owner edit — ${(await edited.text()).slice(0, 200)}`).toBe(200);

    expect((await request.delete(api(`/campaign/delete/${doc!.id}`), {
      headers: authHeaders(owner!.identity),
    })).status(), 'owner delete').toBe(200);
  });

  // ── playlist plumbing, owner-seeded ────────────────────────────────────────

  /**
   * A playlist with one zone holding one file, created by the owner.
   *
   * Built through the API rather than the editor because this suite is about
   * authorisation, not about the canvas — and because the editor cannot be driven
   * as three identities without three browser sessions per test. The zone shape
   * mirrors what the editor produces, so the membership write under test is the
   * same one the app makes.
   */
  async function createPlaylistAsOwner(
    request: APIRequestContext,
    label: string,
  ): Promise<string> {
    const name = `${PREFIX}${label}_${Date.now()}`;
    const created = await request.post(api('/playlist/create'), {
      headers: authHeaders(owner!.identity),
      data: { name, description: 'lifecycle identity suite' },
    });
    // ok(), not toBe(200): /playlist/create answers 201 Created, unlike every
    // campaign endpoint, which answers 200. Pinning 200 here made the owner's own
    // seed look like a failure.
    expect(
      created.ok(),
      `playlist seed must succeed — ${created.status()} ${(await created.text()).slice(0, 200)}`,
    ).toBe(true);
    const echoed = (await created.json()) as { id?: string; data?: { id?: string } };
    if (echoed.id ?? echoed.data?.id) return (echoed.id ?? echoed.data!.id)!;

    const list = await request.get(
      api('/playlist/read?page=1&limit=50&search=&sort=createdAt&order=-1&isNotFolder=false'),
      { headers: authHeaders(owner!.identity) },
    );
    const found = ((await list.json()).docs ?? []).find((p: { name: string }) => p.name === name);
    expect(found, `the seeded playlist "${name}" must be findable`).toBeTruthy();
    return found.id;
  }

  /**
   * A playlist with a real, valid single-zone layout, created by the owner.
   *
   * The template's layout and zone ids are re-minted per playlist. Reusing them
   * verbatim across documents would make two playlists claim the same layout id,
   * which is the kind of shared-identifier collision that produces a failure in a
   * test that looks unrelated.
   */
  async function playlistWithLayout(request: APIRequestContext, label: string): Promise<string> {
    expect(template, 'the layout template must have been built in beforeAll').toBeTruthy();
    const id = await createPlaylistAsOwner(request, label);

    const layouts = JSON.parse(JSON.stringify(template)) as Array<Record<string, any>>;
    for (const layout of layouts) {
      layout.id = objectId();
      for (const zone of layout.zones ?? []) zone.id = objectId();
    }

    const res = await request.post(api(`/playlist/update/${id}`), {
      headers: authHeaders(owner!.identity),
      data: { name: `${PREFIX}${label}`, layouts },
    });
    expect(
      res.ok(),
      `the owner must be able to stamp a layout onto the seeded playlist — ${res.status()} ${(
        await res.text()
      ).slice(0, 200)}`,
    ).toBe(true);
    return id;
  }

  /** The first zone's playback array, read with the owner's authority. */
  async function zoneItemsAsOwner(
    request: APIRequestContext,
    playlistId: string,
  ): Promise<Array<{ campaign?: { id: string } | null; file?: { id: string } | null }>> {
    const res = await request.get(api(`/playlist/read/${playlistId}`), {
      headers: authHeaders(owner!.identity),
    });
    if (!res.ok()) return [];
    const doc = await res.json();
    return doc.layouts?.[0]?.zones?.[0]?.array?.data ?? [];
  }

  /**
   * Append a campaign to a playlist's first zone as `who`.
   *
   * /playlist/update REPLACES `layouts` outright, so the whole document has to be
   * read, mutated and sent back — and the read model has to be collapsed into the
   * write model first (expanded file/campaign objects back down to ids, zone
   * schedules to arrays), or the writer rejects its own reader's output. That
   * asymmetry is BUG-SCHED-05; PlaylistService.normaliseForWrite owns it, and this
   * helper reproduces just enough of it to stay independent of a browser session.
   *
   * When the identity may not even READ the playlist, there is nothing to mutate:
   * that read status is returned as the outcome, because "refused at the read"
   * is a denial of the same operation and must not be reported as a pass.
   */
  async function addCampaign(
    request: APIRequestContext,
    who: CampaignIdentity,
    playlistId: string,
    campaignId: string,
  ): Promise<import('@playwright/test').APIResponse> {
    const read = await request.get(api(`/playlist/read/${playlistId}`), {
      headers: authHeaders(who.identity),
    });
    if (!read.ok()) return read;

    const doc = normalise(await read.json());
    const zone = ensureZone(doc);
    zone.array.data.push({ campaign: campaignId, duration: 10 });

    return request.post(api(`/playlist/update/${playlistId}`), {
      headers: authHeaders(who.identity),
      data: { name: doc.name, layouts: doc.layouts },
    });
  }

  /** Drop every campaign entry from a playlist's first zone as `who`. */
  async function removeCampaigns(
    request: APIRequestContext,
    who: CampaignIdentity,
    playlistId: string,
  ): Promise<import('@playwright/test').APIResponse> {
    const read = await request.get(api(`/playlist/read/${playlistId}`), {
      headers: authHeaders(who.identity),
    });
    if (!read.ok()) return read;

    const doc = normalise(await read.json());
    const zone = ensureZone(doc);
    zone.array.data = zone.array.data.filter((item: Record<string, unknown>) => !item.campaign);

    return request.post(api(`/playlist/update/${playlistId}`), {
      headers: authHeaders(who.identity),
      data: { name: doc.name, layouts: doc.layouts },
    });
  }

  /** Collapse a READ playlist into the shape the writer accepts. See BUG-SCHED-05. */
  function normalise(doc: Record<string, any>): Record<string, any> {
    const out = JSON.parse(JSON.stringify(doc));
    for (const layout of out.layouts ?? []) {
      for (const zone of layout.zones ?? []) {
        if (!Array.isArray(zone.schedule)) zone.schedule = [];
        for (const item of zone.array?.data ?? []) {
          if (item.file && typeof item.file === 'object') item.file = item.file.id;
          if (item.campaign && typeof item.campaign === 'object') item.campaign = item.campaign.id;
        }
      }
    }
    return out;
  }

  /**
   * The first zone of the first layout — where a campaign goes.
   *
   * The playlist is always created by `playlistWithLayout`, so the zone exists by
   * construction. If it does not, the fixture is broken and that must surface as a
   * clear error rather than as a mystery 400 from a synthesised layout.
   */
  function ensureZone(doc: Record<string, any>): { array: { data: Array<Record<string, unknown>> } } {
    const layout = doc.layouts?.[0];
    if (!layout?.zones?.[0]) {
      throw new Error(
        'the playlist under test has no first zone — playlistWithLayout should have stamped one on',
      );
    }
    const zone = layout.zones[0];
    zone.array = zone.array ?? { data: [], defaultDuration: 10, transition: 'none' };
    zone.array.data = zone.array.data ?? [];
    return zone;
  }
});
