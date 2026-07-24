// =============================================================================
//  Centralised, override-friendly configuration for the Search test-suite.
//  Precedence: process.env  >  built-in defaults.  No external deps (no dotenv).
// =============================================================================

const num = (v: string | undefined, d: number) => (v == null ? d : Number(v));
const bool = (v: string | undefined, d: boolean) => (v == null ? d : v === 'true');

export const ENV = {
  /** Target application under test. */
  BASE_URL: process.env.CMS_BASE_URL ?? 'https://cms.pocsample.in',

  /** Admin account (full access) — used by global-setup to cache a session. */
  ADMIN_EMAIL: process.env.CMS_ADMIN_EMAIL ?? 'dev@wilyer.com',
  ADMIN_PASSWORD: process.env.CMS_ADMIN_PASSWORD ?? 'testdev',

  /** Where the cached admin storageState is written (relative to suite root). */
  AUTH_FILE: process.env.SEARCH_AUTH_FILE ?? '.auth/search-admin.json',

  // ── Thresholds (all configurable per environment / CI hardware) ────────────
  /** A single successful search API call should respond under this (ms). */
  API_MAX_MS: num(process.env.SEARCH_API_MAX_MS, 700),
  /** Average API response ceiling for the performance test (ms). */
  PERF_AVG_MAX_MS: num(process.env.SEARCH_PERF_AVG_MAX_MS, 700),
  /** Consecutive searches executed by the performance test. */
  PERF_ITERATIONS: num(process.env.SEARCH_PERF_ITERATIONS, 50),
  /** Max API requests we tolerate for one logical search (debounce check). */
  DEBOUNCE_MAX_CALLS: num(process.env.SEARCH_DEBOUNCE_MAX_CALLS, 1),

  // ── Behaviour toggles ──────────────────────────────────────────────────────
  /** Fail tests on unexpected console errors / 5xx (off → warn only). */
  STRICT_CONSOLE: bool(process.env.SEARCH_STRICT_CONSOLE, true),
  /** Run the expensive @perf bucket (50× / large-dataset). Off by default. */
  RUN_PERF: bool(process.env.SEARCH_RUN_PERF, false),
};

export default ENV;
