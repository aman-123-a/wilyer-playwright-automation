// =============================================================================
//  Media Sets test data. Every set a spec creates carries MEDIASET_PREFIX, so a
//  teardown sweep can remove exactly this suite's data and never a colleague's
//  sets on the shared cms2 server.
// =============================================================================

export const MEDIASET_PREFIX = 'ZZ_QA_MS_';

/** A collision-free name: prefix + label + worker + random suffix. */
export function mediaSetName(label: string, workerIndex: number | string = 0): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${MEDIASET_PREFIX}${label}_w${workerIndex}_${rand}`;
}
