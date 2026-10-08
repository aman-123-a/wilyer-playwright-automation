// =============================================================================
//  Clusters — offline behaviour and master failover (operator-driven drill).
//
//  The network is pulled by hand on the real boxes; Playwright watches the CMS
//  and does the timing, so the grace numbers come off a clock instead of a
//  stopwatch. Each test prints what to do, then waits for the cluster to report
//  the expected state and prints how long it took.
//
//  Two signals, two mechanisms — each test uses whichever is authoritative:
//    • master election — the socket `clusterScreens` message. Live, no reload.
//    • online/offline  — the `status` flag rendered on each card, which is server
//      state read at page load, so those waits reload the page. A reload
//      re-handshakes the socket; the master is re-announced on connect.
//
//  Opt-in — these tests block on a human, and they disrupt real screens:
//     CLUSTER_ID=<id> CLUSTER_DRILL=true npm run cms2 -- tests/_core/clusters
//
//  Pick one drill at a time with -g:
//     -g "slave goes offline"          pull the network on a slave only
//     -g "master goes offline"         pull the network on the master only
//     -g "whole cluster goes offline"  pull both at once
//
//  What the CMS cannot see: whether the pixels stayed in step through the
//  outage. Each drill prints the window it measured so the observed playback can
//  be written against the same timeline.
// =============================================================================

/* eslint-disable no-console -- this drill's console output IS its interface: it
   tells the operator which cable to pull and when, and prints the measured
   windows so observed playback can be written against the same timeline. A
   silent drill cannot be run. */

import { test, expect } from '../../../../fixtures/test-fixtures';
import { requireCluster, requireClusterDrill } from '../../../../helpers/cluster/requireCluster';
import { CLUSTER } from '../../../../config/cluster';

const ACT_TIMEOUT = CLUSTER.DRILL_TIMEOUT_MS;

test.describe.configure({ mode: 'serial' });

