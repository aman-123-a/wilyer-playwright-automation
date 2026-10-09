// =============================================================================
//  Media Sets test data. Every set a spec creates carries MEDIASET_PREFIX, so a
//  teardown sweep can remove exactly this suite's data and never a colleague's
//  sets on the shared cms2 server.
//
//  The prefix is per WORKER, not per suite. Specs sweep by prefix after every
//  test, and with a shared prefix one worker's teardown deleted the sets another
//  worker was still asserting on — "Total - 0" after a search, a set "lost" on
//  move, leftover counts off in the load specs. TEST_PARALLEL_INDEX is unique
//  among the workers running at any one moment (an index is only reused after
//  its previous owner exits), so each worker now sweeps only its own data.
// =============================================================================

/** Shared by every worker. Use it only for a manual sweep of aborted runs. */
export const MEDIASET_ROOT = 'ZZ_QA_MS_';

/** `w<n>_` for the current worker; `wx_` outside a test worker. */
export const WORKER_TAG = `w${process.env.TEST_PARALLEL_INDEX ?? 'x'}_`;

export const MEDIASET_PREFIX = `${MEDIASET_ROOT}${WORKER_TAG}`;

/** Folder prefix for a spec: its own stem plus this worker's tag. */
export const folderPrefix = (stem: string): string => `${stem}${WORKER_TAG}`;

/** A collision-free name: prefix + label + worker + random suffix. */
export function mediaSetName(label: string, workerIndex: number | string = 0): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${MEDIASET_PREFIX}${label}_w${workerIndex}_${rand}`;
}
