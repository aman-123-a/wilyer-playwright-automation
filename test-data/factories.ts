// =============================================================================
//  Test-data factories.
//
//  Every fixture this suite creates is named through a factory so that:
//   • names are unique per run — parallel workers never collide;
//   • names are recognisable — a leaked record says which suite made it;
//   • teardown can sweep by prefix without touching real customer data.
//
//  Uniqueness combines a timestamp, the worker index and a counter. Timestamp
//  alone is not enough: workers start in the same millisecond, and a fast loop
//  creates several records inside one millisecond.
// =============================================================================

/** Prefix every artefact this framework creates. Teardown sweeps on it. */
export const TEST_PREFIX = 'QA';

let counter = 0;

/** Monotonic per-process discriminator. */
const nextSeq = (): number => (counter += 1);

/** Playwright sets this per worker; falls back to 0 outside a test run. */
const workerId = (): string => process.env.TEST_WORKER_INDEX ?? '0';

/**
 * A unique, sweepable name.
 * Shape: QA-<label>-<base36 time>-w<worker>-<seq>
 */
export function uniqueName(label: string): string {
  return `${TEST_PREFIX}-${label}-${Date.now().toString(36)}-w${workerId()}-${nextSeq()}`;
}

/** True when a name was created by this framework — the teardown predicate. */
export function isTestArtefact(name: string): boolean {
  return name.startsWith(`${TEST_PREFIX}-`);
}

// ── String generators for boundary and negative suites ──────────────────────

/** A string of exactly `length` characters. */
export const stringOfLength = (length: number, char = 'a'): string => char.repeat(length);

/** Unicode, emoji, RTL and combining marks — names that break naive encoders. */
export const UNICODE_SAMPLES = [
  'Ünïcødé-Nämé',
  '日本語のキャンペーン',
  'emoji-🚀-campaign',
  'عربى-حملة',
  'combining-á́́',
] as const;

/** Whitespace shapes that expose missing trim logic. */
export const WHITESPACE_SAMPLES = [
  '  leading',
  'trailing  ',
  '  both  ',
  'inner\tTab',
  'new\nline',
] as const;

/**
 * Payloads for the security suites.
 *
 * These assert INPUT HANDLING: the product must store or reject them safely and
 * never execute them. They are not exploits against a third party — they run
 * only against the team's own pre-production CMS.
 */
export const INJECTION_PAYLOADS = {
  xss: [
    '<script>window.__xss=1</script>',
    '"><img src=x onerror="window.__xss=1">',
    "javascript:window.__xss=1",
  ],
  sql: ["' OR '1'='1", "'; DROP TABLE campaigns; --", "1' UNION SELECT null--"],
  /** The CMS search parameter is an unescaped regex — see BUG-CMP-02. */
  regex: ['.*', '(((((', '[a-', '^$.*+?()[]{}|\\'],
  html: ['<b>bold</b>', '<iframe src="about:blank"></iframe>'],
  pathTraversal: ['../../etc/passwd', '..\\..\\windows\\system32\\config\\sam'],
} as const;

// ── Entity factories ────────────────────────────────────────────────────────

export interface UserFactoryOptions {
  role?: string;
  domain?: string;
}

export interface GeneratedUser {
  name: string;
  email: string;
  password: string;
  role: string;
}

/**
 * A random user record for form-level tests.
 *
 * The password is generated per call and is NOT a credential for any real
 * account — never substitute a working login here.
 */
export function makeUser(opts: UserFactoryOptions = {}): GeneratedUser {
  const seq = nextSeq();
  const stamp = Date.now().toString(36);
  const local = `${TEST_PREFIX.toLowerCase()}-user-${stamp}-w${workerId()}-${seq}`;
  return {
    name: `${TEST_PREFIX} User ${stamp}-${seq}`,
    email: `${local}@${opts.domain ?? 'example.invalid'}`,
    // Long, random, and unique per call — satisfies complexity rules without
    // being a value anyone could mistake for a real password.
    password: `Qa!${stamp}${seq}${Math.random().toString(36).slice(2, 10)}A1`,
    role: opts.role ?? 'viewer',
  };
}

export interface CampaignSeed {
  name: string;
  defaultDuration: number;
  itemCount: number;
}

export function makeCampaign(overrides: Partial<CampaignSeed> = {}): CampaignSeed {
  return {
    name: uniqueName('campaign'),
    defaultDuration: 10,
    itemCount: 1,
    ...overrides,
  };
}

export interface PlaylistSeed {
  name: string;
  slideDurationSeconds: number;
}

export function makePlaylist(overrides: Partial<PlaylistSeed> = {}): PlaylistSeed {
  return {
    name: uniqueName('playlist'),
    // The stepper floor is 1s; typing bypasses it, which the boundary suite
    // exercises deliberately.
    slideDurationSeconds: 10,
    ...overrides,
  };
}

export interface FolderSeed {
  name: string;
  parent?: string;
}

export function makeFolder(overrides: Partial<FolderSeed> = {}): FolderSeed {
  return { name: uniqueName('folder'), ...overrides };
}

export interface ScreenSeed {
  name: string;
  city: string;
  locality: string;
}

export function makeScreen(overrides: Partial<ScreenSeed> = {}): ScreenSeed {
  return {
    name: uniqueName('screen'),
    city: 'Noida',
    locality: 'Sector 62',
    ...overrides,
  };
}

export interface MediaSetSeed {
  name: string;
  aspectRatio: string;
}

export function makeMediaSet(overrides: Partial<MediaSetSeed> = {}): MediaSetSeed {
  return { name: uniqueName('mediaset'), aspectRatio: '16:9', ...overrides };
}

/** Pick a deterministic element — index-based, so runs stay reproducible. */
export function pick<T>(items: readonly T[], index: number): T {
  if (items.length === 0) throw new Error('pick() called with an empty list');
  return items[index % items.length] as T;
}
