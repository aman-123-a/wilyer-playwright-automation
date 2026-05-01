export const CREDENTIALS = {
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'dev@wilyer.com',
    password: process.env.ADMIN_PASSWORD ?? 'testdev',
  },
} as const;

export type RoleType = 'unrestricted' | 'restricted';

export interface RolePayload {
  name: string;
  type: RoleType;
  /** Required when `type === 'restricted'`. */
  parent?: string;
  /** Which permission sections to fully select. Empty = none. */
  permissions?: string[];
}

/**
 * Exact section labels as they appear in the CMS dialog.
 * Verified against the live "Create Custom Role" modal — each matches the
 * visible text after "Select All in ".
 */
export const PERMISSION_SECTIONS = [
  'Overview & Monitoring',
  'Screens Management',
  'Content Management',
  'Screen Group Management',
  'Team Administration',
  'Reports',
  'Cluster Management',
  'Remote Update',
] as const;

/** Collision-safe role name for parallel/repeat runs. */
export const uniqueRoleName = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
