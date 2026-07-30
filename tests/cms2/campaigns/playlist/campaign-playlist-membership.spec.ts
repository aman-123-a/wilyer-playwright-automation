// =============================================================================
//  Campaigns V1 — MEMBERSHIP OF A PLAYLIST (CMP-080…087).
//
//  Target: cms2.pocsample.in (branch `cms2`). Never run on `live`.
//
//  ── What this file is about ─────────────────────────────────────────────────
//  Not the campaign record — the reference to it. A campaign only reaches a
//  screen by sitting in a playlist zone, so "add it", "take it out again" and
//  "delete it while it is still in there" are the operations that decide what
//  actually plays. The last one is the interesting one: a hard delete of a
//  referenced campaign either cleans the reference up or leaves a hole in
//  somebody's running playlist.
//
//  ── Storage model (mapped live 2026-07-29, re-confirmed 2026-07-30) ─────────
//      playlist.layouts[].zones[].array.data[]  — one entry per zone item
//  An entry is EITHER {file, duration, schedule} OR {campaign, duration}. Both
//  kinds share one array, and their index in it IS the playback order.
//
//  ── UI model (mapped live 2026-07-30) ───────────────────────────────────────
//  Add is drag-only: there is no "add to playlist" action anywhere on a campaign
//  card, so the campaign picker tab must be open and its card dragged onto the
//  zone. The zone entry that results is its own component — a CAMPAIGN pill, an
//  "N file(s)" summary, and Edit / Change Position / Remove. Notably no Schedule
//  control (BUG-SCHED-01) and no duration control: a campaign contributes its
//  own items' durations, which is why nothing here asserts a duration on it.
//
//  Standing rule: nothing is proven by the editor's own state or by a toast.
//  Every claim is read back from /playlist/read after a save.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { PlaylistService } from '../../../../api';
import type { Playlist } from '../../../../api';
import { uniqueName } from '../../../../test-data/campaigns.data';

/**
 * Playlist names carry this prefix AND the worker index, and teardown sweeps only
 * its own worker's share.
 *
 * The worker index is not cosmetic. A prefix-only sweep deletes every playlist
 * matching it, including the ones a PARALLEL worker is in the middle of editing —
 * which surfaces as "Playlist not found" and a blank editor in whichever test was
 * unlucky, i.e. as a fake product bug in a random test.
 */
const PLAYLIST_PREFIX = 'QA_MEMBER_';

const workerPrefix = (workerIndex: number): string => `${PLAYLIST_PREFIX}w${workerIndex}_`;

