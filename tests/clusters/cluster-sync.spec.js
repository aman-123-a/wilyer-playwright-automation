// =============================================================================
//  Clusters — master/slave sync configuration (CMS side).
//
//  What the CMS can prove on its own: the cluster is wired for synchronised
//  playback (sync on, one shared playlist, one elected master, the rest
//  slaves) and the page agrees with both the API and the live channel.
//
//  Playback timing lives in cluster-playback-sync.spec.js; the offline / master
//  failover drill lives in cluster-failover.spec.js.
//
//  Read-only: nothing here toggles Sync, restarts screens or re-syncs — those
//  reach real hardware.
//
//  Run:  npx playwright test tests/clusters/cluster-sync.spec.js
//        CLUSTER_ID=<id> npx playwright test tests/clusters/cluster-sync.spec.js
// =============================================================================

import { test, expect } from '@playwright/test';
import { login } from '../../helpers/loginHelper.js';
import { ClusterSettingsPage } from '../../pages/cms/ClusterSettingsPage.js';

const CLUSTER_ID = process.env.CLUSTER_ID || '6a979dc496d249abd0118b63'; // "try cluster"

test.describe.configure({ mode: 'serial' });

test.describe('Cluster · master/slave sync configuration', () => {
  // Login plus first paint on this app routinely costs 40s+; the default 60s
  // budget leaves no room for the live channel to publish an election.
  test.setTimeout(180_000);

  /** @type {ClusterSettingsPage} */
  let cluster;

  test.beforeEach(async ({ page }) => {
    await login(page);
    cluster = new ClusterSettingsPage(page, CLUSTER_ID);
    await cluster.open();
  });

  test('cluster is configured for synchronised playback @smoke', async () => {
    const doc = await cluster.fetchCluster();

    expect(doc.id, 'cluster/read returned a different cluster').toBe(CLUSTER_ID);
    expect(doc.isScreenSync, 'Sync is Off — screens will not play in step').toBe(true);
    expect(doc.batches.length, 'cluster has no batches').toBeGreaterThan(0);

    // The header toggle must agree with the persisted flag.
    expect((await cluster.toggleLabels()).sync).toMatch(/sync on/i);
  });

  test('the batch holds ≥2 screens and one shared playlist @smoke', async () => {
    const [batch] = (await cluster.fetchCluster()).batches;

    expect(batch.screens.length, 'a cluster needs at least a master and a slave').toBeGreaterThanOrEqual(2);
    expect(batch.playlist, 'batch has no playlist — nothing to synchronise').toBeTruthy();
    expect(batch.width).toBeGreaterThan(0);
    expect(batch.height).toBeGreaterThan(0);

    // Same media on every screen is the precondition for frame-level sync.
    const firstFrames = batch.screens.map((s) => s.playlist?.[0]?.zones?.[0]?.img);
    expect(new Set(firstFrames).size, 'screens are previewing different media').toBe(1);
  });

  test('the live channel elects exactly one master @smoke', async () => {
    const elapsed = await cluster.live.waitForMaster({ timeoutMs: 60_000 });
    const master = await cluster.screenNameById(cluster.live.masterScreenId);
    const ids = (await cluster.screens()).map((s) => s.id);

    expect(ids, 'the elected master is not a screen in this cluster').toContain(cluster.live.masterScreenId);
    expect(cluster.live.masterHistory, 'the cluster re-elected while simply idling')
      .toHaveLength(1);

    console.log(`👑 ${master} elected after ${(elapsed / 1000).toFixed(1)}s · slaves: ${(await cluster.slaveNames()).join(', ')}`);
  });

  test('the crown in the UI matches the elected master', async () => {
    const master = await cluster.masterName();

    // The crown paints from the same socket message, a beat after first render.
    const { states } = await cluster.waitForScreenState((s) => s.some((x) => x.isMaster), {
      timeoutMs: 30_000,
      pollMs: 1_000,
    });

    const crowned = states.filter((s) => s.isMaster);
    expect(crowned, `expected one crown, got ${JSON.stringify(states)}`).toHaveLength(1);
    expect(crowned[0].name, 'the crown is on a different screen than the elected master').toBe(master);
  });

  test('every screen card matches its API status', async () => {
    const apiStatus = new Map((await cluster.screens()).map((s) => [s.name, s.status]));

    for (const s of await cluster.screenStates()) {
      expect(apiStatus.has(s.name), `card "${s.name}" is not in cluster/read`).toBe(true);
      expect(s.online, `"${s.name}" dot says ${s.online ? 'online' : 'offline'}, API says the opposite`)
        .toBe(apiStatus.get(s.name));
    }
  });

  test('all cluster screens are online before a sync drill @smoke', async () => {
    const offline = (await cluster.screenStates()).filter((s) => !s.online);
    expect(offline.map((s) => s.name), 'these screens are offline — reconnect them before testing sync')
      .toEqual([]);
  });

  test('the master does not churn while the cluster is idle', async () => {
    const first = await cluster.masterName();

    // Nothing changes on the network, so no re-election message may arrive.
    await cluster.page.waitForTimeout(30_000);

    expect(cluster.live.masterHistory.map((h) => h.screenId), 'master changed with no network event')
      .toEqual([cluster.live.masterHistory[0].screenId]);
    expect(await cluster.screenNameById(cluster.live.masterScreenId)).toBe(first);
  });

  test('Manage Playlist and Manage Screens are reachable from the batch', async () => {
    await expect(cluster.managePlaylistLink.first()).toBeVisible();
    await expect(cluster.manageScreensBtn.first()).toBeVisible();
    await expect(cluster.managePlaylistLink.first()).toHaveAttribute('href', /\/batch-settings\/[a-f0-9]{24}/);
  });
});
