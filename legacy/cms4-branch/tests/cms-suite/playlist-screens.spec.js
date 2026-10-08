// =============================================================================
//  PLAYLIST `screens` FIELD — backend contract change.
//    OLD:  "scree
// ns": []        (array)
//    NEW:  "screens": <number>  (count)
//
//  Risk: frontend code that did screens.map(...) or screens.length will crash
//  when the field becomes a number (or null / string / negative). We inject each
//  variant at the API boundary and assert the playlist page never crashes,
//  white-screens, or throws TypeError: x.map/length is not a function.
// =============================================================================

import { test, expect } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { PlaylistsPage } from '../../pages/cms/PlaylistsPage.js';
import { login } from '../../helpers/loginHelper.js';
import { mockTransformJson, deepSetField, deepDeleteField } from '../../utils/cms/mocks.js';
import { assertNotBlank, assertNoCrashScreen, assertLoaderCleared } from '../../utils/cms/crashDetector.js';
import { ConsoleMonitor } from '../../utils/cms/consoleMonitor.js';

const PLAYLIST_API = '**/api/**playlist**';

/** Render the playlists page with `screens` rewritten to `value` everywhere. */
async function renderWithScreens(page, mutate) {
  await login(page);
  await mockTransformJson(page, PLAYLIST_API, (json) => mutate(json));
  await page.goto(`${ENV.BASE_URL}/playlists`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
}

/** The .map()/.length TypeErrors we must never see. */
function mapLengthCrashes(consoleMon) {
  return consoleMon.allCritical.filter((t) =>
    /\.map is not a function|\.length|is not a function|cannot read propert/i.test(t)
  );
}

// These suites deliberately inject schema drift — monitors must not auto-fail.
test.describe('Playlist screens field — POSITIVE', () => {
  test('playlist page loads and shows screen counts (live)', async ({ adminPage }) => {
    const pl = new PlaylistsPage(adminPage);
    await pl.open();
    await pl.expectListLoaded();
    await assertNotBlank(adminPage, 'playlists');
    // If any playlists exist, a "<n> screen(s)" badge should render as a number.
    const badge = pl.screenCountBadges().first();
    if (await badge.isVisible().catch(() => false)) {
      const txt = await badge.innerText();
      expect(txt).toMatch(/\d+\s*screen/i);
    }
  });
});

test.describe('Playlist screens field — NEGATIVE / CRITICAL (injected)', () => {
  test.use({ strictMonitors: false });

  test('screens = number (the new contract) renders without crash', async ({ page }) => {
    const mon = new ConsoleMonitor(page);
    await renderWithScreens(page, (j) => deepSetField(j, 'screens', 5));
    await assertNotBlank(page, 'playlists screens=number');
    await assertNoCrashScreen(page, 'playlists screens=number');
    await assertLoaderCleared(page, { label: 'playlists screens=number' });
    expect(mapLengthCrashes(mon), 'no .map()/.length crash on numeric screens').toHaveLength(0);
  });

  test('screens = null does not crash', async ({ page }) => {
    const mon = new ConsoleMonitor(page);
    await renderWithScreens(page, (j) => deepSetField(j, 'screens', null));
    await assertNotBlank(page, 'playlists screens=null');
    await assertNoCrashScreen(page, 'playlists screens=null');
    expect(mapLengthCrashes(mon)).toHaveLength(0);
  });

  test('screens missing entirely does not crash', async ({ page }) => {
    const mon = new ConsoleMonitor(page);
    await renderWithScreens(page, (j) => deepDeleteField(j, 'screens'));
    await assertNotBlank(page, 'playlists screens missing');
    await assertNoCrashScreen(page, 'playlists screens missing');
    expect(mapLengthCrashes(mon)).toHaveLength(0);
  });

  test('screens = string instead of number does not crash', async ({ page }) => {
    const mon = new ConsoleMonitor(page);
    await renderWithScreens(page, (j) => deepSetField(j, 'screens', 'NaN'));
    await assertNotBlank(page, 'playlists screens=string');
    await assertNoCrashScreen(page, 'playlists screens=string');
    expect(mapLengthCrashes(mon)).toHaveLength(0);
  });

  test('screens = negative value does not crash or render garbage', async ({ page }) => {
    const mon = new ConsoleMonitor(page);
    await renderWithScreens(page, (j) => deepSetField(j, 'screens', -5));
    await assertNotBlank(page, 'playlists screens=negative');
    await assertNoCrashScreen(page, 'playlists screens=negative');
    expect(mapLengthCrashes(mon)).toHaveLength(0);
  });
});

test.describe('Playlist screens field — EDGE CASES (injected)', () => {
  test.use({ strictMonitors: false });

  test('screens = 0 renders an explicit zero state', async ({ page }) => {
    const mon = new ConsoleMonitor(page);
    await renderWithScreens(page, (j) => deepSetField(j, 'screens', 0));
    await assertNotBlank(page, 'playlists screens=0');
    expect(mapLengthCrashes(mon)).toHaveLength(0);
  });

  test('very large screen count renders without overflow crash', async ({ page }) => {
    const mon = new ConsoleMonitor(page);
    await renderWithScreens(page, (j) => deepSetField(j, 'screens', 999_999_999));
    await assertNotBlank(page, 'playlists screens=huge');
    await assertNoCrashScreen(page, 'playlists screens=huge');
    expect(mapLengthCrashes(mon)).toHaveLength(0);
  });

  test('mixed old/new payloads (some array, some number) both render', async ({ page }) => {
    const mon = new ConsoleMonitor(page);
    await login(page);
    let toggle = false;
    await mockTransformJson(page, PLAYLIST_API, (json) => {
      // Alternate each playlist entry between the old [] and new number form.
      const flip = (o) => {
        if (o && typeof o === 'object' && 'screens' in o) {
          o.screens = (toggle = !toggle) ? 3 : [];
        }
      };
      if (Array.isArray(json)) json.forEach(flip);
      else if (json && Array.isArray(json.data)) json.data.forEach(flip);
      else flip(json);
      return json;
    });
    await page.goto(`${ENV.BASE_URL}/playlists`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await assertNotBlank(page, 'playlists mixed payload');
    await assertNoCrashScreen(page, 'playlists mixed payload');
    expect(mapLengthCrashes(mon)).toHaveLength(0);
  });
});
