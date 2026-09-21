// =============================================================================
//  Clusters — master/slave sync configuration (CMS side).
//
//  What the CMS can prove on its own: the cluster is wired for synchronised
//  playback (sync on, one shared playlist, one elected master, the rest slaves)
//  and the page agrees with both the API and the live channel.
//
//  Playback timing lives in ../perf/cluster-playback-sync.spec.ts; the offline /
//  master failover drill lives in ../resilience/cluster-failover.spec.ts.
//
//  Read-only: nothing here toggles Sync, restarts screens or re-syncs — those
//  reach real hardware.
//
//  Run:  CLUSTER_ID=<id> npm run cms2 -- tests/_core/clusters
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { requireCluster } from '../../../../helpers/cluster/requireCluster';
import { CLUSTER } from '../../../../config/cluster';

test.describe.configure({ mode: 'serial' });

test.describe('Cluster · master/slave sync configuration', () => {
  requireCluster();

  // Login plus first paint on this app routinely costs 40s+; the default budget
  // leaves no room for the live channel to publish an election.
  test.setTimeout(180_000);

  test.beforeEach(async ({ clusterSettings }) => {
    await clusterSettings.open();
  });

  test('cluster is configured for synchronised playback @smoke', async ({ clusterSettings }) => {
    const doc = await clusterSettings.fetchCluster();

    expect(doc.id, 'cluster/read returned a different cluster').toBe(CLUSTER.ID);
    expect(doc.isScreenSync, 'Sync is Off — screens will not play in step').toBe(true);
    expect(doc.batches.length, 'cluster has no batches').toBeGreaterThan(0);

    // The header toggle must agree with the persisted flag.
    expect((await clusterSettings.toggleLabels()).sync).toMatch(/sync on/i);
  });

  test('the batch holds ≥2 screens and one shared playlist @smoke', async ({ clusterSettings }) => {
    const [batch] = (await clusterSettings.fetchCluster()).batches;

    expect(
      batch.screens.length,
      'a cluster needs at least a master and a slave',
    ).toBeGreaterThanOrEqual(2);
    expect(batch.playlist, 'batch has no playlist — nothing to synchronise').toBeTruthy();
    expect(batch.width).toBeGreaterThan(0);
    expect(batch.height).toBeGreaterThan(0);

    // Same media on every screen is the precondition for frame-level sync.
    const firstFrames = batch.screens.map((s) => s.playlist?.[0]?.zones?.[0]?.img);
    expect(new Set(firstFrames).size, 'screens are previewing different media').toBe(1);
  });

  test('the live channel elects exactly one master @smoke', async ({ clusterSettings }) => {
    const elapsed = await clusterSettings.live.waitForMaster({
      timeoutMs: CLUSTER.ELECTION_TIMEOUT_MS,
    });
    const master = await clusterSettings.screenNameById(clusterSettings.live.masterScreenId);
    const ids = (await clusterSettings.screens()).map((s) => s.id);

    expect(ids, 'the elected master is not a screen in this cluster').toContain(
      clusterSettings.live.masterScreenId,
    );
    expect(
      clusterSettings.live.masterHistory,
      'the cluster re-elected while simply idling',
    ).toHaveLength(1);

    const slaves = await clusterSettings.slaveNames();
    // eslint-disable-next-line no-console -- who was elected, and how long it took, is the finding
    console.log(
      `👑 ${master} elected after ${(elapsed / 1000).toFixed(1)}s · slaves: ${slaves.join(', ')}`,
    );
  });

  test('the crown in the UI matches the elected master', async ({ clusterSettings }) => {
    const master = await clusterSettings.masterName();

    // The crown paints from the same socket message, a beat after first render.
    const { states } = await clusterSettings.waitForScreenState((s) => s.some((x) => x.isMaster), {
      timeoutMs: 30_000,
      pollMs: 1_000,
    });

    const crowned = states.filter((s) => s.isMaster);
    expect(crowned, `expected one crown, got ${JSON.stringify(states)}`).toHaveLength(1);
    expect(crowned[0].name, 'the crown is on a different screen than the elected master').toBe(
      master,
    );
  });

  test('every screen card matches its API status', async ({ clusterSettings }) => {
    const apiStatus = new Map((await clusterSettings.screens()).map((s) => [s.name, s.status]));

    for (const s of await clusterSettings.screenStates()) {
      expect(apiStatus.has(s.name), `card "${s.name}" is not in cluster/read`).toBe(true);
      expect(
        s.online,
        `"${s.name}" dot says ${s.online ? 'online' : 'offline'}, API says the opposite`,
      ).toBe(apiStatus.get(s.name));
    }
  });

  test('all cluster screens are online before a sync drill @smoke', async ({ clusterSettings }) => {
    const offline = (await clusterSettings.screenStates()).filter((s) => !s.online);
    expect(
      offline.map((s) => s.name),
      'these screens are offline — reconnect them before testing sync',
    ).toEqual([]);
  });

  test('the master does not churn while the cluster is idle', async ({ clusterSettings }) => {
    const first = await clusterSettings.masterName();

    // Nothing changes on the network, so no re-election message may arrive.
    // eslint-disable-next-line playwright/no-wait-for-timeout -- observing that NOTHING happens for 30s IS the assertion; there is no state to wait on
    await clusterSettings.page.waitForTimeout(30_000);

    expect(
      clusterSettings.live.masterHistory.map((h) => h.screenId),
      'master changed with no network event',
    ).toEqual([clusterSettings.live.masterHistory[0].screenId]);
    expect(await clusterSettings.screenNameById(clusterSettings.live.masterScreenId)).toBe(first);
  });

  test('Manage Playlist and Manage Screens are reachable from the batch', async ({
    clusterSettings,
  }) => {
    await expect(clusterSettings.managePlaylistLink.first()).toBeVisible();
    await expect(clusterSettings.manageScreensBtn.first()).toBeVisible();
    await expect(clusterSettings.managePlaylistLink.first()).toHaveAttribute(
      'href',
      /\/batch-settings\/[a-f0-9]{24}/,
    );
  });
});
