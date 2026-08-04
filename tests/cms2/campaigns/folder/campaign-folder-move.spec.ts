// =============================================================================
//  Campaigns V1 — filing a campaign into a folder, and moving it (FOLD-001…008)
//
//  Target: cms2.pocsample.in (branch `cms2`). Never run on `live`.
//
//  Start with the finding that shapes this whole suite: THERE IS NO FOLDER UI
//  FOR CAMPAIGNS. The only campaign surface is picker tab 4 inside the playlist
//  editor, and it renders no folder tree, no folder column and no "move to
//  folder" action (see pages/CampaignPickerPage.ts — the word "folder" does not
//  appear in it). `folderId` exists on every campaign record and the API accepts
//  it, so an admin can file a campaign somewhere they can never see or undo it
//  from the CMS.
//
//  FOLD-001 asserts that absence deliberately, so the gap is a recorded result
//  rather than folklore; the rest exercise the move through the API, which is
//  the only path that exists today.
//
//  Campaign folders are the MEDIA folder namespace (`/folder/read`) — there is
//  no `/campaign-folder` endpoint. Same fact the sub-user fence suite depends on
//  (tests/cms2/campaigns/rbac/subuser-folder-campaigns.spec.ts).
//
//  House rule inherited from the CRUD suite: persistence is proven by API
//  read-back, never by a toast.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { requireFeature } from '../../../../helpers';
import { HttpClient, tokenFromContext, type Campaign } from '../../../../api';
import {
  CAMPAIGN_PREFIX,
  DEFAULT_DURATION,
  uniqueName,
} from '../../../../test-data/campaigns.data';

interface Folder {
  id: string;
  name: string;
}

/**
 * A folder from the media namespace to move campaigns into.
 *
 * Read rather than created: folder creation is a different module's concern,
 * and a suite that seeds its own folders leaves debris in a shared account when
 * a run is interrupted. Returns undefined when the account has none, which the
 * tests treat as a skip — an empty account is a setup fact, not a defect.
 */
async function anyFolder(http: HttpClient): Promise<Folder | undefined> {
  // `folders`, not the `docs` every other listing uses — /folder/read does not
  // follow the paginated envelope. Reading `docs` here silently yields nothing,
  // which skips the whole suite while looking like an account with no folders.
  const body = await http.get<{ folders?: Folder[] }>('/folder/read', {
    params: { page: 1, limit: 100 },
  });
  return body.folders?.[0];
}

