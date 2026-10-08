// =============================================================================
//  MEDIA SETS — Load / latency.
//  A small, bounded burst against the shared cms2 server — latency profiling,
//  not a soak test (real load testing belongs in k6 on an isolated environment).
//
//  Method, same as the campaigns perf suite: every figure is a SAMPLE reported as
//  p50/p95 with the first call discarded as warm-up, and assertions are on p95.
//  The data set is SET_COUNT sets created with bounded concurrency, swept in
//  afterAll by prefix.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { latencyStats, sampleLatency, formatStats } from '../../../../utils/performance';

/** Sets created for the run — enough to span two pages at the UI's 20/page. */
const SET_COUNT = 25;
/** Parallel creates; the server answered 429 above ~6 in earlier runs. */
const CONCURRENCY = 4;
const RUNS = 10;
const BUDGET = ENV.PERF.apiSlowMs;

const report: string[] = [];
const record = (line: string): void => {
  report.push(line);
  // eslint-disable-next-line no-console
  console.log(line);
};

test.describe.configure({ mode: 'serial' });

test.describe('Media Sets — Load @perf', () => {
  let files: ZoneFiles;
  let token: string;

  test.beforeAll(async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: testInfo.project.use.storageState });
    const api = await MediaSetService.fromContext(context);
    files = await api.pickZoneFiles();
    token = mediaSetName('load', testInfo.workerIndex);
    await context.close();
  });

  test.afterAll(async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: testInfo.project.use.storageState });
    const swept = await (await MediaSetService.fromContext(context)).cleanupByPrefix(MEDIASET_PREFIX);
    await context.close();
    // eslint-disable-next-line no-console
    console.log(`\n=== Media Sets load summary (swept ${swept}) ===\n${report.join('\n')}\n`);
  });

  test.beforeEach(async ({ mediaSetsPage }) => {
    test.skip(!(await mediaSetsPage.isAvailable()), 'Media Sets module is absent from this build');
  });

  test('LOAD-01 · burst create: every set is accepted, no 429/5xx', async ({ mediaSetApi }) => {
    const statuses: number[] = [];
    const started = Date.now();
    const queue = Array.from({ length: SET_COUNT }, (_, i) => `${token}_${String(i).padStart(3, '0')}`);

    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        for (let name = queue.shift(); name; name = queue.shift()) {
          const res = await mediaSetApi.createRaw(MediaSetService.payload(name, files));
          statuses.push(res.status());
        }
      }),
    );

    const elapsed = Date.now() - started;
    record(`burst create ${SET_COUNT} sets @ concurrency ${CONCURRENCY}: ${elapsed}ms ` +
      `(${Math.round(elapsed / SET_COUNT)}ms/set)`);
    const bad = statuses.filter((s) => s !== 201);
    expect(bad, `non-201 responses: ${bad.join(',')}`).toHaveLength(0);
    expect((await mediaSetApi.list({ search: token })).totalDocs).toBe(SET_COUNT);
  });

  test('LOAD-02 · list latency stays inside the API budget (p95)', async ({ mediaSetApi }) => {
    const samples = await sampleLatency(RUNS, async () => {
      expect((await mediaSetApi.listRaw({ limit: 20 })).status()).toBe(200);
    });
    const stats = latencyStats(samples);
    record(formatStats('GET mediaSet/read limit=20', stats));
    expect(stats.p95, `list p95 under ${BUDGET}ms`).toBeLessThan(BUDGET);
  });

  test('LOAD-03 · search latency stays inside the API budget (p95)', async ({ mediaSetApi }) => {
    const samples = await sampleLatency(RUNS, async () => {
      const res = await mediaSetApi.listRaw({ search: token, limit: 20 });
      expect(res.status()).toBe(200);
    });
    const stats = latencyStats(samples);
    record(formatStats('GET mediaSet/read search=<token>', stats));
    expect(stats.p95, `search p95 under ${BUDGET}ms`).toBeLessThan(BUDGET);
  });

  test('LOAD-04 · pagination is consistent: no overlap, no gaps across pages', async ({
    mediaSetApi,
  }) => {
    const limit = 10;
    const seen = new Set<string>();
    let pages = 0;
    for (let page = 1; ; page += 1) {
      const res = await mediaSetApi.list({ search: token, limit, page });
      pages += 1;
      for (const m of res.mediaSets) {
        expect(seen.has(m.id), `set ${m.name} repeated across pages`).toBe(false);
        seen.add(m.id);
      }
      if (page >= res.totalPages) break;
    }
    expect(seen.size, 'every created set is reachable through paging').toBe(SET_COUNT);
    expect(pages).toBe(Math.ceil(SET_COUNT / limit));
  });

  test('LOAD-05 · UI list renders a full page of cards inside the listing budget', async ({
    mediaSetsPage,
    page,
  }) => {
    const started = Date.now();
    await page.goto('/library');
    await mediaSetsPage.mediaSetsTab.click();
    await expect(mediaSetsPage.cards().first()).toBeVisible({ timeout: ENV.PERF.listingLoadMs * 2 });
    const ms = Date.now() - started;
    record(`UI /library → Media Sets first card: ${ms}ms (budget ${ENV.PERF.listingLoadMs}ms)`);
    expect(ms).toBeLessThan(ENV.PERF.listingLoadMs);
    expect(await mediaSetsPage.cardCount(), 'list is capped at 20 per page').toBeLessThanOrEqual(20);
  });

  test('LOAD-06 · UI bulk delete of a full page of sets completes and removes them all', async ({
    mediaSetsPage,
    mediaSetApi,
  }) => {
    await mediaSetsPage.open();
    await mediaSetsPage.search(token);
    await expect.poll(async () => mediaSetsPage.cardCount()).toBeGreaterThan(0);

    const n = await mediaSetsPage.cardCount();
    for (let i = 0; i < n; i++) {
      await mediaSetsPage.cards().nth(i).locator('input[type="checkbox"]').check();
    }
    expect(await mediaSetsPage.bulkDeleteCount()).toBe(n);

    const started = Date.now();
    await mediaSetsPage.bulkDeleteBtn.click();
    // One DELETE per set, run back to back — the modal closes only when all finish.
    await mediaSetsPage.confirmDelete(120_000);
    const modalMs = Date.now() - started;
    record(`UI bulk delete of ${n} sets: modal closed after ${modalMs}ms (${Math.round(modalMs / n)}ms/set)`);
    test.info().annotations.push({
      type: 'perf',
      description: `bulk delete of ${n} sets blocked the UI for ${modalMs}ms`,
    });

    await expect
      .poll(async () => (await mediaSetApi.list({ search: token })).totalDocs, { timeout: 30_000 })
      .toBe(SET_COUNT - n);
  });
});
