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
//  bound — good enough to catch a screen drifting seconds behind its master,
//  not a frame-accurate NTP measurement.
//
//  Preconditions: both screens online and playing (run cluster-sync.spec.js
//  first — it fails fast if a screen is offline).
//
//  Run:  npx playwright test tests/clusters/cluster-playback-sync.spec.js
//        CLUSTER_SYNC_WINDOW_MS=180000 CLUSTER_SYNC_TOLERANCE_MS=1500 \
//          npx playwright test tests/clusters/cluster-playback-sync.spec.js
// =============================================================================

import { test, expect } from '@playwright/test';
import { login } from '../../helpers/loginHelper.js';
import { ClusterSettingsPage } from '../../pages/cms/ClusterSettingsPage.js';

const CLUSTER_ID = process.env.CLUSTER_ID || '6a979dc496d249abd0118b63'; // "try cluster"

// How long we listen before judging. Long enough to catch several playlist
// items; the whole suite waits this out, so it is deliberately tunable.
const WINDOW_MS = Number(process.env.CLUSTER_SYNC_WINDOW_MS || 120_000);

// Largest master-to-slave gap we accept on a shared item.
const TOLERANCE_MS = Number(process.env.CLUSTER_SYNC_TOLERANCE_MS || 2_000);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

test.describe.configure({ mode: 'serial' });

test.describe('Cluster · playback synchronisation', () => {
  test.setTimeout(WINDOW_MS + 180_000);

  /** @type {ClusterSettingsPage} */
  let cluster;
  let master;      // { id, name }
  let slaves;      // { id, name }[]

  test.beforeAll(async ({ browser }) => {
    // Hooks do not inherit the describe-level budget, and this one sits out the
    // whole measurement window.
    test.setTimeout(WINDOW_MS + 180_000);
    const page = await browser.newPage();
    await login(page);
    cluster = new ClusterSettingsPage(page, CLUSTER_ID);
    await cluster.open();

    await cluster.live.waitForMaster({ timeoutMs: 60_000 });
    const screens = await cluster.screens();
    const masterId = cluster.live.masterScreenId;
    master = screens.find((s) => s.id === masterId);
    slaves = screens.filter((s) => s.id !== masterId);

    expect(master, 'the elected master is not a screen in this cluster').toBeTruthy();
    expect(slaves.length, 'need at least one slave to compare against').toBeGreaterThan(0);
    console.log(`👑 master ${master.name} · slaves ${slaves.map((s) => s.name).join(', ')}`);

    // One measurement window feeds every test in this file.
    cluster.live.reset();
    await page.waitForTimeout(WINDOW_MS);
    console.log(`recorded ${cluster.live.events.length} playback events over ${WINDOW_MS / 1000}s`);
  });

  test('every screen in the cluster is reporting playback @smoke', async () => {
    for (const s of [master, ...slaves]) {
      const playing = cluster.live.eventsFor(s.id, 'PLAYING');
      expect(playing.length, `"${s.name}" reported no PLAYING events — it is not playing`)
        .toBeGreaterThan(0);
      console.log(`${s.name}: ${playing.length} PLAYING events`);
    }
  });

  test('master and slaves are playing the same playlist and the same loop @smoke', async () => {
    const fingerprint = (id) => {
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
        expect([...m.lid], `"${s.name}" is in loop ${lid}, master is not — the screens are out of step`)
          .toContain(lid);
      }
    }
  });

  test('slave playback stays within tolerance of the master @smoke', async () => {
    for (const s of slaves) {
      const pairs = cluster.live.skewBetween(master.id, s.id);

      expect(pairs.length, `no shared playback slots between "${master.name}" and "${s.name}" — they are not playing the same items`)
        .toBeGreaterThan(0);

      const skews = pairs.map((p) => p.skewMs);
      const worst = pairs.reduce((a, b) => (b.skewMs > a.skewMs ? b : a));
      console.log(
        `${master.name} ↔ ${s.name}: ${pairs.length} shared slots · ` +
        `median ${median(skews)}ms · worst ${worst.skewMs}ms on "${worst.fn}"`
      );

      expect(worst.skewMs, `"${s.name}" drifted ${worst.skewMs}ms behind/ahead of "${master.name}" on "${worst.fn}"`)
        .toBeLessThanOrEqual(TOLERANCE_MS);
    }
  });

  test('both screens walk the playlist in the same order', async () => {
    const order = (id) => {
      const seen = [];
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
      expect(theirs.slice(0, overlap), `"${s.name}" played the loop in a different order than "${master.name}"`)
        .toEqual(m.slice(0, overlap));
    }
  });

  test('no screen stalls: playback advances during the window', async () => {
    for (const s of [master, ...slaves]) {
      const slots = new Set(cluster.live.eventsFor(s.id, 'PLAYING').map((e) => `${e.lp}:${e.fp}`));
      expect(slots.size, `"${s.name}" never advanced past one item in ${WINDOW_MS / 1000}s — playback is stalled`)
        .toBeGreaterThan(1);
    }
  });
});
