# Bug Verification on "Sameer Test" Playlist

**Document ID:** CMP-QA-DOC-11
**Target URL:** `https://cms2.pocsample.in/playlist-settings/6a67400362dca4bcc662f29b`
**Playlist:** `Sameer Test` (owned by another user)
**Build:** `v3.5.21` / `index-BZDVu4l_.js`
**Date:** 2026-07-28
**Purpose:** confirm the campaign defects are not specific to a QA-created playlist, but reproduce
in an existing, real playlist belonging to another user.

> **Safety:** the playlist itself was **never saved**. Only the campaign picker was exercised.
> Sameer's layout, zones and content are unchanged.

---

## Result: 6 of 6 applicable defects reproduce identically

| ID | Test | Result on this playlist |
|----|------|------------------------|
| **BUG-CMP-02** | Type `.*` in the picker search | **REPRODUCES** — returns all **29** campaigns (whole account) |
| **BUG-CMP-02** | Search `^SAMEERTEST` (anchor) | **REPRODUCES** — anchor evaluates, 1 result |
| **BUG-CMP-03** | `GET /campaign/read` without `sort`/`order` | **REPRODUCES** — **500** |
| **BUG-CMP-04** | Type `-5` into per-item duration | **REPRODUCES** — accepted; `min` attribute NOT SET; saved to server as `duration: -5` |
| **BUG-CMP-04** | Duration display | **REPRODUCES** — editor shows `Total Duration : -1h:-1m:-5s` |
| **BUG-CMP-08** | 507-character campaign name | **REPRODUCES** — accepted; `maxLength = -1`; persisted at `nameLen: 507` |
| **BUG-CMP-11** | Search `"  SAMEERTEST_  "` (padded) | **REPRODUCES** — 0 results; unpadded returns 1 |

**Control (correct behaviour):** literal search `SAMEERTEST_` → exactly 1 result, as expected.

---

## Evidence

A single campaign was created **through this playlist's picker UI** with both defects at once:

```
Name field length : 507        (maxLength attribute = -1)
Item duration     : -5         (min attribute = NOT SET)
UI displayed      : Total Duration : -1h:-1m:-5s
```

Server read-back after save:

```json
{ "nameLen": 507, "items": 1, "durations": [-5] }
```

Both the overlong name and the negative duration were persisted by the server.

### Regex injection from this picker

| Query | Campaigns returned |
|-------|-------------------|
| `SAMEERTEST_` (literal control) | 1 |
| `^SAMEERTEST` (anchor) | 1 |
| `.*` (wildcard) | **29 — the entire account** |

Typing `.*` into the search box of this playlist's Campaigns tab dumps every campaign in the
account. No API tooling involved.

---

## Interpretation

The defects are **not environment- or playlist-specific.** Campaigns are a global, account-level
entity; the picker inside any playlist reads and writes the same `/campaign/*` endpoints. Testing
from `Sameer Test` produced byte-identical results to testing from a QA-created playlist.

This also means the reverse holds: **any user editing any playlist can trigger these defects**, and
a campaign created with a negative duration or a 507-character name from one playlist becomes
visible to every other playlist and user in the account immediately.

---

## Not applicable on this route

| ID | Why not tested here |
|----|--------------------|
| BUG-CMP-01 | Zero-item campaigns cannot be created through the UI (client guard); requires a direct API call — already proven twice |
| BUG-CMP-07 | Would require creating two persistent case-variant campaigns visible to other users; already proven, and live examples exist in the account (`VANS`/`vans`, `vansh 1`/`Vansh 1`) |
| BUG-CMP-09, 10, 12 | API-only defects; unrelated to which playlist is open |

---

## Test hygiene

| Item | Status |
|------|--------|
| Campaigns created | 1 (507-char name, duration −5) |
| Campaigns deleted | 1 — verified by API read-back, zero residue |
| **Sameer's playlist** | **Never saved. Layout, zones and content unchanged.** |
| Playlist Save button | Not clicked at any point |

**Note:** account campaign count read 28 at close vs. 24 earlier in the day. The difference is
other users' activity during the session — none of it from this test run.

**Known limitation:** the annotated screenshot for this run could not be captured — the page
screenshot timed out twice while the 507-character name card was rendered, which is itself a
data point for BUG-CMP-08 (an overlong name degrades rendering enough to stall a full-page
capture). The numeric evidence above is from server read-back and is unaffected.
