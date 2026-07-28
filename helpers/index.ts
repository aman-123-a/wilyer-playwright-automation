// =============================================================================
//  Helpers barrel — domain-level building blocks shared across suites.
//  (utils/ holds generic, product-agnostic tooling; helpers/ holds things that
//  know what a role, a permission or a CMS module is.)
// =============================================================================

export {
  ROLES,
  ACTIONS,
  credentialsFor,
  configuredRoles,
  requireCredentials,
  storageStateFor,
} from './rbac/roles';
export type { Role, Action } from './rbac/roles';

export {
  MODULES,
  PERMISSION_MATRIX,
  cellFor,
  confirmedCells,
  unconfirmedCells,
} from './rbac/PermissionMatrix';
export type {
  Module,
  Confirmation,
  PermissionCell,
  PermissionMatrix,
} from './rbac/PermissionMatrix';

export {
  probeRoute,
  expectRouteBlocked,
  expectRouteAllowed,
  expectNavHidden,
  expectNavVisible,
  expectControlFenced,
  expectControlAvailable,
  expectApiDenied,
  expectApiAllowed,
  expectDenied,
} from './rbac/permissions';
export type { RouteGuardResult } from './rbac/permissions';
