// =============================================================================
//  Campaigns V1 — FINDING, EDITING AND PLACING A CAMPAIGN FROM THE PLAYLIST
//  EDITOR (CMP-090…096, covering CP-PLC-002/003/005/009/010).
//
//  Target: cms2.pocsample.in (branch `cms2`). Never run on `live`.
//
//  ── What this file is about ─────────────────────────────────────────────────
//  campaign-playlist-membership.spec.ts proves a campaign can be put into a zone
//  and taken back out. This file covers the three operations that surround that
//  and are not membership changes at all:
//
//    • SEARCH — the picker is the only way to reach a campaign for a drag, and
//      the account holds hundreds. If search widens instead of narrows, or falls
//      back to "everything" on a miss, the operator drags the wrong campaign onto
//      a live screen. A no-match that renders the full list is the dangerous
//      failure, so it gets its own test.
//    • EDIT — a playlist stores a REFERENCE, so editing the campaign must show
//      through everywhere it is used, and renaming it must not break the link.
//      Both are asserted from a second playlist as well as the first: a bug that
//      refreshes only the playlist you happen to have open is invisible with one.
//    • POSITION — index in the zone array IS playback order. Appending is covered
//      by CMP-081; what is not is whether a campaign that sits FIRST survives a
//      save, because a serialiser that treats campaigns as a separate collection
//      quietly pushes them to the end of the loop.
//
//  Standing rule, inherited from the membership suite: nothing is proven by the
//  editor's own state or by a toast. Every persistence claim is read back from
//  /playlist/read (or /campaign/read) after a save.
//
//  ── Note on the edit mechanism ──────────────────────────────────────────────
//  CMP-093 changes the campaign's CONTENTS over the API rather than through the
//  update modal's media panel. The subject of that test is propagation to the
//  playlists, not the modal, and CampaignPickerPage.update()'s `addItems` path is
//  not exercised anywhere in the suite — driving it here would put an unproven
//  helper between the test and its assertion. The UI edit path is covered by
//  CMP-094, which renames through the modal.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { PlaylistService } from '../../../../api';
import type { Playlist } from '../../../../api';
import { uniqueName } from '../../../../test-data/campaigns.data';

/**
 * As in the membership suite, playlist names carry the worker index and teardown
 * sweeps only its own worker's share — a prefix-only sweep deletes playlists a
 * PARALLEL worker is still editing, which surfaces as a fake product bug in a
 * random test.
 */
const PLAYLIST_PREFIX = 'QA_PLCONT_';

const workerPrefix = (workerIndex: number): string => `${PLAYLIST_PREFIX}w${workerIndex}_`;

