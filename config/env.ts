// =============================================================================
//  Centralised, typed environment configuration.
//
//  The active target is chosen by TEST_ENV and resolved from the version-
//  controlled registry in config/environments.ts. Credentials and runtime knobs
//  are layered on top from .env files.
//
//  Import the typed `ENV` object everywhere — never read process.env directly
//  from a test, page object or helper.
//
//  Resolution order (highest priority first):
//    1. process.env                 — CI secrets, inline overrides
//    2. .env.<TEST_ENV>             — per-environment local overrides
//    3. .env                        — shared local credentials
//    4. config/environments.ts      — checked-in URLs and defaults
// =============================================================================

import { config as loadDotenv } from 'dotenv';
import { resolveEnvironment, type EnvironmentConfig, type EnvironmentName } from './environments';

// Which environment are we pointed at? The npm scripts set this; default to the
// first pre-production server so a bare `playwright test` never hits production.
const TEST_ENV = process.env.TEST_ENV ?? 'cms';

// dotenv never overwrites an existing process.env value, so loading the
// environment-specific file first gives it priority over the shared one.
loadDotenv({ path: `.env.${TEST_ENV}` });
loadDotenv({ path: '.env' });

const ENVIRONMENT: EnvironmentConfig = resolveEnvironment(TEST_ENV);

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

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Destructive suites are gated by a flag — but production ignores the flag
 * entirely. A misconfigured CI variable must never be able to delete real
 * customer data, so this is a hard block rather than a default.
 */
const allowDestructive = ENVIRONMENT.isProduction ? false : bool('CMS_ALLOW_DESTRUCTIVE', false);

export const ENV = {
  /** Active environment name, e.g. 'cms2'. */
  NAME: ENVIRONMENT.name as EnvironmentName,

  /** Human label for reports, e.g. 'Pre-Production 2'. */
  LABEL: ENVIRONMENT.label,

  /** Application under test. */
  BASE_URL: pick('CMS_BASE_URL', ENVIRONMENT.baseUrl),

  /** REST API backing the CMS. */
  API_BASE_URL: pick('CMS_API_BASE_URL', ENVIRONMENT.apiBaseUrl),

  /** Whether API_BASE_URL is confirmed against the live server or inferred. */
  API_CONFIDENCE: ENVIRONMENT.apiConfidence,

  /** True for real customer-facing infrastructure. */
  IS_PRODUCTION: ENVIRONMENT.isProduction,

  /** Admin / primary account (full access).
   *  Credentials are NEVER hardcoded — supply them via a local, gitignored
   *  .env file (CMS_ADMIN_EMAIL / CMS_ADMIN_PASSWORD). See .env.example. */
  ADMIN: {
    email: pick('CMS_ADMIN_EMAIL', ''),
    password: pick('CMS_ADMIN_PASSWORD', ''),
  } as Credentials,

  /** Scoped / restricted sub-user account. Supplied via .env (see ADMIN). */
  SUBUSER: {
    email: pick('CMS_SUBUSER_EMAIL', ''),
    password: pick('CMS_SUBUSER_PASSWORD', ''),
  } as Credentials,

  /** Performance budgets (ms). */
  PERF: {
    pageLoadMs: num('CMS_PERF_PAGE_LOAD_MS', 5000),
    listingLoadMs: num('CMS_PERF_LISTING_LOAD_MS', 4000),
    apiSlowMs: num('CMS_API_SLOW_MS', 3000),
  },

  /** Lighthouse minimum category scores (0-100). */
  LIGHTHOUSE: {
    performance: num('CMS_LH_PERFORMANCE', 50),
    accessibility: num('CMS_LH_ACCESSIBILITY', 80),
    'best-practices': num('CMS_LH_BEST_PRACTICES', 80),
    seo: num('CMS_LH_SEO', 80),
  },

  /** Behaviour toggles. */
  ALLOW_DESTRUCTIVE: allowDestructive,
  /** When true, monitors fail the test; when false they only warn. */
  STRICT_MONITORS: bool('CMS_STRICT_MONITORS', false),

  /** True when running under CI. */
  IS_CI: !!process.env.CI,
} as const;

/**
 * Storage-state file holding the cached session, namespaced per environment so
 * switching targets can never reuse another server's cookies.
 */
export const storageStateFor = (role: string): string => `storage/${ENV.NAME}/${role}.json`;

/** Cached admin session written by the `setup` project. */
export const ADMIN_STORAGE_STATE = storageStateFor('admin');

/** True when credentials are present — suites that need a login check this. */
export const hasAdminCredentials = (): boolean =>
  ENV.ADMIN.email.length > 0 && ENV.ADMIN.password.length > 0;

export default ENV;
