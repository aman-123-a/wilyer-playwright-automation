# Feature: Clusters (synchronised playback)

**Env:** all (`_core`) · **Specs:** `tests/_core/clusters/`
**Page objects:** `pages/ClustersPage.ts` (listing, batches, content mode),
`pages/ClusterSettingsPage.ts` (master election, screen state, live channel)
**Config:** `config/cluster.ts` · **Helpers:** `helpers/cluster/`

## What a cluster is

A named set of **batches**; a batch is a set of screens plus the content assigned to
them. Two or more physical screens play one playlist *in step*, under a master
elected at runtime. A cluster is not a content holder — content reaches it through a
batch.

## Flows

1. `/clusters` listing → open a cluster → batches, content mode (Files | Playlist)
2. Master election: one screen wears the 👑, the rest are slaves
3. Synchronised playback across every screen in a batch
4. Failover: a screen drops off the network, the cluster re-elects

## Three sources of truth — not interchangeable

| Source | Carries | Does NOT carry |
|---|---|---|
| `GET /cluster/read/{id}` | `isScreenSync`, `manageMode`, batches, per-screen `status` (online) | **master identity** |
| socket.io live channel | `clusterScreens` (master election), `playlistEvent` (playback telemetry) | — |
| The DOM (crown, status dot) | Painted *from* the live channel | Never the primary signal — the crown paints a beat after first render |

Asserting master identity from `/cluster/read` is the trap here: it simply is not in
that payload.

## Coverage

| Area | Spec |
|---|---|
| Sync configuration, election, crown-vs-API agreement | `tests/_core/clusters/functional/cluster-sync.spec.ts` |
| Offline behaviour, master failover (operator drill) | `tests/_core/clusters/resilience/cluster-failover.spec.ts` |
| Playback skew between master and slaves | `tests/_core/clusters/perf/cluster-playback-sync.spec.ts` |

Related: `tests/cms2/campaigns/cluster/campaign-cluster-integration.spec.ts` (a
campaign reaches cluster screens only *indirectly*, via a playlist) and
`tests/cms2/campaigns/rbac/cluster-crud-permissions.spec.ts`.

## Running it

Every cluster suite **skips** unless `CLUSTER_ID` is set — no cluster, no run, and no
red report that only means "no hardware here".

```bash
CLUSTER_ID=<id> npm run cms2 -- tests/_core/clusters
CLUSTER_ID=<id> CLUSTER_DRILL=true npm run cms2 -- tests/_core/clusters/resilience
```

The drill blocks on a human pulling a network cable and is forced off on production.

## Notes / gotchas

- **Attach the monitor before navigating.** `clusterScreens` is sent once, on connect;
  the page object does this in its constructor, which is why it must be built (via the
  `clusterSettings` fixture) before `open()`.
- **A reload drops the socket.** `waitForScreenState` polls in place by default; pass
  `reload: true` only for the online flags, which are server-rendered at page load.
- **Skew is an upper bound.** Events are stamped on arrival at the client, so the
  number carries socket jitter on top of true player skew. Good enough to catch a
  screen seconds behind its master; not a frame-accurate NTP measurement.
- Chromium claims these specs (`CLUSTER_SPECS` in `playwright.config.ts`) — five
  browser projects would open five sockets onto the same hardware and report five
  copies of one measurement.
- `/batch-settings/<id>` is not reachable by direct navigation; it redirects to
  `/clusters`. Click the Manage link instead. See BUG-CLU-01.
