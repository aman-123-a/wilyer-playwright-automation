// =============================================================================
//  Campaign test data.
//
//  Naming: every artefact this suite creates starts with CAMPAIGN_PREFIX so the
//  teardown sweep can find and remove it, and so a human looking at cms2 can
//  tell test data from a colleague's work at a glance. cms2 is a shared server —
//  other people's campaigns are never touched.
// =============================================================================

/** Every campaign this suite creates carries this prefix. Teardown keys off it. */
export const CAMPAIGN_PREFIX = 'QA_CRUD_';

/**
 * Collision-proof name. Parallel workers run concurrently against one shared
 * account and campaign names are unique per account (BR-11), so the worker
 * index and a random suffix are both required.
 */
export function uniqueName(label: string, workerIndex: number | string = 0): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${CAMPAIGN_PREFIX}${label}_w${workerIndex}_${rand}`;
}

/** Default duration the create form ships with. */
export const DEFAULT_DURATION = 10;

/** Boundary values for the per-item and default duration fields (BR-13). */
export const DURATIONS = {
  valid: 10,
  minimum: 1,
  zero: 0,
  negative: -5,
  fractional: 2.5,
  huge: 999_999,
} as const;

/** Name boundaries. The API caps nothing today — see BUG-CMP-08. */
export const NAMES = {
  blank: '',
  /**
   * All-whitespace names of different lengths are DIFFERENT strings, so earlier
   * sessions left `'   '` and `'      '` behind on cms2 and a re-run collides
   * with them — the server then answers "already exists", which reads as a
   * correct rejection and hides the actual defect. 11 is chosen to be unlikely
   * to collide with anything a human or an earlier run produced.
   */
  whitespace: ' '.repeat(11),
  single: 'A',
  atCap: 'C'.repeat(255),
  overCap: 'C'.repeat(1000),
  xss: '<script>alert(1)</script>',
  sqlish: "'; DROP TABLE campaign;--",
  template: '{{7*7}}',
  traversal: '../../etc/passwd',
  unicode: 'अभियान_परीक्षण 广告活动 كامبين 🎉',
} as const;

/**
 * Search queries that prove the `search` parameter is a live regex rather than a
 * literal. `.*` matching the whole collection is the headline (BUG-CMP-02).
 */
export const SEARCH_METACHARACTERS = ['.*', '^QA', 'Q{2,}', '(QA|zzzz)'] as const;
