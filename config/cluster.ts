// =============================================================================
//  Cluster configuration — synchronised playback across a set of screens.
//
//  A cluster is real hardware: two or more physical screens, online, playing a
//  shared playlist in step under an elected master. None of that can be faked,
//  so every cluster suite is opt-in and SKIPS with a reason when no cluster is
//  configured — exactly like the Android player suites.
//
//  There is deliberately NO default cluster id. A committed id would point the
//  suite at a cluster that exists on one server and not the others, producing
//  404s that read like defects; and "which cluster did that run measure?" must
//  be answerable from the run's own configuration.
//
//  Import `CLUSTER` — never read process.env directly from a spec or helper.
// =============================================================================

import { ENV } from './env';

// Importing ENV above has already loaded the .env files; these readers only
// need to layer the cluster keys on top.
const pick = (key: string, fallback: string): string => process.env[key] ?? fallback;

const num = (key: string, fallback: number): number => {
  const raw = process.env[key];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  return raw === undefined ? fallback : raw === 'true';
};

export const CLUSTER = {
  /** Cluster id under test (the `/cluster-settings/<id>` segment). Empty = suites skip. */
  ID: pick('CLUSTER_ID', ''),

  /**
   * How long the live channel gets to announce a master. A cluster with screens
   * online and no master inside this window is a defect, not a slow network.
   */
  ELECTION_TIMEOUT_MS: num('CLUSTER_ELECTION_TIMEOUT_MS', 60_000),

  /**
   * Failover drills block on a human pulling a network cable, so they are
   * double-gated: this flag, plus a per-action budget for the operator.
   */
  DRILL: bool('CLUSTER_DRILL', false),
  DRILL_TIMEOUT_MS: num('CLUSTER_DRILL_TIMEOUT_MS', 180_000),

  /**
   * The grace window the player is specified to keep playing through after it
   * loses the network. A product SLA — if a run needs it widened, that is the
   * finding, not the fix.
   */
  GRACE_MIN_S: num('CLUSTER_GRACE_MIN_S', 10),
  GRACE_MAX_S: num('CLUSTER_GRACE_MAX_S', 15),

  /**
   * How long the sync suite listens before judging. Long enough to catch several
   * playlist items; the whole file waits this out, so it is tunable.
   */
  SYNC_WINDOW_MS: num('CLUSTER_SYNC_WINDOW_MS', 120_000),

  /** Largest master-to-slave gap accepted on a shared playback slot. */
  SYNC_TOLERANCE_MS: num('CLUSTER_SYNC_TOLERANCE_MS', 2_000),

  /**
   * Drills disrupt real screens. Harmless in a lab, not harmless on a panel in a
   * lobby — so they are forced off on production regardless of the flag.
   */
  ALLOW_DRILL: bool('CLUSTER_DRILL', false) && !ENV.IS_PRODUCTION,
} as const;

/** True when a cluster id is configured — the minimum to drive a cluster suite. */
export const hasClusterConfig = (): boolean => CLUSTER.ID.length > 0;

export default CLUSTER;
