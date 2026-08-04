// =============================================================================
//  Clusters · CRUD PERMISSIONS (CLP-001…007).
//
//  Target: cms2.pocsample.in. Identities come from .env, never hardcoded.
//
//  ── Why this sits in the campaigns folder ───────────────────────────────────
//  A campaign never touches a cluster directly — mapped live and pinned by
//  ../cluster/campaign-cluster-integration: a cluster's content is Files or
//  Playlist, there is no campaign mode. A campaign reaches cluster screens only
//  by sitting in a playlist that a batch is set to play. So the permissions that
//  actually decide whether a campaign can reach a fleet of screens are the
//  CLUSTER ones, and they have never been tested.
//
//  ── Endpoints, mapped live 2026-08-03 ───────────────────────────────────────
//    GET    /cluster/read?page&limit&search   → { clusters: [...], totalDocs }
//    POST   /cluster/create                   { name, description }
//    POST   /cluster/update/{id}              { name, description }   ← POST, not PUT
//    DELETE /cluster/delete/{id}
//    POST   /cluster/updateManageMode/{id}    ← Files ⇄ Playlist content mode
//  Note the read wrapper: `clusters`, NOT the `docs` every other listing uses.
//
//  ── Method ─────────────────────────────────────────────────────────────────
//  One verb moves per case, everything else held constant. `access` is a JWT
//  claim, so every toggle is followed by a fresh login (BUG-PERM-01). The role is
//  a SHARED record: snapshotted in beforeAll, restored in afterAll, restore
//  asserted. Fixtures are created by the ADMIN, so a case that revokes create can
//  still have something to try to update or delete.
//
//  CLP-007 is the one worth reading twice. On campaigns, /campaign/update admits
//  a caller holding create OR update and refuses only when both are off
//  (BUG-PERM-02) — "may add, may not edit" is not expressible. This asks whether
//  the cluster writer repeats that mistake.
// =============================================================================

import { test, expect, type APIRequestContext } from '@playwright/test';
import { ENV, type Credentials } from '../../../../config/env';
import { loginAs, authHeaders, type Identity } from '../../../../helpers/rbac/identities';
import {
  findMember,
  readRole,
  readModule,
  patchModule,
  restoreRole,
  type RoleSnapshot,
} from '../../../../helpers/rbac/rolePermissions';

const PREFIX = 'QA_CLP_';
const NOT_AUTHORIZED = /not authorized to perform this action/i;

