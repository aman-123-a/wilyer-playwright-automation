// =============================================================================
//  MEDIA SETS — Create builder: file browser filters + counter (Section 2).
//  Automates the parts of the 2026-07-09 report's Aspect-Ratio section that are
//  still present + stable on the current build: the file-type filter, the
//  in-builder file search, their intersection (report AR-6), and the "N of
//  <total>" counter (report F1).
//
//  NOT automated here — and why:
//   • AR-1/2/3 (aspect filter → landscape/portrait-only) and F2 (ratio-vs-
//     orientation label): the report's "Aspect Ratio" / "Choose Any" toggle has
//     been REPLACED by a "Change ratio" button on the current cms2 build, so the
//     exact flow no longer exists to encode. Left for a re-mapping pass.
//   • AR-4/5 (orientation enforcement on assignment): drag-drop into Landscape /
//     Portrait zones — deferred as inherently flaky without a stable DnD hook.
//
//  Read-only: the builder is always cancelled; no media set is saved.
//  Runs against whatever CMS_BASE_URL points at, provided the builder exposes
//  the "N of <total>" counter (skips cleanly otherwise).
// =============================================================================

import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Media Sets — Create builder @regression', () => {
  test.beforeEach(async ({ mediaSetsPage }) => {
    // Module-level check FIRST: open() clicks the "Media Sets" tab, which does
    // not exist on builds without the module (live), so it must not run there.
    test.skip(
      !(await mediaSetsPage.isAvailable()),
      'Media Sets module is absent from this build (no Media Sets tab in the Library nav)',
    );
    await mediaSetsPage.open();
    await mediaSetsPage.openCreate();
    test.skip(
      (await mediaSetsPage.fileCounter()) === null,
      'Create builder file counter not present on this build',
    );
  });

  test.afterEach(async ({ mediaSetsPage }) => {
    await mediaSetsPage.cancelCreate();
  });

  test('builder loads with name field, orientation zones, filters, and counter @smoke', async ({
    mediaSetsPage,
  }) => {
    await expect(mediaSetsPage.nameInput).toBeVisible();
    await expect(mediaSetsPage.landscapeZone).toBeVisible();
    await expect(mediaSetsPage.portraitZone).toBeVisible();
    await expect(mediaSetsPage.filterAll).toBeVisible();
    await expect(mediaSetsPage.fileSearchInput).toBeVisible();
    const counter = await mediaSetsPage.fileCounter();
    expect(counter, 'file counter present').not.toBeNull();
    expect(counter!.total, 'library has files').toBeGreaterThan(0);
  });

  test('type filter narrows the file set and the counter tracks it', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.filterFiles('all');
    const all = (await mediaSetsPage.fileCounter())!.total;
    expect(all).toBeGreaterThan(0);

    await mediaSetsPage.filterFiles('images');
    const images = (await mediaSetsPage.fileCounter())!.total;

    await mediaSetsPage.filterFiles('videos');
    const videos = (await mediaSetsPage.fileCounter())!.total;

    // Each single-type view is a strict subset of "All", and the two types
    // together account for (at most) the whole library.
    expect(images, 'Images ⊂ All').toBeLessThan(all);
    expect(videos, 'Videos ⊂ All').toBeLessThan(all);
    expect(images + videos, 'Images + Videos ≤ All').toBeLessThanOrEqual(all);
  });

  test('AR-6 — file filter × file search intersect (AND logic → empty)', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.filterFiles('images');
    await mediaSetsPage.searchFiles('zzznofile' + '99999');

    await mediaSetsPage.expectFileTotal(0); // no file matches both filters
    expect(await mediaSetsPage.builderFileCount(), 'no tiles rendered').toBe(0);
  });

  test('F1 — the "N of total" counter stays in sync with the visible files', async ({
    mediaSetsPage,
  }) => {
    // Report F1 flagged the counter drifting from the actually-visible files.
    // Guard the correct behaviour: the counter's "shown" equals the number of
    // file tiles on screen, both in the default view and after a filter.
    const before = (await mediaSetsPage.fileCounter())!;
    expect(before.shown, 'counter shown = visible tiles (default)').toBe(
      await mediaSetsPage.builderFileCount(),
    );

    await mediaSetsPage.filterFiles('videos');
    const after = (await mediaSetsPage.fileCounter())!;
    expect(after.shown, 'counter shown = visible tiles (after filter)').toBe(
      await mediaSetsPage.builderFileCount(),
    );
  });
});
