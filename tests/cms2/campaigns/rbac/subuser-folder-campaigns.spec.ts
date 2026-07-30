// =============================================================================
//  Campaigns · SUB-USER folder permissions — CRUD, negative, BVA, integration.
//
//  Target: cms2.pocsample.in. Identities come from .env (never hardcoded):
//    CMS_ADMIN_EMAIL   — unrestricted account owner
//    CMS_SUBUSER_EMAIL — restricted sub-user, scoped to ONE folder
//
//  ── The rule under test, as the server actually implements it ───────────────
//  Mapped live on 2026-07-29. The sub-user's JWT grants
//  `access.campaigns = {view, create, update, delete}` — all true — but
//  `isRestrictedAccess: true` layers a FOLDER fence on top, and the fence is
//  what decides. Campaign folders are the MEDIA folder namespace (`/folder/read`),
//  not a campaign-specific one; there is no `/campaign-folder` endpoint.
//
//  Effective rules for a restricted sub-user:
//    • create INSIDE an assigned folder            → 200
//    • create in an unassigned folder              → 403 "Access denied to this folder."
//    • create at the ROOT (null / "" / omitted)    → 403 "You can only create
//                                                    campaigns inside a folder
//                                                    you have access to."
//    • create with a well-formed unknown folder id → 400 "Folder not found."
//    • touching a campaign in an unassigned folder → 403 "You don't have access
//                                                    to this campaign."
//
//  That fence is enforced properly, including against privilege escalation
//  (moving a campaign out of scope) and IDOR. What it does NOT fence is the
//  media a campaign item may reference — see SUBF-026.
//
//  ── Method ──────────────────────────────────────────────────────────────────
//  Every request is made as an EXPLICIT identity: the suite clears storageState
//  and logs in per identity, because inheriting the cached admin session would
//  make every sub-user assertion pass for the wrong reason. Denials are asserted
//  on the exact status AND message, and every "was it really blocked?" claim is
//  settled by an admin read-back, never by the error alone.
// =============================================================================

import { test, expect, type APIRequestContext } from '@playwright/test';
import { ENV } from '../../../../config/env';
import { loginAs, authHeaders, type Identity } from '../../../../helpers/rbac/identities';
import {
  findMember,
  readRole,
  patchModule,
  restoreRole,
  allCampaignVerbs,
  type RoleSnapshot,
} from '../../../../helpers/rbac/rolePermissions';

/** Every artefact this suite creates carries this prefix, so teardown finds it. */
const PREFIX = 'QA_SUBF_';

