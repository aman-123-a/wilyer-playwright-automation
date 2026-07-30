// =============================================================================
//  Campaigns V1 — CAMPAIGN LOOP LOGIC, verified in Chrome (CP-LOOP-001…004, 009).
//
//  Target: cms2.pocsample.in (branch `cms2`). Never run on `live`.
//
//  ── The problem this file solves ────────────────────────────────────────────
//  Module 1 of the test plan (CP-LOOP-001…026) is the core of the campaign
//  feature: a campaign occupies ONE zone slot and shows its NEXT file on each pass
//  of the loop, mapping iteration → file as ((i-1) mod N) + 1. Every case in that
//  module is written as "publish to a screen and observe N iterations", which made
//  the whole module unautomated — and therefore entirely unverified.
//
//  It does not have to be. The playlist editor's Preview button opens a real
//  player (POST /playlist/createPreview → https://preview.pocsample.in/<id> in an
//  iframe) which rotates content in the browser. That makes the loop observable
//  with no screen, no APK and no licence. See pages/PlaylistPreviewPage.ts for how
//  the active frame is detected — the player switches frames with opacity and
//  z-index only, so `toBeVisible()` does not work here.
//
//  ── What a pass here does and does not prove ────────────────────────────────
//  AS-08 and DEP-04 in the requirement analysis record that loop resolution
//  executes ON-DEVICE, in player firmware. The preview player is a different
//  implementation. So these tests prove the loop CONTRACT and catch regressions on
//  every commit; they are NOT hardware sign-off, and they do not replace running
//  CP-LOOP-001 against screen 8977960229 once for the record. Everything here is
//  tagged @preview so a hardware campaign can be selected separately.
//
//  Cases that genuinely cannot come here — CP-LOOP-018 (player restart),
//  019/020 (offline and reconnect), 021 (two screens), 012 (video plays to natural
//  length, needs real decode) — are hardware-only and stay out rather than being
//  faked. See docs/known-gaps.md.
//
//  ── Timing ──────────────────────────────────────────────────────────────────
//  Durations are pushed to the 1s floor (BR-13 minimum) so a 4-file campaign
//  completes several passes inside a test. Sampling is 250ms, and assertions are
//  written against the ORDER of frame changes, never against wall-clock position —
//  the latter would be flaky on a loaded CI box for no added signal.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { PlaylistPreviewPage } from '../../../../pages/PlaylistPreviewPage';
import { uniqueName } from '../../../../test-data/campaigns.data';

const PLAYLIST_PREFIX = 'QA_LOOP_';

const workerPrefix = (workerIndex: number): string => `${PLAYLIST_PREFIX}w${workerIndex}_`;

