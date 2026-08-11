import { test, expect } from '@playwright/test';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL       = 'https://cms.wilyersignage.com/';
const LOGIN_EMAIL    = (process.env.CMS_EMAIL || process.env.CMS_ADMIN_EMAIL || '');
const LOGIN_PASSWORD = (process.env.CMS_PASSWORD || process.env.CMS_ADMIN_PASSWORD || '');
const RUN_ID         = Date.now();
const PLAYLIST_NAME  = `AQI_AllLayouts_${RUN_ID}`;

// All 15 resolutions are added as separate "New Layouts" inside a single playlist.
// Each gets its own canvas size and an AQI widget zone.
const LAYOUTS = [
  { id: 'full-landscape',     group: 'Full Screen',    label: 'Landscape 16:9',  baseW: 1920, baseH: 1080, orientation: 'landscape' },
  { id: 'full-portrait',      group: 'Full Screen',    label: 'Portrait 9:16',   baseW: 1080, baseH: 1920, orientation: 'portrait'  },
  { id: 'split-landscape',    group: 'Two Split',      label: 'Landscape 9:8',   baseW: 1080, baseH: 960,  orientation: 'landscape' },
  { id: 'split-portrait',     group: 'Two Split',      label: 'Portrait 8:9',    baseW: 960,  baseH: 1080, orientation: 'portrait'  },
  { id: 'wide-strip',         group: 'Wide Strip',     label: 'Landscape 8:2',   baseW: 1920, baseH: 480,  orientation: 'landscape' },
  { id: 'wide-strip-93',      group: 'Wide Strip',     label: 'Landscape 9:3',   baseW: 1920, baseH: 640,  orientation: 'landscape' },
  { id: 'wide-strip-102',     group: 'Wide Strip',     label: 'Landscape 10:2',  baseW: 1920, baseH: 384,  orientation: 'landscape' },
  { id: 'tall-strip',         group: 'Tall Strip',     label: 'Portrait 4:9',    baseW: 480,  baseH: 1080, orientation: 'portrait'  },
  { id: 'tall-strip-39',      group: 'Tall Strip',     label: 'Portrait 3:9',    baseW: 360,  baseH: 1080, orientation: 'portrait'  },
  { id: 'tall-strip-210',     group: 'Tall Strip',     label: 'Portrait 2:10',   baseW: 216,  baseH: 1080, orientation: 'portrait'  },
  { id: 'portrait-69',        group: 'Portrait',       label: 'Portrait 6:9',    baseW: 720,  baseH: 1080, orientation: 'portrait'  },
  { id: 'landscape-96',       group: 'Landscape',      label: 'Landscape 9:6',   baseW: 1080, baseH: 720,  orientation: 'landscape' },
  { id: 'scroll-normal',      group: 'Scrolling Bar',  label: 'Normal',          baseW: 1920, baseH: 240,  orientation: 'landscape' },
  { id: 'scroll-static-left', group: 'Scrolling Bar',  label: 'Static Left Img', baseW: 1920, baseH: 240,  orientation: 'landscape' },
  { id: 'square',             group: 'Perfect Square', label: '1:1',             baseW: 1080, baseH: 1080, orientation: 'landscape' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /email|phone/i }).fill(LOGIN_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(LOGIN_PASSWORD);
  const loginBtn = page.getByRole('button', { name: /log in/i });
  await loginBtn.click();
  await expect(loginBtn).toBeHidden({ timeout: 20_000 });
}

async function createPlaylist(page, name) {
  await page.goto(`${BASE_URL}playlists`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /\+?\s*new playlist/i }).click();
  const modal = page.locator('.modal.show').filter({ hasText: /create new playlist/i });
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.locator('#name').fill(name);
  await modal.locator('#description').fill(`AQI on every layout (${name})`);
  await modal.getByRole('button', { name: /create playlist/i }).click();
  await page.waitForURL(/\/playlist-settings\//, { timeout: 20_000 });
}

async function addNewLayout(page) {
  // Click the top-bar "+ New Layout" button. This appends a new empty layout
  // and makes it the active one on the canvas.
  await page.getByRole('button', { name: /\s*new layout\s*/i }).first().click();
  // Allow the new layout's canvas to mount.
  await expect(page.locator('#composer')).toBeVisible({ timeout: 10_000 });
}

