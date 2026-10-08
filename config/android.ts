// =============================================================================
//  Android player configuration — the device half of the signage system.
//
//  The CMS is one half of this product: an operator builds a playlist in the
//  browser, and an Android player on a screen somewhere is supposed to download
//  and play it. A CMS-only suite proves the first half and assumes the second,
//  which is precisely where the interesting defects live (sync latency, offline
//  behaviour, reboot recovery).
//
//  Everything here is optional. With no device configured the player suites
//  SKIP with a readable reason — exactly like an undeployed feature — so a
//  normal CMS run on a laptop with no hardware attached stays green.
//
//  Import `ANDROID` — never read process.env directly from a spec or helper.
// =============================================================================

import { ENV } from './env';

// Importing ENV above has already loaded the .env files; these readers only
// need to layer the Android keys on top.
const pick = (key: string, fallback: string): string => process.env[key] ?? fallback;

const num = (key: string, fallback: number): number => {
  const raw = process.env[key];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  return raw === undefined ? fallback : raw === 'true';
};

const PACKAGE = pick('ANDROID_APP_PACKAGE', '');

export const ANDROID = {
  /** Player APK package name, e.g. com.wilyer.signage. Empty = not configured. */
  PACKAGE,

  /** Launcher activity. Appium can usually infer it; set it when it cannot. */
  ACTIVITY: pick('ANDROID_APP_ACTIVITY', ''),

  /**
   * Target device serial (`adb devices`). Empty means "the only one attached" —
   * fine locally, but always set it in a lab with more than one box connected,
   * otherwise adb picks non-deterministically and a run reports on the wrong screen.
   */
  UDID: pick('ANDROID_DEVICE_UDID', ''),

  /** adb binary. On PATH by default; override for a non-standard SDK location. */
  ADB_PATH: pick('ANDROID_ADB_PATH', 'adb'),

  /** Appium server base URL — `appium` started with default flags listens here. */
  APPIUM_URL: pick('ANDROID_APPIUM_URL', 'http://127.0.0.1:4723').replace(/\/+$/, ''),

  /**
   * Where the player caches downloaded media on device. The scoped-storage
   * default is derived from the package; override if the app writes elsewhere.
   */
  MEDIA_DIR: pick('ANDROID_MEDIA_DIR', PACKAGE ? `/sdcard/Android/data/${PACKAGE}/files` : ''),

  /** logcat tag the player logs playback under — narrows a very noisy stream. */
  LOG_TAG: pick('ANDROID_LOG_TAG', ''),

  /**
   * Regex with ONE capture group, matched against logcat to read what is on
   * screen right now. The default matches lines like `Now playing: Diwali.mp4`;
   * point it at whatever the app actually emits.
   */
  NOW_PLAYING_PATTERN: pick('ANDROID_NOW_PLAYING_PATTERN', 'now playing[:\\s]+(.+)'),

  /**
   * How long a CMS publish may take to reach the device. This is a product SLA,
   * not a flake knob — if a run needs it raised, that is the finding.
   */
  SYNC_TIMEOUT_MS: num('ANDROID_SYNC_TIMEOUT_MS', 120_000),

  /** Appium session setup budget — device-side server install can be slow. */
  SESSION_TIMEOUT_MS: num('ANDROID_SESSION_TIMEOUT_MS', 120_000),

  /** Default element wait used by the driver's polling helpers. */
  ELEMENT_TIMEOUT_MS: num('ANDROID_ELEMENT_TIMEOUT_MS', 15_000),

  /**
   * Name of the playlist already assigned to this device in the CMS, and a
   * media file it contains. The end-to-end suite needs a known pairing between
   * a CMS record and this specific screen; it cannot be guessed, so the suite
   * skips rather than asserting against whatever happens to be on the box.
   */
  TEST_PLAYLIST: pick('ANDROID_TEST_PLAYLIST', ''),
  TEST_MEDIA: pick('ANDROID_TEST_MEDIA', ''),

  /** Soak duration in minutes. 0 disables the soak suite. */
  SOAK_MINUTES: num('ANDROID_SOAK_MINUTES', 0),

  /** Memory growth over a soak run that counts as a leak (percent of baseline). */
  SOAK_MEMORY_GROWTH_PCT: num('ANDROID_SOAK_MEMORY_GROWTH_PCT', 50),

  /** How long to wait for a device to come back after `adb reboot`. */
  REBOOT_TIMEOUT_MS: num('ANDROID_REBOOT_TIMEOUT_MS', 180_000),

  /**
   * Resilience suites cut WiFi, force-stop the app and reboot the box. Harmless
   * on a lab device, disruptive on one showing real content — so it is opt-in,
   * and gated a second time by the CMS-wide destructive flag.
   */
  ALLOW_DISRUPTIVE: bool('ANDROID_ALLOW_DISRUPTIVE', false) && !ENV.IS_PRODUCTION,
} as const;

/** True when a package name is configured — the minimum to drive a device. */
export const hasAndroidConfig = (): boolean => ANDROID.PACKAGE.length > 0;

export default ANDROID;
