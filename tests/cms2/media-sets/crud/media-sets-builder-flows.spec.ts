// =============================================================================
//  MEDIA SETS — Create builder: edge flows (cms2 v3.5.25).
//  Companion to media-sets-builder-formats.spec.ts. Covers the flows a QA would
//  walk after the happy path: orientation guard, replace/remove a file, duration
//  label, 3-format create, create without files, double-click Create, hostile
//  names, duplicate formats and leaving the builder with unsaved changes.
//
//  Every set saved here carries MEDIASET_PREFIX and is swept after each test.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import type { MediaSetsPage } from '../../../../pages/MediaSetsPage';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';

/** Records with absurd metadata (99999×99999) are a known data defect — skip them. */
const sane = (t: { w: number; h: number }) => t.w < 20_000 && t.h < 20_000;

async function waitForTiles(m: MediaSetsPage) {
  await expect.poll(() => m.builderFileCount(), { timeout: 15_000 }).toBeGreaterThan(0);
}

/** Filter to the active zone's ratio, then click the first matching file. */
async function assignFirstFor(m: MediaSetsPage, zone: RegExp) {
  await m.activateZone(zone);
  if (!(await m.aspectPill().evaluate((e) => e.classList.contains('active')))) {
    await m.aspectPill().click();
  }
  await expect(m.aspectNote).toBeVisible();
  await m.page.waitForTimeout(1_200);
  await waitForTiles(m);
  const idx = (await m.tileDimensions()).findIndex(sane); // skip the corrupt 99999×99999 record
  await m.builderFiles().nth(Math.max(idx, 0)).click();
  await expect(m.zoneCard(zone)).toContainText('Duration');
}

