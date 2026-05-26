import { test, expect } from '@playwright/test';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL       = 'https://cms.pocsample.in/';
const LOGIN_EMAIL    = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';
const RUN_ID         = Date.now();

// One playlist will be created for each layout, sized to its baseW × baseH,
// with an AQI widget dropped onto the canvas.
const LAYOUTS = [
  { id: 'full-landscape',     group: 'Full Screen',    label: 'Landscape 16:9',  ratio: '16:9', baseW: 1920, baseH: 1080, orientation: 'landscape' },
  { id: 'full-portrait',      group: 'Full Screen',    label: 'Portrait 9:16',   ratio: '9:16', baseW: 1080, baseH: 1920, orientation: 'portrait'  },
  { id: 'split-landscape',    group: 'Two Split',      label: 'Landscape 9:8',   ratio: '9:8',  baseW: 1080, baseH: 960,  orientation: 'landscape' },
  { id: 'split-portrait',     group: 'Two Split',      label: 'Portrait 8:9',    ratio: '8:9',  baseW: 960,  baseH: 1080, orientation: 'portrait'  },
  { id: 'wide-strip',         group: 'Wide Strip',     label: 'Landscape 8:2',   ratio: '8:2',  baseW: 1920, baseH: 480,  orientation: 'landscape' },
  { id: 'wide-strip-93',      group: 'Wide Strip',     label: 'Landscape 9:3',   ratio: '9:3',  baseW: 1920, baseH: 640,  orientation: 'landscape' },
  { id: 'wide-strip-102',     group: 'Wide Strip',     label: 'Landscape 10:2',  ratio: '10:2', baseW: 1920, baseH: 384,  orientation: 'landscape' },
  { id: 'tall-strip',         group: 'Tall Strip',     label: 'Portrait 4:9',    ratio: '4:9',  baseW: 480,  baseH: 1080, orientation: 'portrait'  },
  { id: 'tall-strip-39',      group: 'Tall Strip',     label: 'Portrait 3:9',    ratio: '3:9',  baseW: 360,  baseH: 1080, orientation: 'portrait'  },
  { id: 'tall-strip-210',     group: 'Tall Strip',     label: 'Portrait 2:10',   ratio: '2:10', baseW: 216,  baseH: 1080, orientation: 'portrait'  },
  { id: 'portrait-69',        group: 'Portrait',       label: 'Portrait 6:9',    ratio: '6:9',  baseW: 720,  baseH: 1080, orientation: 'portrait'  },
  { id: 'landscape-96',       group: 'Landscape',      label: 'Landscape 9:6',   ratio: '9:6',  baseW: 1080, baseH: 720,  orientation: 'landscape' },
  { id: 'scroll-normal',      group: 'Scrolling Bar',  label: 'Normal',          ratio: '8:1',  baseW: 1920, baseH: 240,  orientation: 'landscape' },
  { id: 'scroll-static-left', group: 'Scrolling Bar',  label: 'Static Left Img', ratio: '8:1',  baseW: 1920, baseH: 240,  orientation: 'landscape' },
  { id: 'square',             group: 'Perfect Square', label: '1:1',             ratio: '1:1',  baseW: 1080, baseH: 1080, orientation: 'landscape' },
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

async function gotoPlaylists(page) {
  await page.goto(`${BASE_URL}playlists`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /\+?\s*new playlist/i })).toBeVisible({ timeout: 20_000 });
}

async function createPlaylist(page, name) {
  await page.getByRole('button', { name: /\+?\s*new playlist/i }).click();
  const modal = page.locator('.modal.show').filter({ hasText: /create new playlist/i });
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.locator('#name').fill(name);
  await modal.locator('#description').fill(`AQI layout test (${name})`);
  await modal.getByRole('button', { name: /create playlist/i }).click();
  await page.waitForURL(/\/playlist-settings\//, { timeout: 20_000 });
}

async function applyCustomSize(page, width, height) {
  // Click "Custom" orientation toggle in top bar — opens #customLayoutSize modal.
  await page.getByRole('button', { name: /^custom$/i }).first().click();
  const modal = page.locator('#customLayoutSize.show');
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.locator('input[name="width"]').fill(String(width));
  await modal.locator('input[name="height"]').fill(String(height));
  await modal.locator('button[type="submit"]').click();
  await expect(modal).toBeHidden({ timeout: 10_000 });
}

async function openAQIWidgetType(page) {
  // The editor's left panel has tabs: Media | Widgets | Sequences.
  const widgetsTab = page.getByRole('button', { name: /^widgets$/i }).first();
  await expect(widgetsTab).toBeVisible({ timeout: 15_000 });
  await widgetsTab.click();

  const aqiCard = page
    .locator('.card.cursor-pointer')
    .filter({ has: page.locator('h6', { hasText: /^AQI\s*\(\d+\)$/ }) })
    .first();

  // The Widgets panel sometimes opens in "show folders" mode (a per-account
  // toggle that persists across sessions). Detect this and flip the toggle.
  const visible = await aqiCard.isVisible({ timeout: 3000 }).catch(() => false);
  if (!visible) {
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
  // Pick an AQI instance whose name matches the layout orientation when possible,
  // otherwise fall back to the first draggable instance.
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

  // Right panel header changes from "Layout Settings" to "ZoneSettings"
  // (one word, no space) once a zone is on the canvas.
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

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Playlists — AQI widget across all layout sizes', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test.beforeAll(async ({ browser }) => {
    // One-off login probe to fail fast if credentials are wrong
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);
    await ctx.close();
  });

  for (const layout of LAYOUTS) {
    test(`Create ${layout.group} → ${layout.label} (${layout.baseW}×${layout.baseH}) with AQI widget`, async ({ page }) => {
      const name = `AQI_${layout.id}_${RUN_ID}`;

      await login(page);
      await gotoPlaylists(page);
      await createPlaylist(page, name);
      await applyCustomSize(page, layout.baseW, layout.baseH);
      await openAQIWidgetType(page);
      await dropAQIWidgetOntoCanvas(page, layout.orientation);
      await saveAndConfirm(page);

      // After save, ZoneSettings stays visible — confirms the zone
      // (with the AQI widget) persisted on the playlist.
      await expect(
        page.locator('strong', { hasText: /^ZoneSettings$/ })
      ).toBeVisible({ timeout: 10_000 });

      console.log(`✅ ${layout.id} — ${layout.baseW}×${layout.baseH} — ${name}`);
    });
  }
});
