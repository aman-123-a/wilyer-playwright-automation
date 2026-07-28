# Campaigns V1 with RBAC — API, Database, Audit, Security & Performance

**Document ID:** CMP-QA-DOC-07

> **Endpoint naming caveat (AS-10).** Campaign endpoints are assumed to follow the conventions
> observed in the existing suite (`/cluster/read`, `/role/update`). Confirm the real paths from
> the network tab on cms2 before automating, then update this document once — every table below
> references the placeholder consistently.

---

## 13. API Testing

### 13.1 Endpoint inventory (assumed)

| Method | Endpoint | Purpose | Permission |
|--------|----------|---------|-----------|
| GET | `/campaign/read` | List campaigns (paged, filterable) | View |
| GET | `/campaign/read/{id}` | Single campaign with items | View |
| POST | `/campaign/create` | Create | Create |
| PUT | `/campaign/update/{id}` | Full update | Edit |
| PATCH | `/campaign/update/{id}` | Partial update | Edit |
| DELETE | `/campaign/delete/{id}` | Soft delete | Delete |
| POST | `/campaign/bulk` | Bulk create/update/delete | per action |
| POST | `/campaign/{id}/items` | Add / reorder items | Edit |
| POST | `/campaign/publish` | Publish to screens/clusters | Publish |
| POST | `/campaign/approve/{id}` | Approve a pending change | Approve |
| POST | `/campaign/reject/{id}` | Reject a pending change | Reject |
| GET | `/campaign/audit/{id}` | Audit trail | View + audit |
| PUT | `/role/update/{id}` | Role permissions (existing) | Admin |

### 13.2 Functional API cases

| ID | Method | Case | Request | Expected |
|----|--------|------|---------|----------|
| API-001 | GET | List — happy path | `?page=1&limit=20` | 200; array; `total`, `page`, `limit` present; schema stable |
| API-002 | GET | List — page beyond the last | `?page=9999` | 200 with an empty array — not a 404 or 500 |
| API-003 | GET | List — `limit=0` | `?limit=0` | 400 or a sane default; never an unbounded dump |
| API-004 | GET | List — `limit=100000` | | Capped at the documented maximum |
| API-005 | GET | List — negative page | `?page=-1` | 400 |
| API-006 | GET | List — sort by an unknown field | `?sort=xyz` | 400 or the default sort; no SQL error |
| API-007 | GET | Single — valid id | | 200 with items in ordinal order |
| API-008 | GET | Single — non-existent id | | 404 |
| API-009 | GET | Single — malformed id | `abc` | 400 |
| API-010 | GET | Single — another tenant's id | | 403/404, no data (IDOR) |
| API-011 | POST | Create — valid | name + 3 item ids | 201 with the created id |
| API-012 | POST | Create — missing name | | 400, field-specific error |
| API-013 | POST | Create — empty items array | | 400/422 per BR-04 |
| API-014 | POST | Create — non-existent media id | | 400/422; nothing persisted |
| API-015 | POST | Create — duplicate name in the folder | | 409 or 400 per BR-11 |
| API-016 | POST | Create — extra unknown fields | `{"is_admin":true}` | Ignored (mass assignment guard) |
| API-017 | PUT | Full update | | 200; all fields replaced |
| API-018 | PUT | Update omitting required fields | | 400 — not a silent partial wipe |
| API-019 | PATCH | Partial update of the name only | | 200; items untouched |
| API-020 | PATCH | Set `status` / `owner_id` / `tenant_id` | | Rejected or ignored |
| API-021 | PATCH | Set `deleted=false` on a deleted record | | Rejected |
| API-022 | DELETE | Valid id | | 200/204; soft-deleted |
| API-023 | DELETE | Already deleted | | Idempotent (204 or 404) — never a 500 |
| API-024 | DELETE | In-use campaign | | 409 per BR-08, with the referencing playlists named |
| API-025 | POST | Bulk create 50 | | All-or-nothing, or per-row results — documented |
| API-026 | POST | Bulk with one invalid row | | Partial-failure semantics explicit |
| API-027 | POST | Items reorder | new ordinals | 200; ordinals contiguous from 1 |
| API-028 | POST | Publish — valid | | 200; approval triggered |
| API-029 | POST | Publish — empty campaign | | 400 per BR-04 |
| API-030 | POST | Approve — valid pending id | | 200 |
| API-031 | POST | Approve — already approved | | 409, not a double publish |
| API-032 | POST | Reject — no reason | | 400 if mandatory |
| API-033 | GET | Audit trail | | 200; chronological; actor ids resolvable |
| API-034 | ALL | Combined filter + sort + page | | Consistent result set; no duplicates across pages |

