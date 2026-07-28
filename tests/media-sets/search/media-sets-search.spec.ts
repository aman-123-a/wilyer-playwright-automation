// =============================================================================
//  MEDIA SETS — list search bar (Library ▸ Media Sets ▸ "Search…").
//  Automates the 10 search cases from the 2026-07-09 QA report.
//
//  ENVIRONMENT: the functional Media-Sets search (live filter + "Total - N"
//  counter + "No media sets match …" empty state) is a cms2.pocsample.in build
//  feature. The default cms.pocsample.in build renders the box but does not
//  filter, so every test here feature-detects the "Total - N" counter and SKIPS
//  with guidance when it is absent. Run against cms2 with:
//      CMS_BASE_URL=https://cms2.pocsample.in npm run test -- tests/media-sets
//
//  The report's fixed baseline (5 sets) has drifted (157 sets, paginated 20/
//  page), so cases are DATA-RELATIVE: they read the live "Total - N" count (the
//  authoritative match count across pages — visible cards are only one page) and
//  a real card name. Read-only: no set is created, edited, or deleted.
// =============================================================================

import { test, expect } from '../../../fixtures/test-fixtures';

/** A token that cannot match any real set name. */
const NO_MATCH = 'zzznotfound' + '123456';

test.describe('Media Sets — list search @regression', () => {
  test.beforeEach(async ({ mediaSetsPage }) => {
    // Module-level check FIRST: open() clicks the "Media Sets" tab, which does
    // not exist on builds without the module (live), so it must not run there.
    test.skip(
      !(await mediaSetsPage.isAvailable()),
      'Media Sets module is absent from this build (no Media Sets tab in the Library nav)',
    );
    await mediaSetsPage.open();
    test.skip(
      !(await mediaSetsPage.hasSearchFeature()),
      'Media-Sets search is a cms2.pocsample.in feature — run with CMS_BASE_URL=https://cms2.pocsample.in',
    );
  });

  test('P1-P4 positive: exact, case-insensitive, and substring all match @smoke @sanity', async ({
    mediaSetsPage,
  }) => {
    const baseline = (await mediaSetsPage.total())!;
    expect(baseline, 'need at least one media set to exercise search').toBeGreaterThan(0);
    const nameText = await mediaSetsPage.firstCardName();
    expect(nameText.length, 'first card exposes a name').toBeGreaterThan(0);

    // P2 — exact name matches (≥1, and never more than the full list).
    await mediaSetsPage.search(nameText);
    await expect
      .poll(async () => mediaSetsPage.total(), { message: `exact "${nameText}" matches` })
      .toBeLessThan(baseline);
    const exact = (await mediaSetsPage.total())!;
    expect(exact).toBeGreaterThan(0);

    // P3 — case-insensitive: lowercased query yields the same match count.
    await mediaSetsPage.search(nameText.toLowerCase());
    await mediaSetsPage.expectTotal(exact);

    // P4 — substring (not prefix-only): an interior slice still matches.
    const sub = nameText.length >= 3 ? nameText.slice(1, Math.min(nameText.length, 4)) : nameText;
    await mediaSetsPage.search(sub);
    await expect
      .poll(async () => mediaSetsPage.total(), { message: `substring "${sub}" matches` })
      .toBeGreaterThan(0);
  });

  test('P5 reset: clearing the query restores the full list', async ({ mediaSetsPage }) => {
    const baseline = (await mediaSetsPage.total())!;

    await mediaSetsPage.search(NO_MATCH);
    await mediaSetsPage.expectTotal(0);

    await mediaSetsPage.clearSearch();
    await mediaSetsPage.expectTotal(baseline);
  });

  test('N1 negative: no match shows 0 + an empty state echoing the query', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.search(NO_MATCH);
    await mediaSetsPage.expectTotal(0);
    expect(await mediaSetsPage.cardCount(), 'no cards rendered').toBe(0);
    await expect(mediaSetsPage.emptyState()).toBeVisible();
    await expect(mediaSetsPage.emptyState()).toContainText(NO_MATCH);
  });

  test('N2 edge: surrounding whitespace is trimmed before matching', async ({ mediaSetsPage }) => {
    const baseline = (await mediaSetsPage.total())!;
    const nameText = await mediaSetsPage.firstCardName();

    await mediaSetsPage.search(nameText);
    // Wait for the filter to settle (count drops below baseline), then capture it.
    await expect
      .poll(async () => mediaSetsPage.total(), { message: 'clean query settled' })
      .toBeLessThan(baseline);
    const clean = (await mediaSetsPage.total())!;

    await mediaSetsPage.search(`   ${nameText}   `);
    await mediaSetsPage.expectTotal(clean);
  });

  test('N3 edge: whitespace-only query is treated as empty (full list)', async ({
    mediaSetsPage,
  }) => {
    const baseline = (await mediaSetsPage.total())!;
    await mediaSetsPage.search('     ');
    await mediaSetsPage.expectTotal(baseline);
  });

  test('N4 security: HTML/XSS payload is escaped, not executed', async ({
    mediaSetsPage,
    consoleMonitor,
    page,
  }) => {
    const payload = '<b>QAX</b>';
    let dialogFired = false;
    page.on('dialog', async (d) => {
      dialogFired = true;
      await d.dismiss().catch(() => {});
    });

    await mediaSetsPage.search(payload);

    expect(dialogFired, 'no JS dialog should fire').toBeFalsy();
    // The empty state echoes the query as LITERAL text — proof it was escaped
    // (an injected <b> would render markup, not show the raw tag string).
    await expect(mediaSetsPage.emptyState()).toContainText(payload);
    expect(
      consoleMonitor.getErrors().some((e) => /xss|qax/i.test(e.text)),
      'no XSS execution in console',
    ).toBeFalsy();
  });

  test('N5 security: SQL-injection string is treated literally, no crash', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.search("' OR 1=1 --");
    await mediaSetsPage.expectTotal(0);
    await mediaSetsPage.expectListResolved();
  });

  test('N6 boundary: a very long query does not crash (F3 — no max-length cap)', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.search('A'.repeat(600), 1_500);

    // Accepted without crashing; the list resolves to a zero/empty state.
    await mediaSetsPage.expectTotal(0);
    await mediaSetsPage.expectListResolved();

    // F3 (informational): document whether a cap exists — do not fail on it.
    const max = await mediaSetsPage.searchMaxLength();
    // eslint-disable-next-line no-console
    console.log(`[F3] media-set search maxlength = ${max} (${max < 0 ? 'uncapped' : 'capped'})`);
  });
});
