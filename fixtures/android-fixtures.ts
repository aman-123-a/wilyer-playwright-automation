// =============================================================================
//  Android player fixtures.
//
//  Extends the CMS fixtures rather than replacing them, so a device spec keeps
//  every page object and API client — which is the whole point: the assertion
//  that matters is "published in the CMS, therefore playing on the screen", and
//  that sentence needs both halves in one test.
//
//      import { test, expect } from '../../../fixtures/android-fixtures';
//
//  Cost model, and why `appium` is a separate fixture from `player`:
//   • `adb` and `player` are free — they shell out only when a method is called.
//   • `appium` starts a real session (seconds, and installs a helper APK on
//     first run). Playwright constructs fixtures lazily, so a spec that never
//     names `appium` never pays for it. Specs that need the UI attach it with
//     `player.withUi(appium)`.
// =============================================================================

import { test as cmsTest, expect } from './test-fixtures';
import { Adb } from '../helpers/android/adb';
import { AppiumDriver } from '../helpers/android/AppiumDriver';
import { PlayerPage } from '../pages/android/PlayerPage';
import { hasAndroidConfig } from '../config/android';

interface AndroidFixtures {
  /** Shell-level device access — playback, storage, logs, stability. */
  adb: Adb;
  /** Live Appium session. Naming it in a test is what starts one. */
  appium: AppiumDriver;
  /** The player as a page object. Call `.withUi(appium)` for UI actions. */
  player: PlayerPage;
}

export const test = cmsTest.extend<AndroidFixtures>({
  // Playwright reads the destructuring pattern to work out fixture
  // dependencies, so the empty `{}` is required syntax here — a named
  // parameter makes it refuse to load the file at all.
  // eslint-disable-next-line no-empty-pattern
  adb: async ({}, use) => {
    await use(new Adb());
  },

  // eslint-disable-next-line no-empty-pattern
  appium: async ({}, use) => {
    const driver = await AppiumDriver.start();
    try {
      await use(driver);
    } finally {
      // Unconditional: an orphaned session keeps the device locked and the next
      // test fails with a misleading "device busy" rather than its real reason.
      await driver.stop();
    }
  },

  player: async ({ adb }, use) => {
    await use(new PlayerPage(adb));
  },
});

/**
 * Evidence on failure. A device failure cannot be re-run later — the screen has
 * moved on, the log buffer has rolled over, and the box may be in another
 * building. Capture at the moment of failure or not at all.
 */
test.afterEach(async ({ player }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || !hasAndroidConfig()) return;
  // Best-effort: if the device dropped off entirely, the original failure is the
  // interesting one and must not be masked by a capture error.
  await player.captureEvidence(testInfo, 'failure').catch(() => undefined);
});

export { expect };
