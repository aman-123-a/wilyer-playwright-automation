// =============================================================================
//  Clusters — playback synchronisation (NTP sync), measured from the CMS.
//
//  Every screen streams its playback state to the CMS live channel:
//    playlistEvent { screenId, data: { cs, fid, fp, lid, lp, pid } }
//  Two screens in step enter the same slot — the same file, at the same index,
//  in the same loop pass — at the same moment, so the gap between their PLAYING
//  reports is the observable sync skew. That is what these tests measure: no
//  stopwatch, no eyeballing two panels side by side.
//
//  Honest about what it is: the stamp is when the event reached this client, so
//  the number carries socket jitter on top of true player skew. It is an upper
//  bound — good enough to catch a screen drifting seconds behind its master, not
//  a frame-accurate NTP measurement.
//
//  Preconditions: both screens online and playing (run the functional suite
//  first — it fails fast if a screen is offline).
//
//  Run:  CLUSTER_ID=<id> npm run cms2 -- tests/_core/clusters/perf
//        CLUSTER_SYNC_WINDOW_MS=180000 CLUSTER_SYNC_TOLERANCE_MS=1500 …
// =============================================================================

/* eslint-disable no-console -- the measured skew, event counts and per-screen
   medians are the deliverable here: this suite reports a number rather than
   only passing or failing, and that number has to reach the run log. */

import type { BrowserContext } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { requireCluster } from '../../../../helpers/cluster/requireCluster';
import { ClusterSettingsPage, type ClusterScreen } from '../../../../pages/ClusterSettingsPage';
import { CLUSTER } from '../../../../config/cluster';
import { ADMIN_STORAGE_STATE } from '../../../../config/env';

const WINDOW_MS = CLUSTER.SYNC_WINDOW_MS;
const TOLERANCE_MS = CLUSTER.SYNC_TOLERANCE_MS;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

test.describe.configure({ mode: 'serial' });

test.describe('Cluster · playback synchronisation', () => {
  requireCluster();

  test.setTimeout(WINDOW_MS + 180_000);

  // This suite owns its own context: the measurement window spans every test in
  // the file, so the page and its socket must outlive a single test's fixtures.
  let context: BrowserContext;
  let cluster: ClusterSettingsPage;
  let master: ClusterScreen;
  let slaves: ClusterScreen[] = [];

  test.beforeAll(async ({ browser }) => {
    // Hooks do not inherit the describe-level budget, and this one sits out the
    // whole measurement window.
    test.setTimeout(WINDOW_MS + 180_000);

    context = await browser.newContext({ storageState: ADMIN_STORAGE_STATE });
    const page = await context.newPage();
    cluster = new ClusterSettingsPage(page, CLUSTER.ID);
    await cluster.open();

    await cluster.live.waitForMaster({ timeoutMs: CLUSTER.ELECTION_TIMEOUT_MS });
    const screens = await cluster.screens();
    const masterId = cluster.live.masterScreenId;
    const elected = screens.find((s) => s.id === masterId);

    expect(elected, 'the elected master is not a screen in this cluster').toBeTruthy();
    master = elected as ClusterScreen;
    slaves = screens.filter((s) => s.id !== masterId);

    expect(slaves.length, 'need at least one slave to compare against').toBeGreaterThan(0);
    console.log(`👑 master ${master.name} · slaves ${slaves.map((s) => s.name).join(', ')}`);

    // One measurement window feeds every test in this file.
    cluster.live.reset();
    // eslint-disable-next-line playwright/no-wait-for-timeout -- the fixed window IS the measurement; ending it early on some state would bias the sample
    await page.waitForTimeout(WINDOW_MS);
    console.log(`recorded ${cluster.live.events.length} playback events over ${WINDOW_MS / 1000}s`);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('every screen in the cluster is reporting playback @smoke', async () => {
    for (const s of [master, ...slaves]) {
      const playing = cluster.live.eventsFor(s.id, 'PLAYING');
      expect(
        playing.length,
        `"${s.name}" reported no PLAYING events — it is not playing`,
      ).toBeGreaterThan(0);
      console.log(`${s.name}: ${playing.length} PLAYING events`);
    }
  });

  test('master and slaves are playing the same playlist and the same loop @smoke', async () => {
    const fingerprint = (
      id: string,
    ): { pid: Set<string | undefined>; lid: Set<string | undefined> } => {
      const es = cluster.live.eventsFor(id);
      return { pid: new Set(es.map((e) => e.pid)), lid: new Set(es.map((e) => e.lid)) };
    };

    const m = fingerprint(master.id);
    for (const s of slaves) {
      const f = fingerprint(s.id);
      for (const pid of f.pid) {
        expect([...m.pid], `"${s.name}" is playing playlist ${pid}, master is not`).toContain(pid);
      }
      for (const lid of f.lid) {
        expect(
          [...m.lid],
          `"${s.name}" is in loop ${lid}, master is not — the screens are out of step`,
        ).toContain(lid);
      }
    }
  });

  test('slave playback stays within tolerance of the master @smoke', async () => {
    for (const s of slaves) {
      const pairs = cluster.live.skewBetween(master.id, s.id);

      expect(
        pairs.length,
        `no shared playback slots between "${master.name}" and "${s.name}" — they are not playing the same items`,
      ).toBeGreaterThan(0);

      const skews = pairs.map((p) => p.skewMs);
      const worst = pairs.reduce((a, b) => (b.skewMs > a.skewMs ? b : a));
      console.log(
        `${master.name} ↔ ${s.name}: ${pairs.length} shared slots · ` +
          `median ${median(skews)}ms · worst ${worst.skewMs}ms on "${worst.fn}"`,
      );

      expect(
        worst.skewMs,
        `"${s.name}" drifted ${worst.skewMs}ms behind/ahead of "${master.name}" on "${worst.fn}"`,
      ).toBeLessThanOrEqual(TOLERANCE_MS);
    }
  });

  test('both screens walk the playlist in the same order', async () => {
    const order = (id: string): string[] => {
      const seen: string[] = [];
      for (const e of cluster.live.eventsFor(id, 'PLAYING')) {
        const key = `${e.lp}:${e.fp}`;
        if (seen[seen.length - 1] !== key) seen.push(key);
      }
      return seen;
    };

    const m = order(master.id);
    for (const s of slaves) {
      const theirs = order(s.id);
      const overlap = Math.min(m.length, theirs.length);
      expect(overlap, `"${s.name}" produced no comparable sequence`).toBeGreaterThan(0);
      expect(
        theirs.slice(0, overlap),
        `"${s.name}" played the loop in a different order than "${master.name}"`,
      ).toEqual(m.slice(0, overlap));
    }
  });

  test('no screen stalls: playback advances during the window', async () => {
    for (const s of [master, ...slaves]) {
      const slots = new Set(cluster.live.eventsFor(s.id, 'PLAYING').map((e) => `${e.lp}:${e.fp}`));
      expect(
        slots.size,
        `"${s.name}" never advanced past one item in ${WINDOW_MS / 1000}s — playback is stalled`,
      ).toBeGreaterThan(1);
    }
  });
});