const api = (p: string): string => `${ENV.API_BASE_URL}${p}`;
const uniqueName = (label: string): string =>
  `${PREFIX}${label}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

interface Subject {
  key: 'restricted' | 'unrestricted';
  label: string;
  creds: Credentials;
  role: RoleSnapshot;
}

interface Cluster {
  id: string;
  name: string;
}

test.describe('Clusters · CRUD permissions @rbac @security', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: 'serial' });

  let admin: Identity | null = null;
  const subjects: Partial<Record<Subject['key'], Subject>> = {};
  let setupError = '';

  async function authenticate(
    browser: import('@playwright/test').Browser,
    creds: Credentials,
  ): Promise<Identity | null> {
    const page = await browser.newPage();
    const outcome = await loginAs(page, creds);
    await page.close();
    return outcome.identity;
  }

  async function withPermission(
    request: APIRequestContext,
    browser: import('@playwright/test').Browser,
    subject: Subject,
    overrides: Record<string, boolean>,
  ): Promise<Identity> {
    const status = await patchModule(request, admin!, subject.role, 'clusters', overrides);
    expect(status, 'the admin must be able to rewrite the clusters module').toBeLessThan(400);
    const identity = await authenticate(browser, subject.creds);
    expect(identity, `${subject.label} must be able to log in after the role change`).toBeTruthy();
    return identity!;
  }

  /** The cluster listing as `who` sees it. The wrapper is `clusters`, not `docs`. */
  async function clustersFor(request: APIRequestContext, who: Identity, search = ''): Promise<Cluster[]> {
    const res = await request.get(api(`/cluster/read?page=1&limit=100&search=${search}`), {
      headers: authHeaders(who),
    });
    if (!res.ok()) return [];
    return (((await res.json()).clusters ?? []) as Cluster[]) ?? [];
  }

  /**
   * A cluster owned by the ADMIN, for the sub-user to be refused on.
   *
   * Deliberately not created by the subject: a case that revokes `create` needs a
   * target that already exists, and a case that revokes `delete` must not depend
   * on the subject having been able to make one.
   */
  async function adminCluster(request: APIRequestContext, label: string): Promise<Cluster> {
    const name = uniqueName(label);
    const res = await request.post(api('/cluster/create'), {
      headers: authHeaders(admin!),
      data: { name, description: 'cluster permission suite' },
    });
    expect(res.status(), 'the admin must be able to create a fixture cluster').toBeLessThan(300);

    // /cluster/create answers with a message only — resolve by read-back.
    const found = (await clustersFor(request, admin!, PREFIX)).find((c) => c.name === name);
    expect(found?.id, 'the fixture cluster must be readable back').toBeTruthy();
    return found!;
  }

  const nameOf = async (request: APIRequestContext, id: string): Promise<string | null> =>
    (await clustersFor(request, admin!, PREFIX)).find((c) => c.id === id)?.name ?? null;

  test.beforeAll(async ({ browser, request }) => {
    test.setTimeout(300_000);

    admin = await authenticate(browser, ENV.ADMIN);
    if (!admin) {
      setupError = 'the admin could not authenticate';
      return;
    }

    for (const [key, label, creds] of [
      ['restricted', 'folder-fenced sub-user', ENV.SUBUSER],
      ['unrestricted', 'account-wide sub-user', ENV.UNRESTRICTED],
    ] as Array<[Subject['key'], string, Credentials]>) {
      if (!creds.email || !creds.password) {
        setupError = `no credentials configured for the ${label}`;
        return;
      }
      const member = await findMember(request, admin, creds.email);
      if (!member?.roleId) {
        setupError = `${creds.email} is not a team member with an assigned role`;
        return;
      }
      subjects[key] = { key, label, creds, role: await readRole(request, admin, member.roleId) };
    }
  });

  test.beforeEach(() => {
    test.skip(Boolean(setupError), `Cannot set up the cluster permission suite: ${setupError}`);
    test.skip(
      !ENV.ALLOW_DESTRUCTIVE,
      'Edits role permissions and creates clusters. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
    );
  });

  test.afterAll(async ({ request }) => {
    if (!admin) return;

    // Roles first — an unrestored role breaks the environment for everyone.
    for (const subject of Object.values(subjects)) {
      if (!subject) continue;
      await restoreRole(request, admin, subject.role).catch(() => undefined);
      expect(
        await readModule(request, admin, subject.role.id, 'clusters').catch(() => ({})),
        `the ${subject.label}'s cluster permissions must be restored to how the suite found them`,
      ).toEqual(subject.role.permissions.clusters);
    }

    for (const c of await clustersFor(request, admin, PREFIX)) {
      if (c.name?.startsWith(PREFIX)) {
        await request
          .delete(api(`/cluster/delete/${c.id}`), { headers: authHeaders(admin) })
          .catch(() => undefined);
      }
    }
  });

  for (const key of ['restricted', 'unrestricted'] as const) {
    const subjectOf = (): Subject => {
      const s = subjects[key];
      expect(s, `subject ${key} must be resolved`).toBeTruthy();
      return s!;
    };

    test.describe(`${key} sub-user`, () => {
      test(`CLP-001 · ${key} · clusters.view revoked hides the cluster listing @rbac @critical`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(300_000);
        const subject = subjectOf();
        const fixture = await adminCluster(request, `View_${key}`);

        const blind = await withPermission(request, browser, subject, { view: false });
        const res = await request.get(api('/cluster/read?page=1&limit=100&search='), {
          headers: authHeaders(blind),
        });
        expect(res.status(), 'clusters.view revoked must refuse the listing').toBe(403);
        expect(JSON.stringify(await res.json()), 'and say so as a permission error').toMatch(
          NOT_AUTHORIZED,
        );

        // The cluster is still there — a refused read must not be mistaken for
        // an empty account.
        expect(await nameOf(request, fixture.id), 'the cluster itself is untouched').toBe(fixture.name);
      });

      test(`CLP-002 · ${key} · clusters.create revoked stops a new cluster @rbac @critical`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(300_000);
        const subject = subjectOf();

        const denied = await withPermission(request, browser, subject, { create: false, view: true });
        const name = uniqueName(`NoCreate_${key}`);
        const res = await request.post(api('/cluster/create'), {
          headers: authHeaders(denied),
          data: { name, description: 'should never exist' },
        });
        expect(res.status(), 'clusters.create revoked must refuse the create').toBe(403);

        expect(
          (await clustersFor(request, admin!, PREFIX)).some((c) => c.name === name),
          'and nothing may have been written',
        ).toBe(false);
      });

      test(`CLP-003 · ${key} · clusters.update revoked stops a rename @rbac @critical`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(300_000);
        const subject = subjectOf();
        const fixture = await adminCluster(request, `NoUpdate_${key}`);

        // create is revoked ALONGSIDE update here, because on campaigns the
        // update endpoint admits anyone holding create (BUG-PERM-02). Holding
        // create constant would leave the result ambiguous; CLP-007 separates them.
        const denied = await withPermission(request, browser, subject, {
          update: false,
          create: false,
          view: true,
        });
        const res = await request.post(api(`/cluster/update/${fixture.id}`), {
          headers: authHeaders(denied),
          data: { name: `${fixture.name}_HACKED`, description: 'should not persist' },
        });
        expect(res.status(), 'clusters.update revoked must refuse the rename').toBe(403);

        expect(
          await nameOf(request, fixture.id),
          'and the cluster must keep the name it had — a refused write must write nothing',
        ).toBe(fixture.name);
      });

      test(`CLP-004 · ${key} · clusters.delete revoked leaves the cluster standing @rbac @critical`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(300_000);
        const subject = subjectOf();
        const fixture = await adminCluster(request, `NoDelete_${key}`);

        const denied = await withPermission(request, browser, subject, { delete: false, view: true });
        const res = await request.delete(api(`/cluster/delete/${fixture.id}`), {
          headers: authHeaders(denied),
        });
        expect(res.status(), 'clusters.delete revoked must refuse the delete').toBe(403);

        expect(
          await nameOf(request, fixture.id),
          'and the cluster must survive the refused delete',
        ).toBe(fixture.name);
      });

      test(`CLP-005 · ${key} · clusters.update revoked stops the content-mode switch @rbac @critical`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(300_000);
        const subject = subjectOf();
        const fixture = await adminCluster(request, `NoMode_${key}`);

        // This is the campaign-relevant one. A cluster's content mode is what
        // decides whether its batches play loose files or a PLAYLIST — and a
        // playlist is the only vehicle by which a campaign reaches cluster
        // screens. If the mode switch is not governed by clusters.update, a role
        // that may not edit a cluster can still change what its whole fleet plays.
        const denied = await withPermission(request, browser, subject, {
          update: false,
          create: false,
          view: true,
        });
        const res = await request.post(api(`/cluster/updateManageMode/${fixture.id}`), {
          headers: authHeaders(denied),
          data: { manageMode: 'playlist' },
        });
        expect(
          res.status(),
          `switching a cluster's content mode must be governed by clusters.update — ` +
            `server answered ${res.status()} ${(await res.text()).slice(0, 150)}`,
        ).toBe(403);
      });

      test(`CLP-006 · ${key} · cluster rights do not confer campaign rights @rbac @security`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(300_000);
        const subject = subjectOf();

        // Full command of clusters, nothing on campaigns. The modules must stay
        // separate: owning the fleet is not the same as owning the content.
        await withPermission(request, browser, subject, {
          view: true,
          create: true,
          update: true,
          delete: true,
        });
        const clusterOnly = await authenticate(browser, subject.creds);
        const status = await patchModule(request, admin!, subject.role, 'campaigns', {
          view: false,
          create: false,
          update: false,
          delete: false,
        });
        expect(status, 'the admin must be able to strip the campaigns module').toBeLessThan(400);
        const stripped = await authenticate(browser, subject.creds);
        expect(stripped, 'the subject must still be able to log in').toBeTruthy();
        expect(clusterOnly, 'sanity: the earlier login also succeeded').toBeTruthy();

        const res = await request.get(
          api('/campaign/read?limit=10&page=1&sort=createdAt&order=-1&search=&folderId='),
          { headers: authHeaders(stripped!) },
        );
        expect(
          res.status(),
          'holding every cluster right must not grant campaign visibility',
        ).toBe(403);
      });

      test(`CLP-007 · ${key} · "may create, may not edit" is expressible on clusters @rbac @security`, async ({
        request,
        browser,
      }) => {
        test.setTimeout(300_000);
        const subject = subjectOf();
        const fixture = await adminCluster(request, `CreateNotEdit_${key}`);

        // The campaigns module fails this: /campaign/update admits a caller who
        // holds create OR update, so a role that may add can always edit
        // (BUG-PERM-02). Same experiment, cluster writer.
        const canCreateNotEdit = await withPermission(request, browser, subject, {
          create: true,
          update: false,
          view: true,
        });
        const res = await request.post(api(`/cluster/update/${fixture.id}`), {
          headers: authHeaders(canCreateNotEdit),
          data: { name: `${fixture.name}_edited`, description: 'create held, update revoked' },
        });

        test.info().annotations.push({
          type: 'observed',
          description: `cluster/update with create:true update:false → ${res.status()}`,
        });

        expect(
          res.status(),
          'a role holding create but not update must not be able to edit — if this is 200, ' +
            'the cluster writer repeats BUG-PERM-02 and "may add, may not edit" is not expressible',
        ).toBe(403);
        expect(
          await nameOf(request, fixture.id),
          'and the name must be unchanged',
        ).toBe(fixture.name);
      });
    });
  }
});
