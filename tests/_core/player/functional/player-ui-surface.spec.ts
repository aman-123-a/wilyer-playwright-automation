// =============================================================================
//  ANDROID PLAYER — UI surface discovery (Appium).
//
//  Run this FIRST on a new build. It answers the question that decides how the
//  rest of the device suite should be written: does the player expose a real
//  view hierarchy, or is it one full-screen surface with nothing to query?
//
//  If this suite reports zero interactive nodes, that is not a failure — it is
//  the finding. It means Appium buys nothing for playback, and every playback
//  assertion belongs in the adb-backed suites instead.
// =============================================================================

import { test, expect } from '../../../../fixtures/android-fixtures';
import { requireDevice, by } from '../../../../helpers/android';
import { PLAYER } from '../../../../pages/android/PlayerPage';

test.describe.configure({ mode: 'serial' });

test.describe('Android player — UI surface', () => {
  requireDevice();

  test('Appium can attach and read the view hierarchy @player @discovery', async ({
    appium,
  }, testInfo) => {
    const xml = await appium.source();

    await testInfo.attach('view-hierarchy.xml', { body: xml, contentType: 'text/xml' });

    expect(xml.length, 'Appium returned an empty hierarchy').toBeGreaterThan(0);

    // Count what is actually addressable. A pure playback surface reports a
    // handful of nodes and no clickables; a settings screen reports dozens.
    const clickable = (xml.match(/clickable="true"/g) ?? []).length;
    const withIds = (xml.match(/resource-id="[^"]+"/g) ?? []).length;
    const withDesc = (xml.match(/content-desc="[^"]+"/g) ?? []).length;

    testInfo.annotations.push({
      type: 'ui-surface',
      description: `${clickable} clickable, ${withIds} with resource-id, ${withDesc} with content-desc`,
    });

    if (clickable === 0) {
      testInfo.annotations.push({
        type: 'gap',
        description:
          'No clickable nodes — this screen is pure playback. Assert it through adb ' +
          '(screenshot, logcat, cached files), not Appium.',
      });
    }
  });

  test('declared selectors resolve against the running build @player @discovery', async ({
    appium,
  }, testInfo) => {
    // PLAYER selectors ship unconfirmed (see pages/android/PlayerPage.ts). This
    // test exists to turn that assumption into a written result rather than a
    // surprise inside an unrelated spec three months from now.
    const results = await Promise.all(
      Object.entries(PLAYER).map(async ([name, selector]) => ({
        name,
        label: selector.label,
        found: await appium.isElementVisible(selector, 2_000),
      })),
    );

    await testInfo.attach('selector-audit.txt', {
      body: results.map((r) => `${r.found ? 'OK  ' : 'MISS'} ${r.name}  ${r.label}`).join('\n'),
      contentType: 'text/plain',
    });

    // Reported, not enforced: most of these belong to screens (pairing,
    // settings) that a healthy paired player is not currently showing.
    testInfo.annotations.push({
      type: 'selectors-resolved',
      description: `${results.filter((r) => r.found).length}/${results.length}`,
    });
  });

  test('player survives being backgrounded and restored @player @regression', async ({
    appium,
    player,
  }) => {
    await appium.background(5);

    // The real-world case: a system update dialog or launcher steals focus for a
    // few seconds. A signage player must come back on its own — an operator is
    // not standing in front of the screen to tap it.
    await player.waitUntilPlaying(60_000);
    await player.expectHealthy();
  });

  test('back button does not exit the player @player @negative', async ({ appium, player }) => {
    await appium.back();

    // Kiosk behaviour: a stray IR remote or wall-mounted keyboard must not be
    // able to drop a screen to the Android launcher.
    await player.waitUntilPlaying(30_000);
    expect(await player.isPlaying(), 'player should still own the screen after Back').toBe(true);
  });

  test('no error text is visible on screen @player @regression', async ({ appium }) => {
    const anyError = await appium.isElementVisible(
      by.uiSelector(
        'new UiSelector().textMatches("(?i).*(error|failed|unable to|no connection).*")',
      ),
      3_000,
    );
    expect(anyError, 'an error message is displayed on the panel').toBe(false);
  });
});
