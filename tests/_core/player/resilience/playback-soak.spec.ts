// =============================================================================
//  ANDROID PLAYER — soak.
//
//  Signage players are never restarted. They run for months, so the defects that
//  reach customers are the slow ones: a decoder that leaks a few MB per video, a
//  handle that is never closed, a service that dies quietly at 3am. None of them
//  are visible in a five-minute functional run — by construction, only elapsed
//  time finds them.
//
//  Opt-in and unbounded by design:  ANDROID_SOAK_MINUTES=720 npm run player
// =============================================================================

import { test, expect } from '../../../../fixtures/android-fixtures';
import { requireDevice } from '../../../../helpers/android';
import { ANDROID } from '../../../../config/android';

const SOAK_MS = ANDROID.SOAK_MINUTES * 60_000;
const SAMPLE_INTERVAL_MS = 60_000;

test.describe.configure({ mode: 'serial' });

test.describe('Android player — soak', () => {
  requireDevice();

  test.skip(
    ANDROID.SOAK_MINUTES <= 0,
    'Soak is off. Set ANDROID_SOAK_MINUTES (e.g. 720 for a twelve-hour run).',
  );

  // The run duration plus room for the final sampling pass.
  test.setTimeout(SOAK_MS + 120_000);

  test(`stays alive and flat for ${ANDROID.SOAK_MINUTES} minutes @player @soak`, async ({
    adb,
    player,
  }, testInfo) => {
    await adb.clearLogcat();

    const baselineKb = await adb.memoryKb();
    const samples: { minute: number; memoryKb: number; playing: boolean }[] = [];
    const deadline = Date.now() + SOAK_MS;
    const started = Date.now();

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));

      const sample = {
        minute: Math.round((Date.now() - started) / 60_000),
        memoryKb: await adb.memoryKb(),
        playing: await player.isPlaying(),
      };
      samples.push(sample);

      // Fail at the moment of death, not at the end. The log buffer and the
      // screen still hold the cause now; in six hours they will not.
      if (!sample.playing) {
        await player.captureEvidence(testInfo, `died-at-${sample.minute}min`);
        throw new Error(`Player stopped playing after ${sample.minute} minutes`);
      }
    }

    await testInfo.attach('soak-samples.csv', {
      body: [
        'minute,memoryKb,playing',
        ...samples.map((s) => `${s.minute},${s.memoryKb},${s.playing}`),
      ].join('\n'),
      contentType: 'text/csv',
    });

    const peakKb = Math.max(...samples.map((s) => s.memoryKb));
    const growthPct = baselineKb > 0 ? ((peakKb - baselineKb) / baselineKb) * 100 : 0;

    testInfo.annotations.push({
      type: 'memory',
      description: `baseline ${baselineKb}KB → peak ${peakKb}KB (+${growthPct.toFixed(1)}%)`,
    });

    expect(await adb.crashes(), 'crashes during the soak').toEqual([]);

    // Compared against the baseline as a percentage rather than an absolute
    // ceiling: the same APK on a 1GB box and a 4GB box legitimately settles at
    // very different figures, but neither should keep climbing.
    expect(growthPct, 'memory growth over the soak run').toBeLessThan(
      ANDROID.SOAK_MEMORY_GROWTH_PCT,
    );
  });
});
