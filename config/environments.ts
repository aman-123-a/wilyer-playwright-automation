// =============================================================================
//  Environment registry — the single source of truth for every target server.
//
//  URLs live here in version control (not in a gitignored .env) so a change of
//  target is reviewable in a diff. Credentials never live here; they come from
//  the local .env / CI secrets. See config/env.ts for the resolution order.
//
//  Switch environment with TEST_ENV, which the npm scripts set for you:
//    npm run cms | cms2 | cms3 | cms4 | live
// =============================================================================

/** Every environment the platform can target. */
export const ENVIRONMENT_NAMES = ['cms', 'cms2', 'cms3', 'cms4', 'live'] as const;

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
 * API host mapping evidence:
 *   cms  → v3-5api.pocsample.in   (legacy/rbac + adaptive-content templates,
 *                                  and the prayer-schedule API audits)
 *   cms2 → v3-5api2.pocsample.in  (verified live 2026-07-28, campaigns suite)
 *   live → v3-5api.wilyersignage.com (verified live 2026-08-04 by capturing CMS
 *                                  traffic — see the note on the entry below)
 *   cms3, cms4 → follow the cmsN → v3-5apiN convention. Probed 2026-09-16: both
 *   hostnames resolve and are served by the real API application (they answer
 *   POST /v3/cms/auth/login with the app's own JSON errors — Joi validation,
 *   then recaptcha — not the SPA's HTML shell). That is NOT the same as
 *   confirming each hostname reaches its own environment's backend: all of
 *   v3-5api2/3/4 sit on the same Cloudflare IPs, and recaptcha blocks the
 *   login comparison that would tell the origins apart. They stay 'convention'
 *   until someone authenticates against one; override with CMS_API_BASE_URL.
 */
export const ENVIRONMENTS: Readonly<Record<EnvironmentName, EnvironmentConfig>> = {
  cms: {
    name: 'cms',
    label: 'Pre-Production 1',
    baseUrl: 'https://cms.pocsample.in',
    apiBaseUrl: 'https://v3-5api.pocsample.in/v3/cms',
    apiConfidence: 'verified',
    isProduction: false,
  },
  cms2: {
    name: 'cms2',
    label: 'Pre-Production 2',
    baseUrl: 'https://cms2.pocsample.in',
    apiBaseUrl: 'https://v3-5api2.pocsample.in/v3/cms',
    apiConfidence: 'verified',
    isProduction: false,
  },
  cms3: {
    name: 'cms3',
    label: 'Pre-Production 3',
    baseUrl: 'https://cms3.pocsample.in',
    apiBaseUrl: 'https://v3-5api3.pocsample.in/v3/cms',
    apiConfidence: 'convention',
    isProduction: false,
  },
  cms4: {
    name: 'cms4',
    label: 'Pre-Production 4',
    baseUrl: 'https://cms4.pocsample.in',
    apiBaseUrl: 'https://v3-5api4.pocsample.in/v3/cms',
    apiConfidence: 'convention',
    isProduction: false,
  },
  live: {
    name: 'live',
    label: 'Production',
    baseUrl: 'https://cms.wilyersignage.com',
    // Verified live 2026-08-04 by capturing CMS traffic: the production API is
    // v3-5api.wilyersignage.com, not api.wilyersignage.com (which was a guess).
    apiBaseUrl: 'https://v3-5api.wilyersignage.com/v3/cms',
    apiConfidence: 'verified',
    isProduction: true,
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
  const name = (value ?? 'cms').trim();
  if (!isEnvironmentName(name)) {
    throw new Error(
      `Unknown TEST_ENV "${name}". Expected one of: ${ENVIRONMENT_NAMES.join(', ')}. ` +
        `Use an npm script (npm run cms2) or set TEST_ENV explicitly.`,
    );
  }
  return ENVIRONMENTS[name];
}
