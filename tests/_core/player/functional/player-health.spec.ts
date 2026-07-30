// =============================================================================
//  ANDROID PLAYER — health and cached-content smoke.
//
//  The cheapest, highest-value device suite: no Appium session, no CMS traffic,
//  just "is the screen actually working". Run it before anything else — every
//  later device failure is ambiguous until this one is green.
// =============================================================================

import { test, expect } from '../../../../fixtures/android-fixtures';
import { requireDevice } from '../../../../helpers/android';
import { ANDROID } from '../../../../config/android';

// One device, one shared piece of state. Parallel workers would fight over it —
// a restart in one test would fail an assertion in another for no real reason.
test.describe.configure({ mode: 'serial' });

test.describe('Android player — health', () => {
  requireDevice();

  test('player is installed, running and owns the screen @smoke @player', async ({
    adb,
    player,
  }, testInfo) => {
    expect(await adb.isInstalled(), `${ANDROID.PACKAGE} should be installed`).toBe(true);
    expect(await adb.isRunning(), 'player process should be alive').toBe(true);
    expect(await adb.isForeground(), 'player should be the foreground app').toBe(true);

    // Recorded, not asserted: the build under test belongs in the report so a
    // result can be attributed to a specific APK months later.
    await testInfo.attach('device.txt', {
      body: [
        `device:  ${await adb.describe()}`,
        `android: ${await adb.androidVersion()}`,
        `package: ${ANDROID.PACKAGE}`,
        `version: ${await adb.appVersion()}`,
      ].join('\n'),
      contentType: 'text/plain',
    });

    await player.captureEvidence(testInfo, 'health');
  });

  test('player has downloaded content to play @smoke @player', async ({ player, adb }) => {
    const files = await player.cachedMediaNames();

    // An empty cache is a real failure, not a setup problem: a paired screen
    // with nothing downloaded shows a black panel to a paying customer.
    expect(files.length, `no media cached under ${ANDROID.MEDIA_DIR}`).toBeGreaterThan(0);
    expect(await adb.mediaBytes(), 'cached media should not be zero bytes').toBeGreaterThan(0);
  });

  test('device has headroom to accept the next sync @player @regression', async ({ adb }) => {
    const freeKb = await adb.freeSpaceKb();

    // A full disk fails a sync silently — the player keeps showing yesterday's
    // playlist and the CMS reports the rollout as sent. 500 MB is the smallest
    // headroom a single 4K asset can land in.
    expect(freeKb, 'free space on /data').toBeGreaterThan(500 * 1024);
  });

  test('no crashes or ANRs during a settling period @player @regression', async ({
    adb,
    player,
  }) => {
    await adb.clearLogcat();
    // Watch a real slice of playback rather than sampling one instant: crashes
    // in these players cluster at media transitions, not at rest.
    await new Promise((resolve) => setTimeout(resolve, 30_000));

    expect(await adb.crashes(), 'crash / ANR lines in logcat').toEqual([]);
    await player.expectHealthy();
  });

  test('reports what it is currently playing @player @regression', async ({ player }, testInfo) => {
    const playing = await player.nowPlaying();

    testInfo.annotations.push({
      type: 'now-playing',
      description: playing ?? `no match for /${ANDROID.NOW_PLAYING_PATTERN}/ in logcat`,
    });

    // Soft on purpose. A player that logs nothing is not broken — but it is
    // untestable for playback, and that gap should be visible in the report
    // rather than dressed up as a product failure.
    if (playing === null) {
      test.info().annotations.push({
        type: 'gap',
        description:
          'Playback cannot be asserted: the app logs no now-playing line. Set ' +
          'ANDROID_NOW_PLAYING_PATTERN, or ask for a log line to be added.',
      });
    }
    expect(await player.isPlaying(), 'player should be in the foreground').toBe(true);
  });
});
