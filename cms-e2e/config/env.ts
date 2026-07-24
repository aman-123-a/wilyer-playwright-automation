// =============================================================================
//  Centralised, typed environment configuration.
//  Loads an optional `.env` file (via dotenv) then layers process.env on top of
//  sane defaults. Import the typed `ENV` object everywhere — never read
//  process.env directly from tests/pages.
//
//  Precedence (highest first):  process.env  >  .env file  >  built-in defaults
// =============================================================================

import 'dotenv/config';

const pick = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;

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

export const ENV = {
  /** Application under test. — TARGET ENV: cms3 (test server). */
  BASE_URL: pick('CMS_BASE_URL', 'https://cms3.pocsample.in'),

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
  ALLOW_DESTRUCTIVE: bool('CMS_ALLOW_DESTRUCTIVE', false),
  /** When true, monitors fail the test; when false they only warn. */
  STRICT_MONITORS: bool('CMS_STRICT_MONITORS', false),

  /** True when running under CI. */
  IS_CI: !!process.env.CI,
} as const;

/** Storage-state file holding the cached admin session (written by global-setup). */
export const ADMIN_STORAGE_STATE = '.auth/admin.json';

export default ENV;
