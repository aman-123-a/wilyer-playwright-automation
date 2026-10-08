# Feature: Auto Login

**Specs:** _none yet_ — no automated suite authored. AUTOLOGIN-SEC-01 was found by
manual/API probing; the regression guard still needs writing.

## Flows

1. Record credentials via the extension
2. Retrieve by host / by keys
3. Replay on a player device

## Coverage

| Area | Spec | Status |
|---|---|---|
| Record / retrieve | — | Not automated |
| Auth enforcement on `readPublic` | — | **Gap** — guard for AUTOLOGIN-SEC-01 |
| `byHost` / `withKeys` auth | — | Not automated |

## Known defects

| ID | Summary | State |
|---|---|---|
| AUTOLOGIN-SEC-01 | `readPublic` serves recorded credentials in plaintext, unauthenticated | **Critical — open** (see `../04_findings/AUTOLOGIN-SEC-01.md`) |

## Notes / gotchas

- Production posture differs: no `readPublic` leak there — `byHost` / `withKeys`
  are authed and credential CRUD is extension-only. The defect is non-prod.
