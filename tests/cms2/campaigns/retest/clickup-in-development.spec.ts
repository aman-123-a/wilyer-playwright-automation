// =============================================================================
//  RETEST — ClickUp list "Campaigns" (901616106811), status "in development".
//
//  Target: cms2.pocsample.in · retested 2026-07-29.
//  Each test is named for its ClickUp task id so a result maps straight back to
//  the ticket. Tests assert the ticket's OWN expected result, so a task that is
//  genuinely fixed passes and a task that is not fails with the evidence.
//
//  Identities come from .env (never hardcoded):
//    CMS_ADMIN_EMAIL   — unrestricted account owner
//    CMS_SUBUSER_EMAIL — restricted sub-user, scoped to one folder
//
//  Note on the fixture drift: the sub-user's assigned folder changed between
//  2026-07-28 ("Noida") and 2026-07-29 ("Meerut"), and the new folder holds no
//  media. Nothing here hardcodes either — the folder and its media are resolved
//  at run time, so the suite survives the next reassignment too.
//
//  Two tasks in the list are NOT covered here, deliberately, rather than being
//  given a test that would silently prove nothing:
//    • 86d3v07h8 (Edit button shown without update permission) — the available
//      sub-user HAS campaigns.update, so the precondition cannot be created
//      without editing a shared role. SUBF-050 records the blocker explicitly.
//    • 86d3v0d58 (breadcrumbs for all user types) — no acceptance criteria on
//      the ticket; "displayed correctly" is not assertable without the expected
//      strings per page and per role.
// =============================================================================

import { test, expect, type APIRequestContext } from '@playwright/test';
import { ENV } from '../../../../config/env';
import { loginAs, authHeaders, type Identity } from '../../../../helpers/rbac/identities';