async function applyCustomSize(page, width, height) {
  await page.getByRole('button', { name: /^custom$/i }).first().click();
  const modal = page.locator('#customLayoutSize.show');
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.locator('input[name="width"]').fill(String(width));
  await modal.locator('input[name="height"]').fill(String(height));
  await modal.locator('button[type="submit"]').click();
  await expect(modal).toBeHidden({ timeout: 10_000 });
}

async function openAQIWidgetType(page) {
  const widgetsTab = page.getByRole('button', { name: /^widgets$/i }).first();
  await expect(widgetsTab).toBeVisible({ timeout: 15_000 });
  await widgetsTab.click();

  // If we're still drilled into a widget instance list from a previous layout,
  // walk back to the type list using the panel's "Go Back" arrow.
  const backArrow = page.locator('button[data-tooltip-id="back-button-widget"]');
  while (await backArrow.first().isVisible().catch(() => false)) {
    await backArrow.first().click();
    await page.waitForTimeout(200);
  }

  const aqiCard = page
    .locator('.card.cursor-pointer')
    .filter({ has: page.locator('h6', { hasText: /^AQI\s*\(\d+\)$/ }) })
    .first();

  // Some accounts open the panel in "show folders" mode — flip it off if so.
  if (!(await aqiCard.isVisible({ timeout: 3000 }).catch(() => false))) {
    const folderToggle = page.locator('button[data-tooltip-id="toggle-folders-widget"]').first();
    if (await folderToggle.isVisible().catch(() => false)) {
      await folderToggle.click();
    }
  }

  await expect(aqiCard).toBeVisible({ timeout: 15_000 });
  await aqiCard.click();
  await expect(page.locator('div[draggable="true"]').first()).toBeVisible({ timeout: 15_000 });
}

async function dropAQIWidgetOntoCanvas(page, orientation) {
  const all = page.locator('div[draggable="true"]');
  const count = await all.count();

  let target = null;
  for (let i = 0; i < count; i++) {
    const txt = (await all.nth(i).textContent() || '').toLowerCase();
    const isPortrait  = /potrait|portrait/.test(txt);
    const isLandscape = /landscape/.test(txt);
    if (orientation === 'portrait'  && isPortrait)  { target = all.nth(i); break; }
    if (orientation === 'landscape' && isLandscape) { target = all.nth(i); break; }
  }
  if (!target) target = all.first();

  await target.scrollIntoViewIfNeeded();
  await target.dragTo(page.locator('#composer'));

  await expect(
    page.locator('strong', { hasText: /^ZoneSettings$/ })
  ).toBeVisible({ timeout: 15_000 });
}

async function saveAndConfirm(page) {
  await page.locator('button.btn-warning[data-bs-target="#updatePlaylist"]').click();
  const modal = page.locator('.modal.show').filter({ hasText: /update playlist/i });
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.getByRole('button', { name: /continue/i }).click();
  await expect(modal).toBeHidden({ timeout: 15_000 });
}

// ─── Test ─────────────────────────────────────────────────────────────────────

test.describe('Playlist — single playlist with every layout via "+ New Layout"', () => {
  // 15 layouts × ~12s + overhead — give plenty of headroom.
  test.setTimeout(15 * 60 * 1000);

  test(`Build a single playlist holding all ${LAYOUTS.length} resolutions`, async ({ page }) => {
    await login(page);
    await createPlaylist(page, PLAYLIST_NAME);
    console.log(`📂 Created playlist "${PLAYLIST_NAME}"`);

    for (let i = 0; i < LAYOUTS.length; i++) {
      const layout = LAYOUTS[i];

      // The first layout is the implicit one created with the playlist;
      // every subsequent layout is added by clicking "+ New Layout".
      if (i > 0) {
        await addNewLayout(page);
      }

      await applyCustomSize(page, layout.baseW, layout.baseH);
      await openAQIWidgetType(page);
      await dropAQIWidgetOntoCanvas(page, layout.orientation);

      console.log(`  ✅ [${i + 1}/${LAYOUTS.length}] ${layout.id} — ${layout.baseW}×${layout.baseH}`);
    }

    await saveAndConfirm(page);

    // Sanity: ZoneSettings remains visible for the currently-selected layout.
    await expect(
      page.locator('strong', { hasText: /^ZoneSettings$/ })
    ).toBeVisible({ timeout: 10_000 });

    console.log(`💾 Saved playlist "${PLAYLIST_NAME}" with ${LAYOUTS.length} layouts`);
  });
});