### 13.3 Robustness & abuse

| ID | Case | Expected |
|----|------|----------|
| API-040 | Malformed JSON body | 400 with a parse error, not a 500 |
| API-041 | Wrong `Content-Type` | 415 |
| API-042 | 10 MB payload | 413 |
| API-043 | 10,000 items in one create | Rejected at the documented bound |
| API-044 | Deeply nested JSON (1,000 levels) | Rejected; no stack overflow |
| API-045 | Unicode/emoji in every string field | Accepted and round-tripped byte-identically |
| API-046 | Null bytes in strings | Sanitised or rejected |
| API-047 | Duplicate keys in the JSON body | Deterministic handling |
| API-048 | Missing auth header | 401 |
| API-049 | Malformed bearer token | 401 |
| API-050 | Rate limit — 100 creates in 10 s | 429 after the threshold, with `Retry-After` |
| API-051 | Concurrent identical creates | One record (idempotency) |
| API-052 | HTTP method not allowed (e.g. PUT on the list route) | 405 |
| API-053 | Response time under nominal load | p95 within the ENV budget (`CMS_API_SLOW_MS`) |
| API-054 | Error bodies leak no stack traces or SQL | Generic message + correlation id only |

### 13.4 API ↔ UI consistency

| ID | Case | Expected |
|----|------|----------|
| API-060 | Validation rules identical in UI and API | Every UI rule enforced server-side (name length, item bounds, duplicates) |
| API-061 | A campaign created via API appears in the UI | Immediately, with the same values |
| API-062 | A campaign edited in the UI reads back identically via API | No field drift |
| API-063 | Permission decisions identical in UI and API | No action allowed by one and denied by the other |
| API-064 | Sort/filter semantics identical | Same result order |

---

## 14. Database Validation

Requires DEP-11 (read access). Where unavailable, assert through the API's read-back instead
and mark the case **Manual/Deferred** rather than dropping it.

| ID | Validation | Expected |
|----|-----------|----------|
| DB-001 | Campaign row created | Correct name, folder id, tenant id, status |
| DB-002 | Item rows created | One row per item with an explicit contiguous ordinal from 1 |
| DB-003 | Reorder updates ordinals | No gaps, no duplicates, no reliance on insertion order |
| DB-004 | Item removal recompacts ordinals | 1..N-1 contiguous |
| DB-005 | Folder mapping | Campaign→folder FK correct; changes on move |
| DB-006 | Playlist mapping | Playlist→campaign reference row created on insert |
| DB-007 | Cluster mapping | Cluster→campaign reference row created on assign |
| DB-008 | Approval status column | Transitions draft → pending → approved/rejected only |
| DB-009 | `created_by` / `created_at` | Real actor id; UTC timestamp |
| DB-010 | `updated_by` / `updated_at` | Updated on every edit; distinct from the creator when applicable |
| DB-011 | Soft delete | `deleted` flag set; row retained; `deleted_at`/`deleted_by` populated |
| DB-012 | Soft-deleted excluded from reads | Absent from list, single fetch, picker, search, and the resolved playback payload |
| DB-013 | Referential integrity | No orphan item rows after campaign deletion |
| DB-014 | Orphan cleanup | Deleting media leaves no dangling campaign-item rows pointing at nothing |
| DB-015 | Unique constraint | Name uniqueness enforced at the DB level, not only in application code |
| DB-016 | Cascade behaviour on folder delete | Matches the Media cascade rules exactly (PB-RULE-04) |
| DB-017 | Tenant isolation | Every campaign query filtered by tenant; no cross-tenant rows reachable |
| DB-018 | Version/ETag column | Present and incremented on update (supports RSK-07 conflict detection) |

---

## 15. Audit Log Validation

