// =============================================================================
//  MEDIA SETS — Create builder: Display Formats, Aspect-Ratio filter, assign,
//  validation and an end-to-end UI create (cms2 v3.5.25 builder).
//
//  Replaces the "deferred" AR-1/2/3, AR-4 and F2 items in
//  media-sets-create-builder.spec.ts now that the builder exposes both the
//  "Choose Any / Aspect Ratio" pills and per-format "Change ratio".
//
//  Assignment is click-based ("pick a format, then click a file on the left"),
//  so no drag-and-drop is needed. Every set this spec saves carries
//  MEDIASET_PREFIX and is swept after each test.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';

const RATIO_16_9 = 16 / 9;
/** The changelog's matching rule: a file fits a ratio when it is within 1.2× of it either way. */
const withinFactor = (a: number, b: number, factor = 1.2) => a <= b * factor && a >= b / factor;

test.describe('Media Sets — Builder: formats & aspect ratio @regression', () => {
  test.beforeEach(async ({ mediaSetsPage }) => {
    test.skip(!(await mediaSetsPage.isAvailable()), 'Media Sets module is absent from this build');
    await mediaSetsPage.open();
    await mediaSetsPage.openCreate();
    test.skip(
      !(await mediaSetsPage.zoneCards().first().isVisible().catch(() => false)),
      'Display Formats builder not present on this build',
    );
    // Tiles are lazy — let the first page of the grid render.
    await expect.poll(() => mediaSetsPage.builderFileCount(), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test.afterEach(async ({ mediaSetsPage, mediaSetApi, page }) => {
    await page.keyboard.press('Escape'); // close any picker a failed test left open
    await mediaSetsPage.cancelCreate();
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  });

  // ── Layout ───────────────────────────────────────────────────────────────────

  test('BLD-01 · opens with Landscape 16:9 (active) and Portrait 9:16, nothing assigned @smoke', async ({
    mediaSetsPage,
  }) => {
    await expect(mediaSetsPage.formatCountText).toContainText('2 formats');
    const landscape = mediaSetsPage.zoneCard(/Landscape · 16:9/);
    const portrait = mediaSetsPage.zoneCard(/Portrait · 9:16/);
    await expect(landscape).toBeVisible();
    await expect(portrait).toBeVisible();
    await expect(landscape).toContainText('Active');
    await expect(portrait).not.toContainText('Active');
    await expect(landscape).toContainText('click a file on the left');
    await expect(portrait).toContainText('click a file on the left');
    await expect(mediaSetsPage.clearMediaBtn).toBeDisabled();
    await expect(mediaSetsPage.chooseAnyPill()).toHaveClass(/active/);
    await expect(mediaSetsPage.aspectPill()).not.toHaveClass(/active/);
  });

  test('BLD-02 · library thumbnails load (no CDN throttling)', async ({ mediaSetsPage, page }) => {
    // BUG-MS-THUMB-429: the grid requests every thumbnail at once and CloudFront
    // answers 429 for ~190 of them, so tiles render as broken-image alt text.
    test.fail(true, 'BUG-MS-THUMB-429 — thumbnails answer HTTP 429 from the CDN');
    const bad: string[] = [];
    page.on('response', (r) => {
      if (r.request().resourceType() === 'image' && r.status() >= 400) {
        bad.push(`${r.status()} ${r.url()}`);
      }
    });
    await mediaSetsPage.cancelCreate();
    await mediaSetsPage.openCreate();
    await page.waitForTimeout(6_000);
    expect(bad, `failed image requests:\n${bad.slice(0, 5).join('\n')}`).toHaveLength(0);
  });

  // ── Aspect-ratio filter (AR-1/2/3) ───────────────────────────────────────────

  test('AR-1 · "Aspect Ratio" pill limits the grid to landscape files for the active Landscape zone', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.aspectPill().click();
    await expect(mediaSetsPage.aspectPill()).toHaveClass(/active/);
    await expect(mediaSetsPage.chooseAnyPill()).not.toHaveClass(/active/);
    await expect(mediaSetsPage.aspectNote).toContainText('16:9');
    await expect.poll(() => mediaSetsPage.builderFileCount(), { timeout: 10_000 }).toBeGreaterThan(0);

    const tiles = await mediaSetsPage.tileDimensions();
    expect(tiles.length, 'tiles with a W×H label').toBeGreaterThan(0);
    const portrait = tiles.filter((t) => t.h > t.w);
    expect(portrait, `portrait tiles under a landscape filter:\n${portrait.map((t) => t.text).join('\n')}`).toHaveLength(0);
  });

  test('AR-1b · every tile under "Showing only 16:9 media" is within 1.2× of 16:9', async ({ mediaSetsPage }) => {
    // BUG-MS-AR-01 (2.4:1 and 1:1 files under 16:9) is fixed on cms2 as of 2026-10-09.
    await mediaSetsPage.aspectPill().click();
    await expect.poll(() => mediaSetsPage.builderFileCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    const tiles = await mediaSetsPage.tileDimensions();
    const wrong = tiles.filter((t) => !withinFactor(t.w / t.h, RATIO_16_9));
    expect(wrong, `tiles outside 1.2× of 16:9:\n${wrong.map((t) => t.text).join('\n')}`).toHaveLength(0);
  });

  test('AR-1c · square files no longer appear under the 16:9 or 9:16 filter', async ({ mediaSetsPage }) => {
    await mediaSetsPage.aspectPill().click();
    for (const zone of [/Landscape · 16:9/, /Portrait · 9:16/]) {
      await mediaSetsPage.activateZone(zone);
      await expect.poll(() => mediaSetsPage.builderFileCount(), { timeout: 10_000 }).toBeGreaterThan(0);
      const square = (await mediaSetsPage.tileDimensions()).filter((t) => withinFactor(t.w / t.h, 1));
      expect(square, `square tiles under ${zone}:\n${square.map((t) => t.text).join('\n')}`).toHaveLength(0);
    }
  });

  test('AR-2 · switching the active zone to Portrait re-filters the grid to 9:16', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.aspectPill().click();
    await mediaSetsPage.activateZone(/Portrait · 9:16/);
    await expect(mediaSetsPage.aspectNote).toContainText('9:16');
    await expect.poll(() => mediaSetsPage.builderFileCount(), { timeout: 10_000 }).toBeGreaterThan(0);

    const tiles = await mediaSetsPage.tileDimensions();
    expect(tiles.length).toBeGreaterThan(0);
    const wrong = tiles.filter((t) => t.w >= t.h && t.w < 20_000); // 99999×99999 = corrupt record, see AR-1b
    expect(wrong, `non-portrait tiles under a 9:16 filter:\n${wrong.map((t) => t.text).join('\n')}`).toHaveLength(0);
  });

  test('AR-3 · "Choose Any" brings every orientation back into the grid', async ({ mediaSetsPage }) => {
    await mediaSetsPage.aspectPill().click();
    await expect(mediaSetsPage.aspectNote).toBeVisible();
    await mediaSetsPage.chooseAnyPill().click();
    await expect(mediaSetsPage.aspectNote).toBeHidden();
    await expect(mediaSetsPage.chooseAnyPill()).toHaveClass(/active/);
    await expect
      .poll(async () => (await mediaSetsPage.tileDimensions()).some((t) => t.h > t.w), { timeout: 10_000 })
      .toBe(true);
  });

  test('AR-3b · the counter\'s shown count follows the Aspect Ratio filter', async ({ mediaSetsPage }) => {
    const any = (await mediaSetsPage.fileCounter())!;
    await mediaSetsPage.aspectPill().click();
    await expect(mediaSetsPage.aspectNote).toBeVisible();
    await expect
      .poll(async () => (await mediaSetsPage.fileCounter())?.shown, { timeout: 6_000 })
      .toBe(await mediaSetsPage.builderFileCount());
    expect((await mediaSetsPage.fileCounter())!.shown).toBeLessThanOrEqual(any.shown);
  });

  test('AR-3c · the counter\'s total follows the Aspect Ratio filter', async ({ mediaSetsPage }) => {
    // BUG-MS-AR-02, narrowed 2026-10-09: "X of Y" now filters X (47 of 892 under
    // 16:9) but Y still counts the whole library. Open question for the developer:
    // is Y meant to be the matching total?
    test.fail(true, 'BUG-MS-AR-02 — counter total ignores the Aspect Ratio filter');
    const all = (await mediaSetsPage.fileCounter())!.total;
    await mediaSetsPage.aspectPill().click();
    await expect(mediaSetsPage.aspectNote).toBeVisible();
    await expect
      .poll(async () => (await mediaSetsPage.fileCounter())?.total ?? all, { timeout: 6_000 })
      .toBeLessThan(all);
  });

  // ── Assign / clear (AR-4) ────────────────────────────────────────────────────

  test('AR-4 · clicking a file assigns it to the active zone, marks it "In set", shows Duration', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.aspectPill().click();
    await expect.poll(() => mediaSetsPage.builderFileCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    const tile = mediaSetsPage.builderFiles().first();
    await tile.click();

    const landscape = mediaSetsPage.zoneCard(/Landscape · 16:9/);
    await expect(landscape).toContainText('Duration');
    await expect(landscape).not.toContainText('click a file on the left');
    await expect(tile).toContainText('In set');
    await expect(mediaSetsPage.clearMediaBtn).toBeEnabled();
    // The other zone is untouched.
    await expect(mediaSetsPage.zoneCard(/Portrait · 9:16/)).toContainText('click a file on the left');
  });

  test('AR-5 · "Clear Media" empties every zone and disables itself', async ({ mediaSetsPage }) => {
    await mediaSetsPage.aspectPill().click();
    await expect.poll(() => mediaSetsPage.builderFileCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    await mediaSetsPage.builderFiles().first().click();
    await expect(mediaSetsPage.clearMediaBtn).toBeEnabled();

    await mediaSetsPage.clearMediaBtn.click();
    await expect(mediaSetsPage.zoneCard(/Landscape · 16:9/)).toContainText('click a file on the left');
    await expect(mediaSetsPage.clearMediaBtn).toBeDisabled();
  });

  // ── Change ratio (F2) ────────────────────────────────────────────────────────

  test('F2 · "Change ratio" opens a picker with All/Landscape/Portrait/Square and closes untouched', async ({
    mediaSetsPage,
    page,
  }) => {
    await mediaSetsPage.zoneCard(/Landscape · 16:9/).getByText('Change ratio').click();
    await expect(page.getByText('Change Aspect Ratio', { exact: true })).toBeVisible();
    for (const pill of ['All', 'Landscape', 'Portrait', 'Square']) {
      await expect(page.getByText(pill, { exact: true }).last()).toBeVisible();
    }
    await expect(page.getByText('16:9', { exact: true }).first()).toBeVisible();

    await page.getByText('Portrait', { exact: true }).first().click();
    await expect(page.getByText('9:16', { exact: true }).first()).toBeVisible();

    await page.keyboard.press('Escape');
    if (await page.getByText('Change Aspect Ratio', { exact: true }).isVisible().catch(() => false)) {
      await page.getByText('Change Aspect Ratio', { exact: true }).locator('xpath=../..').getByRole('button').first().click();
    }
    await expect(page.getByText('Change Aspect Ratio', { exact: true })).toBeHidden();
    await expect(mediaSetsPage.zoneCard(/Landscape · 16:9/)).toBeVisible();
  });

  test('F2b · choosing Square on the Landscape format relabels it 1:1 and the filter follows', async ({
    mediaSetsPage,
    page,
  }) => {
    await mediaSetsPage.zoneCard(/Landscape/).getByText('Change ratio').click();
    await expect(page.getByText('Change Aspect Ratio', { exact: true })).toBeVisible();
    await page.getByText('Square', { exact: true }).first().click();
    await page.getByText('1:1', { exact: true }).first().click();
    // A single-choice picker closes itself; if it has an Apply button, use it.
    const apply = page.getByRole('button', { name: /^apply$/i });
    if (await apply.isVisible({ timeout: 1_500 }).catch(() => false)) await apply.click();
    await expect(page.getByText('Change Aspect Ratio', { exact: true })).toBeHidden({ timeout: 10_000 });

    await expect(mediaSetsPage.zoneCards().first()).toContainText('1:1');
    await mediaSetsPage.aspectPill().click();
    await expect(mediaSetsPage.aspectNote).toContainText('1:1');
  });

  // ── Add / remove format ──────────────────────────────────────────────────────

  test('FMT-1 · "Add Display Format" (multi-select + Apply) adds a format; Cancel adds none', async ({
    mediaSetsPage,
    page,
  }) => {
    await mediaSetsPage.addFormatBtn.click();
    await expect(page.getByText('Add Display Format', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: /^cancel$/i }).last().click();
    await expect(mediaSetsPage.formatCountText).toContainText('2 formats');

    await mediaSetsPage.addFormatBtn.click();
    await page.getByText('Square', { exact: true }).first().click();
    const card = page.getByText('1:1', { exact: true }).first().locator('xpath=ancestor::*[.//input[@type="checkbox"]][1]');
    await card.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: /^apply \(1\)$/i }).click();
    await expect(mediaSetsPage.formatCountText).toContainText('3 formats');
    await expect(mediaSetsPage.zoneCards()).toHaveCount(3);
  });

  test('FMT-2 · removing a format with its × drops the count', async ({ mediaSetsPage }) => {
    await mediaSetsPage.zoneCard(/Portrait · 9:16/).locator('button').last().click();
    await expect(mediaSetsPage.formatCountText).toContainText('1 format');
    await expect(mediaSetsPage.zoneCards()).toHaveCount(1);
  });

  // ── Validation + end-to-end create ───────────────────────────────────────────

  test('VAL-1 · Create with no name shows "Media set name is required", stays on the builder, saves nothing', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }) => {
    const before = (await mediaSetApi.list({ limit: 1 })).totalDocs;
    await mediaSetsPage.createSubmitBtn.click();
    await expect(page.getByText('Media set name is required')).toBeVisible();
    await expect(mediaSetsPage.nameInput).toBeVisible();
    await expect(page).toHaveURL(/\/library\/mediaset\/create/);
    expect((await mediaSetApi.list({ limit: 1 })).totalDocs).toBe(before);
  });

  test('E2E-1 · name + one file per format → Create saves a set with both zones filled', async ({
    mediaSetsPage,
    mediaSetApi,
    page,
  }, testInfo) => {
    const name = mediaSetName('ui_builder', testInfo.workerIndex);
    await mediaSetsPage.nameInput.fill(name);
    await mediaSetsPage.aspectPill().click();

    await expect.poll(() => mediaSetsPage.builderFileCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    await mediaSetsPage.builderFiles().first().click(); // Landscape (active)
    await mediaSetsPage.activateZone(/Portrait · 9:16/);
    await expect.poll(() => mediaSetsPage.builderFileCount(), { timeout: 10_000 }).toBeGreaterThan(0);
    await mediaSetsPage.builderFiles().first().click(); // Portrait
    await expect(mediaSetsPage.zoneCard(/Landscape/)).toContainText('Duration');
    await expect(mediaSetsPage.zoneCard(/Portrait/)).toContainText('Duration');

    await mediaSetsPage.createSubmitBtn.click();
    await expect(page).not.toHaveURL(/\/mediaset\/create/, { timeout: 20_000 });

    const found = await mediaSetApi.findByName(name);
    expect(found, 'the set exists on the server').toBeTruthy();
    expect(found!.zones.map((z) => z.label).sort()).toEqual(['Landscape', 'Portrait']);
  });
});
