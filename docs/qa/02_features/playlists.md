# Feature: Playlists

**Env:** all (`_core`) · **Specs:** `tests/_core/playlists/`

## Flows

1. Create playlist → choose layout → fill zones → save
2. Set per-slide / per-layout duration
3. Publish to screens

## Coverage

| Area | Spec |
|---|---|
| CRUD / functional | `tests/_core/playlists/functional/playlists.spec.ts` |
| Duration boundaries | `tests/_core/playlists/boundary/playlist-duration.spec.ts` |
| Not-found paths | `tests/_core/playlists/negative/playlist-not-found.spec.ts` |

Related: `tests/_core/library/functional/library.spec.ts` (media the playlist draws
from), `tests/_core/player/e2e/cms-to-player.spec.ts` (what actually plays).

## Known defects

| ID | Summary | State |
|---|---|---|
| | Duration stepper floor is 1, but typing bypasses it | Open |

## Notes / gotchas

- **Never hand-build a layout payload.** Template one from the editor — create
  answers 201 only for editor-shaped payloads.
- Every playlist update mints new zone ids, even for untouched zones. Do not
  assert on zone id stability.
- Duration selectors are editable only in multi-slide zones.
