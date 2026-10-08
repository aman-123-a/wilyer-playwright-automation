// =============================================================================
//  Environment registry — the single source of truth for every target server.
//
//  URLs live here in version control (not in a gitignored .env) so a change of
//  target is reviewable in a diff. Credentials never live here; they come from
//  the local .env / CI secrets. See config/env.ts for the resolution order.
//
//  This is the cms2 branch: it targets cms2 only. Each server has its own
//  branch (cms, cms2, cms3, cms4, live). Run with: npm run cms2
// =============================================================================

/** Every environment the platform can target. */
export const ENVIRONMENT_NAMES = ['cms2'] as const;

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
 * API host evidence: cms2 → v3-5api2.pocsample.in (verified live 2026-07-28,
 * campaigns suite).
 */
export const ENVIRONMENTS: Readonly<Record<EnvironmentName, EnvironmentConfig>> = {
  cms2: {
    name: 'cms2',
    label: 'Pre-Production 2',
    baseUrl: 'https://cms2.pocsample.in',
    apiBaseUrl: 'https://v3-5api2.pocsample.in/v3/cms',
    apiConfidence: 'verified',
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
  const name = (value ?? 'cms2').trim();
  if (!isEnvironmentName(name)) {
    throw new Error(
      `Unknown TEST_ENV "${name}". Expected one of: ${ENVIRONMENT_NAMES.join(', ')}. ` +
        `Use an npm script (npm run cms2) or set TEST_ENV explicitly.`,
    );
  }
  return ENVIRONMENTS[name];
}
