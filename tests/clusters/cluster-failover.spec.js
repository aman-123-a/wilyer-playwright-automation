// =============================================================================
//  Clusters — offline behaviour and master failover (operator-driven drill).
//
//  The network is pulled by hand on the real boxes; Playwright watches the CMS
//  and does the timing, so the 10-15s grace numbers come off a clock instead of
//  a stopwatch. Each test prints what to do, then waits for the cluster to
//  report the expected state and prints how long it took.
//
//  Two signals, two mechanisms — each test uses whichever is authoritative:
//    • master election — the socket `clusterScreens` message. Live, no reload.
//    • online/offline  — the `status` flag rendered on each card, which is
//      server state read at page load, so those waits reload the page. A reload
//      re-handshakes the socket; the master is re-announced on connect.
//
//  Opt-in — these tests block on a human:
//     CLUSTER_DRILL=1 npx playwright test tests/clusters/cluster-failover.spec.js
//
//  Pick one drill at a time with -g:
//     -g "slave goes offline"          pull the network on a slave only
//     -g "master goes offline"         pull the network on the master only
//     -g "whole cluster goes offline"  pull both at once
//
//  What the CMS cannot see: whether the pixels stayed in step through the
//  outage. Each drill prints the window it measured so the observed playback
//  can be written against the same timeline.
// =============================================================================

import { test, expect } from '@playwright/test';
import { login } from '../../helpers/loginHelper.js';
import { ClusterSettingsPage } from '../../pages/cms/ClusterSettingsPage.js';

const CLUSTER_ID = process.env.CLUSTER_ID || '6a979dc496d249abd0118b63'; // "try cluster"

// How long the tester gets to pull/restore the network before we give up.
const ACT_TIMEOUT = Number(process.env.CLUSTER_DRILL_TIMEOUT || 180_000);

// The grace window the player is specified to keep playing through.
const GRACE_MIN_S = 10;
const GRACE_MAX_S = 15;

test.describe.configure({ mode: 'serial' });

