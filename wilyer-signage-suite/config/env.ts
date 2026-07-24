// =============================================================================
//  Centralised environment configuration for the Wilyer Signage CMS suite.
// =============================================================================
//  No external dotenv dependency — we parse an optional `.env` file ourselves
//  and layer process.env on top of sane defaults.
//
//  Precedence (highest first):  process.env  >  .env file  >  built-in defaults
// =============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const suiteRoot = path.resolve(__dirname, '..');

/** Minimal .env parser — supports KEY=VALUE, # comments, and quoted values. */
function loadDotEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = loadDotEnv(path.join(suiteRoot, '.env'));

const pick = (key: string, fallback: string): string =>
  process.env[key] ?? fileEnv[key] ?? fallback;

const bool = (key: string, fallback: boolean): boolean => {
  const v = process.env[key] ?? fileEnv[key];
  return v === undefined ? fallback : v === 'true';
};

const num = (key: string, fallback: number): number =>
  Number(process.env[key] ?? fileEnv[key] ?? fallback);

export const ENV = {
  /** Target application under test. */
  BASE_URL: pick('CMS_BASE_URL', 'https://cms.pocsample.in'),

  /** Admin / primary account (full access). */
  ADMIN_EMAIL: pick('CMS_ADMIN_EMAIL', 'dev@wilyer.com'),
  ADMIN_PASSWORD: pick('CMS_ADMIN_PASSWORD', 'testdev'),

  /** Restricted / scoped account — used by the security/RBAC tests. */
  VIEWER_EMAIL: pick('CMS_VIEWER_EMAIL', 'dev@wilyer.com'),
  VIEWER_PASSWORD: pick('CMS_VIEWER_PASSWORD', 'testdev'),
  EDITOR_EMAIL: pick('CMS_EDITOR_EMAIL', 'dev@wilyer.com'),
  EDITOR_PASSWORD: pick('CMS_EDITOR_PASSWORD', 'testdev'),

  /** Performance thresholds (ms) — overridable per environment / CI hardware. */
  PERF_PAGE_LOAD_MS: num('CMS_PERF_PAGE_LOAD_MS', 6000),
  API_SLOW_MS: num('CMS_API_SLOW_MS', 3000),

  /**
   * When true, suites that mutate live data (create/delete) actually run their
   * mutations. When false, those tests soft-skip so the suite is safe to point
   * at production. Read-only and API-mock tests always run.
   */
  ALLOW_DESTRUCTIVE: bool('CMS_ALLOW_DESTRUCTIVE', false),

  /**
   * When true, the global console-error / API-5xx monitor FAILS a test on
   * violation. When false it only annotates (useful for first runs).
   */
  STRICT_MONITORS: bool('CMS_STRICT_MONITORS', false),

  /** Where a hand-captured (OTP/2FA) storage state lives, if any. */
  MANUAL_AUTH: bool('CMS_MANUAL_AUTH', false),
} as const;

export type Env = typeof ENV;
export default ENV;
