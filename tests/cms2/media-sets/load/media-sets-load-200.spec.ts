// =============================================================================
//  MEDIA SETS — Volume: 220 records created in one run (> 200).
//  Proves the module copes with a large list: creation throughput, 429 behaviour,
//  list/search latency at volume, pagination integrity (11 pages at 20/page), UI
//  render, and a full teardown.
//
//  Still a bounded run on a SHARED server: concurrency is capped at 5 (the API
//  answered 429 above ~6 parallel creates), 429/5xx are retried with backoff, and
//  every set carries MEDIASET_PREFIX and is swept in afterAll — even on failure.
//
//  Writes 220 records, so it needs CMS_ALLOW_DESTRUCTIVE (default on for cms2).
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { latencyStats, sampleLatency, formatStats } from '../../../../utils/performance';

const TOTAL = 220;
const CONCURRENCY = 5;
const PAGE_SIZE = 20;
const BUDGET = ENV.PERF.apiSlowMs;

const report: string[] = [];
const record = (line: string): void => {
  report.push(line);
  // eslint-disable-next-line no-console
  console.log(line);
};

/** Run `worker` over `items` with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: limit }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await worker(item);
    }),
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('Media Sets — Volume (220 records) @perf @stress', () => {
  test.setTimeout(600_000);

  let files: ZoneFiles;
  let token: string;
  let api: MediaSetService;
  let close: () => Promise<void>;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'writes 220 records — set CMS_ALLOW_DESTRUCTIVE=true');
    const context = await browser.newContext({ storageState: testInfo.project.use.storageState });
    close = () => context.close();
    api = await MediaSetService.fromContext(context);
    files = await api.pickZoneFiles();
    token = mediaSetName('vol', testInfo.workerIndex);
  });

  test.afterAll(async () => {
    if (!api) return;
    // Always sweep, pass or fail, so a failed run never leaves 220 sets behind.
    const started = Date.now();
    const stale = await api.findByPrefix(MEDIASET_PREFIX);
    await pool(stale, CONCURRENCY, (m) => api.deleteQuietly(m.id));
    const ms = Date.now() - started;
    const left = (await api.findByPrefix(MEDIASET_PREFIX)).length;
    await close();
    // eslint-disable-next-line no-console
    console.log(
      `\n=== Media Sets volume summary ===\n${report.join('\n')}\n` +
        `teardown: removed ${stale.length} sets in ${ms}ms, ${left} left\n`,
    );
  });

  test.beforeEach(async ({ mediaSetsPage }) => {
    test.skip(!(await mediaSetsPage.isAvailable()), 'Media Sets module is absent from this build');
  });

  test('VOL-01 · create 220 sets: all accepted, 429s absorbed by retry', async () => {
    const names = Array.from({ length: TOTAL }, (_, i) => `${token}_${String(i).padStart(3, '0')}`);
    let throttled = 0;
    const failures: string[] = [];
    const started = Date.now();

    await pool(names, CONCURRENCY, async (name) => {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const res = await api.createRaw(MediaSetService.payload(name, files));
        if (res.status() === 201) return;
        if (res.status() === 429 || res.status() >= 500) {
          if (res.status() === 429) throttled += 1;
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        failures.push(`${name}: ${res.status()}`);
        return;
      }
      failures.push(`${name}: still throttled/failing after 4 attempts`);
    });

    const elapsed = Date.now() - started;
    record(
      `create ${TOTAL} sets @ concurrency ${CONCURRENCY}: ${elapsed}ms ` +
        `(${Math.round(elapsed / TOTAL)}ms/set, ${(TOTAL / (elapsed / 1000)).toFixed(1)} sets/s), ` +
        `${throttled} throttled (429) responses retried`,
    );
    expect(failures, failures.slice(0, 5).join('; ')).toHaveLength(0);
  });

  test('VOL-02 · the server count equals what was created', async () => {
    const res = await api.list({ search: token, limit: 1 });
    expect(res.totalDocs).toBe(TOTAL);
    expect(res.totalPages).toBe(1 * TOTAL);
  });

  test('VOL-03 · pagination at 20/page: 11 pages, no duplicates, no gaps', async () => {
    const seen = new Set<string>();
    const sizes: number[] = [];
    for (let page = 1; ; page += 1) {
      const res = await api.list({ search: token, limit: PAGE_SIZE, page });
      sizes.push(res.mediaSets.length);
      for (const m of res.mediaSets) {
        expect(seen.has(m.id), `${m.name} repeated across pages`).toBe(false);
        seen.add(m.id);
      }
      if (page >= res.totalPages) break;
    }
    expect(seen.size).toBe(TOTAL);
    expect(sizes).toHaveLength(Math.ceil(TOTAL / PAGE_SIZE));
    expect(sizes.slice(0, -1).every((n) => n === PAGE_SIZE), 'every page but the last is full').toBe(true);
    expect(sizes.at(-1)).toBe(TOTAL % PAGE_SIZE || PAGE_SIZE);
  });

  test('VOL-04 · list and search latency at volume stay inside the budget (p95)', async () => {
    const list = latencyStats(
      await sampleLatency(10, async () => expect((await api.listRaw({ limit: PAGE_SIZE })).status()).toBe(200)),
    );
    record(formatStats(`GET read limit=20 @ ${TOTAL}+ sets`, list));
    expect(list.p95, `list p95 under ${BUDGET}ms`).toBeLessThan(BUDGET);

    const search = latencyStats(
      await sampleLatency(10, async () =>
        expect((await api.listRaw({ search: `${token}_100`, limit: PAGE_SIZE })).status()).toBe(200),
      ),
    );
    record(formatStats('GET read search=<one name>', search));
    expect(search.p95, `search p95 under ${BUDGET}ms`).toBeLessThan(BUDGET);

    const wide = latencyStats(
      await sampleLatency(10, async () =>
        expect((await api.listRaw({ search: token, limit: 100 })).status()).toBe(200),
      ),
    );
    record(formatStats('GET read search=<prefix> limit=100', wide));
    expect(wide.p95, `wide search p95 under ${BUDGET}ms`).toBeLessThan(BUDGET);
  });

  test('VOL-05 · UI shows Total - 220 and renders a full first page in budget', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.open();
    const started = Date.now();
    await mediaSetsPage.search(token);
    await mediaSetsPage.expectTotal(TOTAL, 20_000);
    await expect(mediaSetsPage.cards().first()).toBeVisible();
    const ms = Date.now() - started;
    record(`UI search over ${TOTAL} sets → Total + first card: ${ms}ms`);

    expect(await mediaSetsPage.cardCount(), 'first page is capped at 20').toBe(PAGE_SIZE);
    expect(ms).toBeLessThan(ENV.PERF.listingLoadMs * 2);
  });

  test('VOL-06 · ticking a full page and bulk-deleting 20 of 220 leaves exactly 200', async ({
    mediaSetsPage,
  }) => {
    await mediaSetsPage.open();
    await mediaSetsPage.search(token);
    await mediaSetsPage.expectTotal(TOTAL, 20_000);

    const n = await mediaSetsPage.cardCount();
    for (let i = 0; i < n; i += 1) {
      await mediaSetsPage.cards().nth(i).locator('input[type="checkbox"]').check();
    }
    expect(await mediaSetsPage.bulkDeleteCount()).toBe(n);

    const started = Date.now();
    await mediaSetsPage.bulkDeleteBtn.click();
    await mediaSetsPage.confirmDelete(120_000);
    record(`UI bulk delete of ${n} of ${TOTAL}: modal closed after ${Date.now() - started}ms`);

    await expect
      .poll(async () => (await api.list({ search: token, limit: 1 })).totalDocs, { timeout: 30_000 })
      .toBe(TOTAL - n);
  });

  test('VOL-07 · API delete of the remaining sets: all removed, throughput recorded', async () => {
    const remaining = await api.findByPrefix(token);
    expect(remaining.length).toBeGreaterThan(0);

    const started = Date.now();
    await pool(remaining, CONCURRENCY, async (m) => {
      const res = await api.deleteRaw(m.id);
      expect([200, 404], `delete ${m.name}`).toContain(res.status());
    });
    const ms = Date.now() - started;
    record(`delete ${remaining.length} sets @ concurrency ${CONCURRENCY}: ${ms}ms (${Math.round(ms / remaining.length)}ms/set)`);

    expect((await api.list({ search: token, limit: 1 })).totalDocs, 'nothing left').toBe(0);
  });
});
