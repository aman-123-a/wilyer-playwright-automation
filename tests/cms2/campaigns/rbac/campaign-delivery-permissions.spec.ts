// =============================================================================
//  Campaigns · DELIVERY-CHAIN PERMISSIONS (DLV-001…009).
//
//  Target: cms2.pocsample.in. Identities come from .env, never hardcoded.
//
//  ── What this file is for ───────────────────────────────────────────────────
//  campaign-permission-matrix covers the campaign RECORD: with campaigns.view /
//  create / update / delete revoked, what may a sub-user do to a campaign. This
//  file covers the DELIVERY CHAIN the campaign travels along — campaign →
//  playlist → screen — because that chain crosses three permission modules, and
//  the interesting failures are the ones that fall between them:
//
//    campaigns.{view,create,update,delete}   the record
//    playlists.{view,update,publish}         the carrier, and pushing it to a screen
//    media.upload                            where a campaign's content comes from
//
//  A role that cannot create a campaign but CAN update a playlist is the case
//  worth knowing about: if the playlist writer accepts a campaign reference it
//  never checked, the campaign permission is decorative — the operator just
//  edits the carrier instead. DLV-004 is that probe.
//
//  ── Permission verbs, read live from the roles on 2026-08-03 ────────────────
//    campaigns  view create update delete
//    playlists  view create update delete publish   ← `publish` is the screen push
//    media      view upload update delete publish   ← `upload`, not `create`
//    screens    view pair updateConfig delete       ← no `update`; publishing
//                                                      content is a PLAYLIST verb
//  That last row matters: assigning content to a screen is governed by
//  playlists.publish, so a role stripped of every screen verb but left with
//  playlists.publish can still change what a screen plays.
//
//  ── Method ─────────────────────────────────────────────────────────────────
//  One permission moves per case, everything else held constant, so a denial can
//  only be attributed to that permission. `access` is a JWT claim, so every
//  toggle is followed by a fresh login (BUG-PERM-01). The role is a SHARED
//  record: it is snapshotted in beforeAll, restored in afterAll, and the restore
//  is asserted. patchModule rewrites the whole permission object because
//  PUT /role/update replaces it.
//
//  Findings are asserted AS OBSERVED, the convention in this repo — a defect
//  stays under test instead of being tolerated silently.
//
//  ── What this file found on cms2, 2026-08-03 ───────────────────────────────
//   • BUG-DLV-01 (DLV-004). POST /playlist/update accepts a campaign reference
//     from a role holding NO campaign permission at all — view, create, update
//     and delete every one revoked — and the reference persists. Reproduced 200
//     for BOTH sub-user shapes, so it is a permission-layer gap, not a fence one.
//     Consequence: "may not touch campaigns" is not expressible, because the same
//     person can put any campaign on any screen by editing the playlist instead.
//   • maker/checker is a SECOND gate after playlists.publish (DLV-006). A role
//     marked `maker` gets 200 "Playlist sent for approval." and the screen keeps
//     playing what it was playing. A publish case that only asserted the status
//     would call that a success; this one asserts the screen.
//   • A publish aimed at a screen outside the fence is likewise accepted and does
//     nothing (DLV-009) — silent, with no way for the operator to tell why.
// =============================================================================

import { test, expect, type APIRequestContext } from '@playwright/test';
import { ENV, type Credentials } from '../../../../config/env';
import { loginAs, authHeaders, type Identity } from '../../../../helpers/rbac/identities';
import {
  findMember,
  readRole,
  readModule,
  patchModule,
  restoreRole,
  type RoleSnapshot,
} from '../../../../helpers/rbac/rolePermissions';

const PREFIX = 'QA_DLV_';
const NOT_AUTHORIZED = /not authorized to perform this action/i;

