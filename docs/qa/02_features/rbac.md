# Feature: RBAC / Role permissions

**Specs:** `tests/_core/rbac/` · **Helpers:** `helpers/rbac/rolePermissions.ts`,
`helpers/rbac/PermissionMatrix.ts`

## Flows

1. Create role → assign permissions → assign user
2. Sub-user access scoped by folder vs account-wide
3. Permission change takes effect on next login / token refresh

## Coverage

| Area | Spec |
|---|---|
| Per-module grants | `tests/_core/rbac/functional/permissions.spec.ts` |
| Matrix-driven checks | `tests/_core/rbac/functional/rbac-data-driven.spec.ts` |
| Campaign permission matrix | `tests/cms2/campaigns/rbac/campaign-permission-matrix.spec.ts` |
| Campaign delivery grants | `tests/cms2/campaigns/rbac/campaign-delivery-permissions.spec.ts` |
| Lifecycle identities | `tests/cms2/campaigns/rbac/campaign-lifecycle-identities.spec.ts` |
| Cluster CRUD grants | `tests/cms2/campaigns/rbac/cluster-crud-permissions.spec.ts` |
| Sub-user folder fencing | `tests/cms2/campaigns/rbac/subuser-folder-campaigns.spec.ts` |
| Team / member management | `tests/_core/team/functional/team.spec.ts` |

## Known defects

| ID | Summary | State |
|---|---|---|
| BUG-PERM-01 | | Open |
| BUG-PERM-02 | | Open |
| BUG-PERM-03 | | Open |

## Notes / gotchas

- `PUT /role/update` **replaces the whole permissions object** — always build the
  payload through `helpers/rbac/rolePermissions.ts`, never patch a subset.
- Identities and their fencing: `../03_testdata/identities.md`.
- `PermissionMatrix.ts` holds only a handful of `confirmed` cells (campaigns/admin).
  Cells marked `expected` are reported, never asserted — deliberately, so the suite
  cannot pass by agreeing with an invented spec. See `docs/known-gaps.md` §2.
