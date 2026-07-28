/**
 * Centralised, typed environment configuration.
 *
 * All environment access in the framework goes through this module so that:
 *  - `.env` is loaded exactly once,
 *  - every value is validated/typed in one place,
 *  - tests never read `process.env` directly (cleaner, mockable, type-safe).
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load `.env` from the framework root regardless of cwd.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/** Read a required string env var or throw a descriptive error. */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Copy .env.example to .env and provide a value.`,
    );
  }
  return value;
}

/** Read an optional string env var with a fallback default. */
function optional(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value;
}

/** Read a numeric env var with a fallback default. */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Read a boolean env var ("true"/"1"/"yes" => true). */
function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export interface UserCredentials {
  email: string;
  password: string;
  name: string;
}

export const env = {
  app: {
    baseURL: optional('BASE_URL', 'https://cms.pocsample.in'),
    apiBaseURL: optional('API_BASE_URL', 'https://cms.pocsample.in/api'),
  },

  users: {
    maker: {
      email: required('MAKER_EMAIL'),
      password: required('MAKER_PASSWORD'),
      name: optional('MAKER_NAME', 'Maker'),
    } satisfies UserCredentials,
    checker: {
      email: required('CHECKER_EMAIL'),
      password: required('CHECKER_PASSWORD'),
      name: optional('CHECKER_NAME', 'Checker'),
    } satisfies UserCredentials,
    /** Optional restricted user — may be empty if not configured. */
    restricted: {
      email: optional('RESTRICTED_EMAIL'),
      password: optional('RESTRICTED_PASSWORD'),
      name: optional('RESTRICTED_NAME', 'Restricted'),
    } satisfies UserCredentials,
  },

  email: {
    host: optional('IMAP_HOST', 'imap.gmail.com'),
    port: num('IMAP_PORT', 993),
    secure: bool('IMAP_SECURE', true),
    user: optional('IMAP_USER'),
    password: optional('IMAP_PASSWORD'),
    mailbox: optional('IMAP_MAILBOX', 'INBOX'),
    notificationFrom: optional('NOTIFICATION_FROM', 'no-reply@wilyer.com'),
    pollTimeoutMs: num('EMAIL_POLL_TIMEOUT_MS', 60_000),
    pollIntervalMs: num('EMAIL_POLL_INTERVAL_MS', 5_000),
    /** True when IMAP credentials are present (email tests can run). */
    get isConfigured(): boolean {
      return Boolean(this.user && this.password);
    },
  },

  exec: {
    headless: bool('HEADLESS', true),
    workers: num('WORKERS', 2),
    retries: num('RETRIES', 2),
    actionTimeoutMs: num('ACTION_TIMEOUT_MS', 15_000),
    navTimeoutMs: num('NAV_TIMEOUT_MS', 30_000),
    expectTimeoutMs: num('EXPECT_TIMEOUT_MS', 10_000),
    isCI: bool('CI', false),
  },
} as const;

export type Env = typeof env;