test.describe('Campaigns · folders', () => {
  requireFeature('campaigns');

  test.skip(
    !ENV.ALLOW_DESTRUCTIVE,
    'Creates, moves and deletes campaigns. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
  );

  /**
   * Sweep only this worker's artefacts — the name carries the worker index, so a
   * parallel worker's in-flight campaigns are never deleted from under it.
   *
   * Unlike every other campaign suite, this one must sweep the FOLDERS too. The
   * usual `findByPrefix` walks the root listing, and this suite's whole purpose
   * is to move campaigns out of it — a root-only sweep would leave every moved
   * campaign behind on a shared server, invisible from the CMS because there is
   * no folder UI to find them with.
   */
  test.afterEach(async ({ campaignApi, context }, testInfo) => {
    const mine = (c: { name: string }): boolean =>
      c.name.startsWith(CAMPAIGN_PREFIX) &&
      c.name.toLowerCase().includes(`_w${testInfo.workerIndex}_`);

    const http = new HttpClient(context.request, { token: await tokenFromContext(context) });
    const folders = await http
      .get<{ folders?: Folder[] }>('/folder/read', { params: { page: 1, limit: 100 } })
      .then((b) => b.folders ?? [])
      .catch(() => [] as Folder[]);

    for (const folderId of ['', ...folders.map((f) => f.id)]) {
      const docs = await campaignApi.listAll({ folderId }).catch(() => [] as Campaign[]);
      for (const c of docs.filter(mine)) await campaignApi.deleteQuietly(c.id);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  The UI surface — what an operator can and cannot do
  // ───────────────────────────────────────────────────────────────────────────

  test('FOLD-001 · the picker offers no way to file or move a campaign @ui @defect', async ({
    playlistsPage,
    campaignPicker,
  }) => {
    const playlistId = await playlistsPage.anyPlaylistId();
    await campaignPicker.open(playlistId);
    await campaignPicker.waitForList();

    // Every probe is scoped to a campaign surface, never the page. The editor's
    // MEDIA tab has a full folder tree of its own, so a page-wide search for
    // "folder" finds it and reports a campaign folder UI that does not exist.
    const FOLDER_FIELD = 'select[name*="folder" i], input[name*="folder" i], #folderId';

    // The card is where a "move" action would live, beside edit / clone / delete.
    // Probed first, while no modal is open and nothing can intercept.
    const firstCampaign = (await campaignPicker.listNames())[0];
    const moveAction = campaignPicker
      .card(firstCampaign)
      .getByRole('button', { name: /folder|move/i });
    expect(await moveAction.count(), 'a campaign card offers no move action').toBe(0);

    await campaignPicker.openUpdateModal(firstCampaign);
    const inUpdateModal = await campaignPicker.updateModal.locator(FOLDER_FIELD).count();
    expect(
      inUpdateModal,
      'the edit modal exposes no folder field, so a filed campaign cannot be moved back',
    ).toBe(0);

    // Re-open the editor rather than dismissing the modal. These dialogs use a
    // static backdrop with the keyboard disabled, their × is unreliable (see
    // CampaignPickerPage.cloneCloseGlyph) and the app does not expose Bootstrap
    // globally, so there is no dependable programmatic close either. A
    // navigation is the one thing guaranteed to clear the modal AND its
    // backdrop — and this test only needs a clean page, not a user's exit path.
    await campaignPicker.open(playlistId);
    await campaignPicker.waitForList();

    await campaignPicker.openCreateModal();
    const inCreateModal = await campaignPicker.createModal.locator(FOLDER_FIELD).count();
    expect(
      inCreateModal,
      'the create modal exposes no folder field, so a campaign can only ever be created at the root',
    ).toBe(0);

    test.info().annotations.push({
      type: 'gap',
      description:
        'Campaigns carry folderId but the CMS renders no folder control. A campaign ' +
        'filed into a folder over the API cannot be seen or moved back from the UI.',
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Filing and moving — the API path
  // ───────────────────────────────────────────────────────────────────────────

  test('FOLD-002 · a campaign can be created directly inside a folder @api @regression', async ({
    campaignApi,
    context,
  }, testInfo) => {
    const http = new HttpClient(context.request, { token: await tokenFromContext(context) });
    const folder = await anyFolder(http);
    test.skip(!folder, 'This account has no media folders to file a campaign into.');

    const name = uniqueName('FolderCreate', testInfo.workerIndex);
    const [file] = await campaignApi.sampleMediaIds(1);

    const res = await campaignApi.createRaw({
      name,
      data: [{ file, duration: DEFAULT_DURATION }],
      defaultDuration: DEFAULT_DURATION,
      folderId: folder!.id,
    });
    expect(res.status(), await res.text()).toBe(200);

    // Looked up in the FOLDER listing, not by name: findByName() sweeps the root
    // (folderId=''), and a campaign created inside a folder is precisely the one
    // thing the root listing does not contain — so the generic helper reports it
    // as "created but missing" when it is filed exactly as asked.
    const inFolder = await campaignApi.listAll({ folderId: folder!.id });
    const saved = inFolder.find((c: Campaign) => c.name === name);
    expect(saved, `the campaign must be listed inside "${folder!.name}"`).toBeTruthy();
    expect(saved!.folderId, `it must be filed in "${folder!.name}"`).toBe(folder!.id);
  });

  test('FOLD-003 · update moves a root campaign into a folder @api @critical', async ({
    campaignApi,
    context,
  }, testInfo) => {
    const http = new HttpClient(context.request, { token: await tokenFromContext(context) });
    const folder = await anyFolder(http);
    test.skip(!folder, 'This account has no media folders to move a campaign into.');

    const seeded = await campaignApi.seed(uniqueName('FolderMove', testInfo.workerIndex), 1);
    expect(seeded.folderId, 'seeded campaigns start at the root').toBeFalsy();

    const res = await campaignApi.updateRaw(seeded.id, {
      name: seeded.name,
      data: seeded.data.map((i) => ({ file: i.file.id, duration: i.duration })),
      defaultDuration: DEFAULT_DURATION,
      folderId: folder!.id,
    });
    expect(res.status(), await res.text()).toBe(200);

    // Read-back, not the update response: the endpoint answers with a message
    // and would report success for a folderId it silently dropped.
    const moved = await campaignApi.read(seeded.id);
    expect(moved.folderId, `the campaign must now live in "${folder!.name}"`).toBe(folder!.id);
  });

  test('FOLD-004 · a moved campaign leaves the root listing for the folder listing @api @critical', async ({
    campaignApi,
    context,
  }, testInfo) => {
    const http = new HttpClient(context.request, { token: await tokenFromContext(context) });
    const folder = await anyFolder(http);
    test.skip(!folder, 'This account has no media folders to move a campaign into.');

    const seeded = await campaignApi.seed(uniqueName('FolderList', testInfo.workerIndex), 1);
    await campaignApi.updateRaw(seeded.id, {
      name: seeded.name,
      data: seeded.data.map((i) => ({ file: i.file.id, duration: i.duration })),
      defaultDuration: DEFAULT_DURATION,
      folderId: folder!.id,
    });

    // The listing is what an operator would navigate, so a move that changes the
    // record but not the listing is still a broken move.
    const inFolder = await campaignApi.listAll({ folderId: folder!.id });
    expect(
      inFolder.some((c: Campaign) => c.id === seeded.id),
      'the folder listing must include the campaign that was moved into it',
    ).toBe(true);

    const atRoot = await campaignApi.listAll({ folderId: '' });
    expect(
      atRoot.some((c: Campaign) => c.id === seeded.id),
      'the root listing must no longer include it',
    ).toBe(false);
  });

  test('FOLD-005 · a campaign can be moved back to the root @api @regression', async ({
    campaignApi,
    context,
  }, testInfo) => {
    const http = new HttpClient(context.request, { token: await tokenFromContext(context) });
    const folder = await anyFolder(http);
    test.skip(!folder, 'This account has no media folders to move a campaign into.');

    const seeded = await campaignApi.seed(uniqueName('FolderBack', testInfo.workerIndex), 1);
    const payload = {
      name: seeded.name,
      data: seeded.data.map((i) => ({ file: i.file.id, duration: i.duration })),
      defaultDuration: DEFAULT_DURATION,
    };

    await campaignApi.updateRaw(seeded.id, { ...payload, folderId: folder!.id });
    expect((await campaignApi.read(seeded.id)).folderId).toBe(folder!.id);

    // The return trip matters on its own: without it, the API-only move is a
    // one-way door — and with no UI to undo it, a mis-filed campaign would be
    // stranded where no operator can reach it.
    const res = await campaignApi.updateRaw(seeded.id, { ...payload, folderId: null });
    expect(res.status(), await res.text()).toBe(200);
    expect((await campaignApi.read(seeded.id)).folderId, 'it must be back at the root').toBeFalsy();
  });

  test('FOLD-006 · a move preserves the items, their order and their durations @api @critical', async ({
    campaignApi,
    context,
  }, testInfo) => {
    const http = new HttpClient(context.request, { token: await tokenFromContext(context) });
    const folder = await anyFolder(http);
    test.skip(!folder, 'This account has no media folders to move a campaign into.');

    const seeded = await campaignApi.seed(uniqueName('FolderKeep', testInfo.workerIndex), 3);
    const before = (await campaignApi.read(seeded.id)).data.map((i) => ({
      file: i.file.id,
      duration: i.duration,
    }));
    expect(before.length, 'the fixture must actually have three items to compare').toBe(3);

    await campaignApi.updateRaw(seeded.id, {
      name: seeded.name,
      data: before,
      defaultDuration: DEFAULT_DURATION,
      folderId: folder!.id,
    });

    // Update REPLACES the record, so a move is a full rewrite of the campaign —
    // which is exactly why the content is worth asserting rather than assumed.
    const after = (await campaignApi.read(seeded.id)).data.map((i) => ({
      file: i.file.id,
      duration: i.duration,
    }));
    expect(after, 'moving a campaign must not disturb what it plays').toEqual(before);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Negative — a rejected move must leave the campaign where it was
  // ───────────────────────────────────────────────────────────────────────────

  test('FOLD-007 · a move to an unknown folder is refused, and nothing changes @api @negative', async ({
    campaignApi,
  }, testInfo) => {
    const seeded = await campaignApi.seed(uniqueName('FolderGhost', testInfo.workerIndex), 1);
    const payload = {
      name: seeded.name,
      data: seeded.data.map((i) => ({ file: i.file.id, duration: i.duration })),
      defaultDuration: DEFAULT_DURATION,
    };

    // Well-formed but non-existent — the same shape SUBF-015 uses, where create
    // answers 400 "Folder not found." Update must not be laxer than create.
    const res = await campaignApi.updateRaw(seeded.id, {
      ...payload,
      folderId: '000000000000000000000000',
    });

    expect(
      res.status(),
      `a move into a folder that does not exist must be rejected — body: ${await res.text()}`,
    ).toBeGreaterThanOrEqual(400);

    // The half-applied case is the damaging one: a rejected move that still
    // detached the campaign from where it was leaves it nowhere.
    const after = await campaignApi.read(seeded.id);
    expect(after.folderId, 'a refused move must leave the campaign at the root').toBeFalsy();
    expect(after.data.length, 'a refused move must not empty the campaign').toBe(1);
  });

  test('FOLD-008 · a malformed folderId is rejected, not coerced to the root @api @negative @boundary @defect', async ({
    campaignApi,
  }, testInfo) => {
    // CONFIRMED against cms2 on 2026-07-31: the API answers 200 "Campaign
    // updated successfully." Asserted against the CORRECT behaviour and marked
    // expected-fail, so the run turns red the moment the API starts rejecting it.
    test.fail(
      true,
      'BUG-CMP-17: POST /campaign/update accepts folderId "not-an-object-id" and returns 200',
    );
    const seeded = await campaignApi.seed(uniqueName('FolderJunk', testInfo.workerIndex), 1);

    const res = await campaignApi.updateRaw(seeded.id, {
      name: seeded.name,
      data: seeded.data.map((i) => ({ file: i.file.id, duration: i.duration })),
      defaultDuration: DEFAULT_DURATION,
      folderId: 'not-an-object-id',
    });

    // BUG-CMP-10 records this on CREATE: an invalid folderId is coerced to null
    // instead of refused, so the campaign lands at the root and the caller is
    // told it succeeded. Asserted here on UPDATE, which is the worse case — the
    // campaign was somewhere, and a silent coercion MOVES it without being asked.
    expect(
      res.status(),
      `a malformed folderId must be rejected — body: ${await res.text()}`,
    ).toBeGreaterThanOrEqual(400);

    test.info().annotations.push({
      type: 'related',
      description: 'BUG-CMP-10 — the same coercion on /campaign/create.',
    });
  });
});
