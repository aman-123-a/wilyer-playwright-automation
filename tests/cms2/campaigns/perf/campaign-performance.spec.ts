// =============================================================================
//  Campaigns V1 — API performance, as consumed by the playlist editor.
//
//  Campaigns have no page of their own: the ONLY way a user reaches them is the
//  Campaigns tab inside the playlist editor. So the hot path measured here is
//  the one that tab fires — `GET /campaign/read` — plus the read/write calls the
//  picker's modals make, and the end-to-end tab-to-cards-rendered time.
//
//  Method notes, because a perf number is only as good as how it was taken:
//   • Every figure is a SAMPLE (default 12 runs), reported as p50/p95, never a
//     single timing. One GC pause or cold connection moves a lone sample by
//     hundreds of ms.
//   • The first call of each sample is discarded as warm-up (TLS + connection).
//   • Assertions are made on p95, not max, so one outlier cannot fail a run.
//   • Requests go through the browser context, so they carry the same auth and
//     TLS path as the real app rather than a synthetic client.
//
//  SCOPE: this is latency profiling, not load testing. cms2 is a shared server
//  with colleagues working on it, so concurrency is capped at a small burst.
//  Real load/soak testing belongs in k6 against an isolated environment
//  (Doc 08 §18.2) — deliberately not attempted here.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { uniqueName } from '../../../../test-data/campaigns.data';
import {
  latencyStats,
  sampleLatency,
  formatStats,
  type LatencyStats,
} from '../../../../utils/performance';

const RUNS = 12;
/** Shared ceiling for a single API call (CMS_API_SLOW_MS, default 3000ms). */
const BUDGET = ENV.PERF.apiSlowMs;

const report: string[] = [];
function record(line: string): void {
  report.push(line);
  // eslint-disable-next-line no-console
  console.log(line);
}

/** Assert on p95 and always publish the numbers, pass or fail. */
function expectWithinBudget(label: string, stats: LatencyStats, budget = BUDGET): void {
  test.info().annotations.push({
    type: stats.p95 < budget ? 'perf' : 'perf-budget-exceeded',
    description: `${label}: p50=${stats.p50}ms p95=${stats.p95}ms max=${stats.max}ms (budget ${budget}ms)`,
  });
  expect(stats.p95, `${label} p95 must stay under ${budget}ms`).toBeLessThan(budget);
}

