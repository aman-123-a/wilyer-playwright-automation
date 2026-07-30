// =============================================================================
//  CMS → PLAYER — the end-to-end assertion this whole product is judged on.
//
//  Every other suite proves half the system. This one proves the join: content
//  that exists in the CMS reaches the panel on the wall, and does so inside an
//  SLA. The interesting output is not pass/fail but the LATENCY — the number
//  regresses long before delivery outright breaks, and it is the number an
//  operator complains about ("I published it ten minutes ago").
//
//  Setup this suite needs, because it cannot be inferred from the device:
//      ANDROID_TEST_PLAYLIST   playlist already assigned to this screen
//      ANDROID_TEST_MEDIA      a media filename inside that playlist
// =============================================================================

import { test, expect } from '../../../../fixtures/android-fixtures';
import { requireDevice } from '../../../../helpers/android';
import { ANDROID } from '../../../../config/android';

test.describe.configure({ mode: 'serial' });

test.describe('CMS to player', () => {
  requireDevice();

  test.skip(
    ANDROID.TEST_PLAYLIST.length === 0,
    'Set ANDROID_TEST_PLAYLIST (and ANDROID_TEST_MEDIA) to the playlist assigned ' +
      'to this screen — the CMS-to-device join cannot be guessed.',
  );

  // A sync round-trip plus playback confirmation outruns the global 90s budget.
  test.setTimeout(ANDROID.SYNC_TIMEOUT_MS + 120_000);

  test('the assigned playlist exists in the CMS @e2e @player', async ({ playlistsPage }) => {
    await playlistsPage.open();
    await playlistsPage.expectListLoaded();
    await playlistsPage.searchPlaylists(ANDROID.TEST_PLAYLIST);

    // Asserted first and separately: if the playlist is missing from the CMS,
    // the device assertions below would fail for a reason that has nothing to
    // do with the device, and someone would spend a morning on the wrong half.
    await expect.poll(() => playlistsPage.cardCount(), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test('its media is cached on the device @e2e @player', async ({ player }, testInfo) => {
    const media = ANDROID.TEST_MEDIA;
    test.skip(media.length === 0, 'Set ANDROID_TEST_MEDIA to a file inside the playlist.');

    const cached = await player.cachedMediaNames();
    await testInfo.attach('cached-media.txt', {
      body: cached.join('\n'),
      contentType: 'text/plain',
    });

    expect(cached.some((f) => f.toLowerCase().includes(media.toLowerCase()))).toBe(true);
  });

  test('a forced sync completes within the SLA @e2e @player @performance', async ({
    player,
    adb,
  }, testInfo) => {
    const media = ANDROID.TEST_MEDIA;
    test.skip(media.length === 0, 'Set ANDROID_TEST_MEDIA to a file inside the playlist.');

    await adb.clearLogcat();
    const how = await player.forceSync();

    const latencyMs = await player.waitForMediaDownload(media);

    testInfo.annotations.push({
      type: 'sync',
      description: `${media} available ${latencyMs}ms after a ${how} sync (SLA ${ANDROID.SYNC_TIMEOUT_MS}ms)`,
    });

    expect(latencyMs).toBeLessThan(ANDROID.SYNC_TIMEOUT_MS);

    // A sync that delivers the file but kills the app has still failed the user.
    await player.expectHealthy();
  });

  test('the playlist actually plays after syncing @e2e @player', async ({ player }, testInfo) => {
    const media = ANDROID.TEST_MEDIA;
    test.skip(media.length === 0, 'Set ANDROID_TEST_MEDIA to a file inside the playlist.');

    const nowPlaying = await player.nowPlaying();
    test.skip(
      nowPlaying === null,
      'The player logs no now-playing line, so playback cannot be observed. ' +
        'Set ANDROID_NOW_PLAYING_PATTERN, or request a log line from the app team.',
    );

    // Downloaded ≠ displayed. A file on disk that never reaches the surface is
    // the most common "but the CMS says it was sent" defect in signage.
    const latencyMs = await player.waitForPlayback(media);

    testInfo.annotations.push({
      type: 'playback',
      description: `${media} on screen after ${latencyMs}ms`,
    });
    await player.captureEvidence(testInfo, 'playing');
  });
});