| ID | Action | Expected entry |
|----|--------|----------------|
| AUD-001 | Create | actor, UTC timestamp, campaign id, initial item list |
| AUD-002 | Update | before/after delta for name, items, order, durations |
| AUD-003 | Delete | actor, timestamp, soft-delete marker |
| AUD-004 | Approve | approver id, pending-change id, decision, timestamp |
| AUD-005 | Reject | approver id, reason text, timestamp |
| AUD-006 | Publish | actor, target screens/clusters, resulting version |
| AUD-007 | Restore | actor, restored-from state |
| AUD-008 | Folder move | source and target folder ids |
| AUD-009 | Permission change affecting campaigns | role id, permission delta |
| AUD-010 | Failed authorisation attempt | Logged (403s on campaign endpoints are security-relevant) |
| AUD-011 | Actor accuracy | Never a service/system account for user-initiated actions |
| AUD-012 | Ordering | Monotonic; stable under clock adjustment (CMP-EDGE-067) |
| AUD-013 | Immutability | No API path permits editing or deleting an audit entry |
| AUD-014 | Access control | Audit readable only with the appropriate permission |

---

## 16. Security Testing

Mapped to OWASP Top 10 (2021). Every case is executed with a **low-privilege token** unless
stated otherwise.

### A01 — Broken Access Control

| ID | Case | Expected |
|----|------|----------|
| SEC-001 | Horizontal — read another user's campaign in a denied folder | 403/404 |
| SEC-002 | Vertical — Viewer performs create/edit/delete/publish | 403 on each |
| SEC-003 | IDOR — enumerate campaign ids `1..1000` | Only entitled records returned; consistent 403/404 for the rest |
| SEC-004 | IDOR — folder id substitution in the create payload | 403 when the target folder is denied |
| SEC-005 | IDOR — screen/cluster id substitution on publish | 403 |
| SEC-006 | Forced browsing to `/campaigns/admin`-style routes | Blocked server-side |
| SEC-007 | Approval bypass — call publish directly, skipping approval | 403 (RSK-06) |
| SEC-008 | Self-approval bypass — approve own submission via API | 403 if segregation of duties is enforced |
| SEC-009 | Privilege escalation — self-grant campaign permissions via `/role/update` | 403; attempt logged |
| SEC-010 | Cross-tenant read (TagTalk isolation) | 403/404; no name, count, or existence disclosure |
| SEC-011 | Direct media URL access for a restricted campaign's items | Signed/authorised URLs only |
| SEC-012 | Permission caching — act immediately after revocation | Old permission not honoured |

### A02/A07 — Authentication & session

| ID | Case | Expected |
|----|------|----------|
| SEC-020 | JWT `role` claim tampered | Signature check fails, 401 |
| SEC-021 | JWT `alg: none` | Rejected |
| SEC-022 | Expired token | 401 |
| SEC-023 | Token replay after logout | 401 |
| SEC-024 | Token from a deleted user | 401 |
| SEC-025 | Token from a role whose campaign permissions were revoked | 403 on campaign endpoints |
| SEC-026 | Session fixation across login | New session id issued |
| SEC-027 | Concurrent sessions, one revoked | Revocation applies to all |

### A03 — Injection

| ID | Case | Expected |
|----|------|----------|
| SEC-030 | SQLi in campaign name | Stored literally; no DB error |
| SEC-031 | SQLi in the search parameter | Parameterised; no error, no data leak |
| SEC-032 | SQLi in sort/filter parameters | Whitelisted; 400 on unknown values |
| SEC-033 | Stored XSS in the campaign name → list view | Escaped |
| SEC-034 | Stored XSS → playlist picker and slot label | Escaped |
| SEC-035 | Stored XSS → approval email body | Escaped in HTML mail (highest-impact surface) |
| SEC-036 | Stored XSS → audit log view | Escaped |
| SEC-037 | Reflected XSS in search results | Escaped |
| SEC-038 | Template injection in the email body (`{{7*7}}`) | Not evaluated |
| SEC-039 | Command/path traversal in an item filename | Sanitised |

### A04/A05/A08 — Design, misconfiguration, integrity

