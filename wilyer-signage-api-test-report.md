# Wilyer Signage CMS — API Test Report

**App:** cms.wilyersignage.com (build v3.5.20)
**API backend:** `https://v3-5api.wilyersignage.com/v3/cms/*`
**Auth:** `Authorization: Bearer <footprint JWT>` (JWT also stored in the `footprint` cookie, `.wilyersignage.com`, not HttpOnly)
**Account:** dev@wilyer.com (role `user`, `isRestrictedAccess:false`)
**Date:** 2026-06-25 · **Tester:** Aman Kumar (QA)
**Scope:** Read-path + auth + input-validation testing against live. No writes/CRUD executed.

---

## Summary

API is healthy: all module read endpoints respond 200 with consistent paginated
shapes, latency is tight (~300–490 ms), and input validation / authorization are
solid. **One real server bug** (500 on param-less list endpoints) and **two minor
front-end/integration issues** found.

---

## Endpoint health (authenticated, valid params)

| Endpoint | Method | Status | ~ms | Response shape |
| --- | --- | --- | --- | --- |
| `/auth/checkAccess` | POST | 200 | ~270 | authorization gate |
| `/dashboard/read` | GET | 200 | 351 | onlineScreens, offlineScreens, expiringSoon, mediaFiles, licenses |
| `/dashboard/readExpiringScreens` | GET | 200 | — | list |
| `/dashboard/readExpiredScreens` | GET | 200 | — | list |
| `/dashboard/groupScreenDistribution` | GET | 200 | — | list |
| `/screen/read?page&limit&sort&order&...` | GET | 200 | 319 | docs[20], totalDocs=69 |
| `/screen/readStats` | GET | 200 | — | stats |
| `/screen/readTags` | GET | 200 | — | tags |
| `/screen/readDeletedScreens` | GET | 200 | — | paginated |
| `/group/read` | GET | 200 | 390 | docs, totalDocs, page… |
| `/cluster/read` | GET | 200 | 326 | clusters, totalDocs… |
| `/playlist/read?page&limit&sort&order&isNotFolder` | GET | 200 | 370 | docs[48], totalDocs=775 |
| `/playlist-folder/read?page&limit` | GET | 200 | — | folders |
| `/playlist-folder/subusers` | GET | 200 | — | subusers |
| `/role/read` | GET | 200 | 394 | roles, totalDocs… |
| `/team/read` | GET | 200 | 328 | docs, totalDocs… |
| `/account/readProfile` | GET | 200 | 331 | _id, name, email, organization… |
| `/plan/read` | GET | 200 | 363 | array |
| `/rollout/read` | GET | 200 | 347 | array |
| `/announcement/read` | GET | 200 | 362 | object |
| `/mdm/readAll` | GET | 200 | — | list |

---

## Authorization (PASS)

| Test | Result |
| --- | --- |
| Valid `Authorization: Bearer <jwt>` | 200 ✅ |
| No auth header | **401** ✅ |
| Token in `footprint` / `x-access-token` / `token` header (wrong scheme) | **401** ✅ |

Only the `Authorization: Bearer` scheme is accepted; every other variant is cleanly
rejected with 401 — no auth bypass.

## Input validation (PASS — when params present)

| Test | Status | Server message |
| --- | --- | --- |
| `limit=-5` | **400** | `"limit" must be greater than or equal to 1` |
| `limit=999999` | **400** | `"limit" must be less than or equal to 1000` (cap enforced) |
| `page=abc` | **400** | `"page" must be a number` |
| `sort=createdAt;DROP` (injection) | 200 | ignored safely, normal results — no injection effect |
| `search=<script>alert(1)</script>` | 200 | treated as literal text → 0 matches, not executed ✅ |
| detail with malformed ObjectId | **404** | `Page Not found.` |

Validation uses Joi-style messages and behaves correctly; injection/XSS payloads are
neutralized (stored/searched as literals, not executed).

---

## Issues found

### 1. Server 500 on param-less list endpoints (real bug — low/medium)

`GET /screen/read` and `GET /playlist/read` **with no query params** return **HTTP 500**
(`"Server error while fetching screens"` / `{"status":500}`).

This is inconsistent with the otherwise-good validation: when params are *present but
invalid* the API returns clean **400s**, but when params are *entirely absent* the
validation path is bypassed and the handler throws an unhandled exception → 500.

- **Impact:** Low for end users (the UI always sends the full param set). But it's poor
  API hygiene — a 500 should be a 400, it pollutes error monitoring, and it's the kind
  of unhandled path that hides deeper issues.
- **Fix:** make the query schema apply defaults / `.required()` so missing params
  resolve to a 400 like invalid ones do.

### 2. Razorpay checkout script requested with `undefined` (front-end — low)

On every page: `GET https://checkout-static-next.razorpay.com/build/undefined` →
`FAILED (ERR_BLOCKED_BY_ORB)`. A build/version variable resolves to the string
`"undefined"` and is concatenated into the script URL. Cosmetic but real; clutters the
network tab and could break the Razorpay checkout flow if that asset is ever needed.

### 3. Duplicate / aborted `screen/read` requests (minor)

The `/screen/read` list call fires twice on load; one is cancelled (`net::ERR_ABORTED`).
Typical React effect double-invoke; harmless but wastes a round-trip on a slow app.

---

## Scope / not tested

- No write/CRUD/upload/delete calls executed (read-only, prod-safe).
- RBAC of a *restricted* sub-user not tested (only the full-access `dev@` account).
- IDOR / cross-tenant access (reading another partner's objects) not attempted.

**Recommended next:** fix the 500 → 400 on param-less list endpoints; codify this
endpoint sweep as a Playwright `request`-context spec in `wilyer-signage-suite/tests/`.
