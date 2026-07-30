// =============================================================================
//  PlayerPage — the Android signage player, as a page object.
//
//  Unusual for a page object in that it has TWO backends and picks per question:
//
//   • Adb    — is the app alive, what has it downloaded, what is on the panel,
//              how much memory is it holding. Works during playback, when there
//              is no interactive UI at all, and keeps answering while the app
//              is crashing.
//   • Appium — pairing, settings, any screen with real widgets. Only created
//              when a spec actually asks for it, because a session costs
//              seconds and most player assertions do not need one.
//
//  The UI selectors below are the part that must be confirmed against the real
//  build. Dump the hierarchy once and correct them:
//
//      adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml
//
//  If that dump shows nothing but a SurfaceView, that is itself the answer: the
//  player has no queryable UI and every assertion should go through Adb.
// =============================================================================

import { expect, type TestInfo } from '@playwright/test';
import { ANDROID } from '../../config/android';
import { Adb } from '../../helpers/android/adb';
import { by, type AppiumDriver, type Selector } from '../../helpers/android/AppiumDriver';

/**
 * Player UI selectors. Accessibility ids first — they survive layout changes
 * and cost one lookup rather than an xpath walk. Text fallbacks are provided
 * where the app is more likely to expose a label than a contentDescription.
 *
 * UNCONFIRMED against a real build — see the file header.
 */
export const PLAYER = {
  pairingCode: by.accessibilityId('pairingCode'),
  pairingInput: by.accessibilityId('pairingCodeInput'),
  pairSubmit: by.accessibilityId('pairSubmit'),
  settingsButton: by.accessibilityId('settings'),
  syncButton: by.accessibilityId('syncNow'),
  nowPlayingLabel: by.accessibilityId('nowPlaying'),
  deviceName: by.accessibilityId('deviceName'),
  errorBanner: by.textContains('error'),
} as const satisfies Record<string, Selector>;

/** One snapshot of everything worth knowing about the device. */
export interface PlayerHealth {
  installed: boolean;
  running: boolean;
  foreground: boolean;
  appVersion: string;
  androidVersion: string;
  mediaFileCount: number;
  mediaBytes: number;
  freeSpaceKb: number;
  memoryKb: number;
  online: boolean;
  crashes: string[];
}

export class PlayerPage {
  readonly adb: Adb;

  /** Set only when a spec opened an Appium session — see `withUi`. */
  private driver?: AppiumDriver;

  constructor(adb: Adb = new Adb(), driver?: AppiumDriver) {
    this.adb = adb;
    this.driver = driver;
  }

  /** Attach (or replace) the Appium session used by the UI methods. */
  withUi(driver: AppiumDriver): this {
    this.driver = driver;
    return this;
  }

  private ui(): AppiumDriver {
    if (!this.driver) {
      throw new Error(
        'This action needs the Appium session. Request the `appium` fixture in the ' +
          'test, or use an adb-backed method instead.',
      );
    }
    return this.driver;
  }

  // ─── State (adb — no Appium session required) ─────────────────────────────

  /**
   * "Playing" means the process is alive AND owns the foreground. Process-alive
   * alone is not enough: a player that has been pushed behind the launcher or a
   * system dialog is running perfectly and showing nobody anything, which is
   * exactly the failure a screen in a shop actually suffers.
   */
  async isPlaying(): Promise<boolean> {
    return (await this.adb.isRunning()) && (await this.adb.isForeground());
  }

  /**
   * What the player says it is showing, read from logcat. There is no way to
   * ask a video surface what frame it is on, so this depends on the app logging
   * it — point ANDROID_NOW_PLAYING_PATTERN at whatever it actually emits.
   * Returns the most recent match, or null when nothing matched.
   */
  async nowPlaying(): Promise<string | null> {
    const pattern = new RegExp(ANDROID.NOW_PLAYING_PATTERN, 'i');
    const lines = await this.adb.logcat(pattern);
    const last = lines[lines.length - 1];
    return last?.match(pattern)?.[1]?.trim() ?? null;
  }

  /** Bare filenames the player has cached — what a sync assertion compares on. */
  async cachedMediaNames(): Promise<string[]> {
    const files = await this.adb.mediaFiles();
    return files.map((path) => path.split('/').pop() ?? path);
  }

  async hasCachedMedia(name: string): Promise<boolean> {
    const needle = name.toLowerCase();
    return (await this.cachedMediaNames()).some((file) => file.toLowerCase().includes(needle));
  }

