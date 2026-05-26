// Centralised environment configuration for the CMS regression suite.
// No external dependency (dotenv is not installed) — we parse an optional
// `.env.cms` file ourselves and layer process.env on top of sane defaults.
//
// Precedence (highest first):  process.env  >  .env.cms file  >  built-in defaults
//
// Usage:  import { ENV } from '../../utils/cms/env.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

/** Minimal .env parser — supports KEY=VALUE, # comments, and quoted values. */
function loadDotEnv(file) {
  const out = {};
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

const fileEnv = loadDotEnv(path.join(repoRoot, '.env.cms'));

/** Resolve a single key with the documented precedence. */
const pick = (key, fallback) =>
  process.env[key] ?? fileEnv[key] ?? fallback;

export const ENV = {
  // Target application (merged / staging build under test)
  BASE_URL: pick('CMS_BASE_URL', 'https://cms.pocsample.in'),

  // Production reference build — used by comparison.spec.js to diff the merged
  // staging build against known-good prod behaviour (UI, features, console, perf).
  PROD_URL: pick('CMS_PROD_URL', 'https://cms.wilyersignage.com'),

  // Admin / primary account (full access)
  ADMIN_EMAIL: pick('CMS_ADMIN_EMAIL', 'dev@wilyer.com'),
  ADMIN_PASSWORD: pick('CMS_ADMIN_PASSWORD', 'testdev'),

  // Sub-user account (scoped / restricted access) — used by folder-scoping tests
  SUBUSER_EMAIL: pick('CMS_SUBUSER_EMAIL', 'subuser@wilyer.com'),
  SUBUSER_PASSWORD: pick('CMS_SUBUSER_PASSWORD', '12345'),

  // Thresholds (ms) — overridable per environment / CI hardware
  PERF_PAGE_LOAD_MS: Number(pick('CMS_PERF_PAGE_LOAD_MS', 5000)),
  PERF_RELAXED_LOAD_MS: Number(pick('CMS_PERF_RELAXED_LOAD_MS', 10000)),
  API_SLOW_MS: Number(pick('CMS_API_SLOW_MS', 3000)),

  // Behaviour toggles
  // When true, suites that mutate live data (create/delete) are allowed to run.
  ALLOW_DESTRUCTIVE: pick('CMS_ALLOW_DESTRUCTIVE', 'true') === 'true',
  // When true, console-error and API-500 monitors FAIL the test on violation.
  // When false they only warn (useful for first runs against a noisy app).
  STRICT_MONITORS: pick('CMS_STRICT_MONITORS', 'false') === 'true',
};

export default ENV;
