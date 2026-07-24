# Prayer Schedule — API Endpoint Check

- **API base:** `https://v3-5api.pocsample.in/v3/cms/prayer-schedule`
- **Auth:** `Authorization: Bearer <JWT>` (extracted from live session; token discarded after test)
- **Account:** dev@wilyer.com (role `user`, `isPrayerScheduleEnabled:true`, `prayerScheduleScreensLimit:2`) · **Date:** 2026-07-16
- **Scope:** read + auth + validation + negative/routing cases. **No data mutated** (create calls used invalid bodies → 400).

## Result matrix
| Endpoint | Method | Case | Status | Body / notes |
|----------|--------|------|--------|--------------|
| `/read` | GET | valid | **200** | 4 plans (r1/bulandshahr, test/Riyadh, west1/Jeddah, lal kurti/meerut) |
| `/read` | GET | no auth | **401** | `Unauthorized Request` ✅ |
| `/read` | GET | malformed token | **401** | `Unauthorized Request` ✅ |
| `/timings/{id}` | GET | valid | **200** | full `timings{Fajr…Isha}` ✅ |
| `/timings/{id}` | GET | nonexistent (valid ObjectId) | **404** | `Prayer schedule not found` ✅ |
| `/timings/{id}` | GET | **malformed id** | **500** ❌ | `{"status":500}` — should be 400 |
| `/timings/{id}` | GET | plan with empty location | **400** | `Location is required (lat/lng, address, or city+country)` (from prior audit) |
| `/timings/` | GET | no id | **404** | `Page Not found.` (routing) |
| `/screens/{id}` | GET | valid | **200** | `{docs:[…]}` ✅ |
| `/screens/{id}` | GET | **nonexistent (valid ObjectId)** | **200** ⚠️ | `{docs:[]}` — should 404 (inconsistent with `/timings`) |
| `/screens/{id}` | GET | **malformed id** | **500** ❌ | `{"status":500}` — should be 400 |
| `/create` | POST | empty body | **400** | `"name" is required` ✅ |
| `/create` | POST | name only (no location) | **400** | `"location" is required` ✅ |
| `/create` | POST | duplicate name | **400** | `Prayer schedule name already exists` ✅ (prior) |
| `/create` | POST | no auth | **401** | `Unauthorized Request` ✅ |
| `/update/{id}` | PUT | valid | **200** | (prior CRUD test) |
| `/update/` | PUT | no id | **404** | `Page Not found.` |
| `/delete/{id}` | DELETE | nonexistent | **404** | `Prayer schedule not found` ✅ |
| `/doesnotexist` | GET | bogus subpath | **404** | `Page Not found.` ✅ |

## Bugs found

1. **Malformed ObjectId → HTTP 500** on `GET /timings/{id}` and `GET /screens/{id}`.
   - A non-hex / wrong-length id (e.g. `not-an-objectid`, `xyz`) throws an unhandled Mongoose CastError surfaced as **500 `{"status":500}`**.
   - Should return **400 Bad Request** (invalid id format). *Severity: Medium* (robustness / incorrect status semantics). Good news: no stack trace leaks — body is just `{"status":500}`.

2. **`GET /screens/{nonexistent-but-valid-id}` → 200 `{docs:[]}`** instead of 404.
   - The screens endpoint does not verify the plan exists — returns empty docs for any well-formed id. **Inconsistent** with `/timings/{id}`, which correctly 404s for the same id. *Severity: Low.*

## What's solid ✅
- **Auth** is enforced everywhere: missing token, malformed token, and unauthenticated POST all return **401**.
- **Create validation** is ordered and clear: `name` required → `location` required → duplicate-name guard.
- **Routing** returns proper 404s (`Page Not found.`) for missing ids / bogus paths.
- **Not-found** on valid-but-missing ids returns 404 with a clear message (timings, delete).
- **No information leakage** in error bodies (500s are opaque `{"status":500}`).

## Recommendation
Add an ObjectId-format guard (return 400) before the DB lookup on `/timings/{id}` and `/screens/{id}`, and make `/screens/{id}` return 404 when the plan doesn't exist — to match `/timings` behavior.
