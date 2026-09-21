// =============================================================================
//  Cluster gating — declare that a suite needs a real, configured cluster.
//
//  Same contract as requireFeature (helpers/features.ts) and requireDevice
//  (helpers/android/device.ts): a suite that cannot run must SKIP with a reason,
//  never fail. A cluster needs two or more physical screens online and playing;
//  nobody has that attached while writing CMS tests, and a red suite that only
//  means "no hardware here" is how people stop reading the report.
//
//      test.describe('Cluster', () => {
//        requireCluster();
//        ...
//      });
// =============================================================================

import { test } from '@playwright/test';
import { CLUSTER, hasClusterConfig } from '../../config/cluster';

/**
 * Skip the enclosing describe unless a cluster id is configured.
 *
 * The check is free and runs at collection, so a normal CMS run never pays for
 * a cluster suite it cannot execute.
 */
export function requireCluster(): void {
  test.skip(
    !hasClusterConfig(),
    'No cluster configured. Set CLUSTER_ID to the id in /cluster-settings/<id> ' +
      '(see .env.example) to run the cluster suites.',
  );
}

/**
 * Additionally require permission to run an operator drill — these block on a
 * human pulling the network on a real screen. Fine on a lab cluster, not fine on
 * a panel showing live content, so it never happens by default and never on
 * production.
 */
export function requireClusterDrill(): void {
  test.skip(
    !CLUSTER.ALLOW_DRILL,
    'Cluster failover drills are off. Set CLUSTER_DRILL=true on a lab cluster to ' +
      'run them (ignored on the production environment).',
  );
}

/** Non-throwing query, for conditional logic inside a test. */
export const canDriveCluster = (): boolean => hasClusterConfig();