| ID | Case | Expected |
|----|------|----------|
| SEC-050 | Mass assignment of `owner_id`, `tenant_id`, `status`, `deleted` | Ignored or rejected |
| SEC-051 | Missing rate limiting on create/publish/approve | 429 enforced |
| SEC-052 | Verbose errors leaking stack traces, SQL or file paths | Generic message + correlation id |
| SEC-053 | CORS permitting arbitrary origins on campaign endpoints | Restricted to the app origin |
| SEC-054 | Missing security headers on campaign pages | CSP, X-Frame-Options, etc. present |
| SEC-055 | CSRF on create/delete/publish/approve | Token or SameSite enforced |
| SEC-056 | Clickjacking the approve action | Framing denied |
| SEC-057 | Sensitive data in URLs (ids, tokens) logged by proxies | Avoided |
| SEC-058 | Unauthenticated access to any campaign endpoint | 401 on every one |
| SEC-059 | API token scoped to read used for write | 403 |
| SEC-060 | Business-logic abuse — 10,000 campaigns created to exhaust storage | Quota or rate limit applies |

---

## 17. Performance Testing

### 17.1 Response-time budgets

Budgets derive from `cms-e2e/config/env.ts` (`CMS_PERF_PAGE_LOAD_MS=5000`,
`CMS_PERF_LISTING_LOAD_MS=4000`, `CMS_API_SLOW_MS=3000`) so the CI thresholds already in the
repo apply unchanged.

| ID | Measurement | Load | Target (p95) |
|----|-------------|------|--------------|
| PERF-001 | Campaign list page load | 1,000 campaigns | ≤ 4,000 ms |
| PERF-002 | Folder view load | 5,000 mixed assets | ≤ 4,000 ms |
| PERF-003 | Playlist editor load | playlist with 5 campaigns | ≤ 5,000 ms |
| PERF-004 | Picker Campaigns tab open | 500 campaigns | ≤ 2,000 ms |
| PERF-005 | Campaign editor open | 1,000 items | ≤ 5,000 ms |
| PERF-006 | Save a 1,000-item campaign | — | ≤ 5,000 ms |
| PERF-007 | `GET /campaign/read` | nominal | ≤ 3,000 ms |
| PERF-008 | `POST /campaign/create` | nominal | ≤ 3,000 ms |
| PERF-009 | Publish to 100 screens | bulk | ≤ 60 s, all screens confirmed |
| PERF-010 | Search response | 5,000 campaigns | ≤ 2,000 ms |

### 17.2 Load & stress

| ID | Scenario | Users | Success criteria |
|----|----------|-------|------------------|
| PERF-020 | Browse + search campaigns | 100 concurrent | p95 within budget; error rate < 1 % |
| PERF-021 | Browse + search | 500 concurrent | p95 ≤ 2× budget; error rate < 1 % |
| PERF-022 | Browse + search | 1,000 concurrent | Documented degradation; no data corruption, no 5xx storm |
| PERF-023 | 50 concurrent campaign saves | 50 | No lost updates; conflicts detected, not silently merged |
| PERF-024 | 20 concurrent publishes | 20 | All complete; sync queue drains |
| PERF-025 | Bulk publish to 1,000 screens | — | Queue-based, non-blocking UI, accurate progress |
| PERF-026 | Sustained load 1 h | 200 | No memory growth trend in the CMS process |

### 17.3 Resource & client-side

| ID | Measurement | Criteria |
|----|-------------|----------|
| PERF-030 | CMS server CPU during bulk sync | < 80 % sustained |
| PERF-031 | CMS server memory during bulk sync | No unbounded growth |
| PERF-032 | Browser memory in the playlist editor over 30 min | No leak (heap returns to baseline after GC) |
| PERF-033 | Player memory over a 24 h campaign soak | Stable; no OOM restart |
| PERF-034 | Player CPU during campaign transitions | Within the device envelope; no dropped frames |
| PERF-035 | Playback transition latency at the campaign slot | Comparable to a plain media transition (PB-RULE-04) |
| PERF-036 | Network payload of the resolved schedule | Does not grow linearly with campaign length × loop count |
| PERF-037 | Lighthouse scores on campaign pages | Meet the thresholds already set in `ENV.LIGHTHOUSE` |

### 17.4 Playback timing accuracy

| ID | Measurement | Criteria |
|----|-------------|----------|
| PERF-040 | Per-item duration accuracy | Within ±500 ms of the configured value |
| PERF-041 | Loop period consistency across 100 loops | Drift < 1 % cumulative |
| PERF-042 | Campaign slot vs static slot timing | No systematic extra delay at the campaign slot |

---

**Next:** [08-automation-plan.md](08-automation-plan.md)
