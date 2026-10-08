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
import { CONTENT_SURFACES, PLAYER, PLAYER_UNCONFIRMED } from '../../../../pages/android/PlayerPage';

test.describe.configure({ mode: 'serial' });

/** One audited selector as a report line. Module scope so the formatting
 *  branch is not read as a conditional inside a test. */
const line = (r: { found: boolean; name: string; label: string }): string =>
  `${r.found ? 'OK  ' : 'MISS'} ${r.name}  ${r.label}`;

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
    // Turns the selector set into a written result rather than a surprise
    // inside an unrelated spec three months from now.
    const audit = async (group: Record<string, { label: string }>) =>
      Promise.all(
        Object.entries(group).map(async ([name, selector]) => ({
          name,
          label: selector.label,
          found: await appium.isElementVisible(
            selector as Parameters<typeof appium.isElementVisible>[0],
            2_000,
          ),
        })),
      );

    const confirmed = await audit(PLAYER);
    const unconfirmed = await audit(PLAYER_UNCONFIRMED);

    await testInfo.attach('selector-audit.txt', {
      body: [
        '# PLAYER — playback screen, expected to resolve',
        ...confirmed.map(line),
        '',
        '# PLAYER_UNCONFIRMED — pairing / settings screens, not currently shown',
        ...unconfirmed.map(line),
      ].join('\n'),
      contentType: 'text/plain',
    });

    testInfo.annotations.push({
      type: 'selectors-resolved',
      description:
        `PLAYER ${confirmed.filter((r) => r.found).length}/${confirmed.length}, ` +
        `unconfirmed ${unconfirmed.filter((r) => r.found).length}/${unconfirmed.length}`,
    });

    // The playback-screen set is enforced: a miss here means the build changed
    // its view tree, which is exactly what this suite exists to catch. The
    // unconfirmed set stays reported-only — those screens are not on display.
    //
    // The content surfaces are exempt from the all-present rule: which of them
    // is attached tracks what is scheduled, so at least one is the only claim
    // that holds run to run (see CONTENT_SURFACES in PlayerPage).
    const surfaces: readonly string[] = CONTENT_SURFACES;
    const structural = confirmed.filter((r) => !surfaces.includes(r.name));

    const missing = structural.filter((r) => !r.found).map((r) => `${r.name} (${r.label})`);
    expect(missing, 'playback-screen selectors should resolve against this build').toEqual([]);

    expect(
      confirmed.filter((r) => surfaces.includes(r.name) && r.found).length,
      'no content surface (webview or image_view) is attached',
    ).toBeGreaterThan(0);
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