test.describe('Campaigns · API performance @perf @api', () => {
  test.afterAll(async () => {
    // eslint-disable-next-line no-console
    console.log(`\n=== Campaign API performance summary ===\n${report.join('\n')}\n`);
  });

  test('PERF-001 · picker list latency — the tab-open hot path @critical', async ({
    campaignApi,
  }, testInfo) => {
    let bytes = 0;
    const samples = await sampleLatency(RUNS, async () => {
      const res = await campaignApi.listRaw({ limit: 50 });
      bytes = (await res.body()).byteLength;
      expect(res.status()).toBe(200);
    });

    const stats = latencyStats(samples);
    record(
      formatStats('GET /campaign/read?limit=50', stats, `  payload=${(bytes / 1024).toFixed(1)}KB`),
    );
    await testInfo.attach('list-latency', {
      body: JSON.stringify(stats, null, 2),
      contentType: 'application/json',
    });

    expectWithinBudget('campaign list', stats);
  });

  test('PERF-002 · latency and payload scaling with page size', async ({ campaignApi }) => {
    const rows: Array<{ limit: number; stats: LatencyStats; kb: number }> = [];

    for (const limit of [10, 25, 50, 100]) {
      let bytes = 0;
      const samples = await sampleLatency(6, async () => {
        const res = await campaignApi.listRaw({ limit });
        bytes = (await res.body()).byteLength;
      });
      const stats = latencyStats(samples);
      rows.push({ limit, stats, kb: bytes / 1024 });
      record(
        formatStats(
          `GET /campaign/read?limit=${limit}`,
          stats,
          `  payload=${(bytes / 1024).toFixed(1)}KB`,
        ),
      );
    }

    // The picker asks for a full page of cards, so the largest page is the one
    // a real user waits on. It must still clear the same ceiling.
    const largest = rows[rows.length - 1];
    expectWithinBudget(`campaign list (limit=${largest.limit})`, largest.stats);

    // A 10x page size that costs ~10x the time points at per-row work in the
    // handler (an N+1 lookup for each item's media) rather than a set-based query.
    const smallest = rows[0];
    const timeRatio = largest.stats.p50 / Math.max(smallest.stats.p50, 1);
    record(
      `  ↳ limit ${smallest.limit}→${largest.limit}: p50 ×${timeRatio.toFixed(2)}, ` +
        `payload ×${(largest.kb / Math.max(smallest.kb, 0.001)).toFixed(2)}`,
    );
  });

  test('PERF-003 · search latency vs an unfiltered list', async ({ campaignApi }, testInfo) => {
    const plain = latencyStats(await sampleLatency(RUNS, () => campaignApi.listRaw({ limit: 50 })));
    const searched = latencyStats(
      await sampleLatency(RUNS, () => campaignApi.listRaw({ limit: 50, search: 'QA' })),
    );

    record(formatStats('GET /campaign/read (no search)', plain));
    record(formatStats('GET /campaign/read?search=QA', searched));
    record(
      `  ↳ search overhead: p50 ${searched.p50 - plain.p50}ms, p95 ${searched.p95 - plain.p95}ms`,
    );

    await testInfo.attach('search-vs-plain', {
      body: JSON.stringify({ plain, searched }, null, 2),
      contentType: 'application/json',
    });

    expectWithinBudget('campaign search', searched);
  });

  test('PERF-004 · deep pagination — first page vs last page', async ({ campaignApi }) => {
    const { totalPages } = await campaignApi.list({ limit: 10 });
    const first = latencyStats(
      await sampleLatency(6, () => campaignApi.listRaw({ limit: 10, page: 1 })),
    );
    record(formatStats('GET /campaign/read page=1', first));

    if (totalPages > 1) {
      const last = latencyStats(
        await sampleLatency(6, () => campaignApi.listRaw({ limit: 10, page: totalPages })),
      );
      record(formatStats(`GET /campaign/read page=${totalPages}`, last));
      record(`  ↳ deep-page cost: p50 ${last.p50 - first.p50}ms across ${totalPages} pages`);
      expectWithinBudget(`campaign list (page ${totalPages})`, last);
    } else {
      record(`  ↳ only ${totalPages} page at limit=10 — deep pagination not exercised`);
    }

    expectWithinBudget('campaign list (page 1)', first);
  });

  test('PERF-005 · read-one latency', async ({ campaignApi }, testInfo) => {
    const name = uniqueName('Perf', testInfo.workerIndex);
    const seeded = await campaignApi.seed(name, 3);
    try {
      const stats = latencyStats(await sampleLatency(RUNS, () => campaignApi.readRaw(seeded.id)));
      record(formatStats('GET /campaign/read/{id} (3 items)', stats));
      expectWithinBudget('campaign read-one', stats);
    } finally {
      await campaignApi.deleteQuietly(seeded.id);
    }
  });

  test('PERF-006 · write latency — create, update, delete @destructive', async ({
    campaignApi,
  }, testInfo) => {
    test.skip(!ENV.ALLOW_DESTRUCTIVE, 'Creates and deletes campaigns.');

    const files = await campaignApi.sampleMediaIds(1);
    const payload = (name: string) => ({
      name,
      data: files.map((file) => ({ file, duration: 10 })),
      defaultDuration: 10,
      folderId: null,
    });

    // Each create needs a unique name (BR-11), so the iteration index is part of it.
    const createdIds: string[] = [];
    const createSamples = await sampleLatency(6, async (i) => {
      const name = `${uniqueName('PerfW', testInfo.workerIndex)}_${i}`;
      const res = await campaignApi.createRaw(payload(name));
      if (res.ok()) {
        const made = await campaignApi.findByName(name);
        if (made) createdIds.push(made.id);
      }
    });
    const createStats = latencyStats(createSamples);
    record(formatStats('POST /campaign/create', createStats));

    try {
      if (createdIds.length > 0) {
        const target = createdIds[0];
        const updateStats = latencyStats(
          await sampleLatency(6, (i) =>
            campaignApi.updateRaw(
              target,
              payload(`${uniqueName('PerfU', testInfo.workerIndex)}_${i}`),
            ),
          ),
        );
        record(formatStats('POST /campaign/update/{id}', updateStats));
        expectWithinBudget('campaign update', updateStats);
      }

      // Delete is measured on the throwaway records, one timing per record.
      const deleteSamples: number[] = [];
      for (const id of createdIds) {
        const start = Date.now();
        await campaignApi.deleteRaw(id);
        deleteSamples.push(Date.now() - start);
      }
      createdIds.length = 0;
      if (deleteSamples.length > 0) {
        const deleteStats = latencyStats(deleteSamples);
        record(formatStats('DELETE /campaign/delete/{id}', deleteStats));
        expectWithinBudget('campaign delete', deleteStats);
      }

      expectWithinBudget('campaign create', createStats);
    } finally {
      for (const id of createdIds) await campaignApi.deleteQuietly(id);
    }
  });

  test('PERF-007 · a small concurrent burst does not degrade the list', async ({ campaignApi }) => {
    // Deliberately modest: cms2 is shared. This detects obvious contention
    // (connection-pool starvation, a per-request full collection scan) without
    // behaving like a load test against a server other people are using.
    const BURST = 8;
    const serial = latencyStats(await sampleLatency(6, () => campaignApi.listRaw({ limit: 50 })));

    const start = Date.now();
    const responses = await Promise.all(
      Array.from({ length: BURST }, () => campaignApi.listRaw({ limit: 50 })),
    );
    const wallClock = Date.now() - start;

    for (const res of responses) {
      expect(res.status(), 'no request may fail under a small burst').toBe(200);
    }

    record(formatStats('GET /campaign/read (serial baseline)', serial));
    record(
      `${'GET /campaign/read x8 concurrent'.padEnd(38)} wall=${wallClock}ms  ` +
        `avg/req=${Math.round(wallClock / BURST)}ms  serial p50=${serial.p50}ms`,
    );

    // If 8 concurrent requests take longer than 8 sequential ones, they are
    // being serialised somewhere rather than handled in parallel.
    expect(
      wallClock,
      `${BURST} concurrent list calls (${wallClock}ms) should beat ${BURST} sequential ` +
        `(~${serial.p50 * BURST}ms) — otherwise requests are being serialised`,
    ).toBeLessThan(serial.p50 * BURST);
  });

  test('PERF-008 · end-to-end: opening the Campaigns tab in the playlist editor @ui', async ({
    playlistsPage,
    campaignPicker,
  }) => {
    const playlistId = await playlistsPage.anyPlaylistId();

    await campaignPicker.open(playlistId);

    // The tab is already open after `open()`; measure a re-open, which is the
    // interaction a user actually repeats while building a playlist.
    const start = Date.now();
    await campaignPicker.tab.click();
    await expect(campaignPicker.cards.first()).toBeVisible({ timeout: 30_000 });
    const elapsed = Date.now() - start;

    const cards = await campaignPicker.count();
    record(`${'UI: Campaigns tab → cards rendered'.padEnd(38)} ${elapsed}ms  (${cards} cards)`);

    test.info().annotations.push({
      type: elapsed < ENV.PERF.listingLoadMs ? 'perf' : 'perf-budget-exceeded',
      description: `Campaigns tab render: ${elapsed}ms (budget ${ENV.PERF.listingLoadMs}ms)`,
    });
    expect(
      elapsed,
      `the Campaigns tab should render within ${ENV.PERF.listingLoadMs}ms`,
    ).toBeLessThan(ENV.PERF.listingLoadMs);
  });
});
