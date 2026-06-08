// =============================================================================
//  Centralised, typed environment configuration.
//  Loads an optional `.env` file (via dotenv) then layers process.env on top of
//  sane defaults. Import the typed `ENV` object everywhere — never read
//  process.env directly from tests/pages.
//
//  Precedence (highest first):  process.env  >  .env file  >  built-in defaults
// =============================================================================

import 'dotenv/config';

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

export const ENV = {
  /** Application under test. */
  BASE_URL: pick('CMS_BASE_URL', 'https://cms.pocsample.in'),

  /** Admin / primary account (full access). */
  ADMIN: {
    email: pick('CMS_ADMIN_EMAIL', 'dev@wilyer.com'),
    password: pick('CMS_ADMIN_PASSWORD', 'testdev'),
  } as Credentials,

  /** Performance budgets (ms). */
  PERF: {
    pageLoadMs: num('CMS_PERF_PAGE_LOAD_MS', 5000),
    apiSlowMs: num('CMS_API_SLOW_MS', 3000),
  },

  /** Behaviour toggles. */
  // When true, suites that mutate live data (delete/update) are allowed to run.
  ALLOW_DESTRUCTIVE: bool('CMS_ALLOW_DESTRUCTIVE', false),
  // When true, console-error + failed-API monitors FAIL the test on violation.
  // When false they only warn (useful against a noisy live build).
  STRICT_MONITORS: bool('CMS_STRICT_MONITORS', false),
  // 5xx responses and uncaught page exceptions ALWAYS fail a test regardless of
  // STRICT_MONITORS — these are the non-negotiable smoke-exit signals.
  FAIL_ON_SERVER_ERROR: bool('CMS_FAIL_ON_SERVER_ERROR', true),

  /** True when running under CI. */
  IS_CI: !!process.env.CI,
} as const;

/** Storage-state file holding the cached admin session (written by auth setup). */
export const ADMIN_STORAGE_STATE = '.auth/admin.json';

export default ENV;
