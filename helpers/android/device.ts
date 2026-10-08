// =============================================================================
//  Device gating — declare that a suite needs real Android hardware.
//
//  Same contract as requireFeature (helpers/features.ts): a suite that cannot
//  run must SKIP with a reason, never fail. Nobody has a signage box plugged in
//  while writing CMS tests, and a red suite that only means "no hardware here"
//  is how people stop reading the report.
//
//      test.describe('Player', () => {
//        requireDevice();
//        ...
//      });
// =============================================================================

import { test } from '@playwright/test';
import { ANDROID, hasAndroidConfig } from '../../config/android';
import { Adb } from './adb';

/**
 * Skip the enclosing describe unless a device is both configured and attached.
 *
 * Two checks, deliberately at different times: the config check is free and
 * runs at collection, the attachment check costs one `adb devices` and runs per
 * test — a box can drop off mid-run (power cut, USB reset), and that is a
 * skip-with-a-reason rather than a cascade of misleading failures.
 */
export function requireDevice(): void {
  test.skip(
    !hasAndroidConfig(),
    'No Android player configured. Set ANDROID_APP_PACKAGE (and see .env.example) ' +
      'to run the device suites.',
  );

  test.beforeEach(async () => {
    const adb = new Adb();
    const ready = await adb.isReady();
    test.skip(
      !ready,
      `Android device not reachable over adb (${await adb.describe()}). ` +
        `Check \`adb devices\`, or \`adb connect <ip>:5555\` for a networked box.`,
    );
  });
}

/**
 * Additionally require permission to disrupt the device — cut WiFi, force-stop
 * the player, reboot it. Fine on a lab box, not fine on a screen in a lobby, so
 * it never happens by default and never on production.
 */
export function requireDisruptive(): void {
  test.skip(
    !ANDROID.ALLOW_DISRUPTIVE,
    'Disruptive device tests are off. Set ANDROID_ALLOW_DISRUPTIVE=true on a ' +
      'lab device to run them (ignored on the production environment).',
  );
}

/** Non-throwing query, for conditional logic inside a test. */
export const canDriveDevice = (): boolean => hasAndroidConfig();
