// =============================================================================
//  Role permission helper — read, patch and restore a Team → Roles permission
//  set through the API, so a suite can test what the CMS does when an
//  administrator ENABLES or DISABLES a module permission.
//
//  ── The trap this file exists to close ──────────────────────────────────────
//  `PUT /role/update/:id` REPLACES the whole `permissions` object; it does not
//  merge. Sending `{permissions:{campaigns:{…}}}` therefore wipes media,
//  playlists, screens and every other module for every sub-user holding that
//  role. Verified live on 2026-07-29 against a throwaway role, which is the only
//  safe way to learn that. `patchModule()` always rewrites the FULL snapshot
//  with one module swapped, so a caller cannot make that mistake by omission.
//
//  ── Restoring is part of the contract ───────────────────────────────────────
//  These suites mutate a SHARED role that real accounts are assigned to. Take a
//  snapshot before the first change, restore it afterwards, and assert the
//  restore landed — an unrestored role is a broken environment for everyone
//  else, not just a failed test.
// =============================================================================

import type { APIRequestContext } from '@playwright/test';
import { ENV } from '../../config/env';
import { authHeaders, type Identity } from './identities';

/** The four permission verbs the campaigns module exposes. */
export const CAMPAIGN_VERBS = ['view', 'create', 'update', 'delete'] as const;
export type CampaignVerb = (typeof CAMPAIGN_VERBS)[number];

/** Everything needed to put a role back exactly as it was found. */
export interface RoleSnapshot {
  id: string;
  name: string;
  description: string;
  isRestrictedAccess: boolean;
  reportsTo: string | null;
  permissions: Record<string, Record<string, unknown>>;
}

export interface TeamMember {
  id: string;
  email: string;
  isActive: boolean;
  roleId: string;
  roleName: string;
}

const url = (path: string): string => `${ENV.API_BASE_URL}${path}`;

/** Every team member of the authenticated account. */
export async function readTeam(
  request: APIRequestContext,
  admin: Identity,
): Promise<TeamMember[]> {
  const r = await request.get(url('/team/read?search=&page=1&limit=200'), {
    headers: authHeaders(admin),
  });
  const docs = ((await r.json()).docs ?? []) as Array<Record<string, any>>;
  return docs.map((d) => ({
    id: String(d.id),
    email: String(d.email ?? '').toLowerCase(),
    isActive: Boolean(d.isActive),
    roleId: String(d.assignedRoleId?._id ?? ''),
    roleName: String(d.assignedRoleId?.name ?? ''),
  }));
}

/** The member record for an email, or undefined when that account is not on the team. */
export async function findMember(
  request: APIRequestContext,
  admin: Identity,
  email: string,
): Promise<TeamMember | undefined> {
  return (await readTeam(request, admin)).find((m) => m.email === email.toLowerCase());
}

/** A full, restorable snapshot of one role. */
export async function readRole(
  request: APIRequestContext,
  admin: Identity,
  roleId: string,
): Promise<RoleSnapshot> {
  const r = await request.get(url('/role/read?search=&page=1&limit=200'), {
    headers: authHeaders(admin),
  });
  const role = ((await r.json()).roles ?? []).find(
    (x: Record<string, any>) => String(x._id) === roleId,
  );
  if (!role) throw new Error(`role ${roleId} not found — cannot snapshot what is not there`);

  return {
    id: roleId,
    name: String(role.name),
    description: String(role.description ?? ''),
    isRestrictedAccess: Boolean(role.isRestrictedAccess),
    reportsTo: role.reportsTo?._id ?? null,
    permissions: (role.permissions ?? {}) as RoleSnapshot['permissions'],
  };
}

/** Write a complete permission set back to a role. Returns the HTTP status. */
export async function writeRole(
  request: APIRequestContext,
  admin: Identity,
  snapshot: RoleSnapshot,
  permissions: RoleSnapshot['permissions'],
): Promise<number> {
  const r = await request.put(url(`/role/update/${snapshot.id}`), {
    headers: authHeaders(admin),
    data: {
      name: snapshot.name,
      description: snapshot.description,
      isRestrictedAccess: snapshot.isRestrictedAccess,
      reportsTo: snapshot.reportsTo,
      permissions,
    },
  });
  return r.status();
}

/**
 * Set one module's permissions, carrying every OTHER module through untouched.
 *
 * `overrides` is merged onto the module's snapshot values, so a caller can flip
 * a single verb without having to restate the rest.
 */
export async function patchModule(
  request: APIRequestContext,
  admin: Identity,
  snapshot: RoleSnapshot,
  module: string,
  overrides: Record<string, boolean>,
): Promise<number> {
  return writeRole(request, admin, snapshot, {
    ...snapshot.permissions,
    [module]: { ...(snapshot.permissions[module] ?? {}), ...overrides },
  });
}

/** Put a role back exactly as snapshotted. */
export async function restoreRole(
  request: APIRequestContext,
  admin: Identity,
  snapshot: RoleSnapshot,
): Promise<number> {
  return writeRole(request, admin, snapshot, snapshot.permissions);
}

/** The live permissions of one module — used to prove a write or a restore landed. */
export async function readModule(
  request: APIRequestContext,
  admin: Identity,
  roleId: string,
  module: string,
): Promise<Record<string, unknown>> {
  const role = await readRole(request, admin, roleId);
  return (role.permissions[module] ?? {}) as Record<string, unknown>;
}

/** All campaign verbs set to the same value — the "all on" / "all off" states. */
export function allCampaignVerbs(value: boolean): Record<CampaignVerb, boolean> {
  return { view: value, create: value, update: value, delete: value };
}