test.describe('Cluster · offline behaviour and master failover', () => {
  test.skip(!process.env.CLUSTER_DRILL, 'operator drill — set CLUSTER_DRILL=1 to run');
  test.setTimeout(ACT_TIMEOUT * 3);

  /** @type {ClusterSettingsPage} */
  let cluster;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(ACT_TIMEOUT * 3);
    await login(page);
    cluster = new ClusterSettingsPage(page, CLUSTER_ID);
    await cluster.open();
    await cluster.live.waitForMaster({ timeoutMs: 60_000 });

    const states = await cluster.screenStates();
    console.log(`\nBaseline: master ${await cluster.masterName()} · ` +
      states.map((s) => `${s.name} ${s.online ? 'online' : 'OFFLINE'}`).join(' | '));
    expect(states.filter((s) => s.online).length, 'start the drill with every screen online')
      .toBe(states.length);
  });

  test('a slave goes offline — it drops out, the master keeps the crown', async () => {
    const master = await cluster.masterName();
    const masterId = cluster.live.masterScreenId;
    const [slave] = await cluster.slaveNames();

    console.log(`\n>> Disconnect the network on SLAVE "${slave}" now. Keep "${master}" connected.`);
    console.log(`   On glass: it must keep playing for ${GRACE_MIN_S}-${GRACE_MAX_S}s on cached media.`);

    const { states, elapsedMs } = await cluster.waitForScreenState(
      (s) => s.find((x) => x.name === slave)?.online === false,
      { timeoutMs: ACT_TIMEOUT, reload: true }
    );
    console.log(`   "${slave}" reported offline after ${(elapsedMs / 1000).toFixed(1)}s.`);

    // A slave dropping out must not move the crown.
    expect(states.find((s) => s.name === master)?.online, 'the master went offline too').toBe(true);
    expect(cluster.live.masterScreenId, 'the master changed when only a slave dropped').toBe(masterId);

    console.log(`\n>> Reconnect "${slave}" now — it must rejoin as a slave, not as master.`);
    await cluster.waitForScreenState(
      (s) => s.find((x) => x.name === slave)?.online === true,
      { timeoutMs: ACT_TIMEOUT, reload: true }
    );
    expect(await cluster.masterName(), 'the returning slave stole the crown').toBe(master);
  });

  test('the master goes offline — a slave is promoted to master', async () => {
    const master = await cluster.masterName();
    const masterId = cluster.live.masterScreenId;
    const slaves = await cluster.slaveNames();

    console.log(`\n>> Disconnect the network on MASTER "${master}" now. Leave ${slaves.join(', ')} connected.`);
    console.log(`   Expected: "${master}" keeps playing ~${GRACE_MIN_S}-${GRACE_MAX_S}s, then a slave takes the crown.`);
    const pulledAt = Date.now();

    // Election is announced on the live channel — watch it without reloading so
    // the socket survives and the promotion timing stays honest.
    const electionMs = await cluster.live.waitForMasterChange(masterId, { timeoutMs: ACT_TIMEOUT });
    const newMasterId = cluster.live.masterScreenId;
    const newMaster = await cluster.screenNameById(newMasterId);

    console.log(`   "${master}" -> "${newMaster}" ${((Date.now() - pulledAt) / 1000).toFixed(1)}s into the drill ` +
      `(${(electionMs / 1000).toFixed(1)}s of waiting).`);

    expect(slaves, 'the promoted screen was not one of the slaves').toContain(newMaster);
    expect(newMasterId, 'the offline master was re-elected').not.toBe(masterId);

    // And the old master must show as offline once the CMS catches up.
    const { elapsedMs } = await cluster.waitForScreenState(
      (s) => s.find((x) => x.name === master)?.online === false,
      { timeoutMs: ACT_TIMEOUT, reload: true }
    );
    console.log(`   "${master}" reported offline after a further ${(elapsedMs / 1000).toFixed(1)}s.`);

    console.log(`\n>> Reconnect "${master}" now.`);
    await cluster.waitForScreenState(
      (s) => s.find((x) => x.name === master)?.online === true,
      { timeoutMs: ACT_TIMEOUT, reload: true }
    );

    // Rejoining must not produce a second crown, whoever ends up wearing it.
    const { states } = await cluster.waitForScreenState((s) => s.some((x) => x.isMaster), {
      timeoutMs: 60_000,
      pollMs: 2_000,
    });
    expect(states.filter((s) => s.isMaster), 'two crowns after the old master rejoined').toHaveLength(1);
    console.log(`   after recovery the crown is on: ${states.find((s) => s.isMaster).name}`);
  });

  test('the whole cluster goes offline — both screens drop, playback is eyes-on', async () => {
    const master = await cluster.masterName();

    console.log('\n>> Disconnect the network on BOTH screens at the same time.');
    console.log(`   Expected on glass: "${master}" continues with a ${GRACE_MIN_S}-${GRACE_MAX_S}s delay, the slave continues uninterrupted.`);
    const pulledAt = Date.now();

    const { states, elapsedMs } = await cluster.waitForScreenState(
      (s) => s.every((x) => !x.online),
      { timeoutMs: ACT_TIMEOUT, reload: true }
    );
    console.log(`   Every screen reported offline ${(elapsedMs / 1000).toFixed(1)}s into polling ` +
      `(${((Date.now() - pulledAt) / 1000).toFixed(1)}s since the prompt).`);
    console.log(`   Record what you saw against that window — grace target ${GRACE_MIN_S}-${GRACE_MAX_S}s.`);

    expect(states.every((s) => !s.online), 'not every screen went offline').toBe(true);

    console.log('\n>> Reconnect both screens now.');
    await cluster.waitForScreenState((s) => s.every((x) => x.online), {
      timeoutMs: ACT_TIMEOUT,
      reload: true,
    });

    const { states: recovered } = await cluster.waitForScreenState((s) => s.some((x) => x.isMaster), {
      timeoutMs: 60_000,
      pollMs: 2_000,
    });
    expect(recovered.filter((s) => s.isMaster), 'cluster came back without exactly one master').toHaveLength(1);
    console.log(`   after recovery the crown is on: ${recovered.find((s) => s.isMaster).name}`);
  });
});
