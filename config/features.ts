// =============================================================================
//  Feature registry — which product feature exists on which server.
//
//  Every environment runs the SAME application code; what differs is which
//  features have been built there yet. A feature is developed on one server,
//  proven, and then released to production, at which point it also becomes
//  available everywhere it has been rolled out to.
//
//  Without this registry, running the full suite against a server that does not
//  yet have a feature produces red failures that mean nothing — the feature is
//  not broken, it is not there. That noise is what makes people stop trusting
//  a suite. With it, such specs SKIP with a readable reason and the run stays
//  meaningful on every target.
//
//  This file is the single source of truth for feature-to-server mapping and
//  lives in version control, so a rollout is a reviewable diff. When a feature
//  ships to another server, add that server to `availableOn` in the same PR.
//
//  Usage from a spec (see helpers/features.ts):
//
//      import { requireFeature } from '../../../helpers';
//      test.describe('Prayer Schedule', () => {
//        requireFeature('prayer-schedule');
//        ...
//      });
// =============================================================================

import { ENVIRONMENT_NAMES, type EnvironmentName } from './environments';

/** Every feature the suite knows how to test. */
export const FEATURE_NAMES = [
  // Core — present on every build since before this registry existed.
  'auth',
  'dashboard',
  'library',
  'playlists',
  'screens',
  'groups',
  'reports',
  'billing',
  'team',
  'rbac',
  // Feature-flagged / in-flight work, one per development server.
  'prayer-schedule',
  'campaigns',
  'autologin',
  'media-sets',
  'file-conversion',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

/**
 * Where a feature stands in its journey from a development server to live.
 *
 *  `core`        — shipped long ago, present on every build. No rollout to track.
 *  `development` — actively being built on its owner server. Expect churn, and
 *                  expect it to be absent everywhere else.
 *  `released`    — has reached production. Still listed so a regression on live
 *                  is attributable to a specific rollout.
 */
export type FeatureStatus = 'core' | 'development' | 'released';

export interface FeatureConfig {
  /** Registry key, matches the directory under tests/ where practical. */
  readonly name: FeatureName;
  /** Human label for skip messages and reports. */
  readonly label: string;
  /** Lifecycle stage — see FeatureStatus. */
  readonly status: FeatureStatus;
  /**
   * Server the feature is being developed on. `null` for core modules, which
   * predate the one-feature-per-server way of working.
   */
  readonly owner: EnvironmentName | null;
  /** Every server the feature currently exists on. */
  readonly availableOn: readonly EnvironmentName[];
  /** Why the mapping is what it is — evidence, or what is still unconfirmed. */
  readonly note?: string;
}

/** Shorthand for the core modules: present on every environment. */
const EVERYWHERE = ENVIRONMENT_NAMES;

const core = (name: FeatureName, label: string): FeatureConfig => ({
  name,
  label,
  status: 'core',
  owner: null,
  availableOn: EVERYWHERE,
});

/**
 * Development-server ownership, as confirmed by the team on 2026-07-28:
 *
 *   cms   → Prayer Schedule   (built here, since released to live)
 *   cms2  → Campaigns, Auto-login
 *   cms3  → Media Sets
 *   cms4  → File conversion
 *   live  → whatever has been released
 */
export const FEATURES: Readonly<Record<FeatureName, FeatureConfig>> = {
  auth: core('auth', 'Authentication'),
  dashboard: core('dashboard', 'Dashboard'),
  library: core('library', 'Library'),
  playlists: core('playlists', 'Playlists'),
  screens: core('screens', 'Screens'),
  groups: core('groups', 'Groups'),
  reports: core('reports', 'Reports'),
  billing: core('billing', 'Billing'),
  team: core('team', 'Team'),
  rbac: core('rbac', 'Roles and permissions'),

  'prayer-schedule': {
    name: 'prayer-schedule',
    label: 'Prayer Schedule',
    status: 'released',
    owner: 'cms',
    availableOn: ['cms', 'live'],
    note: 'Built on cms and released to production. Not rolled out to cms2/cms3/cms4.',
  },

  campaigns: {
    name: 'campaigns',
    label: 'Campaigns',
    status: 'development',
    owner: 'cms2',
    availableOn: ['cms2'],
    note: 'Campaigns V1 under active test on cms2 — see docs/qa-reports/campaigns-v1-rbac/.',
  },

  autologin: {
    name: 'autologin',
    label: 'Auto-login',
    status: 'development',
    owner: 'cms2',
    availableOn: ['cms2'],
    note: 'In development on cms2. No automated suite authored yet.',
  },

  'media-sets': {
    name: 'media-sets',
    label: 'Media Sets',
    status: 'development',
    owner: 'cms3',
    availableOn: ['cms2', 'cms3'],
    note:
      'Owned by cms3. Also listed for cms2, where the existing specs were authored against a ' +
      'live build (see tests/media-sets/). MediaSetsPage.isAvailable() probes the running build ' +
      'and remains the final word — this entry only prevents a pointless run on cms/cms4/live.',
  },

  'file-conversion': {
    name: 'file-conversion',
    label: 'File conversion',
    status: 'development',
    owner: 'cms4',
    availableOn: ['cms4'],
    note: 'In development on cms4. No automated suite authored yet.',
  },
} as const;

/** Type guard — is this string a known feature? */
export function isFeatureName(value: string): value is FeatureName {
  return (FEATURE_NAMES as readonly string[]).includes(value);
}

/**
 * Resolve a feature, failing loudly on a typo. A silent fallback here would
 * skip a whole suite on every server and nobody would notice it stopped running.
 */
export function resolveFeature(name: string): FeatureConfig {
  if (!isFeatureName(name)) {
    throw new Error(
      `Unknown feature "${name}". Expected one of: ${FEATURE_NAMES.join(', ')}. ` +
        `Add it to config/features.ts if it is genuinely new.`,
    );
  }
  return FEATURES[name];
}

/** Is `feature` present on `environment`? */
export function isFeatureAvailableOn(feature: string, environment: EnvironmentName): boolean {
  return resolveFeature(feature).availableOn.includes(environment);
}

/** Every feature present on a given environment — used by the coverage report. */
export function featuresOn(environment: EnvironmentName): readonly FeatureConfig[] {
  return FEATURE_NAMES.map((name) => FEATURES[name]).filter((f) =>
    f.availableOn.includes(environment),
  );
}

// ─── Test-tree layout ────────────────────────────────────────────────────────
//
//  Specs are filed by the server that owns the feature:
//
//      tests/_core/<module>/…   modules present on every build
//      tests/cms/<module>/…     features owned by cms   (prayer-schedule)
//      tests/cms2/<module>/…    features owned by cms2  (campaigns, autologin)
//      tests/cms3/<module>/…    features owned by cms3  (media-sets)
//      tests/cms4/<module>/…    features owned by cms4  (file-conversion)
//      tests/live/<module>/…    production-only checks
//
//  A folder is NOT "only runs on that server", it is "owned by that server".
//  Prayer Schedule was built on cms and has since shipped to live, so its specs
//  stay in tests/cms/ and are additionally selected on a live run. Playwright
//  derives that selection from `availableOn` below, which is why the registry —
//  not the directory name — decides what executes.

/** Folder under tests/ holding specs that run on every environment. */
export const CORE_TEST_DIR = '_core';

/** Folder under tests/ that owns a feature's specs. */
export function testDirForFeature(feature: FeatureName): string {
  return FEATURES[feature].owner ?? CORE_TEST_DIR;
}

/**
 * Every folder under tests/ that should execute against `environment`: the core
 * tree, the environment's own folder, and the owning folder of any feature that
 * has been rolled out to this environment from elsewhere.
 */
export function testDirsFor(environment: EnvironmentName): readonly string[] {
  const dirs = new Set<string>([CORE_TEST_DIR, environment]);
  for (const feature of featuresOn(environment)) {
    if (feature.owner) dirs.add(feature.owner);
  }
  return [...dirs];
}

/**
 * The inverse: server folders that must be excluded on this environment. This
 * is what Playwright's `testIgnore` consumes — selecting by exclusion keeps
 * tests/global.setup.ts and any future top-level spec in scope automatically.
 */
export function ignoredTestDirsFor(environment: EnvironmentName): readonly string[] {
  const active = new Set(testDirsFor(environment));
  return ENVIRONMENT_NAMES.filter((name) => !active.has(name));
}