  /**
   * Block until `name` has been downloaded, and return how long it took.
   *
   * The returned latency is the point of this method — "content eventually
   * arrived" is a weak assertion, "content arrived in 14s against a 120s SLA"
   * is a number a release decision can be made on, and a regression in it shows
   * up long before an outright failure does.
   */
  async waitForMediaDownload(name: string, timeoutMs = ANDROID.SYNC_TIMEOUT_MS): Promise<number> {
    return this.adb.waitFor(() => this.hasCachedMedia(name), {
      timeoutMs,
      what: `"${name}" to reach the device`,
    });
  }

  /** Block until the player reports `name` on screen. Returns the latency. */
  async waitForPlayback(name: string, timeoutMs = ANDROID.SYNC_TIMEOUT_MS): Promise<number> {
    const needle = name.toLowerCase();
    return this.adb.waitFor(
      async () => (await this.nowPlaying())?.toLowerCase().includes(needle) ?? false,
      { timeoutMs, what: `"${name}" to start playing` },
    );
  }

  /** Block until the player is alive and in the foreground — post-restart/boot. */
  async waitUntilPlaying(timeoutMs = 60_000): Promise<number> {
    return this.adb.waitFor(() => this.isPlaying(), {
      timeoutMs,
      what: 'the player to reach the foreground',
    });
  }

  /** Everything at once, for a baseline at the start of a soak run. */
  async health(): Promise<PlayerHealth> {
    return {
      installed: await this.adb.isInstalled(),
      running: await this.adb.isRunning(),
      foreground: await this.adb.isForeground(),
      appVersion: await this.adb.appVersion(),
      androidVersion: await this.adb.androidVersion(),
      mediaFileCount: (await this.adb.mediaFiles()).length,
      mediaBytes: await this.adb.mediaBytes(),
      freeSpaceKb: await this.adb.freeSpaceKb(),
      memoryKb: await this.adb.memoryKb(),
      online: await this.adb.isOnline(),
      crashes: await this.adb.crashes(),
    };
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  /**
   * Force a content refresh. Prefers the in-app button; falls back to an app
   * restart, which every player supports. The distinction matters to the test
   * that calls it: a restart also proves the app re-syncs on cold start.
   */
  async forceSync(): Promise<'ui' | 'restart'> {
    if (this.driver && (await this.driver.isElementVisible(PLAYER.syncButton, 3_000))) {
      await this.driver.tap(PLAYER.syncButton);
      return 'ui';
    }
    await this.adb.restartApp();
    await this.waitUntilPlaying();
    return 'restart';
  }

  /** Pairing code shown on an unenrolled device, for CMS-side enrolment. */
  async readPairingCode(): Promise<string> {
    return (await this.ui().find(PLAYER.pairingCode)).text();
  }

  async enterPairingCode(code: string): Promise<void> {
    const input = await this.ui().find(PLAYER.pairingInput);
    await input.clear();
    await input.type(code);
    await this.ui().tap(PLAYER.pairSubmit);
  }

  async openSettings(): Promise<void> {
    await this.ui().tap(PLAYER.settingsButton);
  }

  // ─── Assertions ───────────────────────────────────────────────────────────

  /** The player owns the screen and has not crashed since the last log clear. */
  async expectHealthy(): Promise<void> {
    expect(await this.adb.isRunning(), 'player process should be alive').toBe(true);
    expect(await this.adb.isForeground(), 'player should own the foreground').toBe(true);
    expect(await this.adb.crashes(), 'player should not have crashed').toEqual([]);
  }

  // ─── Evidence ─────────────────────────────────────────────────────────────

  /**
   * Attach a screenshot, the log tail and a health snapshot to the report.
   *
   * A device failure is expensive to reproduce — the box may be in another
   * building, and the state that caused it is gone the moment the next test
   * restarts the app. Capturing on the spot is the difference between a bug
   * report and "it failed once last week".
   */
  async captureEvidence(testInfo: TestInfo, label = 'player'): Promise<void> {
    await testInfo
      .attach(`${label}-screen.png`, {
        body: await this.adb.screenshot(),
        contentType: 'image/png',
      })
      .catch(() => undefined);

    const lines = await this.adb.logcat();
    await testInfo.attach(`${label}-logcat.txt`, {
      body: lines.slice(-300).join('\n'),
      contentType: 'text/plain',
    });

    await testInfo.attach(`${label}-health.json`, {
      body: JSON.stringify(await this.health(), null, 2),
      contentType: 'application/json',
    });
  }
}

export default PlayerPage;
