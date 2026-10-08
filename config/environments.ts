// =============================================================================
//  Environment registry — the single source of truth for every target server.
//
//  URLs live here in version control (not in a gitignored .env) so a change of
//  target is reviewable in a diff. Credentials never live here; they come from
//  the local .env / CI secrets. See config/env.ts for the resolution order.
//
//  This is the cms4 branch: it targets cms4 only. Each server has its own
//  branch (cms, cms2, cms3, cms4, live). Run with: npm run cms4
// =============================================================================

/** Every environment the platform can target. */
export const ENVIRONMENT_NAMES = ['cms4'] as const;

export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

/**
 * How much we actually know about an environment's API host.
 *
 * `verified`   — observed live against that server, with a dated note below.
 * `convention` — inferred from the naming pattern of the verified hosts and NOT
 *                yet confirmed. API suites warn before running against these so
 *                a wrong host surfaces as a loud warning, never a silent pass.
 */
export type Confidence = 'verified' | 'convention';

export interface EnvironmentConfig {
  /** Short name, matches the npm script and TEST_ENV value. */
  readonly name: EnvironmentName;
  /** Human label used in reports and log lines. */
  readonly label: string;
  /** CMS web application under test. */
  readonly baseUrl: string;
  /** REST API backing that CMS instance. */
  readonly apiBaseUrl: string;
  /** How far to trust `apiBaseUrl`. */
  readonly apiConfidence: Confidence;
  /**
   * True for real customer-facing infrastructure. Production hard-disables
   * destructive suites regardless of the CMS_ALLOW_DESTRUCTIVE flag, and
   * ships no default credentials.
   */
  readonly isProduction: boolean;
}

/**
 * API host evidence: cms4 → v3-5api4.pocsample.in follows the cmsN → v3-5apiN convention.
 * Probed 2026-09-16: the host is served by the real API application, but it is
 * not yet confirmed to reach cms4's own backend. Override with CMS_API_BASE_URL.
 */
export const ENVIRONMENTS: Readonly<Record<EnvironmentName, EnvironmentConfig>> = {
  cms4: {
    name: 'cms4',
    label: 'Pre-Production 4',
    baseUrl: 'https://cms4.pocsample.in',
    apiBaseUrl: 'https://v3-5api4.pocsample.in/v3/cms',
    apiConfidence: 'convention',
    isProduction: false,
  },
} as const;

/** Type guard — is this string one of the known environment names? */
export function isEnvironmentName(value: string): value is EnvironmentName {
  return (ENVIRONMENT_NAMES as readonly string[]).includes(value);
}

/**
 * Resolve an environment by name, failing loudly on a typo. A silent fallback
 * here would point a destructive suite at the wrong server.
 */
export function resolveEnvironment(value: string | undefined): EnvironmentConfig {
  const name = (value ?? 'cms4').trim();
  if (!isEnvironmentName(name)) {
    throw new Error(
      `Unknown TEST_ENV "${name}". Expected one of: ${ENVIRONMENT_NAMES.join(', ')}. ` +
        `Use an npm script (npm run cms4) or set TEST_ENV explicitly.`,
    );
  }
  return ENVIRONMENTS[name];
}