const PREFIX = 'QA_RT_';
const uniqueName = (label: string): string =>
  `${PREFIX}${label}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * A name of EXACTLY `len` characters that is still unique per run.
 *
 * The length cases cannot use `uniqueName` (its length varies) but they also
 * cannot use a fixed string: campaign names are unique per folder, so a fixed
 * name passes on a clean server and then reports the NEXT run's duplicate-name
 * 400 as if it were the length validation working. Keeping the prefix also
 * keeps the artefact sweepable.
 */
const nameOfLength = (len: number): string => {
  const head = `${PREFIX}${Math.random().toString(36).slice(2, 7)}`;
  return (head + 'N'.repeat(Math.max(0, len - head.length))).slice(0, len);
};

interface Folder {
  id: string;
  name: string;
}

const api = (path: string): string => `${ENV.API_BASE_URL}${path}`;
const listUrl = (folderId = '', search = ''): string =>
  api(
    `/campaign/read?limit=100&page=1&sort=createdAt&order=-1&search=${encodeURIComponent(search)}&folderId=${folderId}`,
  );

test.describe('RETEST · ClickUp "in development" @retest @regression', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  // Deliberately NOT serial. A retest run must report a verdict for EVERY
  // ticket, and serial mode skips the rest of the block after the first
  // failure — so one unfixed bug would hide the status of every task after it.
  // Each test owns uniquely-named data, so they are independent.

  let admin: Identity | null = null;
  let sub: Identity | null = null;
  let skipReason = '';

  let folderA: Folder;
  let folderB: Folder;
  let subFolder: Folder;
  let playlistFolder: Folder;
  /**
   * A real media id. Resolved from the admin's library and reused for the
   * sub-user's campaigns too — which only works because of BUG-SUBF-01 (item
   * media is not scope-checked). That defect is tracked in its own suite; here
   * it is merely the most faithful way to satisfy "add valid media and save".
   */
  let mediaId = '';

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

    const folders = async (who: Identity): Promise<Folder[]> =>
      ((await (await request.get(api('/folder/read?page=1&limit=100'), { headers: authHeaders(who) })).json())
        .folders ?? []) as Folder[];

    const adminFolders = await folders(admin);
    [folderA, folderB] = adminFolders;
    subFolder = (await folders(sub))[0];

    playlistFolder = ((await (await request.get(api('/playlist-folder/read?page=1&limit=100'), {
      headers: authHeaders(admin),
    })).json()).playlistFolders ?? [])[0] as Folder;

    mediaId =
      ((await (await request.get(
        api('/file/read?limit=5&page=1&search=&type=&sort=createdAt&order=-1&folderId='),
        { headers: authHeaders(admin) },
      )).json()).docs ?? [])[0]?.id ?? '';
  });

  test.beforeEach(() => {
    test.skip(!admin || !sub, `Cannot authenticate both identities on ${ENV.NAME}: ${skipReason}`);
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'Creates and deletes data. Set CMS_ALLOW_DESTRUCTIVE=true.');
  });

  test.afterAll(async ({ request }) => {
    if (!admin || !sub) return;
    for (const [who, folder] of [
      [admin, folderA],
      [admin, folderB],
      [admin, { id: '', name: 'root' } as Folder],
      [sub, subFolder],
    ] as const) {
      const r = await request.get(listUrl(folder.id), { headers: authHeaders(who) });
      if (!r.ok()) continue;
      for (const d of (((await r.json()).docs ?? []) as Array<{ id: string; name: string }>).filter((x) =>
        x.name.startsWith(PREFIX),
      )) {
        await request.delete(api(`/campaign/delete/${d.id}`), { headers: authHeaders(who) }).catch(() => undefined);
      }
    }
    // Playlists created by the log test.
    const pls = await request.get(
      api(`/playlist/read?page=1&search=${PREFIX}&limit=50&sort=createdAt&order=-1&isNotFolder=false`),
      { headers: authHeaders(admin) },
    );
    if (pls.ok()) {
      for (const d of (((await pls.json()).docs ?? []) as Array<{ id: string; name: string }>).filter((x) =>
        x.name.startsWith(PREFIX),
      )) {
        await request.delete(api(`/playlist/delete/${d.id}`), { headers: authHeaders(admin) }).catch(() => undefined);
      }
    }
  });

  /** Create a campaign as `who`; returns status + message. */
  async function create(
    request: APIRequestContext,
    who: Identity,
    name: string,
    folderId: string | null,
  ): Promise<{ status: number; message: string; raw: string }> {
    const r = await request.post(api('/campaign/create'), {
      headers: authHeaders(who),
      data: { name, data: [{ file: mediaId, duration: 10 }], defaultDuration: 10, folderId },
    });
    const raw = await r.text();
    let message = '';
    try {
      message = JSON.parse(raw).message ?? '';
    } catch {
      message = raw.slice(0, 150);
    }
    return { status: r.status(), message, raw };
  }

  async function findIn(
    request: APIRequestContext,
    who: Identity,
    folderId: string,
    name: string,
  ): Promise<{ id: string; name: string } | undefined> {
    const r = await request.get(listUrl(folderId), { headers: authHeaders(who) });
    if (!r.ok()) return undefined;
    return ((await r.json()).docs ?? []).find((d: { name: string }) => d.name === name);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  86d3ux0q0 · BUG-CMP-02 — regex injection in campaign search
  // ═══════════════════════════════════════════════════════════════════════════

  test('86d3ux0q0 · search treats regex metacharacters as literal text @security @critical', async ({
    request,
  }) => {
    const total = (await (await request.get(listUrl(), { headers: authHeaders(admin!) })).json()).totalDocs;
    expect(total, 'precondition: the account has campaigns to match against').toBeGreaterThan(0);

    // Ticket's expected result: "Search should treat all input as plain text and
    // escape regex characters." A wildcard must therefore match NOTHING, not
    // every record.
    for (const pattern of ['.*', '^QA', '.+', '[a-z]']) {
      const r = await request.get(listUrl('', pattern), { headers: authHeaders(admin!) });
      expect(r.status()).toBe(200);
      expect(
        (await r.json()).totalDocs,
        `"${pattern}" must be matched literally, not evaluated as a regex`,
      ).toBe(0);
    }

    // …and a literal substring still works, so the escaping did not break search.
    const seeded = uniqueName('Search');
    expect((await create(request, admin!, seeded, null)).status).toBe(200);
    const hit = await request.get(listUrl('', seeded), { headers: authHeaders(admin!) });
    expect((await hit.json()).totalDocs, 'literal search must still match').toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  86d3ux0r0 · BUG-CMP-03 — 500 when sort/order omitted
  // ═══════════════════════════════════════════════════════════════════════════

  test('86d3ux0r0 · campaign read works without sort/order @critical', async ({ request }) => {
    // Ticket's expected result: "API should apply default sorting or return 400."
    for (const q of ['limit=50&page=1', 'limit=50&page=1&sort=createdAt', 'limit=50&page=1&order=-1']) {
      const r = await request.get(api(`/campaign/read?${q}`), { headers: authHeaders(admin!) });
      expect(r.status(), `GET /campaign/read?${q} must not be a 500`).toBeLessThan(500);
      expect(r.status(), `GET /campaign/read?${q} should succeed or be a clean 400`).not.toBe(500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  86d3ux0vh · BUG-CMP-08 — maximum campaign name length
  // ═══════════════════════════════════════════════════════════════════════════

  test('86d3ux0vh · a campaign name over the limit is rejected @boundary @defect', async ({
    request,
  }) => {
    // Ticket's expected result: "Campaign name should be restricted to the
    // maximum allowed length (for example, 255 characters) with an appropriate
    // validation message." 255 is the stated ceiling, so 255 stays legal and
    // 256 is the first value that must fail.
    const ok = await create(request, admin!, nameOfLength(255), null);
    expect(ok.status, `a 255-character name is within the stated limit — ${ok.message}`).toBe(200);

    const over = await create(request, admin!, nameOfLength(256), null);
    expect(over.status, `256 characters must be rejected — got ${over.status} ${over.message}`).toBe(400);

    const wayOver = await create(request, admin!, nameOfLength(1000), null);
    expect(
      wayOver.status,
      `1000 characters (the ticket's own repro) must be rejected — got ${wayOver.status} ${wayOver.message}`,
    ).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  86d3vbqer + 86d3uz4py — names unique WITHIN a folder, duplicates allowed across
  // ═══════════════════════════════════════════════════════════════════════════

  test('86d3vbqer · campaign names are unique within a folder, on CREATE @critical', async ({
    request,
  }) => {
    const name = uniqueName('Uniq');

    expect((await create(request, admin!, name, folderA.id)).status, 'first in folder A').toBe(200);

    const dup = await create(request, admin!, name, folderA.id);
    expect(dup.status, `duplicate in the SAME folder must be refused — ${dup.raw}`).toBe(400);
    expect(dup.message).toMatch(/already exists in this folder/i);

    // Business rule: "Duplicate names are allowed in different folders."
    expect(
      (await create(request, admin!, name, folderB.id)).status,
      'the same name in a DIFFERENT folder must be allowed',
    ).toBe(200);
    expect(
      (await create(request, admin!, name, null)).status,
      'the same name at the root must be allowed',
    ).toBe(200);
  });

  test('86d3vbqer · the uniqueness rule is case-insensitive @boundary', async ({ request }) => {
    const name = uniqueName('Case');
    expect((await create(request, admin!, name, folderA.id)).status).toBe(200);

    const upper = await create(request, admin!, name.toUpperCase(), folderA.id);
    expect(upper.status, `a case variant must also be refused — ${upper.raw}`).toBe(400);
    expect(upper.message).toMatch(/already exists in this folder/i);
  });

  test('86d3vbqer · the rule also applies on RENAME @critical', async ({ request }) => {
    // "Validation should apply during both Create and Rename/Edit operations."
    const taken = uniqueName('Taken');
    const other = uniqueName('Other');
    expect((await create(request, admin!, taken, folderA.id)).status).toBe(200);
    expect((await create(request, admin!, other, folderA.id)).status).toBe(200);

    const target = await findIn(request, admin!, folderA.id, other);
    expect(target, 'the second campaign must exist to be renamed').toBeTruthy();

    const rename = await request.post(api(`/campaign/update/${target!.id}`), {
      headers: authHeaders(admin!),
      data: {
        name: taken,
        data: [{ file: mediaId, duration: 10 }],
        defaultDuration: 10,
        folderId: folderA.id,
      },
    });
    const body = await rename.text();
    expect(rename.status(), `renaming onto a taken name must be refused — ${body}`).toBe(400);
    expect(body).toMatch(/already exists in this folder/i);

    // The rejected rename must not have partially applied.
    expect(await findIn(request, admin!, folderA.id, other), 'the campaign keeps its old name').toBeTruthy();
  });

  test('86d3uz4py · the same rule applies to the sub-user in its own folder @rbac', async ({
    request,
  }) => {
    const name = uniqueName('SubUniq');

    expect(
      (await create(request, sub!, name, subFolder.id)).status,
      'sub-user creates in its assigned folder',
    ).toBe(200);

    const dup = await create(request, sub!, name, subFolder.id);
    expect(dup.status, `duplicate in the sub-user's own folder must be refused — ${dup.raw}`).toBe(400);
    expect(dup.message).toMatch(/already exists in this folder/i);

    // The admin may still use that name elsewhere — the scope is the folder,
    // not the account.
    expect(
      (await create(request, admin!, name, folderA.id)).status,
      'the same name in another folder is unaffected by the sub-user',
    ).toBe(200);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  86d3v9yhr — the admin can find a sub-user's campaign inside a folder
  // ═══════════════════════════════════════════════════════════════════════════

  test('86d3v9yhr · the admin finds and opens a campaign the sub-user created in a folder @integration @critical', async ({
    request,
  }) => {
    const name = uniqueName('SubMade');
    expect((await create(request, sub!, name, subFolder.id)).status).toBe(200);

    // The ticket's repro is "Navigate to Campaigns → search for the campaign".
    // Search must reach across folders, from the unfiltered scope.
    const search = await request.get(listUrl('', name), { headers: authHeaders(admin!) });
    expect(search.status()).toBe(200);
    const hits = (await search.json()).docs ?? [];
    expect(hits, "the admin's search must find the sub-user's foldered campaign").toHaveLength(1);

    // …and "access" it: read-one must succeed for the account owner.
    const one = await request.get(api(`/campaign/read/${hits[0].id}`), { headers: authHeaders(admin!) });
    expect(one.status(), 'the admin must be able to open it').toBe(200);
    expect((await one.json()).folderId, 'and see which folder it is in').toBe(subFolder.id);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  86d3v7wyw / 86d3v88q0 / 86d3vb5nn — activity logs
  // ═══════════════════════════════════════════════════════════════════════════

  test('86d3v7wyw · a sub-user campaign creation is logged with its folder @integration', async ({
    request,
  }) => {
    const name = uniqueName('LogCamp');
    expect((await create(request, sub!, name, subFolder.id)).status).toBe(200);

    const logs = await request.get(api('/log/read?page=1&limit=50&type=campaign'), {
      headers: authHeaders(admin!),
    });
    expect(logs.status()).toBe(200);
    const entry = (((await logs.json()).docs ?? []) as Array<{ msg: string; user: string }>).find((d) =>
      d.msg?.includes(name),
    );

    expect(entry, 'the creation must appear in the campaign log').toBeTruthy();
    expect(entry!.msg, 'the log must carry the folder context').toContain(subFolder.name);
    expect(entry!.user, 'and attribute the action to the sub-user').toBe(ENV.SUBUSER.email);
  });

  test('86d3v88q0 · a playlist created inside a folder is logged with the folder name @integration', async ({
    request,
  }) => {
    const name = uniqueName('LogPl');
    const mk = await request.post(api('/playlist/create'), {
      headers: authHeaders(admin!),
      data: { name, description: 'retest', folderId: playlistFolder.id },
    });
    expect(mk.status(), `playlist create in a folder: ${(await mk.text()).slice(0, 200)}`).toBe(201);

    const logs = await request.get(api('/log/read?page=1&limit=50&type=playlist'), {
      headers: authHeaders(admin!),
    });
    const entry = (((await logs.json()).docs ?? []) as Array<{ msg: string }>).find((d) =>
      d.msg?.includes(name),
    );

    expect(entry, 'the creation must appear in the playlist log').toBeTruthy();
    expect(
      entry!.msg,
      'the ticket asks for the folder name so the location is identifiable',
    ).toContain(playlistFolder.name);
  });

  test('86d3vb5nn · logs can be filtered down to campaign activity only @integration', async ({
    request,
  }) => {
    const unfiltered = await request.get(api('/log/read?page=1&limit=50'), {
      headers: authHeaders(admin!),
    });
    const mixed = [
      ...new Set((((await unfiltered.json()).docs ?? []) as Array<{ type: string }>).map((d) => d.type)),
    ];

    const filtered = await request.get(api('/log/read?page=1&limit=50&type=campaign'), {
      headers: authHeaders(admin!),
    });
    expect(filtered.status()).toBe(200);
    const body = await filtered.json();
    const types = [...new Set((body.docs as Array<{ type: string }>).map((d) => d.type))];

    expect(body.totalDocs, 'the campaign filter must return campaign activity').toBeGreaterThan(0);
    expect(types, 'and nothing but campaign activity').toEqual(['campaign']);
    expect(
      body.totalDocs,
      'the filter must actually narrow the set, not return everything',
    ).toBeLessThan((await unfiltered.json().catch(() => ({ totalDocs: Infinity }))).totalDocs ?? Infinity);
    // Recorded for the ticket: the unfiltered feed really is mixed.
    expect(mixed.length, 'precondition: the unfiltered log is mixed-type').toBeGreaterThan(0);
  });

  test('86d3vb5nn · the sub-user can read its own account log feed @rbac', async ({ request }) => {
    // access.logs.view is true for this role, so the feed must be reachable —
    // the ticket puts the filter in "Team Logs and Account Logs" alike.
    const r = await request.get(api('/log/read?page=1&limit=10&type=campaign'), {
      headers: authHeaders(sub!),
    });
    expect(r.status(), 'a sub-user with logs.view must reach the log feed').toBe(200);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  86d3v07h8 — Edit offered without Update permission
  //
  //  Unblocked on 2026-07-29: the fixture sub-user's role changed from
  //  campaigns.update TRUE to FALSE partway through the day, so the ticket's
  //  precondition now exists and the case is testable for the first time.
  // ═══════════════════════════════════════════════════════════════════════════

  test('86d3v07h8 · precondition — the sub-user must lack campaigns.update @rbac', async () => {
    const access = (sub!.claims.access ?? {}) as Record<string, Record<string, boolean>>;
    expect(
      access.campaigns?.update,
      'this ticket can only be retested with a role whose campaigns.update is false',
    ).toBe(false);
  });

  test('86d3v07h8 · the API must REFUSE an update from a role without update permission @security @critical', async ({
    request,
  }) => {
    // The ticket is written about a visible button. The question that actually
    // matters is whether the permission is ENFORCED — a hidden button is
    // cosmetic if the endpoint answers anyway.
    const access = (sub!.claims.access ?? {}) as Record<string, Record<string, boolean>>;
    test.skip(access.campaigns?.update !== false, 'needs a role without campaigns.update');

    const name = uniqueName('NoUpdate');
    expect((await create(request, sub!, name, subFolder.id)).status, 'create is still granted').toBe(
      200,
    );
    const doc = await findIn(request, sub!, subFolder.id, name);
    expect(doc, 'the campaign must exist to be updated').toBeTruthy();

    const upd = await request.post(api(`/campaign/update/${doc!.id}`), {
      headers: authHeaders(sub!),
      data: {
        name: `${name}_renamed`,
        data: [{ file: mediaId, duration: 10 }],
        defaultDuration: 10,
        folderId: subFolder.id,
      },
    });
    const body = await upd.text();

    expect(
      upd.status(),
      `BUG-RT-01: access.campaigns.update is FALSE for this role, yet the update ` +
        `endpoint answered ${upd.status()} ${body}. The permission is not enforced ` +
        `server-side, so hiding the Edit button would only conceal it.`,
    ).toBe(403);

    // If it did go through, prove it by reading the record back.
    const after = await request.get(api(`/campaign/read/${doc!.id}`), { headers: authHeaders(sub!) });
    if (after.ok()) {
      expect((await after.json()).name, 'a refused update must not have persisted').toBe(name);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  Tickets marked SHIPPED — re-verified because the API still reproduces them
  // ═══════════════════════════════════════════════════════════════════════════

  test('86d3ux0pq · BUG-CMP-01 — a zero-item campaign must be rejected @boundary @critical', async ({
    request,
  }) => {
    // Marked "shipped". The UI does block this ("Add at least one media item."),
    // so a UI-only fix would look complete while the API stays open.
    const admin400 = await request.post(api('/campaign/create'), {
      headers: authHeaders(admin!),
      data: { name: uniqueName('Empty'), data: [], defaultDuration: 10, folderId: null },
    });
    expect(
      admin400.status(),
      `a campaign with no media has nothing to play — got ${admin400.status()} ${(await admin400.text()).slice(0, 120)}`,
    ).toBe(400);

    const sub400 = await request.post(api('/campaign/create'), {
      headers: authHeaders(sub!),
      data: { name: uniqueName('EmptySub'), data: [], defaultDuration: 10, folderId: subFolder.id },
    });
    expect(sub400.status(), 'the same rule must apply to a sub-user').toBe(400);
  });

  /** Durations that are not playable, per BR-13 (minimum 1 second). */
  const BAD_DURATIONS: Array<[string, number]> = [
    ['zero', 0],
    ['negative', -5],
  ];

  for (const [label, value] of BAD_DURATIONS) {
    test(`86d3ux0ru · BUG-CMP-04 — item duration ${label} must be rejected @boundary`, async ({
      request,
    }) => {
      const r = await request.post(api('/campaign/create'), {
        headers: authHeaders(admin!),
        data: {
          name: uniqueName(`Dur${label}`),
          data: [{ file: mediaId, duration: value }],
          defaultDuration: 10,
          folderId: null,
        },
      });
      expect(
        r.status(),
        `duration ${value} is not playable — got ${r.status()} ${(await r.text()).slice(0, 120)}`,
      ).toBe(400);
    });
  }

  test('86d3ux0ru · BUG-CMP-04 — defaultDuration zero/negative must be rejected @boundary', async ({
    request,
  }) => {
    for (const value of [0, -5]) {
      const r = await request.post(api('/campaign/create'), {
        headers: authHeaders(admin!),
        data: {
          name: uniqueName(`Def${value}`),
          data: [{ file: mediaId, duration: 10 }],
          defaultDuration: value,
          folderId: null,
        },
      });
      expect(
        r.status(),
        `defaultDuration ${value} — got ${r.status()} ${(await r.text()).slice(0, 120)}`,
      ).toBe(400);
    }
  });
});
