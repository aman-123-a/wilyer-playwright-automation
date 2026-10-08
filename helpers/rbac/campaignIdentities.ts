// =============================================================================
//  Campaign identity resolution for the RBAC suites.
//
//  A campaign suite that wants to run "the same lifecycle as three different
//  people" needs three things per person, and none of them are knowable up front:
//
//    1. a session token                     — logins go through the UI (reCAPTCHA)
//    2. WHERE that person may file a campaign — the root, or an assigned folder
//    3. a media id that person may reference  — folder-fenced accounts can only
//                                               see media inside their folders
//
//  (2) and (3) are the traps. `isRestrictedAccess` fences a sub-user to a set of
//  folders; creating at the root then fails with a folder error that looks
//  nothing like a permission error, and a suite that hardcodes the root silently
//  tests the fence instead of the thing it meant to test. Equally, only SOME of
//  a fenced account's folders actually contain media on cms2 (see the memory
//  note `cms-test-identities`), so the first assigned folder is not good enough —
//  the search below prefers one that has a usable file.
//
//  ── What "may" means here ───────────────────────────────────────────────────
//  `can()` answers from the identity's OWN JWT, because that is what the server
//  authorises against: `access` is a token claim. Reading the role record instead
//  would answer a different (and for existing sessions, wrong) question — see
//  BUG-PERM-01. The account owner carries no `access` map at all and is
//  unconditionally permitted, which is why `isOwner` short-circuits.
// =============================================================================

import type { APIRequestContext, Browser } from '@playwright/test';
import { ENV, type Credentials } from '../../config/env';
import { authHeaders, loginAs, type Identity } from './identities';

const api = (path: string): string => `${ENV.API_BASE_URL}${path}`;

/** One account, resolved far enough to drive a full campaign lifecycle as it. */
export interface CampaignIdentity {
  key: 'admin' | 'subuser' | 'unrestricted';
  /** Human label used in assertion messages — it must name WHO failed. */
  label: string;
  identity: Identity;
  /** The account owner, who has no permission map and is never fenced. */
  isOwner: boolean;
  /** True when a folder fence applies (`isRestrictedAccess` on the role). */
  isFenced: boolean;
  /**
   * Folder this identity must file campaigns in. `null` means the root, which is
   * only legal for an unfenced account.
   */
  folderId: string | null;
  /** A media id this identity can legitimately reference, or '' if it has none. */
  fileId: string;
}

/** Every campaign verb, as the permission model names them. */
export type CampaignVerb = 'view' | 'create' | 'update' | 'delete';

/**
 * Whether an identity holds `module.verb`, per its own token.
 *
 * The owner is allowed everything. For anyone else an ABSENT module is treated
 * as denied rather than granted: a suite must never conclude "permitted" from a
 * claim that simply is not there.
 */
export function can(who: CampaignIdentity, module: string, verb: string): boolean {
  if (who.isOwner) return true;
  const access = (who.identity.claims as Record<string, unknown>).access as
    | Record<string, Record<string, unknown>>
    | undefined;
  return access?.[module]?.[verb] === true;
}

/** Log in through the UI and lift the session token. Returns null on failure. */
async function authenticate(browser: Browser, creds: Credentials): Promise<Identity | null> {
  const page = await browser.newPage();
  try {
    return (await loginAs(page, creds)).identity;
  } finally {
    await page.close();
  }
}

/** Media ids visible to an identity within a folder ('' = the root). */
async function mediaIn(
  request: APIRequestContext,
  identity: Identity,
  folderId: string,
): Promise<string[]> {
  const res = await request.get(
    api(`/file/read?limit=5&page=1&search=&type=&sort=createdAt&order=-1&folderId=${folderId}`),
    { headers: authHeaders(identity) },
  );
  if (!res.ok()) return [];
  const docs = ((await res.json()).docs ?? []) as Array<{ id: string }>;
  return docs.map((d) => d.id);
}

/**
 * Resolve one account into everything a lifecycle suite needs to act as it.
 *
 * Returns null — rather than throwing — when the account is not configured or
 * cannot log in. A partly-configured environment should skip the identities it
 * lacks and still cover the ones it has; failing the whole file would report a
 * missing .env entry as an application defect.
 */
export async function resolveCampaignIdentity(
  browser: Browser,
  request: APIRequestContext,
  key: CampaignIdentity['key'],
  label: string,
  creds: Credentials,
): Promise<CampaignIdentity | null> {
  if (!creds.email || !creds.password) return null;

  const identity = await authenticate(browser, creds);
  if (!identity) return null;

  const claims = identity.claims as Record<string, unknown>;
  const isOwner = key === 'admin';
  const isFenced = claims.isRestrictedAccess === true;

  if (!isFenced) {
    const files = await mediaIn(request, identity, '');
    return { key, label, identity, isOwner, isFenced, folderId: null, fileId: files[0] ?? '' };
  }

  // Fenced: find an assigned folder, preferring one that actually holds media so
  // the campaign payloads this identity writes can be realistic.
  const res = await request.get(api('/folder/read?page=1&limit=100'), {
    headers: authHeaders(identity),
  });
  const folders = res.ok()
    ? (((await res.json()).folders ?? []) as Array<{ id: string; name: string }>)
    : [];
  if (folders.length === 0) return null;

  for (const folder of folders) {
    const files = await mediaIn(request, identity, folder.id);
    if (files.length > 0) {
      return { key, label, identity, isOwner, isFenced, folderId: folder.id, fileId: files[0] };
    }
  }
  return { key, label, identity, isOwner, isFenced, folderId: folders[0].id, fileId: '' };
}

/** The three cms2 identities, in the order the suites report them. */
export function campaignIdentitySpecs(): Array<{
  key: CampaignIdentity['key'];
  label: string;
  creds: Credentials;
}> {
  return [
    { key: 'admin', label: 'admin (account owner)', creds: ENV.ADMIN },
    { key: 'subuser', label: 'folder-fenced sub-user', creds: ENV.SUBUSER },
    { key: 'unrestricted', label: 'account-wide sub-user', creds: ENV.UNRESTRICTED },
  ];
}
