// =============================================================================
//  Helpers barrel — domain-level building blocks shared across suites.
//  (utils/ holds generic, product-agnostic tooling; helpers/ holds things that
//  know what a role, a permission or a CMS module is.)
// =============================================================================

export { requireFeature, hasFeature } from './features';

// Android player (device-side testing) — see config/android.ts for setup.
export {
  Adb,
  AppiumDriver,
  AndroidElement,
  by,
  requireDevice,
  requireDisruptive,
  canDriveDevice,
} from './android';
export type { AdbDevice, AdbResult, Selector, Using } from './android';

export {
  ROLES,
  ACTIONS,
  credentialsFor,
  configuredRoles,
  requireCredentials,
  storageStateFor,
} from './rbac/roles';
export type { Role, Action } from './rbac/roles';

export { can, campaignIdentitySpecs, resolveCampaignIdentity } from './rbac/campaignIdentities';
export type { CampaignIdentity, CampaignVerb } from './rbac/campaignIdentities';

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