const uniqueName = (label: string): string =>
  `${PREFIX}${label}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

interface Folder {
  id: string;
  name: string;
}

const api = (path: string): string => `${ENV.API_BASE_URL}${path}`;

const listUrl = (folderId = ''): string =>
  api(`/campaign/read?limit=100&page=1&sort=createdAt&order=-1&search=&folderId=${folderId}`);

/** A valid campaign payload; callers override whatever the case is about. */
const payload = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: uniqueName('C'),
  data: [],
  defaultDuration: 10,
  ...over,
});

test.describe('Campaigns · sub-user folder permissions @rbac @security', () => {
  // Never inherit the admin storageState — this suite is about identity.
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: 'serial' });

  let admin: Identity | null = null;
  let sub: Identity | null = null;
  let skipReason = '';

  /** The one folder the sub-user is assigned to. */
  let inScope: Folder;
  /** A folder the admin has and the sub-user does not. */
  let outOfScope: Folder;
  /** Every folder id the sub-user is assigned — the whole of its permitted scope. */
  let subFolderIds: string[] = [];
  /** A media id inside the sub-user's folder — the only media it can legitimately use. */
  let subFileId = '';
  /** A media id OUTSIDE the sub-user's scope — for the reference-leak probe. */
  let foreignFile: { id: string; name: string };
  /**
   * A playlist the sub-user can open. Campaigns have no sidebar entry, so the
   * editor is the only UI that reaches them — and for a restricted sub-user
   * every playlist lives inside its folder. Resolved here via the API because
   * clicking the folder card on /playlists is SPA state with no URL change, so
   * driving that click is a race with no reliable signal to wait on.
   */
  let subPlaylistId = '';
  /**
   * How many PLAYLIST folders the sub-user can see. Playlist folders are a
   * separate namespace from the media folders campaigns are filed under — the
   * two can share a name and never share an id — so the /playlists view is
   * asserted against this, not against the campaign folder.
   */
  let subPlaylistFolderCount = 0;
  /**
   * The sub-user's role as this suite found it.
   *
   * This suite is about the FOLDER fence, so the role's campaign permissions
   * must not be a second, silent variable: a run that starts with
   * `campaigns.update = false` reports a permission denial as a folder denial
   * and "passes" while proving nothing. The suite therefore grants the full
   * campaign set for its duration and restores the role afterwards.
   */
  let subRole: RoleSnapshot | null = null;

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(240_000);

    for (const [label, creds] of [
      ['ADMIN', ENV.ADMIN],
      ['SUB', ENV.SUBUSER],
    ] as const) {
      const page = await browser.newPage();
      const outcome = await loginAs(page, creds);
      if (label === 'ADMIN') admin = outcome.identity;
      else {
        sub = outcome.identity;
        skipReason = outcome.reason;
      }
      await page.close();
    }
    if (!admin || !sub) return;

    const foldersFor = async (who: Identity): Promise<Folder[]> => {
      const r = await request.get(api('/folder/read?page=1&limit=100'), { headers: authHeaders(who) });
      return ((await r.json()).folders ?? []) as Folder[];
    };
    const adminFolders = await foldersFor(admin);
    const subFolders = await foldersFor(sub);

    outOfScope = adminFolders.find((f) => !subFolders.some((s) => s.id === f.id))!;
    subFolderIds = subFolders.map((f) => f.id);

    // Work in an assigned folder that HOLDS MEDIA, not simply the first one.
    // A campaign item needs a real file id, and `data[0].file` empty is a 400 —
    // so picking an empty folder makes every create fail on payload validation
    // and reports it as a permission result. Fall back to the first folder only
    // when the sub-user has no media at all.
    let stocked: Folder | undefined;
    for (const folder of subFolders) {
      const r = await request.get(
        api(`/file/read?limit=10&page=1&search=&type=&sort=createdAt&order=-1&folderId=${folder.id}`),
        { headers: authHeaders(sub) },
      );
      const docs = ((await r.json()).docs ?? []) as Array<{ id: string }>;
      if (docs.length > 0) {
        stocked = folder;
        subFileId = docs[0].id;
        break;
      }
    }
    inScope = stocked ?? subFolders[0];

    // Hold the role permissions constant so only the folder fence varies.
    const member = await findMember(request, admin, ENV.SUBUSER.email);
    if (member?.roleId) {
      subRole = await readRole(request, admin, member.roleId);
      await patchModule(request, admin, subRole, 'campaigns', allCampaignVerbs(true));
      // `access` is a JWT claim, so the sub-user needs a token minted after the grant.
      const page = await browser.newPage();
      sub = (await loginAs(page, ENV.SUBUSER)).identity ?? sub;
      await page.close();
    }

    // Media it may not: the admin's root scope.
    const foreign = await request.get(
      api('/file/read?limit=5&page=1&search=&type=&sort=createdAt&order=-1&folderId='),
      { headers: authHeaders(admin) },
    );
    foreignFile = ((await foreign.json()).docs ?? [])[0];

    // Playlists live in the PLAYLIST-folder namespace, which is distinct from
    // the media-folder namespace campaigns are filed under — same folder name,
    // different id — so it has to be resolved separately.
    const pf = await request.get(api('/playlist-folder/read?page=1&limit=100'), {
      headers: authHeaders(sub),
    });
    // Search EVERY assigned playlist folder, not just the first: a sub-user can
    // hold several, and only some of them contain playlists. Taking [0] made the
    // UI case fail on setup rather than on anything the product did.
    const playlistFolders = ((await pf.json()).playlistFolders ?? []) as Array<{
      id: string;
      name: string;
    }>;
    subPlaylistFolderCount = playlistFolders.length;

    // Prefer the playlist folder that CORRESPONDS to the media folder we chose:
    // the create-campaign modal offers the media of the folder the editor was
    // opened in, so a playlist from an empty folder gives the picker nothing to
    // select. The two namespaces only line up by name, which is why this is a
    // preference with a fallback rather than a lookup.
    const ordered = [
      ...playlistFolders.filter((f) => f.name === inScope.name),
      ...playlistFolders.filter((f) => f.name !== inScope.name),
    ];
    for (const folder of ordered) {
      const pls = await request.get(
        api(
          `/playlist/read?page=1&search=&limit=50&sort=createdAt&order=-1&isNotFolder=true&folderId=${folder.id}`,
        ),
        { headers: authHeaders(sub) },
      );
      const found = (((await pls.json()).docs ?? [])[0] ?? {}).id ?? '';
      if (found) {
        subPlaylistId = found;
        break;
      }
    }
  });

  test.beforeEach(() => {
    test.skip(
      sub === null || admin === null,
      `Cannot authenticate both identities on ${ENV.NAME}: ${skipReason}`,
    );
    test.skip(
      !ENV.ALLOW_DESTRUCTIVE,
      'Creates and deletes campaigns. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
    );
  });

  /** Remove this suite's artefacts from both folders, as whichever identity owns them. */
  test.afterAll(async ({ request }) => {
    if (!admin || !sub) return;

    // Give the role back before anything else — leaving it changed would alter
    // what every other suite, and every real user of that role, is allowed to do.
    if (subRole) await restoreRole(request, admin, subRole).catch(() => undefined);

    for (const [who, folder] of [
      [sub, inScope],
      [admin, outOfScope],
      [admin, { id: '', name: 'root' } as Folder],
    ] as const) {
      const r = await request.get(listUrl(folder.id), { headers: authHeaders(who) });
      if (!r.ok()) continue;
      const docs = ((await r.json()).docs ?? []) as Array<{ id: string; name: string }>;
      for (const d of docs.filter((x) => x.name.startsWith(PREFIX) || x.name.trim() === '')) {
        await request
          .delete(api(`/campaign/delete/${d.id}`), { headers: authHeaders(who) })
          .catch(() => undefined);
      }
    }
  });

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Create as the sub-user; returns status + parsed message. */
  async function subCreate(
    request: APIRequestContext,
    body: Record<string, unknown>,
  ): Promise<{ status: number; message: string; raw: string }> {
    const r = await request.post(api('/campaign/create'), {
      headers: authHeaders(sub!),
      data: body,
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

  /** Find a campaign by name in a folder, as a given identity. */
  async function findIn(
    request: APIRequestContext,
    who: Identity,
    folderId: string,
    name: string,
  ): Promise<{ id: string; name: string; folderId: string | null } | undefined> {
    const r = await request.get(listUrl(folderId), { headers: authHeaders(who) });
    if (!r.ok()) return undefined;
    return ((await r.json()).docs ?? []).find((d: { name: string }) => d.name === name);
  }

  /**
   * Delete every campaign in the sub-user's folder whose name matches exactly.
   *
   * Needed by the fixed-name boundary cases: campaign names are unique per
   * account, so a case that cannot randomise its name must clear its own
   * residue on both sides of the assertion or it only passes on a clean server.
   */
  async function purgeByExactName(request: APIRequestContext, name: string): Promise<void> {
    const r = await request.get(listUrl(inScope.id), { headers: authHeaders(sub!) });
    if (!r.ok()) return;
    const docs = ((await r.json()).docs ?? []) as Array<{ id: string; name: string }>;
    for (const d of docs.filter((x) => x.name === name)) {
      await request
        .delete(api(`/campaign/delete/${d.id}`), { headers: authHeaders(sub!) })
        .catch(() => undefined);
    }
  }

  /** Seed a campaign in the sub-user's own folder and return its id. */
  async function seedInScope(request: APIRequestContext, label = 'Seed'): Promise<{ id: string; name: string }> {
    const name = uniqueName(label);
    const res = await subCreate(request, {
      name,
      data: [{ file: subFileId, duration: 10 }],
      defaultDuration: 10,
      folderId: inScope.id,
    });
    expect(res.status, `seed must succeed: ${res.raw}`).toBe(200);
    const doc = await findIn(request, sub!, inScope.id, name);
    expect(doc, 'seeded campaign must be listed in the folder').toBeTruthy();
    return { id: doc!.id, name };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SMOKE — the permission actually granted
  // ═══════════════════════════════════════════════════════════════════════════

  test('SUBF-001 · sub-user CREATES a campaign inside its assigned folder @smoke @critical', async ({
    request,
  }) => {
    const name = uniqueName('Create');
    const res = await subCreate(request, {
      name,
      data: [{ file: subFileId, duration: 10 }],
      defaultDuration: 10,
      folderId: inScope.id,
    });

    expect(res.status, `create in an assigned folder must be allowed: ${res.raw}`).toBe(200);

    // Persistence is proven by read-back, never by the success message.
    const doc = await findIn(request, sub!, inScope.id, name);
    expect(doc, 'the campaign must exist on the server').toBeTruthy();
    expect(doc!.folderId, 'it must be filed in the folder it was created in').toBe(inScope.id);
  });

  test('SUBF-002 · the sub-user READS it in the folder, and the root list omits it @smoke', async ({
    request,
  }) => {
    const { name } = await seedInScope(request, 'Read');

    expect(await findIn(request, sub!, inScope.id, name), 'listed in its folder').toBeTruthy();
    // Foldered campaigns are not in the unfiltered list — for EITHER identity.
    // That is folder navigation working, not a permission denial.
    expect(await findIn(request, sub!, '', name), 'not in the sub-user root list').toBeUndefined();
  });

  test('SUBF-003 · the sub-user READS ONE by id @critical', async ({ request }) => {
    const { id, name } = await seedInScope(request, 'ReadOne');
    const r = await request.get(api(`/campaign/read/${id}`), { headers: authHeaders(sub!) });

    expect(r.status()).toBe(200);
    const doc = await r.json();
    expect(doc.name).toBe(name);
    expect(doc.folderId).toBe(inScope.id);
  });

  test('SUBF-004 · the sub-user UPDATES a campaign in its folder @critical', async ({ request }) => {
    const { id, name } = await seedInScope(request, 'Update');
    const renamed = `${name}_renamed`;

    const r = await request.post(api(`/campaign/update/${id}`), {
      headers: authHeaders(sub!),
      data: {
        name: renamed,
        data: [{ file: subFileId, duration: 15 }],
        defaultDuration: 15,
        folderId: inScope.id,
      },
    });
    expect(r.status(), `update must be allowed: ${(await r.text()).slice(0, 200)}`).toBe(200);

    const after = await request.get(api(`/campaign/read/${id}`), { headers: authHeaders(sub!) });
    const doc = await after.json();
    expect(doc.name, 'the rename must persist').toBe(renamed);
    expect(doc.folderId, 'the campaign must stay in its folder').toBe(inScope.id);
  });

  test('SUBF-005 · the sub-user DELETES its own campaign @critical @destructive', async ({
    request,
  }) => {
    const { id } = await seedInScope(request, 'Delete');

    const del = await request.delete(api(`/campaign/delete/${id}`), { headers: authHeaders(sub!) });
    expect(del.status(), `delete must be allowed: ${(await del.text()).slice(0, 200)}`).toBe(200);

    const after = await request.get(api(`/campaign/read/${id}`), { headers: authHeaders(sub!) });
    expect(after.ok(), 'the campaign must be gone after deletion').toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  NEGATIVE — where the campaign may be filed
  // ═══════════════════════════════════════════════════════════════════════════

  test('SUBF-010 · create in an UNASSIGNED folder is refused @negative @critical', async ({
    request,
  }) => {
    const name = uniqueName('OutOfScope');
    const res = await subCreate(request, {
      name,
      data: [{ file: subFileId, duration: 10 }],
      defaultDuration: 10,
      folderId: outOfScope.id,
    });

    expect(res.status, `expected a clean denial, got: ${res.raw}`).toBe(403);
    expect(res.message).toMatch(/access denied to this folder/i);

    // A denial that still writes is the failure mode worth checking for.
    expect(
      await findIn(request, admin!, outOfScope.id, name),
      'nothing may be written into a folder the sub-user was denied',
    ).toBeUndefined();
  });

  test('SUBF-011 · a restricted sub-user cannot create at the ROOT @negative @critical', async ({
    request,
  }) => {
    const res = await subCreate(request, {
      name: uniqueName('Root'),
      data: [{ file: subFileId, duration: 10 }],
      defaultDuration: 10,
      folderId: null,
    });

    expect(res.status, `expected a clean denial, got: ${res.raw}`).toBe(403);
    expect(res.message).toMatch(/only create campaigns inside a folder you have access to/i);
  });

  /**
   * Three spellings of "no folder". All must land on the SAME rule — a gap in
   * any one of them would be a way around the fence, which is exactly the kind
   * of hole a restricted role is supposed to close.
   */
  const NO_FOLDER: Array<[string, Record<string, unknown>]> = [
    ['omitted entirely', {}],
    ['empty string', { folderId: '' }],
    ['malformed id', { folderId: 'not-an-objectid' }],
  ];

  for (const [label, override] of NO_FOLDER) {
    test(`SUBF-012 · folderId ${label} is refused, not defaulted to root @negative @boundary`, async ({
      request,
    }) => {
      const res = await subCreate(
        request,
        payload({ data: [{ file: subFileId, duration: 10 }], ...override }),
      );

      expect(res.status, `expected a denial, got: ${res.raw}`).toBe(403);
      expect(res.message).toMatch(/only create campaigns inside a folder you have access to/i);
    });
  }

  test('SUBF-015 · a well-formed but unknown folder id is a 400, not a silent root write @negative @boundary', async ({
    request,
  }) => {
    const name = uniqueName('Ghost');
    const res = await subCreate(request, {
      name,
      data: [{ file: subFileId, duration: 10 }],
      defaultDuration: 10,
      folderId: '000000000000000000000000',
    });

    // BUG-CMP-10 records that an invalid folderId is silently coerced to null
    // for the ADMIN. For a restricted sub-user the folder is resolved first, so
    // the request is rejected outright — the safer behaviour.
    expect(res.status, `expected 400 Folder not found, got: ${res.raw}`).toBe(400);
    expect(res.message).toMatch(/folder not found/i);
    expect(
      await findIn(request, admin!, '', name),
      'a rejected create must not leave a campaign at the root',
    ).toBeUndefined();
  });

  test('SUBF-016 · listing an unassigned folder is refused @negative @security', async ({
    request,
  }) => {
    const r = await request.get(listUrl(outOfScope.id), { headers: authHeaders(sub!) });
    expect(r.status()).toBe(403);
    expect((await r.json()).message).toMatch(/access denied to this folder/i);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  SECURITY — escalation and IDOR
  // ═══════════════════════════════════════════════════════════════════════════

  test('SUBF-020 · the sub-user cannot MOVE its campaign into an unassigned folder @security @critical', async ({
    request,
  }) => {
    const { id, name } = await seedInScope(request, 'Move');

    const r = await request.post(api(`/campaign/update/${id}`), {
      headers: authHeaders(sub!),
      data: {
        name,
        data: [{ file: subFileId, duration: 10 }],
        defaultDuration: 10,
        folderId: outOfScope.id,
      },
    });
    expect(r.status(), 'moving content out of your own scope is privilege escalation').toBe(403);

    // The decisive check: the denial must also mean nothing moved.
    const after = await request.get(api(`/campaign/read/${id}`), { headers: authHeaders(sub!) });
    expect((await after.json()).folderId, 'the campaign must still be in its original folder').toBe(
      inScope.id,
    );
  });

  test('SUBF-021 · the sub-user cannot move its campaign to the ROOT @security', async ({
    request,
  }) => {
    const { id, name } = await seedInScope(request, 'MoveRoot');

    const r = await request.post(api(`/campaign/update/${id}`), {
      headers: authHeaders(sub!),
      data: { name, data: [{ file: subFileId, duration: 10 }], defaultDuration: 10, folderId: null },
    });
    expect(r.status()).toBe(403);

    const after = await request.get(api(`/campaign/read/${id}`), { headers: authHeaders(sub!) });
    expect((await after.json()).folderId, 'the campaign must not escape to the root').toBe(inScope.id);
  });

  test('SUBF-022 · IDOR — read/update/delete of a campaign in an unassigned folder @security @critical', async ({
    request,
  }) => {
    // Seed as the ADMIN, inside a folder the sub-user has no access to.
    const name = uniqueName('Foreign');
    const mk = await request.post(api('/campaign/create'), {
      headers: authHeaders(admin!),
      data: {
        name,
        data: [{ file: foreignFile.id, duration: 10 }],
        defaultDuration: 10,
        folderId: outOfScope.id,
      },
    });
    expect(mk.status(), 'admin seed must succeed').toBe(200);
    const target = await findIn(request, admin!, outOfScope.id, name);
    expect(target, 'admin seed must be listed').toBeTruthy();

    const attempts = {
      read: await request.get(api(`/campaign/read/${target!.id}`), { headers: authHeaders(sub!) }),
      update: await request.post(api(`/campaign/update/${target!.id}`), {
        headers: authHeaders(sub!),
        data: {
          name: `${PREFIX}hijacked`,
          data: [{ file: subFileId, duration: 10 }],
          defaultDuration: 10,
          folderId: outOfScope.id,
        },
      }),
      delete: await request.delete(api(`/campaign/delete/${target!.id}`), {
        headers: authHeaders(sub!),
      }),
    };

    for (const [verb, res] of Object.entries(attempts)) {
      expect(res.status(), `${verb} on a foreign-folder campaign must be denied`).toBe(403);
      expect((await res.json()).message).toMatch(/don't have access to this campaign/i);
    }

    // Denied means untouched — proven from the admin's side, not from the error.
    const still = await findIn(request, admin!, outOfScope.id, name);
    expect(still, 'the campaign must survive the denied delete').toBeTruthy();
    expect(still!.name, 'the campaign must survive the denied update unrenamed').toBe(name);
  });

  test('SUBF-025 · an anonymous request cannot create anything @security @negative', async ({
    request,
  }) => {
    const r = await request.post(api('/campaign/create'), {
      headers: { 'Content-Type': 'application/json' },
      data: {
        name: uniqueName('Anon'),
        data: [{ file: subFileId, duration: 10 }],
        defaultDuration: 10,
        folderId: inScope.id,
      },
    });
    expect(r.status(), 'no token must mean 401 before any folder logic runs').toBe(401);
  });

  test('SUBF-026 · a campaign item may reference media OUTSIDE the folder fence @security @defect', async ({
    request,
  }) => {
    // The fence covers where a campaign is FILED. It does not cover what a
    // campaign item POINTS AT.
    //
    // Establish the fence first: this file is not in the sub-user's library.
    const own = await request.get(
      api('/file/read?limit=100&page=1&search=&type=&sort=createdAt&order=-1&folderId='),
      { headers: authHeaders(sub!) },
    );
    const visible = ((await own.json()).docs ?? []).some(
      (d: { id: string }) => d.id === foreignFile.id,
    );
    expect(visible, 'precondition: the foreign file must NOT be in the sub-user library').toBe(false);

    const name = uniqueName('Leak');
    const res = await subCreate(request, {
      name,
      data: [{ file: foreignFile.id, duration: 10 }],
      defaultDuration: 10,
      folderId: inScope.id,
    });
    expect(res.status, 'the create is accepted — item media is not scope-checked').toBe(200);

    const doc = await findIn(request, sub!, inScope.id, name);
    const one = await request.get(api(`/campaign/read/${doc!.id}`), { headers: authHeaders(sub!) });
    const item = (await one.json()).data[0];

    expect(
      item.file.id === foreignFile.id && Boolean(item.file.name) && Boolean(item.file.thumb),
      'BUG-SUBF-01: by referencing an id it cannot list, the sub-user receives the ' +
        "foreign file's name, type and a working CDN thumbnail URL. Campaign item " +
        'media must be validated against the caller\'s folder scope on write.',
    ).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  BOUNDARY VALUE ANALYSIS — inside the folder the sub-user owns
  // ═══════════════════════════════════════════════════════════════════════════

  test('SUBF-030 · an empty name is the only field rule enforced @boundary @negative', async ({
    request,
  }) => {
    const res = await subCreate(request, {
      name: '',
      data: [{ file: subFileId, duration: 10 }],
      defaultDuration: 10,
      folderId: inScope.id,
    });
    expect(res.status).toBe(400);
    expect(res.message).toMatch(/name.*not allowed to be empty/i);
  });

  /**
   * Name boundaries. All of these are ACCEPTED today, which is the finding:
   * there is no maximum length and no trim, so a whitespace-only campaign is
   * indistinguishable from an unnamed one in the picker. Matches BUG-CMP-08 /
   * BUG-CMP-09, here confirmed to apply to the sub-user path too.
   */
  const NAME_CASES: Array<[string, string]> = [
    ['single character', 'A'],
    ['256 characters', 'N'.repeat(256)],
    ['1000 characters', 'N'.repeat(1000)],
    ['whitespace only', '   '],
  ];

  for (const [label, value] of NAME_CASES) {
    test(`SUBF-031 · name: ${label} is accepted unvalidated @boundary @defect`, async ({
      request,
    }) => {
      // These names are FIXED by definition — a 1-character name cannot also
      // carry a unique suffix — and campaign names are unique per account. So
      // this case owns its own lifecycle: purge, create, assert, purge. Without
      // the leading purge the second run of the suite collides with its own
      // residue and reports a product 400 that is really a test artefact.
      await purgeByExactName(request, value);

      const res = await subCreate(request, {
        name: value,
        data: [{ file: subFileId, duration: 10 }],
        defaultDuration: 10,
        folderId: inScope.id,
      });
      expect(
        res.status,
        `BUG-CMP-08/09: no maximum length and no trim on the campaign name (${label}) — ${res.raw}`,
      ).toBe(200);

      await purgeByExactName(request, value);
    });
  }

  /**
   * Duration boundaries — zero, negative and fractional are all stored. A zero
   * or negative slide duration is not playable, so this is a data-integrity
   * hole rather than a cosmetic one (BUG-CMP-04).
   */
  const DURATIONS: Array<[string, number]> = [
    ['zero', 0],
    ['negative', -5],
    ['fractional', 2.5],
    ['very large', 999_999],
  ];

  for (const [label, value] of DURATIONS) {
    test(`SUBF-032 · defaultDuration: ${label} is accepted @boundary @defect`, async ({
      request,
    }) => {
      const res = await subCreate(request, {
        name: uniqueName(`Dur_${label.replace(/\s/g, '')}`),
        data: [{ file: subFileId, duration: value }],
        defaultDuration: value,
        folderId: inScope.id,
      });
      expect(res.status, `BUG-CMP-04: duration ${value} should be rejected`).toBe(200);
    });
  }

  test('SUBF-033 · a campaign with ZERO media items is accepted @boundary @defect', async ({
    request,
  }) => {
    const res = await subCreate(request, {
      name: uniqueName('Empty'),
      data: [],
      defaultDuration: 10,
      folderId: inScope.id,
    });
    // The UI blocks this ("Add at least one media item."); the API does not.
    expect(res.status, 'BUG-CMP-01: an item-less campaign has nothing to play').toBe(200);
  });

  test('SUBF-034 · a non-existent media id is accepted — no referential integrity @boundary @defect', async ({
    request,
  }) => {
    const name = uniqueName('BogusFile');
    const res = await subCreate(request, {
      name,
      data: [{ file: '000000000000000000000000', duration: 10 }],
      defaultDuration: 10,
      folderId: inScope.id,
    });
    expect(res.status, 'a campaign item may point at a media id that does not exist').toBe(200);

    // Confirm what the reader does with a dangling reference.
    const doc = await findIn(request, sub!, inScope.id, name);
    const one = await request.get(api(`/campaign/read/${doc!.id}`), { headers: authHeaders(sub!) });
    const body = await one.json();
    expect(
      body.data,
      'BUG-SUBF-02: a dangling media reference is stored and returned, so the player ' +
        'receives an item it cannot resolve',
    ).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  INTEGRATION — the two identities, and the real UI path
  // ═══════════════════════════════════════════════════════════════════════════

  test('SUBF-040 · the admin sees the sub-user\'s campaign only via the folder @integration', async ({
    request,
  }) => {
    const { name } = await seedInScope(request, 'Cross');

    expect(
      await findIn(request, admin!, inScope.id, name),
      'the account owner must be able to see what its sub-user created',
    ).toBeTruthy();
    expect(
      await findIn(request, admin!, '', name),
      '…but only inside the folder — the unfiltered list is root-only',
    ).toBeUndefined();
  });

  test('SUBF-041 · the sub-user creates a campaign through the real UI path @integration @ui @smoke', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    // Campaigns have no sidebar entry: the only UI is picker tab 4 inside a
    // playlist editor. For a restricted sub-user that playlist lives inside its
    // folder, so the whole path is folder → playlist → editor → Campaigns.
    const context = await browser.newContext();
    const page = await context.newPage();
    const name = uniqueName('UI');

    try {
      const outcome = await loginAs(page, ENV.SUBUSER);
      expect(outcome.identity, 'sub-user must be able to log in').toBeTruthy();

      expect(subPlaylistId, 'the sub-user must have a playlist to open').toBeTruthy();

      // The scoped view: the sub-user's /playlists shows its folder, and no
      // playlists at the root — everything it owns is inside the folder.
      await page.goto('/playlists');
      // Assert the scope by COUNT rather than by folder name. The name is not a
      // reliable target here: the same string also appears as an <option> in a
      // hidden move-to-folder <select>, and the folder cards carry no accessible
      // text of their own. The count is what the fence actually determines.
      await expect(
        page.getByRole('heading', { name: /folders\s*\(/i }).first(),
        'the sub-user must land on a folder-scoped playlists view',
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole('heading', { name: /folders\s*\(/i }).first(),
        `the sub-user must see exactly the ${subPlaylistFolderCount} playlist folder(s) it is assigned`,
      ).toHaveText(new RegExp(`\\(\\s*${subPlaylistFolderCount}\\s*\\)`));

      await page.goto(`/playlist-settings/${subPlaylistId}`);
      await expect(
        page.locator('#composer'),
        'the sub-user must be able to open a playlist inside its folder',
      ).toBeVisible({ timeout: 30_000 });

      await page.getByRole('button', { name: /^campaigns$/i }).first().click();
      const newBtn = page.locator('button[data-bs-target="#createCampaign"]').first();
      await expect(newBtn, 'the sub-user has campaigns.create, so New must be offered').toBeVisible({
        timeout: 20_000,
      });

      await newBtn.click();
      const modal = page.locator('#createCampaign');
      await modal.locator('#name').fill(name);

      // The media picker opens inside the playlist's own folder, which may hold
      // no files. It is folder-navigable, so step out and into a folder that
      // does — the sub-user only ever sees its assigned folders here, which is
      // itself the fence working.
      const active = modal.getByRole('heading', { name: /active media\s*\(/i }).first();
      const tile = modal.locator('div.card:has(> img.rounded-2)').first();

      /** Click the first tile and report whether it became an active item. */
      const selectMedia = async (): Promise<boolean> => {
        if (!(await tile.isVisible({ timeout: 8_000 }).catch(() => false))) return false;
        await tile.click();
        return expect
          .poll(async () => (await active.textContent().catch(() => '')) ?? '', { timeout: 10_000 })
          .toMatch(/\([1-9]/)
          .then(() => true)
          .catch(() => false);
      };

      let selected = await selectMedia();
      if (!selected) {
        // Step up and into each assigned folder until one yields real media —
        // a folder card looks like a media tile but cannot be added.
        await modal
          .getByRole('button', { name: /back/i })
          .first()
          .click()
          .catch(() => undefined);
        for (const folder of [inScope.name]) {
          await modal
            .getByText(folder, { exact: true })
            .first()
            .click({ timeout: 10_000 })
            .catch(() => undefined);
          selected = await selectMedia();
          if (selected) break;
        }
      }

      // Without a selectable file the dialog keeps "Create Campaign" disabled by
      // design ("Add at least one media item."), so there is no UI create to
      // observe. That is a data precondition, not a product result — say so
      // rather than reporting a failure the product did not cause.
      test.skip(
        !selected,
        'No selectable media inside the sub-user\'s playlist folder on this environment, ' +
          'so the create-campaign dialog cannot be completed through the UI.',
      );
      // Arm both waits immediately BEFORE the submit — the request only fires on
      // this click, and arming them earlier leaves them pending across any
      // skip. A toast is time-limited evidence (~11 s) and proves only that a
      // message appeared; the create request proves what was actually sent, and
      // the response proves what the server did with it.
      const sent = page.waitForRequest((r) => /\/campaign\/create/.test(r.url()), {
        timeout: 30_000,
      });
      const answered = page.waitForResponse((r) => /\/campaign\/create/.test(r.url()), {
        timeout: 30_000,
      });

      await modal
        .getByRole('button', { name: /create campaign/i })
        .first()
        .click();

      const body = JSON.parse((await sent).postData() ?? '{}');
      // The point is that the UI supplies a folder the sub-user is assigned to,
      // entirely on its own: there is no folder control in this dialog, and a
      // root create would be refused. WHICH assigned folder it derives depends
      // on the playlist the editor was opened from, so pinning one id would be
      // asserting the fixture rather than the fence.
      expect(
        subFolderIds,
        'the editor must file the campaign in a folder the sub-user has access to',
      ).toContain(body.folderId);

      const response = await answered;
      expect(
        response.status(),
        `the sub-user's UI create must succeed: ${(await response.text()).slice(0, 200)}`,
      ).toBe(200);
    } finally {
      await context.close();
    }
  });
});