test.describe('Campaigns · loop logic (browser preview)', () => {
  test.skip(
    !ENV.ALLOW_DESTRUCTIVE,
    'Creates playlists and campaigns. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
  );

  /**
   * A playlist whose single zone holds two 1-second slides plus `campaignName`.
   *
   * The two plain slides are not padding — they are the loop-pass separator. A
   * campaign advances once per PASS, so without other items in the zone there is
   * nothing to distinguish "the campaign advanced" from "the same slot repainted".
   */
  async function playlistWithCampaign(
    editor: import('../../../../pages/PlaylistEditorPage').PlaylistEditorPage,
    label: string,
    workerIndex: number,
    campaignName: string,
  ): Promise<string> {
    const id = await editor.createPlaylist(
      `${workerPrefix(workerIndex)}${label}_${Date.now()}`,
      'campaign loop suite',
    );
    await editor.buildTwoImageSlideZone();
    await editor.setSlideDuration('1', 0).catch(() => undefined);
    await editor.setSlideDuration('1', 1).catch(() => undefined);
    await editor.addCampaignToZone(campaignName);
    await editor.save();
    return id;
  }

  /** The campaign's own file basenames, in stored order — the expected loop order. */
  const fileNamesOf = (campaign: { data?: Array<{ file?: { name?: string } }> }): string[] =>
    (campaign.data ?? []).map((i) => i.file?.name ?? '').filter(Boolean);

  test.afterEach(async ({ playlistApi, campaignApi }, testInfo) => {
    await playlistApi.cleanupByPrefix(workerPrefix(testInfo.workerIndex)).catch(() => 0);
    const mine = (await campaignApi.findByPrefix('QA_CRUD_')).filter((c) =>
      c.name.toLowerCase().includes(`_w${testInfo.workerIndex}_`),
    );
    for (const c of mine) await campaignApi.deleteQuietly(c.id);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  The PRD reference case
  // ───────────────────────────────────────────────────────────────────────────

  test('CP-LOOP-001 · a 4-file campaign shows one file per loop pass, in order @preview @critical @smoke', async ({
    playlistEditorPage,
    playlistPreview,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(420_000);
    const name = uniqueName('Loop4', testInfo.workerIndex);
    const campaign = await campaignApi.seed(name, 4, 1, 'image');
    const files = fileNamesOf(await campaignApi.read(campaign.id));
    expect(files, 'precondition: the campaign holds four named files').toHaveLength(4);

    await playlistWithCampaign(playlistEditorPage, 'Loop4', testInfo.workerIndex, name);
    await playlistPreview.open();
    await playlistPreview.waitForFirstFrame();

    const seq = await playlistPreview.sampleSequence(50_000);
    const shown = PlaylistPreviewPage.campaignFrames(seq, files);

    await testInfo.attach('frame-sequence', {
      body: seq.map((f) => `${f.at}ms  ${f.file}`).join('\n'),
      contentType: 'text/plain',
    });

    expect(
      shown.length,
      `the campaign slot must have advanced at least 4 times in 50s — full sequence: ${seq
        .map((f) => f.file)
        .join(' -> ')}`,
    ).toBeGreaterThanOrEqual(4);

    // The headline assertion: successive appearances walk the file list in order.
    // A shared or reset counter shows up here as a repeat or a jump.
    expect(
      shown.slice(0, 4),
      'consecutive passes must walk the campaign file list in order',
    ).toEqual(PlaylistPreviewPage.expectedCycle(files, shown[0], 4));
  });

  test('CP-LOOP-002 · the campaign index wraps after the last file with no skip or repeat @preview @critical', async ({
    playlistEditorPage,
    playlistPreview,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(420_000);
    const name = uniqueName('LoopWrap', testInfo.workerIndex);
    const campaign = await campaignApi.seed(name, 3, 1, 'image');
    const files = fileNamesOf(await campaignApi.read(campaign.id));
    expect(files).toHaveLength(3);

    await playlistWithCampaign(playlistEditorPage, 'Wrap', testInfo.workerIndex, name);
    await playlistPreview.open();
    await playlistPreview.waitForFirstFrame();

    const seq = await playlistPreview.sampleSequence(60_000);
    const shown = PlaylistPreviewPage.campaignFrames(seq, files);
    await testInfo.attach('frame-sequence', {
      body: seq.map((f) => `${f.at}ms  ${f.file}`).join('\n'),
      contentType: 'text/plain',
    });

    expect(
      shown.length,
      `need at least two full cycles to see the wrap — saw ${shown.join(' -> ')}`,
    ).toBeGreaterThanOrEqual(6);

    // ((i-1) mod 3) + 1 means the sequence is the file list, repeated verbatim.
    // The boundary is where an off-by-one lives: a wrap that skips file 1 or shows
    // the last file twice fails here and nowhere else.
    expect(
      shown.slice(0, 6),
      'two full cycles must follow the file list in order, wrapping cleanly at the boundary',
    ).toEqual(PlaylistPreviewPage.expectedCycle(files, shown[0], 6));
  });

  test('CP-LOOP-003 · a single-file campaign shows that file on every pass @preview @regression', async ({
    playlistEditorPage,
    playlistPreview,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(360_000);
    const name = uniqueName('Loop1', testInfo.workerIndex);
    const campaign = await campaignApi.seed(name, 1, 1, 'image');
    const files = fileNamesOf(await campaignApi.read(campaign.id));
    expect(files).toHaveLength(1);

    await playlistWithCampaign(playlistEditorPage, 'Single', testInfo.workerIndex, name);
    await playlistPreview.open();
    await playlistPreview.waitForFirstFrame();

    const seq = await playlistPreview.sampleSequence(35_000);
    const shown = PlaylistPreviewPage.campaignFrames(seq, files);

    // N=1 makes the modulo degenerate. It must behave like plain media, not stall
    // the loop or blank the slot.
    expect(
      shown.length,
      `the single file must keep appearing — ${seq.map((f) => f.file).join(' -> ')}`,
    ).toBeGreaterThanOrEqual(2);
    expect(new Set(shown).size, 'only that one file may ever appear').toBe(1);
    expect(shown[0]).toBe(files[0]);
  });

  test('CP-LOOP-004 · a two-file campaign strictly alternates @preview @regression', async ({
    playlistEditorPage,
    playlistPreview,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(360_000);
    const name = uniqueName('Loop2', testInfo.workerIndex);
    const campaign = await campaignApi.seed(name, 2, 1, 'image');
    const files = fileNamesOf(await campaignApi.read(campaign.id));
    expect(files).toHaveLength(2);

    await playlistWithCampaign(playlistEditorPage, 'Alt', testInfo.workerIndex, name);
    await playlistPreview.open();
    await playlistPreview.waitForFirstFrame();

    const seq = await playlistPreview.sampleSequence(45_000);
    const shown = PlaylistPreviewPage.campaignFrames(seq, files);
    expect(shown.length, `saw ${shown.join(' -> ')}`).toBeGreaterThanOrEqual(4);

    // A,B,A,B — never the same file twice running. Two consecutive identical
    // appearances mean the index failed to advance on that pass.
    for (let i = 1; i < Math.min(shown.length, 6); i += 1) {
      expect(
        shown[i],
        `appearance ${i + 1} must differ from ${i} — strict alternation, saw ${shown.join(' -> ')}`,
      ).not.toBe(shown[i - 1]);
    }
    expect(shown.slice(0, 4)).toEqual(PlaylistPreviewPage.expectedCycle(files, shown[0], 4));
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  The zero-file case — a live defect with a path to the player
  // ───────────────────────────────────────────────────────────────────────────

  test('CP-LOOP-009 · BUG-CMP-01 · a zero-file campaign must never reach the player @preview @critical', async ({
    playlistEditorPage,
    playlistPreview,
    campaignApi,
    consoleMonitor,
  }, testInfo) => {
    test.setTimeout(360_000);
    test.fail(
      true,
      'BUG-CMP-01: POST /campaign/create accepts data: [], so a zero-file campaign ' +
        'can be built and dropped into a playlist. The loop then evaluates (i-1) mod 0.',
    );

    const name = uniqueName('LoopZero', testInfo.workerIndex);
    // Straight at the defect: the API accepts this today.
    const created = await campaignApi.createRaw({
      name,
      data: [],
      defaultDuration: 10,
      folderId: null,
    });
    expect(
      created.status(),
      'a campaign with no media must be rejected at creation — this is the fix that closes BUG-CMP-01',
    ).toBeGreaterThanOrEqual(400);

    // If creation was (wrongly) allowed, the rest documents the consequence: the
    // modulo-by-zero reaches a player. Asserting on it here is what turns an
    // abstract API defect into a customer-visible one.
    await playlistWithCampaign(playlistEditorPage, 'Zero', testInfo.workerIndex, name);
    await playlistPreview.open();
    await playlistPreview.waitForFirstFrame();
    const seq = await playlistPreview.sampleSequence(20_000);

    await testInfo.attach('frame-sequence', {
      body: seq.map((f) => `${f.at}ms  ${f.file}`).join('\n'),
      contentType: 'text/plain',
    });
    expect(consoleMonitor.summary(), 'and it must not throw in the player').not.toMatch(
      /NaN|Infinity|cannot read propert|undefined is not/i,
    );
  });
});
