// =============================================================================
//  RBAC role and action vocabulary.
//
//  Roles map to the CMS's Team → Roles configuration. The CMS models
//  permissions per SECTION (each exposing NONE / READ-ONLY / ALL, plus
//  per-module checkboxes), so a "role" here is a named account configured that
//  way — not a built-in enum inside the product.
//
//  Credentials are resolved from the environment ONLY. Nothing in this file
//  may ever carry a real email or password: this repository is shared, and a
//  committed fallback credential is a credential leak regardless of intent.
// =============================================================================

import { ENV, type Credentials } from '../../config/env';

/** Every role the platform can exercise. */
export const ROLES = [
  'owner',
  'admin',
  'support',
  'maker',
  'checker',
  'viewer',
  'restricted',
  'unrestricted',
] as const;

export type Role = (typeof ROLES)[number];

/** Every permission-bearing action the suites assert on. */
export const ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'duplicate',
  'publish',
  'reports',
  'search',
  'folder',
  'approval',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * Environment variable names per role. Add the pair to your local .env (or CI
 * secrets) for each role you want covered; suites skip roles with no account
 * rather than failing, so a partial setup still runs.
 */
const CREDENTIAL_VARS: Record<Role, { email: string; password: string }> = {
  owner: { email: 'CMS_OWNER_EMAIL', password: 'CMS_OWNER_PASSWORD' },
  admin: { email: 'CMS_ADMIN_EMAIL', password: 'CMS_ADMIN_PASSWORD' },
  support: { email: 'CMS_SUPPORT_EMAIL', password: 'CMS_SUPPORT_PASSWORD' },
  maker: { email: 'CMS_MAKER_EMAIL', password: 'CMS_MAKER_PASSWORD' },
  checker: { email: 'CMS_CHECKER_EMAIL', password: 'CMS_CHECKER_PASSWORD' },
  viewer: { email: 'CMS_VIEWER_EMAIL', password: 'CMS_VIEWER_PASSWORD' },
  restricted: { email: 'CMS_RESTRICTED_EMAIL', password: 'CMS_RESTRICTED_PASSWORD' },
  // `unrestricted` pointed at CMS_SUBUSER_* — the folder-FENCED account — so any
  // suite asking for an unrestricted identity silently got a restricted one and
  // could only pass by asserting too little. It now has its own variable pair.
  unrestricted: { email: 'CMS_UNRESTRICTED_EMAIL', password: 'CMS_UNRESTRICTED_PASSWORD' },
};

/** Credentials for a role, or undefined when that account is not configured. */
export function credentialsFor(role: Role): Credentials | undefined {
  // ENV already applied dotenv layering; admin is pre-resolved there.
  if (role === 'admin') {
    return ENV.ADMIN.email ? ENV.ADMIN : undefined;
  }

  const vars = CREDENTIAL_VARS[role];
  const email = process.env[vars.email];
  const password = process.env[vars.password];
  return email && password ? { email, password } : undefined;
}

/** Roles that currently have credentials configured. */
export function configuredRoles(): Role[] {
  return ROLES.filter((role) => credentialsFor(role) !== undefined);
}

/**
 * Credentials for a role, or a clear explanation of what to set.
 * Use in a suite that cannot proceed without the account.
 */
export function requireCredentials(role: Role): Credentials {
  const creds = credentialsFor(role);
  if (!creds) {
    const vars = CREDENTIAL_VARS[role];
    throw new Error(
      `No credentials configured for role "${role}". ` +
        `Set ${vars.email} and ${vars.password} in your local .env or CI secrets. ` +
        `Credentials are never committed to this repository.`,
    );
  }
  return creds;
}

/** Storage-state path for a role's cached session, namespaced per environment. */
export function storageStateFor(role: Role): string {
  return `storage/${ENV.NAME}/${role}.json`;
}
