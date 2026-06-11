// =============================================================================
//  PLAYLISTS — negative path: opening a missing / deleted playlist.
//
//  Regression guard for the readPlaylist crash observed live (2026-06-11):
//    GET /v3/cms/playlist/read/<id>  → 404
//    TypeError: Cannot read properties of undefined (reading 'forEach')
//        at readPlaylist (assets/index-*.js)
//
//  When a playlist id no longer exists the editor must degrade gracefully —
//  NOT throw an uncaught exception and paint an empty, nameless editor. This
//  test fails until the read handler null-checks the 404 payload before
//  iterating it.
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';

// A well-formed but non-existent ObjectId — the read endpoint 404s on it.
// Synthetic on purpose: never relies on a specific deleted playlist that
// could be recreated and quietly turn this test green.
const MISSING_PLAYLIST_ID = '000000000000000000000000';
const MISSING_PLAYLIST_URL = `/playlist-settings/${MISSING_PLAYLIST_ID}`;

test.describe('Playlists — missing playlist (negative path) @regression', () => {
  // This is a regression guard for an open bug — never let a retry "pass" it.
  test.describe.configure({ retries: 0 });

  test('opening a deleted playlist does not throw an uncaught exception', async ({
    page,
    consoleMonitor,
  }) => {
    // The crash is frequent but not 100% deterministic per load, so give the
    // editor two chances to fetch-and-(currently)-crash before we judge it clean.
    await page.goto(MISSING_PLAYLIST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);
    if (!consoleMonitor.getErrors().some((e) => e.type === 'pageerror')) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3_000);
    }

    const uncaught = consoleMonitor
      .getErrors()
      .filter((e) => e.type === 'pageerror');

    expect(
      uncaught,
      `uncaught page exception(s) on a missing playlist:\n${uncaught
        .map((e) => e.text)
        .join('\n')}`,
    ).toHaveLength(0);
  });
});
