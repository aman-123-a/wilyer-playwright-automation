# Feature: Campaigns

**Env:** cms2 · **Specs:** `tests/cms2/campaigns/`

## Requirement source

- BRD/PRD: <!-- link -->

## Flows

1. Create campaign → add playlists → schedule → publish
2. Clone campaign — `POST /campaign/duplicate/{id}`
3. Edit / delete campaign

## Acceptance criteria

| # | Criterion | Covered by |
|---|---|---|
| 1 | | |

## Coverage

| Area | Spec |
|---|---|
| CRUD | `tests/cms2/campaigns/crud/campaign-crud.spec.ts` |
| Clone | `tests/cms2/campaigns/crud/campaign-clone.spec.ts` |
| Scheduling | `tests/cms2/campaigns/scheduling/campaign-scheduling.spec.ts` |
| Folder move | `tests/cms2/campaigns/folder/campaign-folder-move.spec.ts` |
| Playlist membership | `tests/cms2/campaigns/playlist/campaign-playlist-membership.spec.ts` |
| Playlist content | `tests/cms2/campaigns/playlist/campaign-playlist-content.spec.ts` |
| Loop / preview | `tests/cms2/campaigns/loop/campaign-loop-preview.spec.ts` |
| Screen integration | `tests/cms2/campaigns/screen/campaign-screen-integration.spec.ts` |
| Cluster integration | `tests/cms2/campaigns/cluster/campaign-cluster-integration.spec.ts` |
| API authz | `tests/cms2/campaigns/api/campaign-authz.spec.ts` |
| API sub-user access | `tests/cms2/campaigns/api/campaign-subuser-access.spec.ts` |
| Permission matrix | `tests/cms2/campaigns/rbac/campaign-permission-matrix.spec.ts` |
| Delivery permissions | `tests/cms2/campaigns/rbac/campaign-delivery-permissions.spec.ts` |
| Lifecycle identities | `tests/cms2/campaigns/rbac/campaign-lifecycle-identities.spec.ts` |
| Cluster CRUD permissions | `tests/cms2/campaigns/rbac/cluster-crud-permissions.spec.ts` |
| Sub-user folder fencing | `tests/cms2/campaigns/rbac/subuser-folder-campaigns.spec.ts` |
| Performance | `tests/cms2/campaigns/perf/campaign-performance.spec.ts` |
| Defect retest | `tests/cms2/campaigns/retest/clickup-in-development.spec.ts` |

## Known defects

| ID | Summary | State |
|---|---|---|
| BUG-PERM-01 | | Open |
| BUG-PERM-02 | | Open |
| BUG-PERM-03 | | Open |
| BUG-CMP-04 | | Fixed — `test.fail()` marker is stale |
| BUG-CMP-12 | | Fixed — `test.fail()` marker is stale |

## Notes / gotchas

- Clone modal has no keyboard exit.
- On cms2 both maker and checker roles now hold every campaign grant — two RBAC
  failures there are fixture drift, not defects.
