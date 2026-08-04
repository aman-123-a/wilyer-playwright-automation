// =============================================================================
//  Campaigns V1 — MANAGE SCREEN INTEGRATION (SCR-001…006).
//
//  Target: cms2.pocsample.in (branch `cms2`). Never run on `live`.
//
//  ── What this file pins ─────────────────────────────────────────────────────
//  The last hop of the campaign delivery chain: campaign → playlist → SCREEN.
//  Mapped live on 2026-08-03 across /screens and /screen-settings/<id>, a screen's
//  Media tab offers exactly two content sections — DIRECT PLAYLIST (one playlist)
//  and INDIVIDUAL MEDIA FILES (bare media) — plus scheduled playlists. There is no
//  campaign mode, no campaign tab and no campaign picker anywhere beneath a screen,
//  which is the same shape the cluster surface has (see ../cluster/…).
//
//  So a campaign reaches a screen only INDIRECTLY, by sitting in a playlist that is
//  then published to the screen. SCR-004 walks that whole chain end to end and reads
//  it back from the API; SCR-002/003 pin the absence of a direct route so that the
//  day one is added, these fail and get rewritten deliberately.
//
//  ── Shared-server discipline ────────────────────────────────────────────────
//  Publishing changes what a colleague's screen plays, so:
//   • only a screen that currently has NO direct playlist is ever targeted, and
//   • every test that publishes unpublishes again in a finally, verified by reload,
//   • individual media files on the screen are never touched (Clear Content, which
//     would wipe them, is never pressed).
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { PlaylistService } from '../../../../api';
import type { ScreensPage } from '../../../../pages/ScreensPage';
import type { ScreenSettingsPage } from '../../../../pages/ScreenSettingsPage';
import type { PlaylistEditorPage } from '../../../../pages/PlaylistEditorPage';
import { uniqueName } from '../../../../test-data/campaigns.data';

const PLAYLIST_PREFIX = 'QA_SCREEN_';
const workerPrefix = (workerIndex: number): string => `${PLAYLIST_PREFIX}w${workerIndex}_`;

/**
 * A screen with an empty Direct Playlist slot.
 *
 * Screen ids are not fixed test data — they are whatever the shared account holds —
 * and publishing over a screen that already carries a playlist would silently
 * replace a colleague's content with no way to know what to restore. So the target
 * is discovered, and only an empty slot qualifies.
 */