test.describe('Campaigns · search, edit and placement from the playlist editor', () => {
  test.skip(
    !ENV.ALLOW_DESTRUCTIVE,
    'Creates and deletes playlists and campaigns. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
  );

  async function freshPlaylist(
    editor: import('../../../../pages/PlaylistEditorPage').PlaylistEditorPage,
    label: string,
    workerIndex: number,
  ): Promise<string> {
    const id = await editor.createPlaylist(
      `${workerPrefix(workerIndex)}${label}_${Date.now()}`,
      'search / edit / placement suite',
    );
    await editor.buildTwoImageSlideZone();
    return id;
  }

  const itemsOf = async (api: PlaylistService, id: string) =>
    PlaylistService.itemsOf(await api.read(id));

  const labelsOf = async (api: PlaylistService, id: string) =>
    (await itemsOf(api, id)).map((i) => i.campaign?.name ?? i.file?.name ?? 'widget');

  test.afterEach(async ({ playlistApi, campaignApi }, testInfo) => {
    await playlistApi.cleanupByPrefix(workerPrefix(testInfo.workerIndex)).catch(() => 0);
    const mine = (await campaignApi.findByPrefix('QA_CRUD_')).filter((c) =>
      c.name.toLowerCase().includes(`_w${testInfo.workerIndex}_`),
    );
    for (const c of mine) await campaignApi.deleteQuietly(c.id);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Search — reaching the right campaign in a crowded account
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-090 · the picker search narrows the list to the campaign asked for @smoke @critical @ui', async ({
    playlistEditorPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(240_000);
    // Two campaigns with unrelated labels: a search for one must not surface the
    // other. Both share the QA_CRUD_ prefix, so a search that matches on prefix
    // rather than on the query would return both — which is the bug being ruled
    // out here, and the reason this needs two seeds rather than one.
    const wanted = uniqueName('SearchHit', testInfo.workerIndex);
    const other = uniqueName('SearchMiss', testInfo.workerIndex);
    await campaignApi.seed(wanted, 1, 10);
    await campaignApi.seed(other, 1, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'Search', testInfo.workerIndex);
    await campaignPicker.open(playlistId);

    await campaignPicker.search(wanted);

    // Both assertions have to RETRY rather than snapshot listNames() once.
    // `search()` resolves on the /campaign/read response, and for a few frames
    // after that the picker still shows the pre-search list — which contains the
    // campaign being searched for, because it was just seeded. A one-shot read
    // therefore passes its "is it listed?" check against the UNFILTERED list and
    // then fails the "is the other one gone?" check, reporting a working search as
    // broken. Waiting for the non-matching card to disappear is what actually
    // pins the filtered state.
    await expect(
      campaignPicker.card(other),
      'a campaign that does not match the query must not be listed — search has to narrow, not merely re-sort',
    ).toHaveCount(0, { timeout: 20_000 });
    await expect(
      campaignPicker.card(wanted),
      'the campaign searched for must survive its own filter',
    ).toHaveCount(1, { timeout: 20_000 });
  });

  test('CMP-091 · a search matching nothing empties the picker instead of falling back to every campaign @ui @negative', async ({
    playlistEditorPage,
    campaignPicker,
  }, testInfo) => {
    test.setTimeout(180_000);
    const playlistId = await freshPlaylist(playlistEditorPage, 'SearchNone', testInfo.workerIndex);
    await campaignPicker.open(playlistId);
    await campaignPicker.waitForList();

    // Precondition: the unfiltered picker actually has content, otherwise "empty
    // after searching" would pass for the wrong reason.
    expect(
      await campaignPicker.count(),
      'precondition: the account has campaigns to filter',
    ).toBeGreaterThan(0);

    await campaignPicker.search(`QA_NO_SUCH_CAMPAIGN_${Date.now()}`);

    // The failure this guards against is the one that silently hands the operator
    // the whole account when their query matched nothing — they then drag whatever
    // happens to be first onto a live screen.
    await expect(
      campaignPicker.cards,
      'a query that matches nothing must yield an empty list, never an unfiltered one',
    ).toHaveCount(0, { timeout: 20_000 });
  });

  test('CMP-092 · clearing the search restores the full list @ui @regression', async ({
    playlistEditorPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(240_000);
    // Two seeds, and the assertions are about which CARDS are present rather than
    // how many. A count-based version of this test ("clearing restores N cards")
    // is not sound on a shared account: the other specs in this suite create and
    // delete campaigns in parallel, so the total legitimately changes between the
    // before and after reads, and the test fails on someone else's cleanup.
    const wanted = uniqueName('SearchClear', testInfo.workerIndex);
    const excluded = uniqueName('SearchKept', testInfo.workerIndex);
    await campaignApi.seed(wanted, 1, 10);
    await campaignApi.seed(excluded, 1, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'SearchClear', testInfo.workerIndex);
    await campaignPicker.open(playlistId);
    await campaignPicker.waitForList();

    await campaignPicker.search(wanted);
    await expect(campaignPicker.card(excluded), 'the search narrowed the list').toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(campaignPicker.card(wanted)).toHaveCount(1, { timeout: 20_000 });

    // A filter you cannot get out of is a dead end: the operator has to reload the
    // editor, losing unsaved zone work. The campaign the filter EXCLUDED coming
    // back is the proof the filter was actually lifted.
    await campaignPicker.search('');
    await expect(
      campaignPicker.card(excluded),
      'clearing the query must restore the list, not leave the last filter applied',
    ).toHaveCount(1, { timeout: 20_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Edit — the reference must track the record
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-093 · editing a campaign shows through to every playlist using it @critical @ui @api', async ({
    playlistEditorPage,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(300_000);
    const name = uniqueName('EditProp', testInfo.workerIndex);
    const campaign = await campaignApi.seed(name, 2, 10);

    // Playlist A takes the campaign through the UI; playlist B through the API.
    // Two playlists is the point of the test — a cache that refreshes only the
    // playlist currently open looks correct with one.
    const first = await freshPlaylist(playlistEditorPage, 'EditPropA', testInfo.workerIndex);
    await playlistEditorPage.addCampaignToZone(name);
    await playlistEditorPage.save();

    const second = await freshPlaylist(playlistEditorPage, 'EditPropB', testInfo.workerIndex);
    await playlistEditorPage.save();
    const linked = await playlistApi.mutate(second, (doc: Playlist) => {
      doc.layouts[0].zones[0].array!.data.push({ campaign: campaign.id, duration: 10 } as never);
    });
    expect(
      linked.status(),
      `the second playlist must accept the campaign — ${await linked.text()}`,
    ).toBe(200);

    // Grow the campaign from 2 items to 3.
    const media = await campaignApi.sampleMediaIds(3);
    const edit = await campaignApi.updateRaw(campaign.id, {
      name,
      data: media.map((file) => ({ file, duration: 10 })),
      defaultDuration: 10,
      folderId: null,
    });
    expect(edit.status(), `the campaign edit must succeed — ${await edit.text()}`).toBe(200);
    expect(
      (await campaignApi.read(campaign.id)).data,
      'precondition: the campaign now holds three items',
    ).toHaveLength(3);

    // Both playlists must report the new length. The zone entry's "N file(s)"
    // summary is the only place the editor states what a campaign contributes, so
    // it is what an operator actually reads — and a stale copy shows up here as
    // the old count while /campaign/read says otherwise.
    for (const id of [first, second]) {
      await playlistEditorPage.openById(id);
      await playlistEditorPage.selectFirstZone();
      await expect(
        playlistEditorPage.campaignEntry(name),
        `playlist ${id} must show the campaign's new file count, not a copy taken when it was added`,
      ).toContainText(/3\s*file/i, { timeout: 20_000 });
    }

    // And the link is still a link, in both, pointing at the same record.
    for (const id of [first, second]) {
      const ref = (await itemsOf(playlistApi, id)).find((i) => i.campaign);
      expect(ref?.campaign?.id, `playlist ${id} must still reference the same campaign`).toBe(
        campaign.id,
      );
    }
  });

  test('CMP-094 · renaming a campaign through the picker keeps every playlist reference intact @ui @critical', async ({
    playlistEditorPage,
    campaignPicker,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(300_000);
    const name = uniqueName('RenameRef', testInfo.workerIndex);
    const renamed = `${name}_RENAMED`;
    const campaign = await campaignApi.seed(name, 2, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'Rename', testInfo.workerIndex);
    await playlistEditorPage.addCampaignToZone(name);
    await playlistEditorPage.save();
    expect(await labelsOf(playlistApi, playlistId), 'precondition').toContain(name);

    // The UI edit path — the update modal, driven exactly as CMP-021 drives it.
    await campaignPicker.open(playlistId);
    await campaignPicker.search(name);
    const result = await campaignPicker.update(name, { name: renamed });
    expect(
      result.status,
      `the rename must succeed — toast: "${result.toast}" blocked: ${result.blockedReason} body: ${result.body.slice(0, 200)}`,
    ).toBe(200);

    // A reference stored by NAME breaks here; one stored by id survives and simply
    // resolves to the new label. The id assertion is what distinguishes the two.
    const items = await itemsOf(playlistApi, playlistId);
    const ref = items.find((i) => i.campaign);
    expect(ref, 'the playlist must still hold a campaign reference after the rename').toBeTruthy();
    expect(ref!.campaign!.id, 'the reference must resolve by id, not by name').toBe(campaign.id);
    expect(ref!.campaign!.name, 'and it must report the new name').toBe(renamed);

    expect(
      (await itemsOf(playlistApi, playlistId)).filter((i) => i.file).length,
      'the file slides beside it must be untouched by a rename',
    ).toBe(2);

    // The editor must show the new name too — a reference that resolves over the
    // API but renders the stale label leaves the operator editing blind.
    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();
    await expect(
      playlistEditorPage.campaignEntry(renamed),
      'the zone strip must show the renamed campaign',
    ).toHaveCount(1, { timeout: 20_000 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Position — index in the zone array is playback order
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-095 · a campaign in the first position stays there across a UI save @ui @boundary', async ({
    playlistEditorPage,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(300_000);
    const name = uniqueName('PosFirst', testInfo.workerIndex);
    const campaign = await campaignApi.seed(name, 1, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'PosFirst', testInfo.workerIndex);
    await playlistEditorPage.save();
    const files = await labelsOf(playlistApi, playlistId);
    expect(files, 'precondition: two file slides').toHaveLength(2);

    // Seed the campaign at index 0 over the API — the UI only appends, so this is
    // the only way to construct the state under test.
    const inserted = await playlistApi.mutate(playlistId, (doc: Playlist) => {
      doc.layouts[0].zones[0].array!.data.unshift({ campaign: campaign.id, duration: 10 } as never);
    });
    expect(inserted.status(), await inserted.text()).toBe(200);
    expect(await labelsOf(playlistApi, playlistId), 'precondition: campaign is first').toEqual([
      name,
      ...files,
    ]);

    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();
    expect(
      await playlistEditorPage.campaignPosition(name),
      'the editor must render the campaign at position 0, not relocate it on load',
    ).toBe(0);

    // The save is the subject: a serialiser that rebuilds the zone by kind rather
    // than by index silently moves campaigns to the end of the loop, which changes
    // what plays first on every screen using this playlist.
    await playlistEditorPage.save();

    expect(
      await labelsOf(playlistApi, playlistId),
      'an untouched save must not reorder the zone',
    ).toEqual([name, ...files]);
  });

  test('CMP-096 · a campaign can be opened for editing from inside the zone @ui @regression', async ({
    playlistEditorPage,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(240_000);
    const name = uniqueName('ZoneEdit', testInfo.workerIndex);
    await campaignApi.seed(name, 2, 10);

    await freshPlaylist(playlistEditorPage, 'ZoneEdit', testInfo.workerIndex);
    await playlistEditorPage.addCampaignToZone(name);

    // The zone entry advertises an Edit control. If it is rendered it must work —
    // a control that looks live and does nothing is worse than no control, because
    // the operator believes the edit landed.
    expect(
      await playlistEditorPage.campaignZoneControl(name, 'edit'),
      'the in-zone Edit control must be usable',
    ).toBe('enabled');

    await playlistEditorPage
      .campaignEntry(name)
      .locator('[data-tooltip-id^="c-edit-"]')
      .first()
      .click({ force: true });

    const modal = playlistEditorPage.page.locator('#updateCampaignZone');
    await expect(modal, 'the in-zone Edit control must open the campaign editor').toHaveClass(
      /show/,
      { timeout: 20_000 },
    );
    // Bound, not blank. The name lives in an input VALUE, which is not part of the
    // modal's text content — asserting on text here passes a populated form off as
    // a failure. The first text input is the Campaign Name field; Default Duration
    // beside it is numeric.
    await expect(
      modal.locator('input[type="text"], input:not([type])').first(),
      'and it must be bound to the campaign that was clicked, not to a blank form',
    ).toHaveValue(name, { timeout: 20_000 });
  });
});