test.describe('Cluster · offline behaviour and master failover', () => {
  requireCluster();
  requireClusterDrill();

  test.setTimeout(ACT_TIMEOUT * 3);

  test.beforeEach(async ({ clusterSettings }) => {
    test.setTimeout(ACT_TIMEOUT * 3);
    await clusterSettings.open();
    await clusterSettings.live.waitForMaster({ timeoutMs: CLUSTER.ELECTION_TIMEOUT_MS });

    const states = await clusterSettings.screenStates();
    const master = await clusterSettings.masterName();
    console.log(
      `\nBaseline: master ${master} · ` +
        states.map((s) => `${s.name} ${s.online ? 'online' : 'OFFLINE'}`).join(' | '),
    );
    expect(
      states.filter((s) => s.online),
      'start the drill with every screen online',
    ).toHaveLength(states.length);
  });

  test('a slave goes offline — it drops out, the master keeps the crown', async ({
    clusterSettings,
  }) => {
    const master = await clusterSettings.masterName();
    const masterId = clusterSettings.live.masterScreenId;
    const [slave] = await clusterSettings.slaveNames();

    console.log(`\n>> Disconnect the network on SLAVE "${slave}" now. Keep "${master}" connected.`);
    console.log(
      `   On glass: it must keep playing for ${CLUSTER.GRACE_MIN_S}-${CLUSTER.GRACE_MAX_S}s on cached media.`,
    );

    const { states, elapsedMs } = await clusterSettings.waitForScreenState(
      (s) => s.find((x) => x.name === slave)?.online === false,
      { timeoutMs: ACT_TIMEOUT, reload: true },
    );
    console.log(`   "${slave}" reported offline after ${(elapsedMs / 1000).toFixed(1)}s.`);

    // A slave dropping out must not move the crown.
    expect(states.find((s) => s.name === master)?.online, 'the master went offline too').toBe(true);
    expect(
      clusterSettings.live.masterScreenId,
      'the master changed when only a slave dropped',
    ).toBe(masterId);

    console.log(`\n>> Reconnect "${slave}" now — it must rejoin as a slave, not as master.`);
    await clusterSettings.waitForScreenState(
      (s) => s.find((x) => x.name === slave)?.online === true,
      { timeoutMs: ACT_TIMEOUT, reload: true },
    );
    expect(await clusterSettings.masterName(), 'the returning slave stole the crown').toBe(master);
  });

  test('the master goes offline — a slave is promoted to master', async ({ clusterSettings }) => {
    const master = await clusterSettings.masterName();
    const masterId = clusterSettings.live.masterScreenId;
    const slaves = await clusterSettings.slaveNames();

    console.log(
      `\n>> Disconnect the network on MASTER "${master}" now. Leave ${slaves.join(', ')} connected.`,
    );
    console.log(
      `   Expected: "${master}" keeps playing ~${CLUSTER.GRACE_MIN_S}-${CLUSTER.GRACE_MAX_S}s, then a slave takes the crown.`,
    );
    const pulledAt = Date.now();

    // Election is announced on the live channel — watch it without reloading so
    // the socket survives and the promotion timing stays honest.
    const electionMs = await clusterSettings.live.waitForMasterChange(masterId, {
      timeoutMs: ACT_TIMEOUT,
    });
    const newMasterId = clusterSettings.live.masterScreenId;
    const newMaster = await clusterSettings.screenNameById(newMasterId);

    console.log(
      `   "${master}" -> "${newMaster}" ${((Date.now() - pulledAt) / 1000).toFixed(1)}s into the drill ` +
        `(${(electionMs / 1000).toFixed(1)}s of waiting).`,
    );

    expect(slaves, 'the promoted screen was not one of the slaves').toContain(newMaster);
    expect(newMasterId, 'the offline master was re-elected').not.toBe(masterId);

    // And the old master must show as offline once the CMS catches up.
    const { elapsedMs } = await clusterSettings.waitForScreenState(
      (s) => s.find((x) => x.name === master)?.online === false,
      { timeoutMs: ACT_TIMEOUT, reload: true },
    );
    console.log(
      `   "${master}" reported offline after a further ${(elapsedMs / 1000).toFixed(1)}s.`,
    );

    console.log(`\n>> Reconnect "${master}" now.`);
    await clusterSettings.waitForScreenState(
      (s) => s.find((x) => x.name === master)?.online === true,
      { timeoutMs: ACT_TIMEOUT, reload: true },
    );

    // Rejoining must not produce a second crown, whoever ends up wearing it.
    const { states } = await clusterSettings.waitForScreenState((s) => s.some((x) => x.isMaster), {
      timeoutMs: 60_000,
      pollMs: 2_000,
    });
    expect(
      states.filter((s) => s.isMaster),
      'two crowns after the old master rejoined',
    ).toHaveLength(1);
    console.log(`   after recovery the crown is on: ${states.find((s) => s.isMaster)?.name}`);
  });

  test('the whole cluster goes offline — both screens drop, playback is eyes-on', async ({
    clusterSettings,
  }) => {
    const master = await clusterSettings.masterName();

    console.log('\n>> Disconnect the network on BOTH screens at the same time.');
    console.log(
      `   Expected on glass: "${master}" continues with a ${CLUSTER.GRACE_MIN_S}-${CLUSTER.GRACE_MAX_S}s delay, the slave continues uninterrupted.`,
    );
    const pulledAt = Date.now();

    const { states, elapsedMs } = await clusterSettings.waitForScreenState(
      (s) => s.every((x) => !x.online),
      { timeoutMs: ACT_TIMEOUT, reload: true },
    );
    console.log(
      `   Every screen reported offline ${(elapsedMs / 1000).toFixed(1)}s into polling ` +
        `(${((Date.now() - pulledAt) / 1000).toFixed(1)}s since the prompt).`,
    );
    console.log(
      `   Record what you saw against that window — grace target ${CLUSTER.GRACE_MIN_S}-${CLUSTER.GRACE_MAX_S}s.`,
    );

    expect(
      states.every((s) => !s.online),
      'not every screen went offline',
    ).toBe(true);

    console.log('\n>> Reconnect both screens now.');
    await clusterSettings.waitForScreenState((s) => s.every((x) => x.online), {
      timeoutMs: ACT_TIMEOUT,
      reload: true,
    });

    const { states: recovered } = await clusterSettings.waitForScreenState(
      (s) => s.some((x) => x.isMaster),
      { timeoutMs: 60_000, pollMs: 2_000 },
    );
    expect(
      recovered.filter((s) => s.isMaster),
      'cluster came back without exactly one master',
    ).toHaveLength(1);
    console.log(`   after recovery the crown is on: ${recovered.find((s) => s.isMaster)?.name}`);
  });
});