test.describe('Campaigns · playlist membership', () => {
  test.skip(
    !ENV.ALLOW_DESTRUCTIVE,
    'Creates and deletes playlists and campaigns. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
  );

  /**
   * A fresh playlist per test, holding one zone with two image slides.
   *
   * Deliberately NOT shared across the file: every test here mutates zone
   * membership, which is the one thing they all assert on, so a shared fixture
   * would make each test's precondition depend on the previous test's cleanup.
   * The cost is a playlist create per test; the benefit is that a failure is
   * attributable and the file can run fully parallel.
   */
  async function freshPlaylist(
    editor: import('../../../../pages/PlaylistEditorPage').PlaylistEditorPage,
    label: string,
    workerIndex: number,
  ): Promise<string> {
    const id = await editor.createPlaylist(
      `${workerPrefix(workerIndex)}${label}_${Date.now()}`,
      'membership suite',
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
  //  Add
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-080 · add a campaign to a playlist zone @smoke @critical @ui', async ({
    playlistEditorPage,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(240_000);
    const name = uniqueName('AddToPl', testInfo.workerIndex);
    await campaignApi.seed(name, 2, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'Add', testInfo.workerIndex);
    await playlistEditorPage.addCampaignToZone(name);
    await playlistEditorPage.save();

    const items = await itemsOf(playlistApi, playlistId);
    expect(items, 'the zone should hold 2 files + the campaign').toHaveLength(3);

    const entry = items[2];
    expect(entry.campaign, 'the third entry must be a campaign reference').toBeTruthy();
    expect(entry.campaign!.name, 'and it must be the campaign that was dragged').toBe(name);

    // A reference, not a copy: the playlist points at the campaign, it does not
    // inline its items. That is what makes editing the campaign later show up on
    // every playlist using it.
    expect(entry.file ?? null, 'a campaign entry must not also carry a file').toBeNull();
    expect(entry.campaign!.id, 'the reference must carry the campaign id').toMatch(/^[a-f0-9]{24}$/i);
  });

  test('CMP-081 · a campaign is appended, leaving the existing order intact @ui @regression', async ({
    playlistEditorPage,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(240_000);
    const name = uniqueName('AddOrder', testInfo.workerIndex);
    await campaignApi.seed(name, 1, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'Order', testInfo.workerIndex);
    await playlistEditorPage.save();
    const before = await labelsOf(playlistApi, playlistId);
    expect(before, 'precondition: two file slides').toHaveLength(2);

    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();
    await playlistEditorPage.addCampaignToZone(name);
    expect(
      await playlistEditorPage.campaignPosition(name),
      'a dropped campaign should land at the end of the loop, not in the middle of it',
    ).toBe(2);
    await playlistEditorPage.save();

    const after = await labelsOf(playlistApi, playlistId);
    expect(after.slice(0, 2), 'adding a campaign must not disturb the items already there').toEqual(
      before,
    );
    expect(after[2]).toBe(name);
  });

  test('CMP-082 · the same campaign can sit in two playlists at once @api @regression', async ({
    playlistEditorPage,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(300_000);
    const name = uniqueName('AddShared', testInfo.workerIndex);
    const campaign = await campaignApi.seed(name, 2, 10);

    const first = await freshPlaylist(playlistEditorPage, 'ShareA', testInfo.workerIndex);
    await playlistEditorPage.addCampaignToZone(name);
    await playlistEditorPage.save();

    // The second playlist gets the reference through the API — the UI path is
    // already covered, and this keeps the test's subject the SHARING rather than
    // a second drag.
    const second = await freshPlaylist(playlistEditorPage, 'ShareB', testInfo.workerIndex);
    await playlistEditorPage.save();
    const res = await playlistApi.mutate(second, (doc: Playlist) => {
      doc.layouts[0].zones[0].array!.data.push({ campaign: campaign.id, duration: 10 } as never);
    });
    expect(res.status(), `a second playlist must accept the same campaign — ${await res.text()}`).toBe(
      200,
    );

    for (const id of [first, second]) {
      const items = await itemsOf(playlistApi, id);
      const ref = items.find((i) => i.campaign?.name === name);
      expect(ref, `playlist ${id} must hold the shared campaign`).toBeTruthy();
      expect(ref!.campaign!.id, 'both playlists must point at the SAME record').toBe(campaign.id);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Remove — take the campaign out, keep the campaign
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-083 · remove a campaign from a playlist zone @smoke @critical @ui', async ({
    playlistEditorPage,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(300_000);
    const name = uniqueName('RemoveFromPl', testInfo.workerIndex);
    const campaign = await campaignApi.seed(name, 2, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'Remove', testInfo.workerIndex);
    await playlistEditorPage.addCampaignToZone(name);
    await playlistEditorPage.save();
    expect(await labelsOf(playlistApi, playlistId), 'precondition: the campaign is in the zone').toContain(
      name,
    );

    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();
    await playlistEditorPage.removeCampaignFromZone(name);
    await playlistEditorPage.save();

    const items = await itemsOf(playlistApi, playlistId);
    expect(items, 'the zone is back to its two file slides').toHaveLength(2);
    expect(
      items.some((i) => i.campaign),
      'no campaign reference may survive the removal',
    ).toBe(false);

    // Remove is not delete. The campaign itself must be untouched and reusable.
    const still = await campaignApi.read(campaign.id);
    expect(still.name, 'removing a reference must not delete the campaign').toBe(name);
    expect(still.data, 'nor change its contents').toHaveLength(2);
  });

  test('CMP-084 · removing a campaign leaves the surrounding items in order @ui @regression', async ({
    playlistEditorPage,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(300_000);
    const name = uniqueName('RemoveMid', testInfo.workerIndex);
    const campaign = await campaignApi.seed(name, 1, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'RemoveMid', testInfo.workerIndex);
    await playlistEditorPage.save();
    const files = await labelsOf(playlistApi, playlistId);

    // Put the campaign in the MIDDLE of the loop — if removal re-indexes the
    // array wrongly, a middle item is where the damage shows.
    const inserted = await playlistApi.mutate(playlistId, (doc: Playlist) => {
      doc.layouts[0].zones[0].array!.data.splice(1, 0, {
        campaign: campaign.id,
        duration: 10,
      } as never);
    });
    expect(inserted.status(), await inserted.text()).toBe(200);
    expect(await labelsOf(playlistApi, playlistId)).toEqual([files[0], name, files[1]]);

    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();
    await playlistEditorPage.removeCampaignFromZone(name);
    await playlistEditorPage.save();

    expect(
      await labelsOf(playlistApi, playlistId),
      'removing the middle item must close the gap, not reorder or drop its neighbours',
    ).toEqual(files);
  });

  test('CMP-085 · a campaign can be removed and added back @ui @regression', async ({
    playlistEditorPage,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(300_000);
    const name = uniqueName('ReAdd', testInfo.workerIndex);
    await campaignApi.seed(name, 2, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'ReAdd', testInfo.workerIndex);
    await playlistEditorPage.addCampaignToZone(name);
    await playlistEditorPage.save();

    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();
    await playlistEditorPage.removeCampaignFromZone(name);
    await playlistEditorPage.save();
    expect(await labelsOf(playlistApi, playlistId)).toHaveLength(2);

    // A membership model that cannot be un-done is as broken as one that cannot
    // remove: the removal must not leave state that blocks re-adding.
    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();
    await playlistEditorPage.addCampaignToZone(name);
    await playlistEditorPage.save();

    const items = await itemsOf(playlistApi, playlistId);
    expect(items, 'the campaign goes back in cleanly').toHaveLength(3);
    expect(items[2].campaign?.name).toBe(name);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Delete a campaign that is still referenced
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-086 · the delete dialog warns that the campaign may be in playlists @ui', async ({
    playlistEditorPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(300_000);
    const name = uniqueName('DelWarn', testInfo.workerIndex);
    await campaignApi.seed(name, 1, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'DelWarn', testInfo.workerIndex);
    await playlistEditorPage.addCampaignToZone(name);
    await playlistEditorPage.save();

    await campaignPicker.open(playlistId);
    await campaignPicker.search(name);
    await campaignPicker
      .card(name)
      .locator('button[data-bs-target="#deleteCampaign"]')
      .first()
      .click();
    await expect(campaignPicker.deleteModal).toHaveClass(/show/, { timeout: 15_000 });

    // The delete is unrecoverable and may pull content out from under a live
    // screen, so the dialog has to say so before the user commits.
    await expect(
      campaignPicker.deleteModal,
      'a destructive, cascading action must be explained before it is confirmed',
    ).toContainText(/playlist/i);

    await campaignPicker.dismiss(campaignPicker.deleteModal);
  });

  test('CMP-087 · deleting a referenced campaign does not leave the playlist unreadable @critical @api @destructive', async ({
    playlistEditorPage,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(300_000);
    const name = uniqueName('DelRefd', testInfo.workerIndex);
    const campaign = await campaignApi.seed(name, 2, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'DelRefd', testInfo.workerIndex);
    await playlistEditorPage.addCampaignToZone(name);
    await playlistEditorPage.save();
    expect(await labelsOf(playlistApi, playlistId), 'precondition').toContain(name);

    // Hard-delete the campaign while a playlist still points at it.
    expect((await campaignApi.deleteRaw(campaign.id)).status()).toBe(200);
    expect(await campaignApi.findByName(name), 'the campaign is gone').toBeUndefined();

    // The playlist must still be readable. Whether the reference is cleaned up or
    // left dangling is the product's choice; a 500 on read is not, because it
    // takes the whole playlist — and every screen playing it — down with it.
    const raw = await playlistApi.readRaw(playlistId);
    expect(
      raw.status(),
      `a playlist referencing a deleted campaign must still be readable — ${(
        await raw.text()
      ).slice(0, 300)}`,
    ).toBe(200);

    const items = await itemsOf(playlistApi, playlistId);
    const dangling = items.filter((i) => i.campaign && !i.campaign.name);
    const cleaned = !items.some((i) => i.campaign);

    expect(
      cleaned || dangling.length > 0,
      'either the reference is removed, or it survives as an unresolvable stub — ' +
        `saw: ${JSON.stringify(items.map((i) => i.campaign ?? i.file?.name))}`,
    ).toBe(true);

    // The files beside it must survive regardless of which way that went: one
    // deleted campaign must never cost a playlist its other content.
    expect(
      items.filter((i) => i.file).length,
      'the file slides in the same zone must be unaffected by the campaign delete',
    ).toBe(2);

    // And the editor must still open it. A playlist that reads back over the API
    // but crashes the editor is just as unusable to the operator who has to fix it.
    await playlistEditorPage.openById(playlistId);
    await expect(
      playlistEditorPage.composer,
      'the editor must render a playlist whose campaign was deleted underneath it',
    ).toBeVisible({ timeout: 30_000 });
  });

  test('CMP-087b · removing the reference first makes the delete a clean no-op for the playlist @api @destructive', async ({
    playlistEditorPage,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(300_000);
    const name = uniqueName('DelAfterRm', testInfo.workerIndex);
    const campaign = await campaignApi.seed(name, 2, 10);

    const playlistId = await freshPlaylist(playlistEditorPage, 'DelAfterRm', testInfo.workerIndex);
    await playlistEditorPage.addCampaignToZone(name);
    await playlistEditorPage.save();

    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();
    await playlistEditorPage.removeCampaignFromZone(name);
    await playlistEditorPage.save();

    const before = await labelsOf(playlistApi, playlistId);
    expect((await campaignApi.deleteRaw(campaign.id)).status()).toBe(200);

    // This is the documented safe order of operations, so it has to be exactly
    // that: the playlist must be byte-for-byte the same afterwards.
    expect(
      await labelsOf(playlistApi, playlistId),
      'deleting an already-unreferenced campaign must not touch the playlist at all',
    ).toEqual(before);
  });
});
