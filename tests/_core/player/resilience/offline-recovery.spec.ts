// =============================================================================
//  ANDROID PLAYER — real-world resilience.
//
//  A signage box does not live in a lab. It lives above a shop counter on flaky
//  guest WiFi, behind a light switch someone flips at closing time, and nobody
//  ever looks at it until a customer notices a black screen. These are the
//  conditions that actually take screens down — not anything a CMS test can see.
//
//  Every test here disrupts the device, so the suite is doubly gated: it needs
//  ANDROID_ALLOW_DISRUPTIVE=true and never runs against production.
// =============================================================================

import { test, expect } from '../../../../fixtures/android-fixtures';
import { requireDevice, requireDisruptive } from '../../../../helpers/android';
import { ANDROID } from '../../../../config/android';

test.describe.configure({ mode: 'serial' });

test.describe('Android player — resilience', () => {
  requireDevice();
  requireDisruptive();

  test.setTimeout(ANDROID.REBOOT_TIMEOUT_MS + 180_000);

  test('keeps playing cached content with the network down @player @resilience', async ({
    adb,
    player,
  }, testInfo) => {
    const before = await player.cachedMediaNames();
    await adb.clearLogcat();

    await adb.setWifi(false);
    try {
      await adb.waitFor(async () => !(await adb.isOnline()), {
        timeoutMs: 30_000,
        what: 'the network to actually drop',
      });

      // Two minutes offline — long enough to cross a media transition, which is
      // where a player that only holds a stream handle instead of a file falls
      // over. A five-second check would pass on a broken build.
      await new Promise((resolve) => setTimeout(resolve, 120_000));

      await player.expectHealthy();
      expect(await player.cachedMediaNames(), 'cache should survive going offline').toEqual(before);
      await player.captureEvidence(testInfo, 'offline');
    } finally {
      // In `finally`: leaving a lab device with WiFi off silently breaks every
      // later run and looks like a product failure.
      await adb.setWifi(true);
    }

    await adb.waitFor(() => adb.isOnline(), { timeoutMs: 60_000, what: 'network to return' });
  });

  test('recovers and re-syncs when the network returns @player @resilience', async ({
    adb,
    player,
  }, testInfo) => {
    await adb.setWifi(false);
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    await adb.setWifi(true);

    const reconnectMs = await adb.waitFor(() => adb.isOnline(), {
      timeoutMs: 120_000,
      what: 'the device to get back online',
    });

    testInfo.annotations.push({
      type: 'reconnect',
      description: `network restored in ${reconnectMs}ms`,
    });

    await player.expectHealthy();
  });

  test('restarts into playback after a force-stop @player @resilience', async ({
    adb,
    player,
  }, testInfo) => {
    await adb.clearLogcat();
    await adb.stopApp();
    expect(await adb.isRunning(), 'app should be stopped').toBe(false);

    await adb.startApp();
    const recoveryMs = await player.waitUntilPlaying(90_000);

    testInfo.annotations.push({
      type: 'cold-start',
      description: `playing ${recoveryMs}ms after launch`,
    });
    expect(await adb.crashes(), 'cold start should not crash').toEqual([]);
  });

  test('auto-starts into playback after a reboot @player @resilience @critical', async ({
    adb,
    player,
  }, testInfo) => {
    // The one that matters most in the field: power is cut at closing time and
    // restored in the morning with nobody there to touch the screen. If the
    // player does not come back by itself, the shop shows a black panel all day.
    await adb.reboot();

    const bootToPlayMs = await player.waitUntilPlaying(180_000);

    testInfo.annotations.push({
      type: 'reboot-recovery',
      description: `playing ${bootToPlayMs}ms after boot completed`,
    });

    await player.expectHealthy();
    expect(await player.cachedMediaNames(), 'content should survive a reboot').not.toEqual([]);
    await player.captureEvidence(testInfo, 'post-reboot');
  });
});