const api = (p: string): string => `${ENV.API_BASE_URL}${p}`;
const uniqueName = (label: string): string =>
  `${PREFIX}${label}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/** One sub-user under test, resolved far enough to drive the whole chain as them. */
interface Subject {
  key: 'restricted' | 'unrestricted';
  label: string;
  creds: Credentials;
  /** Where this identity may file content: its assigned folder, or the root. */
  folderId: string;
  /** A media id it may legitimately reference. */
  fileId: string;
  role: RoleSnapshot;
}

test.describe('Campaigns · delivery-chain permissions @rbac @security', () => {
  // Identity is the point of this suite — never inherit the admin session.
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: 'serial' });

  let admin: Identity | null = null;
  const subjects: Partial<Record<Subject['key'], Subject>> = {};
  let setupError = '';

  async function authenticate(
    browser: import('@playwright/test').Browser,
    creds: Credentials,
  ): Promise<Identity | null> {
    const page = await browser.newPage();
    const outcome = await loginAs(page, creds);
    await page.close();
    return outcome.identity;
  }

  /** Toggle one verb on a subject's role and hand back a token that carries it. */
  async function withPermission(
    request: APIRequestContext,
    browser: import('@playwright/test').Browser,
    subject: Subject,
    module: string,
    overrides: Record<string, boolean>,
  ): Promise<Identity> {
    const status = await patchModule(request, admin!, subject.role, module, overrides);
    expect(status, `the admin must be able to rewrite ${module} on the role`).toBeLessThan(400);
    const identity = await authenticate(browser, subject.creds);
    expect(identity, `${subject.label} must be able to log in after the role change`).toBeTruthy();
    return identity!;
  }

  /** A campaign owned by the subject, filed where it is allowed to file. */
  async function seedCampaign(
    request: APIRequestContext,
    who: Identity,
    subject: Subject,
    label: string,
  ): Promise<{ id: string; name: string }> {
    const name = uniqueName(label);
    const res = await request.post(api('/campaign/create'), {
      headers: authHeaders(who),
      data: {
        name,
        data: subject.fileId ? [{ file: subject.fileId, duration: 10 }] : [],
        defaultDuration: 10,
        folderId: subject.folderId || null,
      },
    });
    expect(res.status(), `seeding a campaign as ${subject.label} must succeed`).toBeLessThan(300);

    // POST /campaign/create answers with a message and no id, so the record is
    // resolved by a read-back — which doubles as proof that it actually persisted
    // rather than merely being acknowledged.
    const list = await request.get(
      api(
        `/campaign/read?limit=50&page=1&sort=createdAt&order=-1&search=${encodeURIComponent(name)}` +
          `&folderId=${subject.folderId}`,
      ),
      { headers: authHeaders(who) },
    );
    const docs = (((await list.json()).docs ?? []) as Array<{ id: string; name: string }>).filter(
      (d) => d.name === name,
    );
    expect(docs[0]?.id, `the campaign seeded as ${subject.label} must be readable back`).toBeTruthy();
    return { id: docs[0].id, name };
  }

  /**
   * A layout borrowed from a playlist the identity can already read.
   *
   * POST /playlist/create answers 201 with `layouts: []`, so a new playlist has
   * nowhere to put a campaign, and a hand-written layout is not a safe stand-in —
   * the write schema disagrees with the read model in three places. So the carrier
   * is TEMPLATED from a real editor-made playlist: its layout shape is known-good,
   * and only the zone's item list is replaced.
   */
  async function borrowLayouts(
    request: APIRequestContext,
    who: Identity,
  ): Promise<Record<string, unknown>[] | null> {
    const list = await request.get(
      api('/playlist/read?limit=25&page=1&sort=createdAt&order=-1&search='),
      { headers: authHeaders(who) },
    );
    if (!list.ok()) return null;
    const docs = ((await list.json()).docs ?? []) as Array<{ id: string }>;

    for (const d of docs.slice(0, 12)) {
      const r = await request.get(api(`/playlist/read/${d.id}`), { headers: authHeaders(who) });
      if (!r.ok()) continue;
      const doc = (await r.json()) as { layouts?: Record<string, unknown>[] };
      const layouts = doc.layouts ?? [];
      const zones = (layouts[0] as { zones?: unknown[] } | undefined)?.zones;
      if (Array.isArray(zones) && zones.length > 0) {
        return JSON.parse(JSON.stringify(layouts)) as Record<string, unknown>[];
      }
    }
    return null;
  }

  /** Collapse a read layout into the shape the writer accepts, with `items` in zone 0. */
  function layoutsWithItems(
    layouts: Record<string, unknown>[],
    items: Array<Record<string, unknown>>,
  ): Record<string, unknown>[] {
    const clone = JSON.parse(JSON.stringify(layouts)) as Array<{
      zones?: Array<{ schedule?: unknown; array?: { data?: unknown[] } }>;
    }>;
    clone.forEach((layout, li) =>
      (layout.zones ?? []).forEach((zone, zi) => {
        if (!Array.isArray(zone.schedule)) zone.schedule = [];
        zone.array = zone.array ?? { data: [] };
        // Only the first zone of the first layout carries the campaign; every
        // other zone is emptied so the carrier holds exactly what was put in it.
        zone.array.data = li === 0 && zi === 0 ? items : [];
      }),
    );
    return clone as unknown as Record<string, unknown>[];
  }

  /** A playlist owned by the subject, with the campaign in its first zone. */
  async function seedPlaylistCarrying(
    request: APIRequestContext,
    who: Identity,
    subject: Subject,
    campaignId: string,
    label: string,
  ): Promise<{ id: string; name: string } | null> {
    const name = uniqueName(label);
    // No folderId: playlist folders are their OWN namespace, so passing the media
    // folder a fenced sub-user is assigned to answers 404 ("folder not found"),
    // which would read as a permission failure and is not one. `null` is a 400 —
    // the field is omitted entirely and the playlist is created at the root, which
    // POST /playlist/create accepts for both sub-user shapes (verified 2026-08-03).
    const res = await request.post(api('/playlist/create'), {
      headers: authHeaders(who),
      data: { name, description: 'delivery-chain permission suite' },
    });
    expect(res.status(), `seeding a playlist as ${subject.label} must succeed`).toBeLessThan(300);
    const body = await res.json();
    const id = body.id ?? body.data?.id ?? body.playlist?.id;

    // A fenced sub-user may be able to read no playlist that has a layout; the
    // admin's serves just as well, because only the layout SHAPE is borrowed —
    // every zone's contents are replaced below.
    const template = (await borrowLayouts(request, who)) ?? (await borrowLayouts(request, admin!));
    if (!template) return null;

    const write = await request.post(api(`/playlist/update/${id}`), {
      headers: authHeaders(who),
      data: { name, layouts: layoutsWithItems(template, [{ campaign: campaignId, duration: 10 }]) },
    });
    expect(write.status(), 'putting the campaign into the carrier must succeed').toBeLessThan(300);

    // Never trust the echo: read it back before any case relies on it.
    const back = await request.get(api(`/playlist/read/${id}`), { headers: authHeaders(who) });
    if (!JSON.stringify(await back.json()).includes(campaignId)) return null;
    return { id, name };
  }

  /**
   * A screen, as the listing reports it.
   *
   * `playlist` carries the published playlist's NAME, not its id (verified live
   * 2026-08-03: publishing QA_CTRL_… set `"playlist":"QA_CTRL_…"`). Comparing it
   * to an id would fail every time and read as "the publish did nothing".
   */
  interface ScreenDoc {
    id: string;
    name?: string;
    playlist?: string | null;
  }

  async function screensVisibleTo(request: APIRequestContext, who: Identity): Promise<ScreenDoc[]> {
    const res = await request.get(
      api('/screen/read?page=1&limit=100&search=&sort=createdAt&order=-1'),
      { headers: authHeaders(who) },
    );
    if (!res.ok()) return [];
    return ((await res.json()).docs ?? []) as ScreenDoc[];
  }

  /**
   * The playlist NAME published to `screen`, read back through `who`'s own listing.
   *
   * Read as the identity that published, not as the owner: there is no
   * GET /screen/read/{id} (it answers 404), the listing is paginated, and this
   * account holds thousands of screens — a fenced sub-user's screen is simply not
   * in the owner's first page, and looking there returns null for a publish that
   * actually landed.
   */
  async function publishedPlaylistName(
    request: APIRequestContext,
    who: Identity,
    screen: string,
  ): Promise<string | null> {
    return (await screensVisibleTo(request, who)).find((d) => d.id === screen)?.playlist ?? null;
  }

  /**
   * A screen THIS identity can see and that has nothing published.
   *
   * Resolved per identity, not once for the suite: the fenced sub-user sees a
   * different set of screens from the owner, and publishing to one it cannot see
   * is a fence question, not a permission one (that case is DLV-009). Targeting
   * the owner's screen from a fenced account would fail every publish case for a
   * reason that has nothing to do with the permission under test.
   */
  async function emptyScreenFor(request: APIRequestContext, who: Identity): Promise<string> {
    return (await screensVisibleTo(request, who)).find((d) => !d.playlist)?.id ?? '';
  }

  const publishToScreen = (
    request: APIRequestContext,
    who: Identity,
    playlistId: string,
    screen: string,
  ) =>
    request.post(api('/screen/publishPlaylist'), {
      headers: authHeaders(who),
      data: { playlistId, screens: [screen] },
    });

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(420_000);

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
      const identity = await authenticate(browser, creds);
      if (!identity) {
        setupError = `${creds.email} could not authenticate`;
        return;
      }

      let folderId = '';
      let fileId = '';
      const filesIn = async (fid: string): Promise<string[]> => {
        const r = await request.get(
          api(`/file/read?limit=5&page=1&search=&type=&sort=createdAt&order=-1&folderId=${fid}`),
          { headers: authHeaders(identity) },
        );
        if (!r.ok()) return [];
        return (((await r.json()).docs ?? []) as Array<{ id: string }>).map((d) => d.id);
      };

      if (role.isRestrictedAccess) {
        const folders = ((
          await (
            await request.get(api('/folder/read?page=1&limit=100'), { headers: authHeaders(identity) })
          ).json()
        ).folders ?? []) as Array<{ id: string }>;
        for (const f of folders) {
          const ids = await filesIn(f.id);
          if (ids.length) {
            folderId = f.id;
            fileId = ids[0];
            break;
          }
        }
        if (!folderId) folderId = folders[0]?.id ?? '';
        if (!folderId) {
          setupError = `${creds.email} has no assigned folder to create in`;
          return;
        }
      } else {
        fileId = (await filesIn(''))[0] ?? '';
      }

      subjects[key] = { key, label, creds, folderId, fileId, role };
    }

    // Publish targets are resolved per identity inside each case: the fenced
    // sub-user sees a different set of screens from the owner.
  });

  test.beforeEach(() => {
    test.skip(Boolean(setupError), `Cannot set up the delivery-chain suite: ${setupError}`);
    test.skip(
      !ENV.ALLOW_DESTRUCTIVE,
      'Edits role permissions and creates content. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
    );
  });

  test.afterAll(async ({ request }) => {
    if (!admin) return;

    // Restore the roles FIRST — an unrestored role breaks the environment for
    // everyone and must not wait behind content cleanup.
    for (const subject of Object.values(subjects)) {
      if (!subject) continue;
      await restoreRole(request, admin, subject.role).catch(() => undefined);
      for (const module of ['campaigns', 'playlists', 'media']) {
        expect(
          await readModule(request, admin, subject.role.id, module).catch(() => ({})),
          `the ${subject.label}'s ${module} permissions must be restored to how the suite found them`,
        ).toEqual(subject.role.permissions[module]);
      }
    }

    // Then this suite's content, wherever it was filed.
    const folders = new Set(['', ...Object.values(subjects).map((s) => s!.folderId)]);
    for (const folderId of folders) {
      for (const [listPath, delPath] of [
        ['/campaign/read', '/campaign/delete'],
        ['/playlist/read', '/playlist/delete'],
      ] as const) {
        const r = await request.get(
          api(`${listPath}?limit=100&page=1&sort=createdAt&order=-1&search=${PREFIX}&folderId=${folderId}`),
          { headers: authHeaders(admin) },
        );
        if (!r.ok()) continue;
        const docs = (((await r.json()).docs ?? []) as Array<{ id: string; name: string }>).filter((d) =>
          d.name?.startsWith(PREFIX),
        );
        for (const d of docs) {
          await request.delete(api(`${delPath}/${d.id}`), { headers: authHeaders(admin) }).catch(() => undefined);
        }
      }
    }
  });

  // Every case runs for both sub-user shapes: a defect that only reproduces for
  // the fenced one is a fence bug, not a permission bug, and the labels say which.
  for (const key of ['restricted', 'unrestricted'] as const) {
    const subjectOf = (): Subject => {
      const s = subjects[key];
      expect(s, `subject ${key} must be resolved`).toBeTruthy();
      return s!;
    };

    test.describe(`${key} sub-user`, () => {
      // ─────────────────────────────────────────────────────────────────────
      //  view
      // ─────────────────────────────────────────────────────────────────────

      test(`DLV-001 · ${key} · campaigns.view revoked hides the campaign but not the playlist carrying it @rbac @critical`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(420_000);
        const subject = subjectOf();

        const full = await withPermission(request, browser, subject, 'campaigns', { view: true, create: true });
        const campaign = await seedCampaign(request, full, subject, `View_${key}`);
        const playlist = await seedPlaylistCarrying(request, full, subject, campaign.id, `ViewPl_${key}`);
        test.skip(!playlist, 'No playlist readable by this identity offers a layout to template a carrier from.');

        const blind = await withPermission(request, browser, subject, 'campaigns', { view: false });

        const direct = await request.get(api(`/campaign/read/${campaign.id}`), { headers: authHeaders(blind) });
        expect(direct.status(), 'campaigns.view revoked must refuse a direct read').toBe(403);

        // The carrier is a different module. Whether the campaign's details leak
        // through the playlist is the question worth asking — a viewer who cannot
        // open a campaign but can read its whole item list through a playlist has
        // been denied nothing.
        const viaPlaylist = await request.get(api(`/playlist/read/${playlist!.id}`), {
          headers: authHeaders(blind),
        });
        expect(viaPlaylist.status(), 'the playlist itself is governed by playlists.view').toBe(200);

        const doc = await viaPlaylist.json();
        const items = JSON.stringify(doc);
        expect(
          items.includes(campaign.id),
          `the playlist still references the campaign ${campaign.name} by id — ` +
            'campaigns.view fences the campaign endpoints, not the reference inside a playlist',
        ).toBe(true);
      });

      // ─────────────────────────────────────────────────────────────────────
      //  create
      // ─────────────────────────────────────────────────────────────────────

      test(`DLV-002 · ${key} · campaigns.create revoked stops the campaign at the source @rbac @critical`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(300_000);
        const subject = subjectOf();

        const denied = await withPermission(request, browser, subject, 'campaigns', {
          create: false,
          view: true,
        });
        const res = await request.post(api('/campaign/create'), {
          headers: authHeaders(denied),
          data: {
            name: uniqueName(`NoCreate_${key}`),
            data: subject.fileId ? [{ file: subject.fileId, duration: 10 }] : [],
            defaultDuration: 10,
            folderId: subject.folderId || null,
          },
        });
        expect(res.status(), 'campaigns.create revoked must refuse the create').toBe(403);
        expect(JSON.stringify(await res.json()), 'and say so as a permission error').toMatch(
          NOT_AUTHORIZED,
        );
      });

      test(`DLV-003 · ${key} · media.upload revoked does not block referencing media a campaign already has @rbac`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(300_000);
        const subject = subjectOf();
        test.skip(!subject.fileId, 'This identity can see no media to reference.');

        // upload and reference are different rights: a role that may not add new
        // media to the library must still be able to build a campaign from what is
        // already there, or "create campaigns" is unusable without "upload".
        await withPermission(request, browser, subject, 'campaigns', { create: true, view: true });
        const restricted = await withPermission(request, browser, subject, 'media', {
          upload: false,
          view: true,
        });

        const res = await request.post(api('/campaign/create'), {
          headers: authHeaders(restricted),
          data: {
            name: uniqueName(`NoUpload_${key}`),
            data: [{ file: subject.fileId, duration: 10 }],
            defaultDuration: 10,
            folderId: subject.folderId || null,
          },
        });
        expect(
          res.status(),
          'media.upload governs adding files to the library, not referencing one in a campaign',
        ).toBeLessThan(300);
      });

      // ─────────────────────────────────────────────────────────────────────
      //  update — the carrier is the interesting attack surface
      // ─────────────────────────────────────────────────────────────────────

      test(`DLV-004 · ${key} · BUG-DLV-01 · a campaign reference must be authorised by the campaigns module, not the playlist one @rbac @security`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(420_000);
        test.fail(
          true,
          'BUG-DLV-01: POST /playlist/update accepts a campaign reference from a role holding no ' +
            'campaign permission at all, and persists it — campaign rights are bypassable ' +
            'through the carrier. Remove this marker when the writer starts refusing.',
        );
        const subject = subjectOf();

        const full = await withPermission(request, browser, subject, 'campaigns', { create: true, view: true });
        const campaign = await seedCampaign(request, full, subject, `Carrier_${key}`);
        const playlist = await seedPlaylistCarrying(request, full, subject, campaign.id, `CarrierPl_${key}`);
        test.skip(!playlist, 'No playlist readable by this identity offers a layout to template a carrier from.');

        // Now take every campaign right away and edit the CARRIER instead.
        const noCampaignRights = await withPermission(request, browser, subject, 'campaigns', {
          create: false,
          update: false,
          delete: false,
          view: false,
        });

        const doc = await (
          await request.get(api(`/playlist/read/${playlist!.id}`), { headers: authHeaders(noCampaignRights) })
        ).json();
        const pl = doc.playlist ?? doc.data ?? doc;
        test.skip(!pl.layouts?.[0]?.zones?.[0], 'the seeded playlist has no zone to edit');

        // Written through the same collapse the editor performs: a read expands
        // `campaign` and `file` into objects that the writer rejects with a 400,
        // and a 400 here would look like a denial when it is only a schema
        // mismatch — the exact confusion this case has to avoid.
        const res = await request.post(api(`/playlist/update/${playlist!.id}`), {
          headers: authHeaders(noCampaignRights),
          data: {
            name: pl.name,
            layouts: layoutsWithItems(pl.layouts, [{ campaign: campaign.id, duration: 10 }]),
          },
        });

        // The status is annotated either way, so the report names what this build
        // does rather than only what it should do.
        test.info().annotations.push({
          type: 'observed',
          description: `playlist/update with a campaign ref, no campaign rights → ${res.status()}`,
        });

        // Asserted against the CORRECT behaviour, not the observed one, because
        // this is a confirmed defect rather than a design decision: the caller
        // holds no campaign right at all, so the write must be refused. The
        // test.fail() marker above keeps the suite green while it is open and
        // turns this into a reported failure the day the server starts refusing —
        // which is the signal to delete the marker, not to relax the assertion.
        expect(
          res.status(),
          'the playlist writer must authorise a campaign reference against the campaigns ' +
            'module before persisting it',
        ).toBe(403);

        const after = await (
          await request.get(api(`/playlist/read/${playlist!.id}`), { headers: authHeaders(admin!) })
        ).json();
        expect(
          JSON.stringify(after).includes(campaign.id),
          'and nothing may have been written',
        ).toBe(false);
      });

      // ─────────────────────────────────────────────────────────────────────
      //  publish — the last hop, campaign → screen
      // ─────────────────────────────────────────────────────────────────────

      test(`DLV-005 · ${key} · playlists.publish revoked stops a campaign reaching a screen @rbac @critical`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(420_000);
        const subject = subjectOf();

        const full = await withPermission(request, browser, subject, 'campaigns', { create: true, view: true });
        const target = await emptyScreenFor(request, full);
        test.skip(!target, 'This identity can see no screen with an empty content slot to publish to.');

        const campaign = await seedCampaign(request, full, subject, `Push_${key}`);
        const playlist = await seedPlaylistCarrying(request, full, subject, campaign.id, `PushPl_${key}`);
        test.skip(!playlist, 'No playlist readable by this identity offers a layout to template a carrier from.');

        const denied = await withPermission(request, browser, subject, 'playlists', { publish: false });
        const res = await publishToScreen(request, denied, playlist!.id, target);
        expect(
          res.status(),
          'publishing content to a screen is governed by playlists.publish — revoked, it must be refused',
        ).toBe(403);

        // Nothing may have landed on the screen.
        expect(
          await publishedPlaylistName(request, denied, target),
          'a refused publish must leave the screen untouched',
        ).not.toBe(playlist!.name);
      });

      test(`DLV-006 · ${key} · playlists.publish granted pushes the campaign to the screen, and it is removable again @rbac @critical`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(420_000);
        const subject = subjectOf();

        const full = await withPermission(request, browser, subject, 'campaigns', { create: true, view: true });
        const target = await emptyScreenFor(request, full);
        test.skip(!target, 'This identity can see no screen with an empty content slot to publish to.');

        const campaign = await seedCampaign(request, full, subject, `Allow_${key}`);
        const playlist = await seedPlaylistCarrying(request, full, subject, campaign.id, `AllowPl_${key}`);
        test.skip(!playlist, 'No playlist readable by this identity offers a layout to template a carrier from.');
        const publisher = await withPermission(request, browser, subject, 'playlists', { publish: true });

        try {
          const res = await publishToScreen(request, publisher, playlist!.id, target);
          const said = (await res.text()).slice(0, 200);
          expect(
            res.status(),
            `with playlists.publish held, the push must be accepted — server said ${said}`,
          ).toBeLessThan(300);

          // playlists.publish is not the last gate. A role marked `maker` under
          // maker/checker does not publish — it REQUESTS a publish, and the server
          // answers 200 "Playlist sent for approval." while the screen keeps
          // playing what it was playing. Read live 2026-08-03: the fenced sub-user
          // on cms2 is a maker, the account-wide one is not.
          const maker =
            (subject.role.permissions.makerAndChecker as Record<string, unknown> | undefined)
              ?.maker === true;
          const queued = /approval/i.test(said);

          expect(
            queued,
            `a maker's publish must be queued for approval and a non-maker's must not — ` +
              `maker=${maker}, server said ${said}`,
          ).toBe(maker);

          if (queued) {
            // The point of the gate: nothing reaches the screen until a checker acts.
            expect(
              await publishedPlaylistName(request, publisher, target),
              'a publish awaiting approval must not change what the screen plays',
            ).not.toBe(playlist!.name);
          } else {
            expect(
              await publishedPlaylistName(request, publisher, target),
              `the screen must now carry the playlist that holds the campaign — ` +
                `publish answered ${res.status()} ${said}`,
            ).toBe(playlist!.name);
          }
        } finally {
          // Restore the screen to empty — this suite found it with nothing
          // published. Deleting the carrier is the restore path: the screen drops
          // a playlist that no longer exists (verified live, 2026-08-03), and no
          // unpublish endpoint is exposed outside the UI modal.
          await request
            .delete(api(`/playlist/delete/${playlist!.id}`), { headers: authHeaders(admin!) })
            .catch(() => undefined);
          await expect
            .poll(() => publishedPlaylistName(request, publisher, target), { timeout: 45_000 })
            .not.toBe(playlist!.name);
        }
      });

      test(`DLV-009 · ${key} · publishing to a screen this identity cannot see changes nothing @rbac @security`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(420_000);
        const subject = subjectOf();

        const full = await withPermission(request, browser, subject, 'campaigns', { create: true, view: true });
        const publisher = await withPermission(request, browser, subject, 'playlists', { publish: true });

        // A screen the OWNER can see and this identity cannot. For an account-wide
        // sub-user there is normally no such screen, and the case skips — that is
        // the correct outcome, not a gap: it has no fence to cross.
        const mine = new Set((await screensVisibleTo(request, publisher)).map((d) => d.id));
        const outside = (await screensVisibleTo(request, admin!)).find(
          (d) => !mine.has(d.id) && !d.playlist,
        )?.id;
        test.skip(!outside, 'Every screen the owner can see is also visible to this identity.');

        const campaign = await seedCampaign(request, full, subject, `Fence_${key}`);
        const playlist = await seedPlaylistCarrying(request, full, subject, campaign.id, `FencePl_${key}`);
        test.skip(!playlist, 'No playlist readable by this identity offers a layout to template a carrier from.');

        const res = await publishToScreen(request, publisher, playlist!.id, outside!);

        // The assertion that matters is the EFFECT, not the status: a publish that
        // the fence swallows is accepted with a 2xx and does nothing, so an
        // operator sees a success and no content change and has no way to tell why.
        expect(
          await publishedPlaylistName(request, admin!, outside!),
          `publishing to a screen outside the fence answered ${res.status()} and must not have ` +
            'changed what that screen plays',
        ).not.toBe(playlist!.name);
      });

      // ─────────────────────────────────────────────────────────────────────
      //  delete
      // ─────────────────────────────────────────────────────────────────────

      test(`DLV-007 · ${key} · campaigns.delete revoked leaves a delivered campaign in place @rbac @critical`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(420_000);
        const subject = subjectOf();

        const full = await withPermission(request, browser, subject, 'campaigns', { create: true, view: true });
        const campaign = await seedCampaign(request, full, subject, `NoDelete_${key}`);

        const denied = await withPermission(request, browser, subject, 'campaigns', {
          delete: false,
          view: true,
        });
        const res = await request.delete(api(`/campaign/delete/${campaign.id}`), {
          headers: authHeaders(denied),
        });
        expect(res.status(), 'campaigns.delete revoked must refuse the delete').toBe(403);

        const still = await request.get(api(`/campaign/read/${campaign.id}`), { headers: authHeaders(admin!) });
        expect(still.status(), 'and the campaign must survive the refused delete').toBe(200);
      });

      test(`DLV-008 · ${key} · deleting a campaign needs the campaign right, not the playlist one @rbac @security`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(420_000);
        const subject = subjectOf();

        const full = await withPermission(request, browser, subject, 'campaigns', { create: true, view: true });
        const campaign = await seedCampaign(request, full, subject, `PlDelete_${key}`);

        // Full rights over the carrier, none over the record: removing the
        // reference is allowed, destroying the campaign is not.
        await withPermission(request, browser, subject, 'playlists', {
          view: true,
          create: true,
          update: true,
          delete: true,
          publish: true,
        });
        const noCampaignDelete = await withPermission(request, browser, subject, 'campaigns', {
          delete: false,
          view: true,
          create: true,
          update: true,
        });

        const res = await request.delete(api(`/campaign/delete/${campaign.id}`), {
          headers: authHeaders(noCampaignDelete),
        });
        expect(
          res.status(),
          'playlist rights must not confer campaign deletion — the modules are separate',
        ).toBe(403);
      });
    });
  }
});