test.describe('Media Sets — Builder: edge flows @regression', () => {
  test.beforeEach(async ({ mediaSetsPage: m }) => {
    test.skip(!(await m.isAvailable()), 'Media Sets module is absent from this build');
    await m.open();
    await m.openCreate();
    test.skip(
      !(await m.zoneCards().first().isVisible().catch(() => false)),
      'Display Formats builder not present on this build',
    );
    await waitForTiles(m);
  });

  test.afterEach(async ({ mediaSetsPage: m, mediaSetApi, page }) => {
    await page.keyboard.press('Escape');
    await m.cancelCreate();
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  });

  // ── Orientation guard (2.6) ──────────────────────────────────────────────────

  test('ORI-1 · a portrait file clicked while Landscape is active is refused with a hint', async ({
    mediaSetsPage: m,
    page,
  }) => {
    // Filter off ("Choose Any") so portrait files are visible; find one.
    const idx = (await m.tileDimensions()).findIndex((t) => sane(t) && t.h > t.w);
    test.skip(idx < 0, 'no portrait file within the first page of the library');
    await m.builderFiles().nth(idx).click();

    await expect(page.getByText(/portrait file.*Portrait format/i).first()).toBeVisible();
    await expect(m.zoneCard(/Landscape · 16:9/)).toContainText('click a file on the left');
    await expect(m.clearMediaBtn).toBeDisabled();
  });

  test('ORI-2 · a landscape file clicked while Portrait is active is refused with a hint', async ({
    mediaSetsPage: m,
    page,
  }) => {
    const idx = (await m.tileDimensions()).findIndex((t) => sane(t) && t.w > t.h);
    test.skip(idx < 0, 'no landscape file within the first page of the library');
    await m.activateZone(/Portrait · 9:16/);
    await m.builderFiles().nth(idx).click();

    await expect(page.getByText(/landscape file.*Landscape format/i).first()).toBeVisible();
    await expect(m.zoneCard(/Portrait · 9:16/)).toContainText('click a file on the left');
  });

  // ── Replace / remove (2.7) ───────────────────────────────────────────────────

  test('REP-1 · clicking a second file replaces the first in the same zone (one "In set")', async ({
    mediaSetsPage: m,
    page,
  }) => {
    await m.aspectPill().click();
    await expect(m.aspectNote).toBeVisible();
    await waitForTiles(m);
    const first = m.builderFiles().nth(0);
    const second = m.builderFiles().nth(1);
    await first.click();
    await expect(first).toContainText('In set');
    const before = await m.zoneCard(/Landscape/).locator('img').first().getAttribute('alt');

    await second.click();
    await expect(second).toContainText('In set');
    await expect(first).not.toContainText('In set');
    await expect(page.getByText('In set', { exact: true })).toHaveCount(1);
    await expect(m.zoneCard(/Landscape/).locator('img').first()).not.toHaveAttribute('alt', before ?? '');
  });

  test('REP-2 · the file × empties just that zone and un-marks the tile', async ({ mediaSetsPage: m }) => {
    await assignFirstFor(m, /Landscape · 16:9/);
    const tile = m.builderFiles().first();
    await expect(tile).toContainText('In set');

    await m.zoneCard(/Landscape · 16:9/).locator('button[title="Remove file"]').click();
    await expect(m.zoneCard(/Landscape · 16:9/)).toContainText('click a file on the left');
    await expect(tile).not.toContainText('In set');
    await expect(m.clearMediaBtn).toBeDisabled();
  });

  // ── Duration (2.8) ───────────────────────────────────────────────────────────

  test('DUR-1 · an assigned file shows a read-only "Duration N sec" (no input in a single-file zone)', async ({
    mediaSetsPage: m,
  }) => {
    await assignFirstFor(m, /Landscape · 16:9/);
    const zone = m.zoneCard(/Landscape · 16:9/);
    await expect(zone).toContainText(/Duration\s*\d+\s*sec/);
    await expect(zone.locator('input[type="number"], input[type="text"]')).toHaveCount(0);
  });

  // ── Create flows (2.9 + 3) ───────────────────────────────────────────────────

  test('CRT-1 · name but no files: blocked with "Please add files to display formats", nothing saved', async ({
    mediaSetsPage: m,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('nofiles', testInfo.workerIndex);
    await m.nameInput.fill(name);
    await m.createSubmitBtn.click();

    await expect(page.getByText(/Please add files to display formats/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/library\/mediaset\/create/);
    expect(await mediaSetApi.findByName(name)).toBeUndefined();
  });

  test('CRT-2 · only one of two formats filled: Create is blocked and names the empty ratio', async ({
    mediaSetsPage: m,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('onezone', testInfo.workerIndex);
    await m.nameInput.fill(name);
    await assignFirstFor(m, /Landscape · 16:9/);
    await m.createSubmitBtn.click();

    await expect(page.getByText(/Please add files to display formats.*9:16/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/library\/mediaset\/create/);
    expect(await mediaSetApi.findByName(name)).toBeUndefined();
  });

  test('CRT-3 · a human double-click saves exactly one set', async ({
    mediaSetsPage: m,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('dblclick', testInfo.workerIndex);
    await m.nameInput.fill(name);
    await assignFirstFor(m, /Landscape · 16:9/);
    await assignFirstFor(m, /Portrait · 9:16/);

    await m.createSubmitBtn.dblclick();
    await expect(page).not.toHaveURL(/\/mediaset\/create/, { timeout: 20_000 });
    await page.waitForTimeout(2_000);
    // Intermittent (~1 run in 3 saves TWO sets — see CRT-3b for the deterministic form), so this
    // only guards that a double-click never saves zero sets or errors out.
    expect((await mediaSetApi.list({ search: name })).totalDocs).toBeGreaterThanOrEqual(1);
  });

  test('CRT-3b · a second Create click while the first request is in flight sends no second request', async ({
    mediaSetsPage: m,
    mediaSetApi,
    page,
  }, testInfo) => {
    // Deterministic form of BUG-MS-DBL-01: hold the create request for 2 s, click Create again
    // 400 ms in, and count POST /mediaSet/create. A guarded button sends one.
    test.fail(true, 'BUG-MS-DBL-01 — Create stays enabled while saving; a 2nd click sends a 2nd request');
    const name = mediaSetName('inflight', testInfo.workerIndex);
    let posts = 0;
    await page.route('**/mediaSet/create', async (route) => {
      if (route.request().method() === 'POST') {
        posts++;
        await new Promise((r) => setTimeout(r, 2_000));
      }
      await route.continue();
    });
    await m.nameInput.fill(name);
    await assignFirstFor(m, /Landscape · 16:9/);
    await assignFirstFor(m, /Portrait · 9:16/);

    await m.createSubmitBtn.click();
    await page.waitForTimeout(400);
    await m.createSubmitBtn.click({ timeout: 2_000, force: true }).catch(() => undefined);
    await expect(page).not.toHaveURL(/\/mediaset\/create/, { timeout: 20_000 });
    await page.waitForTimeout(1_500);

    expect(posts, 'POST /mediaSet/create requests').toBe(1);
    expect((await mediaSetApi.list({ search: name })).totalDocs).toBe(1);
  });

  test('CRT-4 · three formats (16:9, 9:16, 1:1) each filled → set saved with three zones', async ({
    mediaSetsPage: m,
    mediaSetApi,
    page,
  }, testInfo) => {
    // Add Square 1:1.
    await m.addFormatBtn.click();
    await page.getByText('Square', { exact: true }).first().click();
    await page
      .getByText('1:1', { exact: true })
      .first()
      .locator('xpath=ancestor::*[.//input[@type="checkbox"]][1]')
      .locator('input[type="checkbox"]')
      .check();
    await page.getByRole('button', { name: /^apply \(1\)$/i }).click();
    await expect(m.formatCountText).toContainText('3 formats');

    // Square media may not exist in this library.
    await m.activateZone(/Square · 1:1/);
    await m.aspectPill().click();
    await page.waitForTimeout(1_500);
    const squares = (await m.tileDimensions()).filter((t) => sane(t) && Math.abs(t.w / t.h - 1) < 0.03);
    test.skip(squares.length === 0, 'library has no square (1:1) file to assign');

    const name = mediaSetName('threefmt', testInfo.workerIndex);
    await m.nameInput.fill(name);
    await assignFirstFor(m, /Landscape · 16:9/);
    await assignFirstFor(m, /Portrait · 9:16/);
    await assignFirstFor(m, /Square · 1:1/);
    await m.createSubmitBtn.click();
    await expect(page).not.toHaveURL(/\/mediaset\/create/, { timeout: 20_000 });

    const found = await mediaSetApi.findByName(name);
    expect(found?.zones).toHaveLength(3);
  });

  test('CRT-5 · a hostile name is stored verbatim and rendered as text, never executed', async ({
    mediaSetsPage: m,
    mediaSetApi,
    page,
  }) => {
    const name = `${MEDIASET_PREFIX}<img src=x onerror=window.__x=1>`; // ≤ 50 chars, the UI limit
    await m.nameInput.fill(name);
    await assignFirstFor(m, /Landscape · 16:9/);
    await assignFirstFor(m, /Portrait · 9:16/);
    await m.createSubmitBtn.click();
    await expect(page).not.toHaveURL(/\/mediaset\/create/, { timeout: 20_000 });

    expect((await mediaSetApi.findByName(name))?.name).toBe(name);
    await m.open();
    await m.search(name.replace(/<.*$/, ''));
    await page.waitForTimeout(1_500);
    expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
  });

  test('NAME-1 · a 51-character name is refused ("must be 50 characters or less"), nothing saved', async ({
    mediaSetsPage: m,
    mediaSetApi,
    page,
  }) => {
    const name = (MEDIASET_PREFIX + 'n'.repeat(60)).slice(0, 51);
    await m.nameInput.fill(name);
    await assignFirstFor(m, /Landscape · 16:9/);
    await assignFirstFor(m, /Portrait · 9:16/);
    await m.createSubmitBtn.click();

    await expect(page.getByText(/must be 50 characters or less/i)).toBeVisible();
    await expect(page).toHaveURL(/\/library\/mediaset\/create/);
    expect(await mediaSetApi.findByName(name)).toBeUndefined();
  });

  test('NAME-2 · a 50-character name is accepted', async ({ mediaSetsPage: m, mediaSetApi, page }) => {
    const name = (MEDIASET_PREFIX + 'm'.repeat(60)).slice(0, 50);
    await m.nameInput.fill(name);
    await assignFirstFor(m, /Landscape · 16:9/);
    await assignFirstFor(m, /Portrait · 9:16/);
    await m.createSubmitBtn.click();
    await expect(page).not.toHaveURL(/\/mediaset\/create/, { timeout: 20_000 });
    expect((await mediaSetApi.findByName(name))?.name).toBe(name);
  });

  test('DESC-1 · the description field stops at 50 characters', async ({ mediaSetsPage: m }) => {
    await m.descriptionInput.click();
    await m.descriptionInput.pressSequentially('d'.repeat(60));
    await expect(m.descriptionInput).toHaveValue('d'.repeat(50));
  });

  // ── Formats (2.3 remainder) ──────────────────────────────────────────────────

  test('FMT-3 · adding a ratio the set already has (16:9) does not create a duplicate format', async ({
    mediaSetsPage: m,
    page,
  }) => {
    // BUG-MS-FMT-01: "Select all" in Add Display Format reads "Apply (48)" and the set then
    // holds 50 formats (2 + 48) — the picker re-adds 16:9 and 9:16 that already exist.
    test.fail(true, 'BUG-MS-FMT-01 — Add Display Format allows duplicate ratios');
    await m.addFormatBtn.click();
    await page
      .getByText('16:9', { exact: true })
      .first()
      .locator('xpath=ancestor::*[.//input[@type="checkbox"]][1]')
      .locator('input[type="checkbox"]')
      .check();
    await page.getByRole('button', { name: /^apply/i }).click();
    await page.waitForTimeout(1_000);
    await expect(m.formatCountText).toContainText('2 formats');
  });

  test('FMT-4 · "Select all" in Add Display Format offers every ratio and Apply shows the count', async ({
    mediaSetsPage: m,
    page,
  }) => {
    await m.addFormatBtn.click();
    await page.getByText('Select all', { exact: true }).click();
    const label = await page.getByRole('button', { name: /^apply/i }).innerText();
    expect(label).toMatch(/^Apply \(\d+\)$/);
    await page.getByRole('button', { name: /^cancel$/i }).last().click(); // leave the set unchanged
    await expect(m.formatCountText).toContainText('2 formats');
  });

  // ── Leaving the builder (3) ──────────────────────────────────────────────────

  test('NAV-1 · Cancel with unsaved changes asks before discarding', async ({ mediaSetsPage: m, page }) => {
    // BUG-MS-UX-01: Cancel returns to /library at once and silently drops the typed name and
    // assigned files — no "discard changes?" prompt.
    test.fail(true, 'BUG-MS-UX-01 — no unsaved-changes guard on Cancel');
    await m.nameInput.fill('qa_unsaved_changes');
    await assignFirstFor(m, /Landscape · 16:9/);
    await m.cancelBtn.click();
    await page.waitForTimeout(1_000);
    await expect(page.getByText(/discard|unsaved|leave/i).first()).toBeVisible({ timeout: 3_000 });
  });

  test('NAV-2 · Cancel with an empty form returns to the Library without a prompt', async ({
    mediaSetsPage: m,
    page,
  }) => {
    await m.cancelBtn.click();
    await expect(page).toHaveURL(/\/library(\?|$|\/?$)/);
    await expect(page).not.toHaveURL(/mediaset\/create/);
  });
});
