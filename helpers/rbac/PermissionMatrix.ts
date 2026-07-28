// =============================================================================
//  Permission matrix — the declared expectation of what each role may do, per
//  module.
//
//  IMPORTANT, and the reason this file is shaped the way it is:
//  a permission matrix asserted from guesswork is worse than no matrix at all.
//  It produces a suite that is green because it agrees with an invented
//  specification, not because the product is correct. So every cell carries its
//  own confirmation status:
//
//    'confirmed' — observed against a real account, with a dated `evidence`
//                  note. These are asserted, and a mismatch fails the build.
//    'expected'  — believed to be true but never verified. These are NOT
//                  asserted by default; the RBAC suite runs them in discovery
//                  mode and reports observed-vs-expected so a human can promote
//                  them to 'confirmed' (or correct them).
//
//  Promote a cell only when you have actually watched that role attempt that
//  action on a real environment. Record what you saw in `evidence`.
// =============================================================================

import type { Action, Role } from './roles';

/** Modules the CMS exposes, as addressed by the RBAC suites. */
export const MODULES = [
  'dashboard',
  'screens',
  'groups',
  'clusters',
  'library',
  'playlists',
  'campaigns',
  'prayerSchedule',
  'team',
  'reports',
  'widgets',
  'mediaSets',
  'notificationSettings',
  'billing',
] as const;

export type Module = (typeof MODULES)[number];

export type Confirmation = 'confirmed' | 'expected';

export interface PermissionCell {
  /** Whether the role is allowed to perform the action. */
  allowed: boolean;
  /** How much this claim can be trusted. */
  status: Confirmation;
  /**
   * Why we believe it. Required for 'confirmed' cells: name the environment,
   * the account and the date, e.g. "cms2, viewer account, 2026-07-28: Create
   * button absent and POST /campaign/create returned 403".
   */
  evidence?: string;
}

/** Sparse matrix: module → role → action → cell. Unlisted cells are unknown. */
export type PermissionMatrix = Partial<
  Record<Module, Partial<Record<Role, Partial<Record<Action, PermissionCell>>>>>
>;

/**
 * The live matrix.
 *
 * Seeded from what this repository can actually evidence. The campaign RBAC
 * investigation (docs/qa-reports/campaigns-v1-rbac/) is the only module with
 * observed role behaviour recorded; everything else is deliberately absent
 * rather than guessed. Add entries as you confirm them.
 */
export const PERMISSION_MATRIX: PermissionMatrix = {
  campaigns: {
    admin: {
      view: {
        allowed: true,
        status: 'confirmed',
        evidence:
          'cms2, admin account, 2026-07-28: campaign list, create, update and delete all succeed via UI and API.',
      },
      create: {
        allowed: true,
        status: 'confirmed',
        evidence:
          'cms2, admin account, 2026-07-28: POST /campaign/create returns 2xx and the campaign is readable back.',
      },
      edit: {
        allowed: true,
        status: 'confirmed',
        evidence:
          'cms2, admin account, 2026-07-28: POST /campaign/update/{id} returns 2xx and the change reads back.',
      },
      delete: {
        allowed: true,
        status: 'confirmed',
        evidence:
          'cms2, admin account, 2026-07-28: DELETE /campaign/delete/{id} hard-deletes; read-back 404s.',
      },
      search: {
        allowed: true,
        status: 'confirmed',
        evidence:
          'cms2, admin account, 2026-07-28: search parameter filters the listing (see BUG-CMP-02 for its regex handling).',
      },
    },
  },
};

/** Look up a cell, or undefined when the combination has never been recorded. */
export function cellFor(module: Module, role: Role, action: Action): PermissionCell | undefined {
  return PERMISSION_MATRIX[module]?.[role]?.[action];
}

/** Every cell that is safe to assert against, flattened for data-driven tests. */
export function confirmedCells(): Array<{
  module: Module;
  role: Role;
  action: Action;
  cell: PermissionCell;
}> {
  const out: Array<{ module: Module; role: Role; action: Action; cell: PermissionCell }> = [];
  for (const [module, roles] of Object.entries(PERMISSION_MATRIX)) {
    for (const [role, actions] of Object.entries(roles ?? {})) {
      for (const [action, cell] of Object.entries(actions ?? {})) {
        if (cell && cell.status === 'confirmed') {
          out.push({
            module: module as Module,
            role: role as Role,
            action: action as Action,
            cell,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Cells believed but not verified. The RBAC suite reports on these instead of
 * asserting them, so an unconfirmed expectation can never fail the build or,
 * worse, pass and be mistaken for verification.
 */
export function unconfirmedCells(): Array<{
  module: Module;
  role: Role;
  action: Action;
  cell: PermissionCell;
}> {
  const out: Array<{ module: Module; role: Role; action: Action; cell: PermissionCell }> = [];
  for (const [module, roles] of Object.entries(PERMISSION_MATRIX)) {
    for (const [role, actions] of Object.entries(roles ?? {})) {
      for (const [action, cell] of Object.entries(actions ?? {})) {
        if (cell && cell.status === 'expected') {
          out.push({
            module: module as Module,
            role: role as Role,
            action: action as Action,
            cell,
          });
        }
      }
    }
  }
  return out;
}
