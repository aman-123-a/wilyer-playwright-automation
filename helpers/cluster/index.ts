// =============================================================================
//  Cluster helpers — the live channel tap and the hardware gate.
// =============================================================================

export { ClusterMonitor, attachClusterMonitor } from './clusterMonitor';
export type { ClusterPlaybackEvent, MasterChange, SkewPair, WaitOptions } from './clusterMonitor';

export { requireCluster, requireClusterDrill, canDriveCluster } from './requireCluster';