async function screenWithNoDirectPlaylist(
  screens: ScreensPage,
  settings: ScreenSettingsPage,
  limit = 8,
): Promise<string | null> {
  await screens.open();
  await screens.expectListLoaded();
  const hrefs = await screens
    .screenRows()
    .evaluateAll((els) =>
      els.slice(0, 40).map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
  const ids = [...new Set(hrefs.map((h) => h.split('/').pop() ?? '').filter(Boolean))];

  for (const id of ids.slice(0, limit)) {
    await settings.open(id);
    if ((await settings.directPlaylistName()) === null) return id;
  }
  return null;
}

/** A playlist holding two image slides and the named campaign, built through the editor. */
async function playlistCarryingCampaign(
  editor: PlaylistEditorPage,
  label: string,
  workerIndex: number,
  campaignName: string,
): Promise<{ id: string; name: string }> {
  const name = `${workerPrefix(workerIndex)}${label}_${Date.now()}`;
  const id = await editor.createPlaylist(name, 'screen integration suite');
  await editor.buildTwoImageSlideZone();
  await editor.addCampaignToZone(campaignName);
  await editor.save();
  return { id, name };
}

test.describe('Campaigns · manage screen integration', () => {
  test.skip(
    !ENV.ALLOW_DESTRUCTIVE,
    'Publishes and unpublishes playlists on a screen. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
  );

  /**
   * Serial, deliberately. Every publishing test targets the SAME discovered screen
   * — the first one with an empty Direct Playlist slot — so running them in
   * parallel would have one test's publish satisfy or break another's precondition.
   */
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async ({ playlistApi, campaignApi }, testInfo) => {
    await playlistApi.cleanupByPrefix(workerPrefix(testInfo.workerIndex)).catch(() => 0);
    const mine = (await campaignApi.findByPrefix('QA_CRUD_')).filter((c) =>
      c.name.toLowerCase().includes(`_w${testInfo.workerIndex}_`),
    );
    for (const c of mine) await campaignApi.deleteQuietly(c.id);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  The surface
  // ───────────────────────────────────────────────────────────────────────────

  test('SCR-001 · a screen manage page is reachable by URL and renders its content sections @smoke @ui', async ({
    screensPage,
    screenSettingsPage,
    page,
  }) => {
    test.setTimeout(180_000);
    await screensPage.open();
    await screensPage.expectListLoaded();

    const href = await screensPage.screenRows().first().getAttribute('href');
    expect(href, 'every screen row must link to its manage page').toMatch(/^\/screen-settings\//);
    const id = href!.split('/').pop()!;

    // Unlike a batch (BUG-CLU-01), this page IS addressable: a reload or a
    // bookmark has to land on the screen, not bounce to the listing.
    await screenSettingsPage.open(id);
    expect(new URL(page.url()).pathname, 'a screen URL must resolve to that screen').toBe(
      `/screen-settings/${id}`,
    );

    await expect(
      screenSettingsPage.directPlaylistHeading,
      'the Direct Playlist section must render',
    ).toBeVisible();
    await expect(
      page.getByText(/^INDIVIDUAL MEDIA FILES$/i).first(),
      'the Individual Media Files section must render',
    ).toBeVisible();
  });

  test('SCR-002 · a screen offers no campaign surface of its own @smoke @critical @ui', async ({
    screensPage,
    screenSettingsPage,
    page,
  }) => {
    test.setTimeout(180_000);
    await screensPage.open();
    const href = await screensPage.screenRows().first().getAttribute('href');
    await screenSettingsPage.open(href!.split('/').pop()!);

    // This is the assertion that encodes the gap. A screen plays a playlist or
    // loose media — if a campaign section ever appears, this fails and the
    // campaign-to-screen cases must be automated for real.
    await expect(
      screenSettingsPage.campaignControls(),
      'a screen has no campaign control — a campaign arrives only inside a playlist',
    ).toHaveCount(0);

    const tabs = await page
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim().toLowerCase()));
    expect(
      tabs.filter((t) => t.includes('campaign')),
      `no tab on the screen surface is campaign-shaped — saw ${JSON.stringify(
        tabs.filter((t) => t.includes('campaign')),
      )}`,
    ).toHaveLength(0);
  });

  test('SCR-003 · the assign picker offers playlists, never campaigns @critical @ui', async ({
    screensPage,
    screenSettingsPage,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(240_000);
    const name = uniqueName('ScrPicker', testInfo.workerIndex);
    await campaignApi.seed(name, 1, 10);

    await screensPage.open();
    const href = await screensPage.screenRows().first().getAttribute('href');
    await screenSettingsPage.open(href!.split('/').pop()!);

    await screenSettingsPage.openPicker();
    await expect(
      screenSettingsPage.publishButtons().first(),
      'the picker must list playlists to publish',
    ).toBeVisible({ timeout: 20_000 });

    // A campaign that demonstrably exists is invisible to this picker. That is
    // the concrete form the gap takes at the screen: an operator cannot publish
    // a campaign to a screen, only a playlist that contains one.
    //
    // Asserted as "no row bears the campaign's name" rather than "no rows at all":
    // the picker also keeps offering whatever is currently published, which is a
    // playlist and has nothing to do with the search.
    await screenSettingsPage.searchPicker(name);
    await expect(
      screenSettingsPage.pickerLabel(name),
      `the screen picker searched a real campaign (${name}) and must not offer it — it lists playlists only`,
    ).toHaveCount(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  The delivery chain
  // ───────────────────────────────────────────────────────────────────────────

  test('SCR-004 · a campaign reaches a screen inside a published playlist @critical @ui @api', async ({
    screensPage,
    screenSettingsPage,
    playlistEditorPage,
    playlistApi,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(420_000);
    const screenId = await screenWithNoDirectPlaylist(screensPage, screenSettingsPage);
    test.skip(
      !screenId,
      'Every screen checked already carries a direct playlist; publishing would replace a colleague’s content.',
    );

    const campaign = uniqueName('ScrChain', testInfo.workerIndex);
    await campaignApi.seed(campaign, 2, 10);
    const playlist = await playlistCarryingCampaign(
      playlistEditorPage,
      'Chain',
      testInfo.workerIndex,
      campaign,
    );

    try {
      await screenSettingsPage.open(screenId!);
      await screenSettingsPage.publishPlaylist(playlist.name);

      // Not proven by the toast: reload and read the card back.
      await screenSettingsPage.open(screenId!);
      expect(
        await screenSettingsPage.directPlaylistName(),
        'the screen must report the published playlist as its direct playlist',
      ).toBe(playlist.name);
      expect(
        await screenSettingsPage.directPlaylistId(),
        'and the card must point at that playlist by id, not merely share its name',
      ).toBe(playlist.id);

      // The campaign has to still be inside what the screen is now playing. A
      // publish that flattened or dropped the campaign reference would leave the
      // screen showing the playlist's files and none of the campaign's.
      const items = PlaylistService.itemsOf(await playlistApi.read(playlist.id));
      const ref = items.find((i) => i.campaign);
      expect(ref, 'the published playlist must still carry a campaign reference').toBeTruthy();
      expect(
        ref!.campaign!.name,
        'and it must be the campaign that was put in it before publishing',
      ).toBe(campaign);
    } finally {
      await screenSettingsPage.open(screenId!).catch(() => undefined);
      if ((await screenSettingsPage.directPlaylistName()) === playlist.name) {
        await screenSettingsPage.unpublishPlaylist().catch(() => undefined);
      }
    }
  });

  test('SCR-005 · unpublishing clears the screen and leaves the campaign intact @critical @ui @api', async ({
    screensPage,
    screenSettingsPage,
    playlistEditorPage,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(420_000);
    const screenId = await screenWithNoDirectPlaylist(screensPage, screenSettingsPage);
    test.skip(!screenId, 'Every screen checked already carries a direct playlist.');

    const campaign = uniqueName('ScrUnpub', testInfo.workerIndex);
    const seeded = await campaignApi.seed(campaign, 1, 10);
    const playlist = await playlistCarryingCampaign(
      playlistEditorPage,
      'Unpub',
      testInfo.workerIndex,
      campaign,
    );

    try {
      await screenSettingsPage.open(screenId!);
      await screenSettingsPage.publishPlaylist(playlist.name);
      await screenSettingsPage.open(screenId!);
      expect(await screenSettingsPage.directPlaylistName(), 'precondition: published').toBe(
        playlist.name,
      );

      await screenSettingsPage.unpublishPlaylist();

      // Persisted, not just repainted.
      await screenSettingsPage.open(screenId!);
      expect(
        await screenSettingsPage.directPlaylistName(),
        'after unpublishing, the screen must carry no direct playlist',
      ).toBeNull();

      // Unpublishing is a screen-level action: it must not reach back and delete
      // the content. The modal promises exactly this ("the playlist will be
      // unpublished from this screen"), so the campaign must survive.
      const still = await campaignApi.findByName(campaign);
      expect(still, 'unpublishing must not delete the campaign it was carrying').toBeTruthy();
      expect(still!.id, 'and it must be the same campaign record').toBe(seeded.id);
    } finally {
      await screenSettingsPage.open(screenId!).catch(() => undefined);
      if ((await screenSettingsPage.directPlaylistName()) === playlist.name) {
        await screenSettingsPage.unpublishPlaylist().catch(() => undefined);
      }
    }
  });

  test('SCR-006 · a screen holds one direct playlist, and publishing a second replaces it @ui @regression', async ({
    screensPage,
    screenSettingsPage,
    playlistEditorPage,
    campaignApi,
  }, testInfo) => {
    test.setTimeout(480_000);
    const screenId = await screenWithNoDirectPlaylist(screensPage, screenSettingsPage);
    test.skip(!screenId, 'Every screen checked already carries a direct playlist.');

    const campaign = uniqueName('ScrSwap', testInfo.workerIndex);
    await campaignApi.seed(campaign, 1, 10);
    const first = await playlistCarryingCampaign(
      playlistEditorPage,
      'SwapA',
      testInfo.workerIndex,
      campaign,
    );
    const second = await playlistCarryingCampaign(
      playlistEditorPage,
      'SwapB',
      testInfo.workerIndex,
      campaign,
    );

    try {
      await screenSettingsPage.open(screenId!);
      await screenSettingsPage.publishPlaylist(first.name);
      await screenSettingsPage.open(screenId!);
      expect(await screenSettingsPage.directPlaylistName()).toBe(first.name);

      // The slot is single-valued. If a second publish stacked instead of
      // replacing, the screen would hold two direct playlists and the operator
      // could not tell which one plays.
      await screenSettingsPage.publishPlaylist(second.name);
      await screenSettingsPage.open(screenId!);
      expect(
        await screenSettingsPage.directPlaylistName(),
        'the newest publish must take the slot',
      ).toBe(second.name);
      await expect(
        screenSettingsPage.directPlaylistCard(),
        'and there must be exactly one direct playlist card',
      ).toHaveCount(1);
    } finally {
      await screenSettingsPage.open(screenId!).catch(() => undefined);
      const held = await screenSettingsPage.directPlaylistName();
      if (held === first.name || held === second.name) {
        await screenSettingsPage.unpublishPlaylist().catch(() => undefined);
      }
    }
  });
});
