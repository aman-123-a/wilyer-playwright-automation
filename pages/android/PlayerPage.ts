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
//  The UI selectors below were confirmed against com.wilyer.signageplayer 3.12.7
//  on 2026-08-04 via `npm run player:discovery`. Re-run it on a new build; it
//  audits every selector here and attaches the result to the report.
//
//      adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml
//
//  What that dump established, and why the split below exists: the build sets
//  resource-ids but almost no contentDescription, so accessibility ids do not
//  work here — an earlier `~name` set resolved 0/8. It also renders content
//  through a WebView, which native queries cannot see inside, so playback is
//  still an Adb question and only the chrome around it is an Appium one.
// =============================================================================

import { expect, type TestInfo } from '@playwright/test';
import { ANDROID } from '../../config/android';
import { Adb } from '../../helpers/android/adb';
import { by, type AppiumDriver, type Selector } from '../../helpers/android/AppiumDriver';

/**
 * Playback-screen selectors, all CONFIRMED present on 3.12.7.
 *
 * Resource ids rather than accessibility ids, because this build sets almost no
 * contentDescription — `by.id` resolves a bare name against ANDROID.PACKAGE.
 */
export const PLAYER = {
  /** Outermost app-owned container — the rotation wrapper. */
  root: by.id('rootRotateLayout'),
  /** Where content actually renders. Native queries cannot see inside it. */
  webView: by.id('webview'),
  /** Full-screen still-image surface, used between video items. */
  contentImage: by.id('image_view'),
  /** Navigation drawer host — settings live behind it on this build. */
  drawer: by.id('my_drawer_layout'),
  navHost: by.id('nav_host_fragment'),

  /**
   * Status LEDs along the bottom-left, 15px squares.
   *
   * Presence only. All three ship contentDescription="TODO", so which STATE
   * each is in — online vs offline, connected vs not, downloading vs idle — is
   * not exposed to accessibility at all. Read state through Adb; these confirm
   * the status bar rendered, nothing more. Their being useful is a request for
   * the app team (set a real contentDescription), not something a selector can
   * work around.
   */
  onlineIndicator: by.id('isDeviceOnlineOrOfflineStatusIndicatorImageView'),
  socketIndicator: by.id('isConnectedToWebSocketServerStatusIndicatorImageView'),
  downloadIndicator: by.id('isFileDownloadingStatusIndicatorImageView'),
} as const satisfies Record<string, Selector>;

/**
 * The content surfaces. The WebView renders video and HTML, the ImageView a
 * still — and observation across discovery runs shows they are NOT mutually
 * exclusive: both are frequently attached at once, and the ImageView comes and
 * goes with what is scheduled at that second.
 *
 * So the rule is "at least one", not "exactly one" and not a specific one:
 * anything stricter makes a suite fail on the playlist rather than the player.
 */
export const CONTENT_SURFACES = ['webView', 'contentImage'] as const;

/**
 * Selectors for screens a healthy paired player is NOT showing — pairing and
 * settings. Discovery cannot confirm these while the device is playing content,
 * so they remain assumptions and are kept out of PLAYER so the audit in
 * player-ui-surface.spec.ts does not report permanent, meaningless misses.
 *
 * UNCONFIRMED. Correct them the first time a spec drives an unenrolled box.
 */
export const PLAYER_UNCONFIRMED = {
  pairingCode: by.accessibilityId('pairingCode'),
  pairingInput: by.accessibilityId('pairingCodeInput'),
  pairSubmit: by.accessibilityId('pairSubmit'),
  settingsButton: by.accessibilityId('settings'),
  syncButton: by.accessibilityId('syncNow'),
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
    if (this.driver && (await this.driver.isElementVisible(PLAYER_UNCONFIRMED.syncButton, 3_000))) {
      await this.driver.tap(PLAYER_UNCONFIRMED.syncButton);
      return 'ui';
    }
    await this.adb.restartApp();
    await this.waitUntilPlaying();
    return 'restart';
  }

  /** Pairing code shown on an unenrolled device, for CMS-side enrolment. */
  async readPairingCode(): Promise<string> {
    return (await this.ui().find(PLAYER_UNCONFIRMED.pairingCode)).text();
  }

  async enterPairingCode(code: string): Promise<void> {
    const input = await this.ui().find(PLAYER_UNCONFIRMED.pairingInput);
    await input.clear();
    await input.type(code);
    await this.ui().tap(PLAYER_UNCONFIRMED.pairSubmit);
  }

  async openSettings(): Promise<void> {
    await this.ui().tap(PLAYER_UNCONFIRMED.settingsButton);
  }

  // ─── Assertions ───────────────────────────────────────────────────────────

  /** The player owns the screen and has not crashed since the last log clear. */
  async expectHealthy(): Promise<void> {
    expect(await this.adb.isRunning(), 'player process should be alive').toBe(true);
    expect(await this.adb.isForeground(), 'player should own the foreground').toBe(true);
    expect(await this.adb.crashes(), 'player should not have crashed').toEqual([]);
  }

  /**
   * The playback surface actually rendered — the case adb cannot distinguish.
   *
   * A player that is alive and foreground can still be showing a blank Activity
   * with no content view attached, which `expectHealthy` reports as perfectly
   * fine. This asserts the app's own view tree is up.
   *
   * Needs an Appium session, so it is a separate method rather than folded into
   * expectHealthy — most callers should not pay for a session.
   */
  async expectSurfaceRendered(): Promise<void> {
    const ui = this.ui();

    expect(
      await ui.isElementVisible(PLAYER.root, ANDROID.ELEMENT_TIMEOUT_MS),
      'player root layout should be on screen',
    ).toBe(true);

    // Either or both may be attached: WebView for video/HTML, ImageView for a
    // still. Requiring a specific one would fail purely on what is scheduled.
    const [webView, image] = await Promise.all([
      ui.isElementVisible(PLAYER.webView, 2_000),
      ui.isElementVisible(PLAYER.contentImage, 2_000),
    ]);
    expect(webView || image, 'no content surface (webview or image_view) is rendered').toBe(true);
  }

  /**
   * The three status LEDs rendered. Presence only — see the note on PLAYER:
   * this build gives them contentDescription="TODO", so their state is
   * unreadable and `health()` remains the source of truth for online/offline.
   */
  async expectStatusIndicators(): Promise<void> {
    const ui = this.ui();

    for (const [name, selector] of [
      ['online', PLAYER.onlineIndicator],
      ['websocket', PLAYER.socketIndicator],
      ['download', PLAYER.downloadIndicator],
    ] as const) {
      expect(
        await ui.isElementVisible(selector, 2_000),
        `${name} status indicator should be rendered`,
      ).toBe(true);
    }
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
